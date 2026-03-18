const fsp = require('fs/promises');
const path = require('path');

const YOUTUBE_FILE = path.join(__dirname, '..', 'youtube-subscriptions.json');

const DEFAULT_YOUTUBE_STATE = {
  subscriptions: [],
};

async function ensureYoutubeStore() {
  try {
    await fsp.access(YOUTUBE_FILE);
  } catch {
    await fsp.writeFile(YOUTUBE_FILE, JSON.stringify(DEFAULT_YOUTUBE_STATE, null, 2), 'utf8');
  }
}

async function loadYoutubeState() {
  await ensureYoutubeStore();

  try {
    const raw = await fsp.readFile(YOUTUBE_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return {
      ...DEFAULT_YOUTUBE_STATE,
      ...parsed,
      subscriptions: Array.isArray(parsed?.subscriptions) ? parsed.subscriptions : [],
    };
  } catch {
    return { ...DEFAULT_YOUTUBE_STATE, subscriptions: [] };
  }
}

async function saveYoutubeState(state) {
  const nextState = {
    ...DEFAULT_YOUTUBE_STATE,
    ...state,
    subscriptions: Array.isArray(state?.subscriptions) ? state.subscriptions : [],
  };

  await fsp.writeFile(YOUTUBE_FILE, JSON.stringify(nextState, null, 2), 'utf8');
}

module.exports = {
  DEFAULT_YOUTUBE_STATE,
  YOUTUBE_FILE,
  ensureYoutubeStore,
  loadYoutubeState,
  saveYoutubeState,
};
