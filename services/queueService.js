const {
  createAudioPlayer,
  NoSubscriberBehavior,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');

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
    guildName: null,
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
    lifecycleBound: false,
    isStarting: false,
    lastPlaybackError: null,
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

function annotateTrack(track, position) {
  return {
    ...track,
    queuePositionHint: position,
  };
}

function reindexQueue(queue) {
  queue.tracks = queue.tracks.map((track, index) => annotateTrack(track, (queue.currentTrack ? 2 : 1) + index));
  return queue.tracks;
}

function enqueueTracks(queue, tracks) {
  queue.tracks.push(...tracks.map((track) => ({ ...track })));
  reindexQueue(queue);
  return queue.tracks.slice(-tracks.length);
}

function peekNextTrack(queue) {
  return queue.tracks[0] || null;
}

function shiftNextTrack(queue) {
  const next = queue.tracks.shift() || null;
  reindexQueue(queue);
  return next;
}

function setCurrentTrack(queue, track) {
  queue.currentTrack = track || null;
  queue.nowPlayingStartedAt = track ? Date.now() : null;
  reindexQueue(queue);
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

  const removed = queue.tracks.splice(index, 1)[0] || null;
  reindexQueue(queue);
  return removed;
}

function shuffleQueue(queue) {
  for (let index = queue.tracks.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [queue.tracks[index], queue.tracks[swapIndex]] = [queue.tracks[swapIndex], queue.tracks[index]];
  }

  reindexQueue(queue);
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
  destroyQueue,
  enqueueTracks,
  getAllGuildQueues,
  getGuildQueue,
  getOrCreateGuildQueue,
  getQueueSize,
  peekNextTrack,
  removeTrack,
  reindexQueue,
  setCurrentTrack,
  setLoopMode,
  setQueueConnection,
  setQueueVolume,
  shiftNextTrack,
  shuffleQueue,
  waitForConnectionReady,
};
