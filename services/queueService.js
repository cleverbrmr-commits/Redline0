const LOOP_MODES = {
  OFF: 'off',
  TRACK: 'track',
  QUEUE: 'queue',
};

const MAX_VOLUME = 200;
const DEFAULT_VOLUME = 100;

function clampVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_VOLUME;
  return Math.min(MAX_VOLUME, Math.max(0, Math.round(numeric)));
}

function getQueueEntries(player) {
  const queue = player?.queue;
  if (!queue) return [];
  if (Array.isArray(queue)) return [...queue];
  if (typeof queue.toArray === 'function') return queue.toArray();
  if (Array.isArray(queue.tracks)) return [...queue.tracks];
  if (typeof queue.values === 'function') return [...queue.values()];
  if (typeof queue[Symbol.iterator] === 'function') return [...queue];
  return [];
}

function getCurrentTrack(player) {
  return player?.current || player?.queue?.current || null;
}

function getQueueLength(player) {
  return getQueueEntries(player).length + (getCurrentTrack(player) ? 1 : 0);
}

function setTrackRequester(track, requesterId) {
  if (!track) return track;
  track.info = {
    ...(track.info || {}),
    requester: requesterId || track.info?.requester || null,
  };
  return track;
}

function addTracks(player, tracks, requesterId) {
  const normalized = tracks.map((track) => setTrackRequester(track, requesterId));

  if (typeof player?.queue?.add === 'function') {
    for (const track of normalized) {
      player.queue.add(track);
    }
  } else if (Array.isArray(player?.queue)) {
    player.queue.push(...normalized);
  }

  return normalized;
}

function clearQueue(player) {
  const entries = getQueueEntries(player);

  if (typeof player?.queue?.clear === 'function') {
    player.queue.clear();
  } else if (Array.isArray(player?.queue)) {
    player.queue.length = 0;
  } else if (Array.isArray(player?.queue?.tracks)) {
    player.queue.tracks.length = 0;
  }

  return entries.length;
}

function removeTrack(player, position) {
  const entries = getQueueEntries(player);
  const index = Number(position) - 2;

  if (!Number.isInteger(index) || index < 0 || index >= entries.length) {
    return null;
  }

  let removed = null;
  if (typeof player?.queue?.remove === 'function') {
    removed = player.queue.remove(index);
  } else if (Array.isArray(player?.queue)) {
    removed = player.queue.splice(index, 1)[0] || null;
  } else if (Array.isArray(player?.queue?.tracks)) {
    removed = player.queue.tracks.splice(index, 1)[0] || null;
  }

  return removed || entries[index] || null;
}

function shuffleQueue(player) {
  if (typeof player?.queue?.shuffle === 'function') {
    player.queue.shuffle();
    return getQueueEntries(player);
  }

  const entries = getQueueEntries(player);
  for (let index = entries.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [entries[index], entries[swapIndex]] = [entries[swapIndex], entries[index]];
  }

  if (Array.isArray(player?.queue)) {
    player.queue.length = 0;
    player.queue.push(...entries);
  } else if (Array.isArray(player?.queue?.tracks)) {
    player.queue.tracks.length = 0;
    player.queue.tracks.push(...entries);
  }

  return entries;
}

function setLoopMode(player, mode) {
  const normalized = Object.values(LOOP_MODES).includes(mode) ? mode : LOOP_MODES.OFF;

  if (typeof player?.setLoop === 'function') {
    player.setLoop(normalized);
  } else {
    player.loop = normalized;
  }

  return normalized;
}

function getLoopMode(player) {
  const value = String(player?.loop || player?.queue?.loop || LOOP_MODES.OFF).toLowerCase();
  return Object.values(LOOP_MODES).includes(value) ? value : LOOP_MODES.OFF;
}

function setPlayerVolume(player, volume) {
  const normalized = clampVolume(volume);
  if (typeof player?.setVolume === 'function') {
    player.setVolume(normalized);
  } else {
    player.volume = normalized;
  }
  return normalized;
}

function getPlayerVolume(player) {
  return clampVolume(player?.volume ?? DEFAULT_VOLUME);
}

function isPlayerPaused(player) {
  return Boolean(player?.paused || player?.isPaused);
}

function isPlayerPlaying(player) {
  return Boolean(player?.playing || player?.isPlaying);
}

module.exports = {
  DEFAULT_VOLUME,
  LOOP_MODES,
  MAX_VOLUME,
  addTracks,
  clampVolume,
  clearQueue,
  getCurrentTrack,
  getLoopMode,
  getPlayerVolume,
  getQueueEntries,
  getQueueLength,
  isPlayerPaused,
  isPlayerPlaying,
  removeTrack,
  setLoopMode,
  setPlayerVolume,
  setTrackRequester,
  shuffleQueue,
};
