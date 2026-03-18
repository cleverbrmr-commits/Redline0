const fsp = require('fs/promises');
const path = require('path');

const MODERATION_FILE = path.join(__dirname, '..', 'moderation.json');

const DEFAULT_MODERATION_STATE = {
  guilds: {},
};

async function ensureModerationStore() {
  try {
    await fsp.access(MODERATION_FILE);
  } catch {
    await fsp.writeFile(MODERATION_FILE, JSON.stringify(DEFAULT_MODERATION_STATE, null, 2), 'utf8');
  }
}

async function loadModerationState() {
  await ensureModerationStore();

  try {
    const raw = await fsp.readFile(MODERATION_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return {
      ...DEFAULT_MODERATION_STATE,
      ...parsed,
      guilds: parsed?.guilds && typeof parsed.guilds === 'object' ? parsed.guilds : {},
    };
  } catch {
    return { ...DEFAULT_MODERATION_STATE, guilds: {} };
  }
}

async function saveModerationState(state) {
  const nextState = {
    ...DEFAULT_MODERATION_STATE,
    ...state,
    guilds: state?.guilds && typeof state.guilds === 'object' ? state.guilds : {},
  };

  await fsp.writeFile(MODERATION_FILE, JSON.stringify(nextState, null, 2), 'utf8');
}

module.exports = {
  DEFAULT_MODERATION_STATE,
  MODERATION_FILE,
  ensureModerationStore,
  loadModerationState,
  saveModerationState,
};
