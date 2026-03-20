const { ChannelType, PermissionsBitField } = require('discord.js');
const { getMusicBootstrapIssue, getMusicRuntimeConfig } = require('./musicConfigService');
const {
  addTracks,
  clearQueue,
  getCurrentTrack,
  getQueueEntries,
  getQueueLength,
  isPlayerPaused,
  isPlayerPlaying,
  removeTrack,
  setLoopMode,
  setPlayerVolume,
  shuffleQueue,
} = require('./queueService');
const {
  buildNowPlayingEmbed,
  buildQueueEndedEmbed,
  buildStateEmbed,
  createTrackCardData,
} = require('../utils/musicEmbeds');

const MUSIC_LOG_PREFIX = '[music]';
const guildStates = new Map();

let riffy = null;
let riffyAvailable = false;
let riffyDependencyError = null;
let rawListenerBound = false;
let eventBindingsComplete = false;
let bootstrappedClientId = null;

class MusicError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MusicError';
  }
}

function logInfo(message) {
  console.log(`${MUSIC_LOG_PREFIX} ${message}`);
}

function logWarn(message, error = null) {
  console.warn(`${MUSIC_LOG_PREFIX} ${message}`);
  if (error) console.warn(error);
}

function ensureRiffyPatched() {
  try {
    const { Node } = require('riffy/build/structures/Node');
    if (global.__REDLINE_RIFFY_PATCHED__) return;

    const originalDefineProperty = Object.defineProperty;
    Object.defineProperty = function patchedDefineProperty(obj, prop, descriptor) {
      if (obj instanceof Node && ['host', 'port', 'password', 'secure', 'identifier'].includes(prop)) {
        return originalDefineProperty(obj, prop, {
          value: descriptor.value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }

      try {
        return originalDefineProperty(obj, prop, descriptor);
      } catch (error) {
        if (error instanceof TypeError && error.message.includes('Invalid property descriptor')) {
          return originalDefineProperty(obj, prop, {
            value: descriptor.value,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        }

        throw error;
      }
    };

    global.__REDLINE_RIFFY_PATCHED__ = true;
  } catch (error) {
    logWarn('Unable to apply the Riffy node patch workaround. Continuing without the patch.', error);
  }
}

function loadRiffyConstructor() {
  try {
    ensureRiffyPatched();
    const imported = require('riffy');
    riffyDependencyError = null;
    return imported?.Riffy || imported?.default || imported;
  } catch (error) {
    riffyDependencyError = error;
    return null;
  }
}

function getDependencyIssue() {
  if (riffyDependencyError) {
    return 'Music playback dependency missing. Install the `riffy` package and restart Serenity.';
  }

  return getMusicBootstrapIssue();
}

function ensureGuildState(guildId) {
  const existing = guildStates.get(guildId);
  if (existing) return existing;

  const state = {
    guildId,
    textChannelId: null,
    voiceChannelId: null,
    lastNowPlayingMessageId: null,
    currentTrackStartedAt: null,
    lastResolvedQuery: null,
  };

  guildStates.set(guildId, state);
  return state;
}

function getGuildState(guildId) {
  return guildStates.get(guildId) || null;
}

function updateGuildState(guildId, patch) {
  const state = ensureGuildState(guildId);
  Object.assign(state, patch);
  return state;
}

async function fetchTextChannel(client, channelId) {
  if (!channelId) return null;
  const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
  return channel && typeof channel.send === 'function' ? channel : null;
}

async function fetchGuildMemberById(guild, userId) {
  if (!guild || !userId) return null;
  return guild.members.cache.get(userId) || guild.members.fetch(userId).catch(() => null);
}

async function buildTrackCard(client, guild, track, fallbackPosition = null) {
  const requesterId = track?.info?.requester || null;
  const requester = requesterId ? await fetchGuildMemberById(guild, requesterId) : null;
  return createTrackCardData(track, {
    requestedBy: requester?.user || requester || null,
    queuePosition: fallbackPosition,
  });
}

function createRiffy(client) {
  const Riffy = loadRiffyConstructor();
  if (!Riffy) {
    riffyAvailable = false;
    return null;
  }

  const runtimeConfig = getMusicRuntimeConfig();
  if (!runtimeConfig.nodes.length) {
    riffyAvailable = false;
    return null;
  }

  const instance = new Riffy(client, runtimeConfig.nodes, {
    send: (payload) => {
      const guild = client.guilds.cache.get(payload.d.guild_id);
      if (guild) guild.shard.send(payload);
    },
    defaultSearchPlatform: runtimeConfig.defaultSearchPlatform,
    restVersion: runtimeConfig.restVersion,
  });

  riffyAvailable = true;
  return instance;
}

function bindRawVoiceBridge(client) {
  if (rawListenerBound) return;
  rawListenerBound = true;
  client.on('raw', (payload) => {
    if (riffy && typeof riffy.updateVoiceState === 'function') {
      riffy.updateVoiceState(payload);
    }
  });
}

async function announceNowPlaying(client, player, track) {
  const state = getGuildState(player.guildId);
  const channel = await fetchTextChannel(client, state?.textChannelId);
  const guild = player.guildId ? client.guilds.cache.get(player.guildId) || await client.guilds.fetch(player.guildId).catch(() => null) : null;
  if (!channel || !guild) return;

  try {
    const card = await buildTrackCard(client, guild, track, 1);
    const queueCards = await Promise.all(getQueueEntries(player).slice(0, 5).map((entry, index) => buildTrackCard(client, guild, entry, index + 2)));
    const message = await channel.send({
      embeds: [buildNowPlayingEmbed({
        currentTrack: card,
        upcomingTracks: queueCards,
        loopMode: player.loop,
        volume: player.volume,
        startedAt: Date.now(),
      })],
    }).catch(() => null);

    updateGuildState(player.guildId, {
      currentTrackStartedAt: Date.now(),
      lastNowPlayingMessageId: message?.id || null,
    });
  } catch (error) {
    logWarn(`Failed to post now-playing status in guild ${player.guildId}.`, error);
  }
}

async function announceQueueEnded(client, player) {
  const runtimeConfig = getMusicRuntimeConfig();
  const state = getGuildState(player.guildId);
  const channel = await fetchTextChannel(client, state?.textChannelId);
  if (channel) {
    await channel.send({ embeds: [buildQueueEndedEmbed()] }).catch(() => null);
  }

  if (runtimeConfig.autoLeaveOnQueueEnd && typeof player.destroy === 'function') {
    player.destroy();
  }

  guildStates.delete(player.guildId);
}

function bindRiffyEvents(client) {
  if (!riffy || eventBindingsComplete) return;
  eventBindingsComplete = true;

  riffy.on('nodeConnect', (node) => {
    riffyAvailable = true;
    logInfo(`Lavalink node connected: ${node.name}`);
  });

  riffy.on('nodeError', (node, error) => {
    riffyAvailable = false;
    logWarn(`Lavalink node error from ${node.name}.`, error);
  });

  riffy.on('nodeDisconnect', (node) => {
    riffyAvailable = false;
    logWarn(`Lavalink node disconnected: ${node.name}`);
  });

  riffy.on('trackStart', async (player, track) => {
    updateGuildState(player.guildId, { currentTrackStartedAt: Date.now() });
    await announceNowPlaying(client, player, track);
  });

  riffy.on('queueEnd', async (player) => {
    await announceQueueEnded(client, player);
  });

  riffy.on('trackError', async (player, track, payload) => {
    const state = getGuildState(player.guildId);
    const channel = await fetchTextChannel(client, state?.textChannelId);
    if (channel) {
      const details = payload?.exception?.message || payload?.message || 'The current track could not be streamed by Lavalink.';
      await channel.send({
        embeds: [buildStateEmbed('Playback issue', `Skipped **${track?.info?.title || 'the current track'}** because Lavalink reported an error: ${details}`, 'warning')],
      }).catch(() => null);
    }
  });

  riffy.on('playerDisconnect', (player) => {
    guildStates.delete(player.guildId);
  });

  riffy.on('playerMove', (player, oldChannel, newChannel) => {
    updateGuildState(player.guildId, { voiceChannelId: newChannel || oldChannel || null });
  });
}

async function ensureMusicSubsystem(client) {
  if (bootstrappedClientId === client.user?.id && riffy) return;

  bindRawVoiceBridge(client);
  riffy = createRiffy(client);
  bindRiffyEvents(client);

  if (!riffy) {
    const issue = getDependencyIssue();
    client.musicSubsystemReady = false;
    client.musicSubsystemIssue = issue;
    logWarn(issue || 'Music subsystem could not be initialized.');
    return;
  }

  try {
    riffy.init(client.user.id);
    bootstrappedClientId = client.user.id;
    client.musicSubsystemReady = true;
    client.musicSubsystemIssue = null;
    logInfo('Music subsystem initialized with Riffy + Lavalink.');
  } catch (error) {
    client.musicSubsystemReady = false;
    client.musicSubsystemIssue = 'Music subsystem failed to initialize with Lavalink. Check the bot logs and your node credentials.';
    logWarn('Music subsystem initialization failed.', error);
  }
}

function getRiffy() {
  return riffy;
}

function isSubsystemReady() {
  return Boolean(riffy) && riffyAvailable !== false;
}

function getSubsystemIssue() {
  return getDependencyIssue();
}

function getPlayer(guildId) {
  return riffy?.players?.get(guildId) || null;
}

function ensurePlaybackAvailable() {
  const issue = getDependencyIssue();
  if (issue) {
    throw new MusicError(issue);
  }

  if (!riffy) {
    throw new MusicError('Music playback is unavailable because the Lavalink client has not been initialized yet.');
  }
}

function ensureVoiceChannel(member) {
  const channel = member?.voice?.channel;
  if (!channel || ![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) {
    throw new MusicError('You must join a voice channel first.');
  }

  return channel;
}

function ensureConnectPermissions(channel, botMember) {
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has(PermissionsBitField.Flags.Connect) || !permissions?.has(PermissionsBitField.Flags.Speak)) {
    throw new MusicError('Serenity needs **Connect** and **Speak** permissions in your voice channel before playback can start.');
  }
}

function ensureSameVoiceChannel(member, player) {
  const memberChannelId = member?.voice?.channelId;
  if (!memberChannelId) {
    throw new MusicError('You must join a voice channel first.');
  }

  if (!player?.voiceChannel) {
    throw new MusicError('There is no active voice session for music in this server.');
  }

  if (player.voiceChannel !== memberChannelId) {
    throw new MusicError('You must be in the same voice channel as Serenity to control playback.');
  }
}

async function createOrReusePlayer({ guild, member, textChannelId }) {
  ensurePlaybackAvailable();

  const voiceChannel = ensureVoiceChannel(member);
  const botMember = await guild.members.fetchMe();
  ensureConnectPermissions(voiceChannel, botMember);

  const existing = getPlayer(guild.id);
  if (existing && existing.voiceChannel && existing.voiceChannel !== voiceChannel.id) {
    throw new MusicError('Serenity is already playing music in another voice channel on this server.');
  }

  const player = existing || riffy.createConnection({
    guildId: guild.id,
    voiceChannel: voiceChannel.id,
    textChannel: textChannelId,
    deaf: true,
  });

  updateGuildState(guild.id, {
    textChannelId,
    voiceChannelId: voiceChannel.id,
  });

  return { player, voiceChannel };
}

async function resolveTracks({ guildId, query, requesterId }) {
  ensurePlaybackAvailable();

  const input = String(query || '').trim();
  if (!input) {
    throw new MusicError('Provide a search query or supported URL for `/play`.');
  }

  try {
    const result = await riffy.resolve({
      query: input,
      requester: requesterId,
      source: input,
      guildId,
    });

    if (!result || !Array.isArray(result.tracks) || !result.tracks.length) {
      throw new MusicError('Failed to resolve a playable track. No results were found for that search or URL.');
    }

    return result;
  } catch (error) {
    if (error instanceof MusicError) throw error;
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('spotify')) {
      throw new MusicError('Spotify links are metadata-only here. Serenity could not resolve that Spotify item into a playable source.');
    }
    if (message.includes('youtube')) {
      throw new MusicError('YouTube failed to return a playable result for that query or URL.');
    }
    if (message.includes('soundcloud')) {
      throw new MusicError('SoundCloud failed to return a playable result for that query or URL.');
    }
    throw new MusicError('Failed to resolve a playable track from that input.');
  }
}

async function enqueueResolvedTracks(player, resolveResult, requesterId) {
  const tracks = Array.isArray(resolveResult?.tracks) ? resolveResult.tracks : [];
  return addTracks(player, tracks, requesterId);
}

async function startPlaybackIfIdle(player) {
  if (!player) return false;
  if (isPlayerPlaying(player) || isPlayerPaused(player) || getCurrentTrack(player)) return false;
  await player.play();
  return true;
}

function requirePlayer(guildId) {
  const player = getPlayer(guildId);
  if (!player) {
    throw new MusicError('Queue is empty. Start playback with `/play` first.');
  }

  return player;
}

function requireControllablePlayer(guildId, member) {
  const player = requirePlayer(guildId);
  ensureSameVoiceChannel(member, player);
  return player;
}

function pausePlayer(player) {
  if (typeof player.pause === 'function') {
    player.pause(true);
  } else {
    player.paused = true;
  }
}

function resumePlayer(player) {
  if (typeof player.pause === 'function') {
    player.pause(false);
  } else {
    player.paused = false;
  }
}

function skipPlayer(player) {
  if (typeof player.stop === 'function') {
    player.stop();
  }
}

function stopAndDestroyPlayer(player) {
  if (typeof player.destroy === 'function') {
    player.destroy();
  } else if (typeof player.stop === 'function') {
    player.stop();
  }
  guildStates.delete(player.guildId);
}

function setPlayerLoop(player, mode) {
  return setLoopMode(player, mode);
}

function updatePlayerVolume(player, value) {
  return setPlayerVolume(player, value);
}

function clearPlayerQueue(player) {
  return clearQueue(player);
}

function shufflePlayerQueue(player) {
  return shuffleQueue(player);
}

function removePlayerTrack(player, position) {
  return removeTrack(player, position);
}

function snapshotPlayer(player) {
  return {
    player,
    currentTrack: getCurrentTrack(player),
    queue: getQueueEntries(player),
    queueLength: getQueueLength(player),
  };
}

async function destroyMusicSubsystem() {
  if (riffy?.players) {
    for (const player of riffy.players.values()) {
      try {
        player.destroy();
      } catch (error) {
        logWarn(`Failed to destroy player for guild ${player.guildId}.`, error);
      }
    }
  }

  guildStates.clear();
}

module.exports = {
  MusicError,
  clearPlayerQueue,
  createOrReusePlayer,
  destroyMusicSubsystem,
  enqueueResolvedTracks,
  ensureMusicSubsystem,
  getDependencyIssue,
  getGuildState,
  getPlayer,
  getRiffy,
  getSubsystemIssue,
  isSubsystemReady,
  pausePlayer,
  removePlayerTrack,
  requireControllablePlayer,
  requirePlayer,
  resolveTracks,
  resumePlayer,
  setPlayerLoop,
  shufflePlayerQueue,
  skipPlayer,
  snapshotPlayer,
  startPlaybackIfIdle,
  stopAndDestroyPlayer,
  updateGuildState,
  updatePlayerVolume,
};
