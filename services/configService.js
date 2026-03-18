const { ensureConfigStore, loadConfigRaw, saveConfigRaw } = require("../storage/configStore");

const DEFAULT_CONFIG = {
  downloadLogChannelId: null,
  modLogChannelId: null,
  prisonLogChannelId: null,
  announceLogChannelId: null,
};

function getConfiguredLogChannelId(config, key) {
  const fallbackByKey = {
    downloadLogChannelId: process.env.DOWNLOAD_LOG_CHANNEL_ID,
    modLogChannelId: process.env.MOD_LOG_CHANNEL_ID,
    prisonLogChannelId: process.env.PRISON_LOG_CHANNEL_ID,
    announceLogChannelId: process.env.ANNOUNCE_LOG_CHANNEL_ID,
  };

  return config?.[key] || fallbackByKey[key] || null;
}

function getConfigDisplayRows(config) {
  return [
    ["Download log", config.downloadLogChannelId],
    ["Moderation log", config.modLogChannelId],
    ["Prison log", config.prisonLogChannelId],
    ["Announcement log", config.announceLogChannelId],
  ];
}

async function ensureConfigStorage() {
  await ensureConfigStore(DEFAULT_CONFIG);
}

async function loadConfig() {
  const raw = await loadConfigRaw(DEFAULT_CONFIG);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
  };
}

async function saveConfig(config) {
  await saveConfigRaw({
    ...DEFAULT_CONFIG,
    ...config,
  });
}

module.exports = {
  DEFAULT_CONFIG,
  ensureConfigStorage,
  getConfigDisplayRows,
  getConfiguredLogChannelId,
  loadConfig,
  saveConfig,
};
