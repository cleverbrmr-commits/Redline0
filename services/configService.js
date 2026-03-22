const { ensureConfigStore, loadConfigRaw, saveConfigRaw } = require('../storage/configStore');

const DEFAULT_LOG_CHANNELS = {
  downloads: null,
  moderation: null,
  prison: null,
  announcements: null,
  members: null,
  messages: null,
  security: null,
  commands: null,
  tickets: null,
  rolemenus: null,
};

const DEFAULT_TEMPLATE_DEFAULTS = {
  welcome: 'premium',
  announcement: 'broadcast',
  embed: 'premium',
  ticket: 'support',
  poll: 'premium',
  autoresponder: 'support',
};

const DEFAULT_WELCOME_MODULE = {
  enabled: false,
  channelId: null,
  pingMember: true,
  includeAvatarBanner: true,
  style: 'premium',
  title: 'Welcome to Serenity',
  subtitle: 'A polished place to get settled in.',
  body: 'We are glad to have you here. Read the key channels, meet the community, and enjoy your stay.',
  footer: 'SERENITY • Onboarding suite',
  autoRoleId: null,
  goodbyeEnabled: false,
  goodbyeChannelId: null,
  goodbyeMessage: '{user} has left {server}.',
};

const DEFAULT_AUTOMOD_MODULE = {
  enabled: true,
  rules: {},
};

const DEFAULT_PROTECTION_MODULE = {
  antiRaid: {},
};

const DEFAULT_COMMAND_ACCESS = {
  roleAllowIds: [],
  roleDenyIds: [],
  channelAllowIds: [],
  channelDenyIds: [],
};

const DEFAULT_ANNOUNCEMENT_MODULE = {
  enabled: true,
  defaultStyle: 'broadcast',
  allowEveryonePing: false,
  allowHerePing: true,
  defaultChannelId: null,
};

const DEFAULT_TICKET_MODULE = {
  enabled: true,
  defaultStyle: 'support',
  panels: [],
};

const DEFAULT_ROLE_MENU_MODULE = {
  enabled: true,
  menus: [],
};

const DEFAULT_AUTORESPONDER_MODULE = {
  enabled: true,
  items: [],
};

const DEFAULT_POLL_MODULE = {
  enabled: true,
  defaultStyle: 'premium',
};

const DEFAULT_EMBED_MODULE = {
  enabled: true,
  defaultStyle: 'premium',
};

const DEFAULT_ALERTS_MODULE = {
  enabled: true,
};

const DEFAULT_GUILD_CONFIG = {
  modules: {
    logging: {
      enabled: true,
      channels: { ...DEFAULT_LOG_CHANNELS },
    },
    onboarding: { ...DEFAULT_WELCOME_MODULE },
    automod: { ...DEFAULT_AUTOMOD_MODULE },
    protection: { ...DEFAULT_PROTECTION_MODULE },
    announcements: { ...DEFAULT_ANNOUNCEMENT_MODULE },
    support: { ...DEFAULT_TICKET_MODULE },
    roles: { ...DEFAULT_ROLE_MENU_MODULE },
    autoresponders: { ...DEFAULT_AUTORESPONDER_MODULE },
    polls: { ...DEFAULT_POLL_MODULE },
    embeds: { ...DEFAULT_EMBED_MODULE },
    alerts: { ...DEFAULT_ALERTS_MODULE },
    templates: {
      defaults: { ...DEFAULT_TEMPLATE_DEFAULTS },
    },
    commands: {
      defaultAccess: { ...DEFAULT_COMMAND_ACCESS },
      overrides: {},
    },
  },
};

const DEFAULT_CONFIG = {
  version: 3,
  guilds: {},
  downloadLogChannelId: null,
  modLogChannelId: null,
  prisonLogChannelId: null,
  announceLogChannelId: null,
  welcomers: {},
};

function mergeDeep(base, patch) {
  if (Array.isArray(base) || Array.isArray(patch)) {
    return Array.isArray(patch) ? [...patch] : Array.isArray(base) ? [...base] : patch;
  }

  if (!base || typeof base !== 'object') {
    return patch === undefined ? base : patch;
  }

  const output = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      output[key] = mergeDeep(base[key], value);
    } else {
      output[key] = Array.isArray(value) ? [...value] : value;
    }
  }
  return output;
}

function normalizeGuildConfig(rawGuildConfig = {}, legacy = {}) {
  const onboardingLegacy = legacy.welcomer || rawGuildConfig.welcomer || {};
  const channels = {
    ...DEFAULT_LOG_CHANNELS,
    ...(rawGuildConfig.modules?.logging?.channels || {}),
  };

  return mergeDeep(DEFAULT_GUILD_CONFIG, {
    ...rawGuildConfig,
    modules: {
      ...(rawGuildConfig.modules || {}),
      logging: {
        enabled: rawGuildConfig.modules?.logging?.enabled ?? true,
        channels: {
          ...channels,
          downloads: channels.downloads || legacy.downloadLogChannelId || null,
          moderation: channels.moderation || legacy.modLogChannelId || null,
          prison: channels.prison || legacy.prisonLogChannelId || null,
          announcements: channels.announcements || legacy.announceLogChannelId || null,
        },
      },
      onboarding: {
        ...DEFAULT_WELCOME_MODULE,
        ...(rawGuildConfig.modules?.onboarding || {}),
        enabled: rawGuildConfig.modules?.onboarding?.enabled ?? Boolean(onboardingLegacy.enabled),
        channelId: rawGuildConfig.modules?.onboarding?.channelId || onboardingLegacy.channelId || null,
      },
      automod: mergeDeep(DEFAULT_AUTOMOD_MODULE, rawGuildConfig.modules?.automod || {}),
      protection: mergeDeep(DEFAULT_PROTECTION_MODULE, rawGuildConfig.modules?.protection || {}),
      announcements: mergeDeep(DEFAULT_ANNOUNCEMENT_MODULE, rawGuildConfig.modules?.announcements || {}),
      support: mergeDeep(DEFAULT_TICKET_MODULE, rawGuildConfig.modules?.support || {}),
      roles: mergeDeep(DEFAULT_ROLE_MENU_MODULE, rawGuildConfig.modules?.roles || {}),
      autoresponders: mergeDeep(DEFAULT_AUTORESPONDER_MODULE, rawGuildConfig.modules?.autoresponders || {}),
      polls: mergeDeep(DEFAULT_POLL_MODULE, rawGuildConfig.modules?.polls || {}),
      embeds: mergeDeep(DEFAULT_EMBED_MODULE, rawGuildConfig.modules?.embeds || {}),
      alerts: mergeDeep(DEFAULT_ALERTS_MODULE, rawGuildConfig.modules?.alerts || {}),
      templates: mergeDeep({ defaults: DEFAULT_TEMPLATE_DEFAULTS }, rawGuildConfig.modules?.templates || {}),
      commands: mergeDeep(DEFAULT_GUILD_CONFIG.modules.commands, rawGuildConfig.modules?.commands || {}),
    },
  });
}

function normalizeConfig(raw = {}) {
  const merged = mergeDeep(DEFAULT_CONFIG, raw || {});
  merged.guilds = merged.guilds && typeof merged.guilds === 'object' ? merged.guilds : {};

  for (const [guildId, guildConfig] of Object.entries(merged.guilds)) {
    merged.guilds[guildId] = normalizeGuildConfig(guildConfig, merged);
  }

  return merged;
}

function getConfiguredLogChannelId(config, key, guildId = null) {
  const normalized = normalizeConfig(config || {});
  const guildConfig = guildId ? normalized.guilds[guildId] : null;
  const guildChannels = guildConfig?.modules?.logging?.channels || {};
  const fallbackByKey = {
    downloadLogChannelId: normalized.downloadLogChannelId || process.env.DOWNLOAD_LOG_CHANNEL_ID || null,
    modLogChannelId: normalized.modLogChannelId || process.env.MOD_LOG_CHANNEL_ID || null,
    prisonLogChannelId: normalized.prisonLogChannelId || process.env.PRISON_LOG_CHANNEL_ID || null,
    announceLogChannelId: normalized.announceLogChannelId || process.env.ANNOUNCE_LOG_CHANNEL_ID || null,
    downloads: guildChannels.downloads || normalized.downloadLogChannelId || process.env.DOWNLOAD_LOG_CHANNEL_ID || null,
    moderation: guildChannels.moderation || normalized.modLogChannelId || process.env.MOD_LOG_CHANNEL_ID || null,
    prison: guildChannels.prison || normalized.prisonLogChannelId || process.env.PRISON_LOG_CHANNEL_ID || null,
    announcements: guildChannels.announcements || normalized.announceLogChannelId || process.env.ANNOUNCE_LOG_CHANNEL_ID || null,
    members: guildChannels.members || guildChannels.moderation || normalized.modLogChannelId || process.env.MOD_LOG_CHANNEL_ID || null,
    messages: guildChannels.messages || guildChannels.moderation || normalized.modLogChannelId || process.env.MOD_LOG_CHANNEL_ID || null,
    security: guildChannels.security || guildChannels.moderation || normalized.modLogChannelId || process.env.MOD_LOG_CHANNEL_ID || null,
    commands: guildChannels.commands || guildChannels.moderation || normalized.modLogChannelId || process.env.MOD_LOG_CHANNEL_ID || null,
    tickets: guildChannels.tickets || guildChannels.moderation || normalized.modLogChannelId || process.env.MOD_LOG_CHANNEL_ID || null,
    rolemenus: guildChannels.rolemenus || guildChannels.moderation || normalized.modLogChannelId || process.env.MOD_LOG_CHANNEL_ID || null,
  };

  return fallbackByKey[key] || null;
}

function getConfigDisplayRows(config, guildId = null) {
  const normalized = normalizeConfig(config || {});
  const guildConfig = guildId ? normalized.guilds[guildId] || normalizeGuildConfig({}, normalized) : normalizeGuildConfig({}, normalized);
  const channels = guildConfig.modules.logging.channels;

  return [
    ['Download log', channels.downloads],
    ['Moderation log', channels.moderation],
    ['Prison log', channels.prison],
    ['Announcement log', channels.announcements],
    ['Member log', channels.members],
    ['Message log', channels.messages],
    ['Security log', channels.security],
    ['Command log', channels.commands],
    ['Ticket log', channels.tickets],
    ['Role menu log', channels.rolemenus],
    ['Welcome channel', guildConfig.modules.onboarding.channelId],
    ['Goodbye channel', guildConfig.modules.onboarding.goodbyeChannelId],
  ];
}

async function ensureConfigStorage() {
  await ensureConfigStore(DEFAULT_CONFIG);
}

async function loadConfig() {
  const raw = await loadConfigRaw(DEFAULT_CONFIG);
  return normalizeConfig(raw);
}

async function saveConfig(config) {
  await saveConfigRaw(normalizeConfig(config));
}

async function getGuildConfig(guildId) {
  const config = await loadConfig();
  return config.guilds[guildId] || normalizeGuildConfig({}, config);
}

async function updateGuildConfig(guildId, patch) {
  const config = await loadConfig();
  config.guilds[guildId] = normalizeGuildConfig(mergeDeep(config.guilds[guildId] || {}, patch), config);
  await saveConfig(config);
  return config.guilds[guildId];
}

module.exports = {
  DEFAULT_ANNOUNCEMENT_MODULE,
  DEFAULT_AUTORESPONDER_MODULE,
  DEFAULT_COMMAND_ACCESS,
  DEFAULT_CONFIG,
  DEFAULT_EMBED_MODULE,
  DEFAULT_GUILD_CONFIG,
  DEFAULT_LOG_CHANNELS,
  DEFAULT_POLL_MODULE,
  DEFAULT_ROLE_MENU_MODULE,
  DEFAULT_TEMPLATE_DEFAULTS,
  DEFAULT_TICKET_MODULE,
  DEFAULT_WELCOME_MODULE,
  ensureConfigStorage,
  getConfigDisplayRows,
  getConfiguredLogChannelId,
  getGuildConfig,
  loadConfig,
  mergeDeep,
  normalizeConfig,
  normalizeGuildConfig,
  saveConfig,
  updateGuildConfig,
};
