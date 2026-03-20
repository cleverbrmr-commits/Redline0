const { createAudioPlayer, NoSubscriberBehavior, AudioPlayerStatus, VoiceConnectionStatus, entersState } = require('@discordjs/voice');

const DEFAULT_VOLUME = 80;
const MAX_VOLUME = 200;
const LOOP_MODES = {
  OFF: 'off',
  TRACK: 'track',
  QUEUE: 'queue',
};

const guildQueues = new Map();

function clampVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_VOLUME;
  return Math.min(MAX_VOLUME, Math.max(0, Math.round(numeric)));
}

function createGuildQueue({ guildId, textChannelId = null, voiceChannelId = null }) {
  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Pause,
    },
  });

  const queue = {
    guildId,
    textChannelId,
    voiceChannelId,
    connection: null,
    player,
    tracks: [],
    currentTrack: null,
    loopMode: LOOP_MODES.OFF,
    volume: DEFAULT_VOLUME,
    nowPlayingStartedAt: null,
    destroyed: false,
  };

  guildQueues.set(guildId, queue);
  return queue;
}

function getGuildQueue(guildId) {
  return guildQueues.get(guildId) || null;
}

function getOrCreateGuildQueue(options) {
  return getGuildQueue(options.guildId) || createGuildQueue(options);
}

function getAllGuildQueues() {
  return [...guildQueues.values()];
}

function setQueueConnection(queue, connection) {
  queue.connection = connection;

  if (connection) {
    queue.voiceChannelId = connection.joinConfig.channelId;
    connection.subscribe(queue.player);
  }
}

function attachTrack(queue, track) {
  return {
    ...track,
    queuePositionHint: queue.currentTrack ? queue.tracks.length + 2 : queue.tracks.length + 1,
  };
}

function enqueueTracks(queue, tracks) {
  const normalized = tracks.map((track) => attachTrack(queue, track));
  queue.tracks.push(...normalized);
  return normalized;
}

function dequeueNextTrack(queue) {
  return queue.tracks.shift() || null;
}

function setCurrentTrack(queue, track) {
  queue.currentTrack = track || null;
  queue.nowPlayingStartedAt = track ? Date.now() : null;
}

function getQueueSize(queue) {
  return (queue.currentTrack ? 1 : 0) + queue.tracks.length;
}

function clearUpcoming(queue) {
  const removed = queue.tracks.length;
  queue.tracks = [];
  return removed;
}

function removeTrack(queue, position) {
  const index = Number(position) - 2;
  if (!Number.isInteger(index) || index < 0 || index >= queue.tracks.length) {
    return null;
  }

  return queue.tracks.splice(index, 1)[0] || null;
}

function shuffleQueue(queue) {
  for (let index = queue.tracks.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [queue.tracks[index], queue.tracks[swapIndex]] = [queue.tracks[swapIndex], queue.tracks[index]];
  }

  return queue.tracks;
}

function setLoopMode(queue, mode) {
  queue.loopMode = Object.values(LOOP_MODES).includes(mode) ? mode : LOOP_MODES.OFF;
  return queue.loopMode;
}

function setQueueVolume(queue, volume) {
  queue.volume = clampVolume(volume);
  const resource = queue.player.state.resource;
  if (resource?.volume) {
    resource.volume.setVolume(queue.volume / 100);
  }
  return queue.volume;
}

async function waitForConnectionReady(connection) {
  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  return connection;
}

function destroyQueue(guildId) {
  const queue = guildQueues.get(guildId);
  if (!queue) return false;

  queue.destroyed = true;
  try {
    queue.player.stop(true);
  } catch {}
  try {
    queue.connection?.destroy();
  } catch {}

  guildQueues.delete(guildId);
  return true;
}

module.exports = {
  AudioPlayerStatus,
  LOOP_MODES,
  MAX_VOLUME,
  DEFAULT_VOLUME,
  VoiceConnectionStatus,
  clearUpcoming,
  clampVolume,
  createGuildQueue,
  dequeueNextTrack,
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
};
