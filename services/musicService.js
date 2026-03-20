const {
  AudioPlayerStatus,
  LOOP_MODES,
  clearUpcoming,
  destroyQueue,
  enqueueTracks,
  getAllGuildQueues,
  getGuildQueue,
  getOrCreateGuildQueue,
  getQueueSize,
  removeTrack,
  setCurrentTrack,
  setLoopMode,
  setQueueConnection,
  setQueueVolume,
  shuffleQueue,
  waitForConnectionReady,
} = require('./queueService');
const {
  createAudioResource,
  entersState,
  joinVoiceChannel,
  StreamType,
  VoiceConnectionStatus,
} = require('@discordjs/voice');
const play = require('play-dl');
const { ChannelType, PermissionsBitField } = require('discord.js');
const { buildNowPlayingEmbed, buildPlayEmbed, buildQueueEmbed, buildRemovedEmbed, buildStateEmbed } = require('../utils/musicEmbeds');

const MUSIC_LOG_PREFIX = '[music]';
const MUSIC_IDLE_TIMEOUT_MS = 120_000;

class MusicError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MusicError';
  }
}

let musicBootstrapped = false;

function logInfo(message) {
  console.log(`${MUSIC_LOG_PREFIX} ${message}`);
}

function logWarn(message, error = null) {
  console.warn(`${MUSIC_LOG_PREFIX} ${message}`);
  if (error) console.warn(error);
}

async function configureSourceTokens() {
  try {
    const tokens = {};

    if (process.env.YOUTUBE_COOKIE) {
      tokens.youtube = {
        cookie: process.env.YOUTUBE_COOKIE,
      };
    }

    if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
      tokens.spotify = {
        client_id: process.env.SPOTIFY_CLIENT_ID,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET,
        refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
        market: process.env.SPOTIFY_MARKET || 'US',
      };
    }

    const soundcloudClientId = process.env.SOUNDCLOUD_CLIENT_ID || await play.getFreeClientID().catch(() => null);
    if (soundcloudClientId) {
      tokens.soundcloud = { client_id: soundcloudClientId };
    }

    if (Object.keys(tokens).length) {
      await play.setToken(tokens).catch((error) => {
        logWarn('Failed to configure one or more playback source tokens; music will continue with reduced provider support.', error);
      });
    }
  } catch (error) {
    logWarn('Source token bootstrap failed; continuing with best-effort defaults.', error);
  }
}

async function ensureMusicSubsystem(client) {
  if (musicBootstrapped) return;
  musicBootstrapped = true;
  await configureSourceTokens();
  client.musicSubsystemReady = true;
  logInfo('Music subsystem initialized.');
}

function ensureGuildContext(source) {
  if (!source.guild) {
    throw new MusicError('Music commands can only be used inside a server.');
  }
}

function getMemberFromSource(source) {
  return source.member || source.guild?.members?.cache?.get(source.user?.id || source.author?.id) || null;
}

function getActorFromSource(source) {
  return source.user || source.author || null;
}

function ensureVoiceChannel(member) {
  const channel = member?.voice?.channel;
  if (!channel || ![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) {
    throw new MusicError('Join a voice channel first, then try that music command again.');
  }
  return channel;
}

function ensureSameVoiceChannel(member, queue) {
  const userChannelId = member?.voice?.channelId;
  if (!queue?.voiceChannelId || !userChannelId || queue.voiceChannelId !== userChannelId) {
    throw new MusicError('You need to be in the same voice channel as Serenity to use that control.');
  }
}

function ensureConnectPermissions(channel, botMember) {
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has(PermissionsBitField.Flags.Connect) || !permissions?.has(PermissionsBitField.Flags.Speak)) {
    throw new MusicError('I need **Connect** and **Speak** permissions in your voice channel before I can play music.');
  }
}

function toTrackPayload(entry, requestedBy) {
  return {
    id: entry.id || entry.url || `${Date.now()}-${Math.random()}`,
    title: entry.title || 'Unknown track',
    url: entry.url || entry.permalink || entry.href || null,
    durationMs: entry.durationInSec ? entry.durationInSec * 1000 : entry.durationRaw ? parseDurationRaw(entry.durationRaw) : entry.duration || 0,
    thumbnail: entry.thumbnails?.[0]?.url || entry.thumbnail?.url || entry.thumbnail || entry.artwork_url || null,
    requestedBy,
    sourceLabel: inferSourceLabel(entry),
    provider: inferSourceLabel(entry),
    artist: entry.channel?.name || entry.artist?.name || entry.channel || entry.user?.name || null,
  };
}

function parseDurationRaw(raw) {
  if (!raw || typeof raw !== 'string') return 0;
  const parts = raw.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  let seconds = 0;
  while (parts.length) {
    seconds = (seconds * 60) + parts.shift();
  }
  return seconds * 1000;
}

function inferSourceLabel(entry) {
  const url = String(entry?.url || entry?.permalink || '').toLowerCase();
  if (url.includes('spotify.com')) return 'Spotify';
  if (url.includes('soundcloud.com')) return 'SoundCloud';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (entry?.source) return String(entry.source);
  return 'Search';
}

async function resolveQueryToTracks(query, requestedBy) {
  const input = String(query || '').trim();
  if (!input) {
    throw new MusicError('Provide a YouTube/Spotify/SoundCloud link or a search query to play.');
  }

  try {
    const validation = play.validate(input);

    if (validation === 'yt_playlist') {
      const playlist = await play.playlist_info(input, { incomplete: true });
      const videos = await playlist.all_videos();
      return videos.slice(0, 50).map((video) => toTrackPayload(video, requestedBy));
    }

    if (validation === 'yt_video') {
      const video = await play.video_info(input);
      return [toTrackPayload(video.video_details, requestedBy)];
    }

    if (validation === 'sp_track') {
      const spotifyTrack = await play.spotify(input);
      const queryText = `${spotifyTrack.name} ${spotifyTrack.artists?.map((artist) => artist.name).join(' ') || ''}`.trim();
      const results = await play.search(queryText, { limit: 1, source: { youtube: 'video' } });
      if (!results.length) throw new MusicError('Spotify track metadata loaded, but no playable source was found on YouTube.');
      return [{
        ...toTrackPayload(results[0], requestedBy),
        sourceLabel: 'Spotify → YouTube',
        provider: 'Spotify',
      }];
    }

    if (validation === 'sp_album' || validation === 'sp_playlist') {
      const spotifyList = await play.spotify(input);
      const spotifyTracks = await spotifyList.all_tracks();
      const limitedTracks = spotifyTracks.slice(0, 50);
      const resolved = [];

      for (const spotifyTrack of limitedTracks) {
        const queryText = `${spotifyTrack.name} ${spotifyTrack.artists?.map((artist) => artist.name).join(' ') || ''}`.trim();
        const [result] = await play.search(queryText, { limit: 1, source: { youtube: 'video' } });
        if (result) {
          resolved.push({
            ...toTrackPayload(result, requestedBy),
            sourceLabel: 'Spotify → YouTube',
            provider: 'Spotify',
          });
        }
      }

      if (!resolved.length) {
        throw new MusicError('Spotify playlist metadata loaded, but none of the tracks could be resolved into playable sources.');
      }

      return resolved;
    }

    if (validation === 'so_track') {
      const info = await play.soundcloud(input);
      return [toTrackPayload(info, requestedBy)];
    }

    if (validation === 'so_playlist') {
      const playlist = await play.soundcloud(input);
      const tracks = await playlist.all_tracks();
      return tracks.slice(0, 50).map((track) => toTrackPayload(track, requestedBy));
    }

    const [result] = await play.search(input, { limit: 1, source: { youtube: 'video', soundcloud: 'tracks' } });
    if (!result) {
      throw new MusicError('No playable results were found for that query.');
    }

    return [toTrackPayload(result, requestedBy)];
  } catch (error) {
    if (error instanceof MusicError) throw error;

    const message = String(error?.message || 'Unknown provider error');
    if (message.toLowerCase().includes('spotify')) {
      throw new MusicError('Spotify resolution failed. Check your Spotify credentials or try the track title directly.');
    }
    if (message.toLowerCase().includes('soundcloud')) {
      throw new MusicError('SoundCloud lookup failed for that input. Try another track, playlist, or plain search query.');
    }
    if (message.toLowerCase().includes('youtube')) {
      throw new MusicError('YouTube lookup failed for that input. Try another URL or search phrase.');
    }
    throw new MusicError('That source could not be resolved into a playable track right now.');
  }
}

async function createTrackResource(track, inlineVolume = 80) {
  if (!track?.url) {
    throw new MusicError('The resolved track did not include a playable URL.');
  }

  const stream = await play.stream(track.url, {
    quality: 2,
    discordPlayerCompatibility: true,
  });

  const resource = createAudioResource(stream.stream, {
    inputType: stream.type || StreamType.Arbitrary,
    inlineVolume: true,
  });

  if (resource.volume) {
    resource.volume.setVolume(inlineVolume / 100);
  }

  return resource;
}

function bindQueueLifecycle(queue) {
  if (queue.lifecycleBound) return;
  queue.lifecycleBound = true;

  queue.player.on(AudioPlayerStatus.Idle, async () => {
    try {
      const previous = queue.currentTrack;

      if (previous && queue.loopMode === LOOP_MODES.TRACK) {
        queue.tracks.unshift(previous);
      } else if (previous && queue.loopMode === LOOP_MODES.QUEUE) {
        queue.tracks.push(previous);
      }

      setCurrentTrack(queue, null);
      await processQueue(queue);
    } catch (error) {
      logWarn(`Queue idle transition failed for guild ${queue.guildId}.`, error);
    }
  });

  queue.player.on('error', async (error) => {
    logWarn(`Playback error in guild ${queue.guildId}. Skipping current track.`, error);
    setCurrentTrack(queue, null);
    await processQueue(queue);
  });
}

async function connectToVoiceChannel(guild, voiceChannel, botMember) {
  ensureConnectPermissions(voiceChannel, botMember);
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      destroyQueue(guild.id);
    }
  });

  await waitForConnectionReady(connection);
  return connection;
}

async function processQueue(queue) {
  if (queue.currentTrack) return queue.currentTrack;

  const nextTrack = queue.tracks.shift() || null;
  if (!nextTrack) {
    setTimeout(() => {
      const freshQueue = getGuildQueue(queue.guildId);
      if (freshQueue && !freshQueue.currentTrack && !freshQueue.tracks.length) {
        destroyQueue(queue.guildId);
      }
    }, MUSIC_IDLE_TIMEOUT_MS).unref?.();
    return null;
  }

  const resource = await createTrackResource(nextTrack, queue.volume);
  setCurrentTrack(queue, nextTrack);
  queue.player.play(resource);
  return nextTrack;
}

async function ensureQueueForRequest(source) {
  ensureGuildContext(source);
  const member = getMemberFromSource(source);
  const actor = getActorFromSource(source);
  const voiceChannel = ensureVoiceChannel(member);
  const botMember = await source.guild.members.fetchMe();
  const existingQueue = getGuildQueue(source.guild.id);

  if (existingQueue?.voiceChannelId && existingQueue.voiceChannelId !== voiceChannel.id) {
    throw new MusicError('Serenity is already active in another voice channel for this server. Join that channel or stop the current queue first.');
  }

  const queue = getOrCreateGuildQueue({
    guildId: source.guild.id,
    textChannelId: source.channel?.id || source.channelId || existingQueue?.textChannelId || null,
    voiceChannelId: voiceChannel.id,
  });

  queue.guild = source.guild;
  queue.guildName = source.guild.name;
  queue.textChannelId = source.channel?.id || source.channelId || queue.textChannelId;
  queue.voiceChannelId = voiceChannel.id;
  bindQueueLifecycle(queue);

  if (!queue.connection) {
    const connection = await connectToVoiceChannel(source.guild, voiceChannel, botMember);
    setQueueConnection(queue, connection);
  }

  return { queue, member, actor, voiceChannel };
}

async function playCommand(source, query) {
  const { queue, actor } = await ensureQueueForRequest(source);
  const tracks = await resolveQueryToTracks(query, actor);
  const shouldStart = !queue.currentTrack;
  const queuedTracks = enqueueTracks(queue, tracks);

  if (shouldStart) {
    await processQueue(queue);
  }

  const previewTrack = shouldStart ? queue.currentTrack : queuedTracks[0];
  return {
    embeds: [buildPlayEmbed({
      track: previewTrack,
      queueLength: getQueueSize(queue),
      addedCount: queuedTracks.length,
      started: shouldStart,
    })],
  };
}

function requireExistingQueue(source) {
  ensureGuildContext(source);
  const queue = getGuildQueue(source.guild.id);
  if (!queue || (!queue.currentTrack && !queue.tracks.length)) {
    throw new MusicError('There is no active music queue in this server right now.');
  }
  return queue;
}

function requireControllableQueue(source) {
  const queue = requireExistingQueue(source);
  const member = getMemberFromSource(source);
  ensureVoiceChannel(member);
  ensureSameVoiceChannel(member, queue);
  return { queue, member };
}

async function pauseCommand(source) {
  const { queue } = requireControllableQueue(source);
  if (!queue.currentTrack) throw new MusicError('Nothing is currently playing.');
  queue.player.pause();
  return { embeds: [buildStateEmbed('Playback paused', `Paused **${queue.currentTrack.title}**.`, 'success')] };
}

async function resumeCommand(source) {
  const { queue } = requireControllableQueue(source);
  if (!queue.currentTrack) throw new MusicError('Nothing is currently playing.');
  queue.player.unpause();
  return { embeds: [buildStateEmbed('Playback resumed', `Resumed **${queue.currentTrack.title}**.`, 'success')] };
}

async function skipCommand(source) {
  const { queue } = requireControllableQueue(source);
  if (!queue.currentTrack) throw new MusicError('Nothing is currently playing.');
  const skipped = queue.currentTrack;
  setCurrentTrack(queue, null);
  queue.player.stop();
  return { embeds: [buildStateEmbed('Track skipped', `Skipped **${skipped.title}**.`, 'success')] };
}

async function stopCommand(source) {
  const { queue } = requireControllableQueue(source);
  const removed = clearUpcoming(queue);
  setCurrentTrack(queue, null);
  queue.player.stop();
  destroyQueue(source.guild.id);
  return { embeds: [buildStateEmbed('Queue stopped', `Playback ended and ${removed} queued track${removed === 1 ? '' : 's'} were cleared.`, 'success')] };
}

async function leaveCommand(source) {
  const { queue } = requireControllableQueue(source);
  const remaining = clearUpcoming(queue);
  setCurrentTrack(queue, null);
  queue.player.stop();
  destroyQueue(source.guild.id);
  return { embeds: [buildStateEmbed('Disconnected', `Left the voice channel and cleared ${remaining} queued track${remaining === 1 ? '' : 's'}.`, 'success')] };
}

async function queueCommand(source, page = 1) {
  const queue = requireExistingQueue(source);
  return { embeds: [buildQueueEmbed(queue, page)] };
}

async function nowPlayingCommand(source) {
  const queue = requireExistingQueue(source);
  return { embeds: [buildNowPlayingEmbed(queue)] };
}

async function removeCommand(source, position) {
  const { queue } = requireControllableQueue(source);
  if (Number(position) === 1) {
    throw new MusicError('To remove the currently playing track, use `/skip` or `/stop`.');
  }
  const removedTrack = removeTrack(queue, position);
  if (!removedTrack) {
    throw new MusicError('That queue position does not exist.');
  }
  return { embeds: [buildRemovedEmbed(removedTrack, position)] };
}

async function clearCommand(source) {
  const { queue } = requireControllableQueue(source);
  const removed = clearUpcoming(queue);
  return { embeds: [buildStateEmbed('Queue cleared', `Removed ${removed} queued track${removed === 1 ? '' : 's'}. The current track will keep playing until it ends or is skipped.`, 'success')] };
}

async function shuffleCommand(source) {
  const { queue } = requireControllableQueue(source);
  if (queue.tracks.length < 2) {
    throw new MusicError('You need at least two queued tracks before shuffle does anything useful.');
  }
  shuffleQueue(queue);
  return { embeds: [buildStateEmbed('Queue shuffled', `Shuffled **${queue.tracks.length}** upcoming tracks.`, 'success')] };
}

async function loopCommand(source, mode) {
  const { queue } = requireControllableQueue(source);
  const nextMode = setLoopMode(queue, String(mode || 'off').toLowerCase());
  return { embeds: [buildStateEmbed('Loop mode updated', `Loop mode is now **${nextMode.toUpperCase()}**.`, 'success')] };
}

async function volumeCommand(source, volume) {
  const { queue } = requireControllableQueue(source);
  const applied = setQueueVolume(queue, volume);
  return { embeds: [buildStateEmbed('Volume updated', `Playback volume is now **${applied}%**.`, 'success')] };
}

async function destroyMusicSubsystem() {
  for (const queue of getAllGuildQueues()) {
    destroyQueue(queue.guildId);
  }
}

module.exports = {
  LOOP_MODES,
  MusicError,
  clearCommand,
  destroyMusicSubsystem,
  ensureMusicSubsystem,
  leaveCommand,
  loopCommand,
  nowPlayingCommand,
  pauseCommand,
  playCommand,
  queueCommand,
  removeCommand,
  resumeCommand,
  shuffleCommand,
  skipCommand,
  stopCommand,
  volumeCommand,
};
