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
  peekNextTrack,
  removeTrack,
  setCurrentTrack,
  setLoopMode,
  setQueueConnection,
  setQueueVolume,
  shiftNextTrack,
  shuffleQueue,
  waitForConnectionReady,
} = require('./queueService');
const {
  createAudioResource,
  entersState,
  generateDependencyReport,
  joinVoiceChannel,
  StreamType,
  VoiceConnectionStatus,
} = require('@discordjs/voice');
const play = require('play-dl');
const { ChannelType, PermissionsBitField } = require('discord.js');
const {
  buildNowPlayingEmbed,
  buildPlayEmbed,
  buildQueueEmbed,
  buildRemovedEmbed,
  buildStateEmbed,
} = require('../utils/musicEmbeds');

const MUSIC_LOG_PREFIX = '[music]';
const MUSIC_IDLE_TIMEOUT_MS = 120_000;
const MAX_PLAYLIST_TRACKS = 50;

class MusicError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MusicError';
    this.code = options.code || 'MUSIC_ERROR';
    this.cause = options.cause;
  }
}

let musicBootstrapped = false;

function logInfo(message) {
  console.log(`${MUSIC_LOG_PREFIX} ${message}`);
}

function logWarn(message, error = null) {
  console.warn(`${MUSIC_LOG_PREFIX} ${message}`);
  if (error) {
    console.warn(error);
  }
}

function isLikelyUrl(value) {
  return /^(https?:\/\/|www\.)/i.test(String(value || '').trim());
}

function normalizeUrlInput(input) {
  const raw = String(input || '').trim();
  if (!raw) return { normalized: raw, providerLabel: null };

  let parsed = null;
  try {
    parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return { normalized: raw, providerLabel: null };
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'music.youtube.com') {
    const videoId = parsed.searchParams.get('v');
    const listId = parsed.searchParams.get('list');

    if (videoId) {
      const normalized = new URL('https://www.youtube.com/watch');
      normalized.searchParams.set('v', videoId);
      if (listId) normalized.searchParams.set('list', listId);
      return { normalized: normalized.toString(), providerLabel: 'YouTube Music' };
    }

    if (listId) {
      const normalized = new URL('https://www.youtube.com/playlist');
      normalized.searchParams.set('list', listId);
      return { normalized: normalized.toString(), providerLabel: 'YouTube Music' };
    }
  }

  if (host === 'youtu.be') {
    const videoId = parsed.pathname.replace(/^\//, '').trim();
    if (videoId) {
      const normalized = new URL('https://www.youtube.com/watch');
      normalized.searchParams.set('v', videoId);
      for (const [key, value] of parsed.searchParams.entries()) {
        normalized.searchParams.set(key, value);
      }
      return { normalized: normalized.toString(), providerLabel: 'YouTube' };
    }
  }

  return { normalized: parsed.toString(), providerLabel: null };
}

function providerLabelFromUrl(url) {
  const value = String(url || '').toLowerCase();
  if (value.includes('spotify.com')) return 'Spotify';
  if (value.includes('soundcloud.com')) return 'SoundCloud';
  if (value.includes('youtube.com') || value.includes('youtu.be')) return 'YouTube';
  return 'Unknown';
}

function inferArtist(entry) {
  return entry?.channel?.name
    || entry?.channel?.toString?.()
    || entry?.channel
    || entry?.artist?.name
    || entry?.artists?.map?.((artist) => artist.name).filter(Boolean).join(', ')
    || entry?.user?.name
    || entry?.uploader?.name
    || null;
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

function toTrackPayload(entry, requestedBy, overrides = {}) {
  const baseUrl = entry?.url || entry?.permalink || entry?.href || null;
  const playbackUrl = overrides.playbackUrl || baseUrl;
  const provider = overrides.provider || providerLabelFromUrl(playbackUrl || baseUrl);

  return {
    id: overrides.id || entry?.id || playbackUrl || `${Date.now()}-${Math.random()}`,
    title: overrides.title || entry?.title || entry?.name || 'Unknown track',
    url: overrides.url || baseUrl || playbackUrl,
    playbackUrl: playbackUrl || baseUrl,
    durationMs: overrides.durationMs || (entry?.durationInSec ? entry.durationInSec * 1000 : entry?.durationRaw ? parseDurationRaw(entry.durationRaw) : entry?.durationInMs || entry?.duration || 0),
    thumbnail: overrides.thumbnail || entry?.thumbnails?.[0]?.url || entry?.thumbnail?.url || entry?.thumbnail || entry?.artwork_url || null,
    requestedBy,
    sourceLabel: overrides.sourceLabel || provider,
    provider,
    artist: overrides.artist || inferArtist(entry),
    originalQuery: overrides.originalQuery || null,
    normalizedFrom: overrides.normalizedFrom || null,
  };
}

function buildSpotifySearchQuery(trackLike) {
  const title = trackLike?.name || trackLike?.title || 'Unknown track';
  const artist = trackLike?.artists?.map?.((artist) => artist.name).filter(Boolean).join(' ') || inferArtist(trackLike) || '';
  return `${title} ${artist}`.trim();
}

async function searchYouTubeTracks(query, limit = 1) {
  return play.search(query, {
    limit,
    source: {
      youtube: 'video',
    },
  });
}

async function resolveSpotifyTrackToPlayableTrack(spotifyTrack, requestedBy, originalQuery) {
  const searchQuery = buildSpotifySearchQuery(spotifyTrack);
  const [youtubeResult] = await searchYouTubeTracks(searchQuery, 1);

  if (!youtubeResult) {
    throw new MusicError('Spotify metadata was found, but no playable YouTube match could be resolved for that track.');
  }

  return toTrackPayload(youtubeResult, requestedBy, {
    sourceLabel: 'Spotify → YouTube',
    provider: 'Spotify',
    artist: spotifyTrack.artists?.map?.((artist) => artist.name).filter(Boolean).join(', ') || inferArtist(youtubeResult),
    originalQuery,
  });
}

async function resolveQueryToTracks(query, requestedBy) {
  const rawInput = String(query || '').trim();
  if (!rawInput) {
    throw new MusicError('Provide a YouTube, YouTube Music, Spotify, or SoundCloud link, or a search query to play.');
  }

  const { normalized, providerLabel } = normalizeUrlInput(rawInput);
  const validation = await play.validate(normalized);
  const queryLooksLikeUrl = isLikelyUrl(rawInput);

  try {
    if (validation === 'yt_playlist') {
      const playlist = await play.playlist_info(normalized, { incomplete: true });
      const videos = await playlist.all_videos();
      return videos.slice(0, MAX_PLAYLIST_TRACKS).map((video) => toTrackPayload(video, requestedBy, {
        sourceLabel: providerLabel || 'YouTube',
        originalQuery: rawInput,
        normalizedFrom: providerLabel ? rawInput : null,
      }));
    }

    if (validation === 'yt_video') {
      const video = await play.video_basic_info(normalized);
      return [toTrackPayload(video.video_details, requestedBy, {
        sourceLabel: providerLabel || 'YouTube',
        playbackUrl: normalized,
        originalQuery: rawInput,
        normalizedFrom: providerLabel ? rawInput : null,
      })];
    }

    if (validation === 'sp_track') {
      const spotifyTrack = await play.spotify(normalized);
      return [await resolveSpotifyTrackToPlayableTrack(spotifyTrack, requestedBy, rawInput)];
    }

    if (validation === 'sp_album' || validation === 'sp_playlist') {
      const spotifyCollection = await play.spotify(normalized);
      const spotifyTracks = await spotifyCollection.all_tracks();
      const playableTracks = [];

      for (const spotifyTrack of spotifyTracks.slice(0, MAX_PLAYLIST_TRACKS)) {
        try {
          playableTracks.push(await resolveSpotifyTrackToPlayableTrack(spotifyTrack, requestedBy, rawInput));
        } catch (error) {
          logWarn(`Skipping unresolved Spotify track during collection import: ${spotifyTrack.name || spotifyTrack.title || 'Unknown track'}.`, error);
        }
      }

      if (!playableTracks.length) {
        throw new MusicError('Spotify metadata was loaded, but none of the collection tracks could be turned into playable sources.');
      }

      return playableTracks;
    }

    if (validation === 'so_track') {
      const soundcloudTrack = await play.soundcloud(normalized);
      return [toTrackPayload(soundcloudTrack, requestedBy, {
        sourceLabel: 'SoundCloud',
        playbackUrl: normalized,
        originalQuery: rawInput,
      })];
    }

    if (validation === 'so_playlist') {
      const playlist = await play.soundcloud(normalized);
      const tracks = await playlist.all_tracks();
      return tracks.slice(0, MAX_PLAYLIST_TRACKS).map((track) => toTrackPayload(track, requestedBy, {
        sourceLabel: 'SoundCloud',
        originalQuery: rawInput,
      }));
    }

    if (validation === false && queryLooksLikeUrl) {
      const provider = providerLabelFromUrl(normalized);
      if (provider === 'Spotify') {
        throw new MusicError('Spotify links require valid Spotify API credentials before Serenity can resolve them.');
      }
      throw new MusicError('That link is unsupported or could not be recognized as a playable YouTube, YouTube Music, Spotify, or SoundCloud URL.');
    }

    const results = await searchYouTubeTracks(rawInput, 1);
    if (!results.length) {
      throw new MusicError('No playable results were found for that search query.');
    }

    return [toTrackPayload(results[0], requestedBy, {
      sourceLabel: 'YouTube',
      originalQuery: rawInput,
    })];
  } catch (error) {
    if (error instanceof MusicError) {
      throw error;
    }

    logWarn(`Source resolution failed for input: ${rawInput}`, error);
    const message = String(error?.message || '').toLowerCase();

    if (message.includes('spotify')) {
      throw new MusicError('Spotify resolution failed. Check Spotify credentials or try using the track title directly.');
    }

    if (message.includes('soundcloud')) {
      throw new MusicError('SoundCloud failed to resolve that track or playlist. Try another link or a plain search query.');
    }

    if (message.includes('youtube') || message.includes('video unavailable')) {
      throw new MusicError('YouTube failed to resolve that input into a playable track. Try another URL or search phrase.');
    }

    throw new MusicError('The requested source could not be resolved into a playable track.');
  }
}

async function createTrackResource(track, inlineVolume = 80) {
  if (!track?.playbackUrl && !track?.url) {
    throw new MusicError('The resolved track did not include a playable source URL.');
  }

  try {
    const stream = await play.stream(track.playbackUrl || track.url);
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type || StreamType.Arbitrary,
      inlineVolume: true,
    });

    if (resource.volume) {
      resource.volume.setVolume(inlineVolume / 100);
    }

    return resource;
  } catch (error) {
    logWarn(`Stream creation failed for track: ${track.title}`, error);
    const message = String(error?.message || '').toLowerCase();

    if (error?.name === 'AbortError' || message.includes('aborted')) {
      throw new MusicError('Failed to resolve a playable audio stream because the provider connection was interrupted. Please try again.');
    }

    if (message.includes('ffmpeg')) {
      throw new MusicError('Playback could not start because FFmpeg or a required voice dependency is missing on the host.');
    }

    if (message.includes('sign in to confirm')) {
      throw new MusicError('YouTube refused to serve that track without additional account verification.');
    }

    throw new MusicError('Failed to resolve a playable audio stream for that track.');
  }
}

async function sendQueueWarning(queue, description) {
  const guild = queue.guild;
  if (!guild || !queue.textChannelId) return null;

  const channel = await guild.channels.fetch(queue.textChannelId).catch(() => null);
  if (!channel || typeof channel.send !== 'function') return null;

  return channel.send({
    embeds: [buildStateEmbed('Playback warning', description, 'warning')],
  }).catch(() => null);
}

function bindQueueLifecycle(queue) {
  if (queue.lifecycleBound) return;
  queue.lifecycleBound = true;

  queue.player.on(AudioPlayerStatus.Idle, async () => {
    try {
      const previous = queue.currentTrack;

      if (previous && queue.loopMode === LOOP_MODES.TRACK) {
        queue.tracks.unshift({ ...previous });
      } else if (previous && queue.loopMode === LOOP_MODES.QUEUE) {
        queue.tracks.push({ ...previous });
      }

      setCurrentTrack(queue, null);
      await processQueue(queue, { notifyOnSkip: true });
    } catch (error) {
      logWarn(`Queue idle transition failed for guild ${queue.guildId}.`, error);
    }
  });

  queue.player.on('error', async (error) => {
    logWarn(`Playback error in guild ${queue.guildId}.`, error);
    queue.lastPlaybackError = error;
    setCurrentTrack(queue, null);
    await sendQueueWarning(queue, 'Playback was interrupted, so Serenity skipped to the next playable track.');
    await processQueue(queue, { notifyOnSkip: true });
  });
}

async function connectToVoiceChannel(guild, voiceChannel, botMember) {
  ensureConnectPermissions(voiceChannel, botMember);

  try {
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
  } catch (error) {
    logWarn(`Voice connection failed for guild ${guild.id}.`, error);
    throw new MusicError('Failed to connect to your voice channel. Check that Serenity can join and speak there.', {
      code: 'VOICE_CONNECT_FAILED',
      cause: error,
    });
  }
}

function scheduleIdleCleanup(queue) {
  setTimeout(() => {
    const freshQueue = getGuildQueue(queue.guildId);
    if (freshQueue && !freshQueue.currentTrack && !freshQueue.tracks.length) {
      destroyQueue(queue.guildId);
    }
  }, MUSIC_IDLE_TIMEOUT_MS).unref?.();
}

async function processQueue(queue, options = {}) {
  if (queue.currentTrack) return queue.currentTrack;

  while (peekNextTrack(queue)) {
    const candidate = peekNextTrack(queue);

    try {
      const resource = await createTrackResource(candidate, queue.volume);
      shiftNextTrack(queue);
      setCurrentTrack(queue, candidate);
      queue.player.play(resource);
      return candidate;
    } catch (error) {
      const failedTrack = shiftNextTrack(queue) || candidate;
      queue.lastPlaybackError = error;
      logWarn(`Skipping unplayable track in guild ${queue.guildId}: ${failedTrack.title}`, error);

      if (options.notifyOnSkip) {
        await sendQueueWarning(queue, `Skipped **${failedTrack.title}** because its stream could not be prepared.`);
      }

      if (options.failFast) {
        if (!queue.tracks.length && !queue.currentTrack) {
          destroyQueue(queue.guildId);
        }
        throw error;
      }
    }
  }

  scheduleIdleCleanup(queue);
  return null;
}

async function ensureMusicSubsystem(client) {
  if (musicBootstrapped) return;
  musicBootstrapped = true;

  try {
    const report = generateDependencyReport();
    logInfo(`Voice dependency report:\n${report}`);
  } catch (error) {
    logWarn('Could not generate voice dependency report.', error);
  }

  try {
    const tokens = {};

    if (process.env.YOUTUBE_COOKIE) {
      tokens.youtube = { cookie: process.env.YOUTUBE_COOKIE };
    }

    if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
      tokens.spotify = {
        client_id: process.env.SPOTIFY_CLIENT_ID,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET,
        refresh_token: process.env.SPOTIFY_REFRESH_TOKEN || '',
        market: process.env.SPOTIFY_MARKET || 'US',
      };
    }

    const soundcloudClientId = process.env.SOUNDCLOUD_CLIENT_ID || await play.getFreeClientID().catch(() => null);
    if (soundcloudClientId) {
      tokens.soundcloud = { client_id: soundcloudClientId };
    }

    if (Object.keys(tokens).length) {
      await play.setToken(tokens);
    }
  } catch (error) {
    logWarn('Source token bootstrap failed; continuing with best-effort provider support.', error);
  }

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
  const shouldStartImmediately = !queue.currentTrack;
  const queuedTracks = enqueueTracks(queue, tracks);

  if (shouldStartImmediately) {
    await processQueue(queue, { failFast: true });
  }

  if (!queue.currentTrack && !queue.tracks.length) {
    throw new MusicError('Playback could not start because no playable audio streams were available from that request.');
  }

  const previewTrack = shouldStartImmediately ? queue.currentTrack : queuedTracks[0];
  return {
    embeds: [buildPlayEmbed({
      track: previewTrack,
      queueLength: getQueueSize(queue),
      addedCount: queuedTracks.length,
      started: shouldStartImmediately,
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
