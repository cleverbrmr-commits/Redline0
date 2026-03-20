const { ensureConfigStore, loadConfigRaw, saveConfigRaw } = require('../storage/configStore');

const ENV_LOG_FALLBACKS = {
  downloadLogChannelId: process.env.DOWNLOAD_LOG_CHANNEL_ID || null,
  modLogChannelId: process.env.MOD_LOG_CHANNEL_ID || null,
  prisonLogChannelId: process.env.PRISON_LOG_CHANNEL_ID || null,
  announceLogChannelId: process.env.ANNOUNCE_LOG_CHANNEL_ID || null,
};

const DEFAULT_AUTOMOD_RULE = {
  enabled: false,
  ignoredChannelIds: [],
  ignoredRoleIds: [],
  allowedRoleIds: [],
  logChannelId: null,
  action: 'delete',
  escalation: [],
};

const DEFAULT_CONFIG = {
  downloadLogChannelId: null,
  modLogChannelId: null,
  prisonLogChannelId: null,
  announceLogChannelId: null,
  welcomers: {},
  guilds: {},
};

function uniqueIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map((value) => String(value)))];
}

function normalizeModuleState(rawState = {}, enabledFallback = true) {
  return {
    enabled: rawState.enabled !== undefined ? Boolean(rawState.enabled) : enabledFallback,
    publicEnabled: rawState.publicEnabled !== undefined ? Boolean(rawState.publicEnabled) : true,
  };
}

function normalizeWelcomerConfig(rawConfig = {}) {
  return {
    enabled: Boolean(rawConfig.enabled),
    channelId: rawConfig.channelId || null,
    goodbyeEnabled: Boolean(rawConfig.goodbyeEnabled),
    goodbyeChannelId: rawConfig.goodbyeChannelId || null,
    pingMember: rawConfig.pingMember !== undefined ? Boolean(rawConfig.pingMember) : true,
    autoRoleId: rawConfig.autoRoleId || null,
    titleTemplate: rawConfig.titleTemplate || 'Welcome to Redline Hub',
    subtitleTemplate: rawConfig.subtitleTemplate || 'Glad you are here, {user_tag}.',
    bodyTemplate: rawConfig.bodyTemplate || 'You are member **#{member_count}** in **{server_name}**. Take a moment to read the important channels and settle in.',
    goodbyeTemplate: rawConfig.goodbyeTemplate || '{user_tag} has left **{server_name}**.',
  };
}

function normalizeAutomodRule(rawRule = {}, overrides = {}) {
  return {
    ...DEFAULT_AUTOMOD_RULE,
    ...overrides,
    ...rawRule,
    ignoredChannelIds: uniqueIds(rawRule.ignoredChannelIds),
    ignoredRoleIds: uniqueIds(rawRule.ignoredRoleIds),
    allowedRoleIds: uniqueIds(rawRule.allowedRoleIds),
    escalation: Array.isArray(rawRule.escalation) ? rawRule.escalation : [],
  };
}

function normalizeAutomodConfig(rawConfig = {}) {
  return {
    enabled: rawConfig.enabled !== undefined ? Boolean(rawConfig.enabled) : false,
    quarantineRoleId: rawConfig.quarantineRoleId || null,
    alertChannelId: rawConfig.alertChannelId || null,
    antiSpam: normalizeAutomodRule(rawConfig.antiSpam, { threshold: 6, windowMs: 7000, action: 'timeout', durationMs: 600000 }),
    antiLink: normalizeAutomodRule(rawConfig.antiLink, { action: 'delete', allowDiscordInvites: false }),
    antiInvite: normalizeAutomodRule(rawConfig.antiInvite, { action: 'delete' }),
    antiCaps: normalizeAutomodRule(rawConfig.antiCaps, { minLength: 14, percentage: 0.75, action: 'warn' }),
    mentionSpam: normalizeAutomodRule(rawConfig.mentionSpam, { threshold: 6, action: 'timeout', durationMs: 300000 }),
    blockedPhrases: {
      ...normalizeAutomodRule(rawConfig.blockedPhrases, { action: 'delete' }),
      phrases: (Array.isArray(rawConfig.blockedPhrases?.phrases) ? rawConfig.blockedPhrases.phrases : []).map((entry) => String(entry).trim()).filter(Boolean),
    },
    antiRaid: {
      enabled: Boolean(rawConfig.antiRaid?.enabled),
      trustedRoleIds: uniqueIds(rawConfig.antiRaid?.trustedRoleIds),
      trustedUserIds: uniqueIds(rawConfig.antiRaid?.trustedUserIds),
      joinThreshold: Number(rawConfig.antiRaid?.joinThreshold) || 6,
      windowMs: Number(rawConfig.antiRaid?.windowMs) || 15000,
      action: rawConfig.antiRaid?.action || 'alert',
      slowmodeSeconds: Number(rawConfig.antiRaid?.slowmodeSeconds) || 10,
      alertChannelId: rawConfig.antiRaid?.alertChannelId || rawConfig.alertChannelId || null,
    },
  };
}

function normalizeLoggingConfig(rawConfig = {}) {
  return {
    enabled: rawConfig.enabled !== undefined ? Boolean(rawConfig.enabled) : true,
    defaultChannelId: rawConfig.defaultChannelId || null,
    channels: {
      moderation: rawConfig.channels?.moderation || rawConfig.modLogChannelId || null,
      messages: rawConfig.channels?.messages || null,
      members: rawConfig.channels?.members || null,
      automod: rawConfig.channels?.automod || rawConfig.modLogChannelId || null,
      joins: rawConfig.channels?.joins || null,
      leave: rawConfig.channels?.leave || null,
      server: rawConfig.channels?.server || null,
      content: rawConfig.channels?.content || rawConfig.announceLogChannelId || null,
    },
  };
}

function normalizeGuildConfig(guildId, rawGuild = {}, rootConfig = {}) {
  const legacyWelcomer = rootConfig.welcomers?.[guildId] || {};
  return {
    id: guildId,
    modules: {
      moderation: normalizeModuleState(rawGuild.modules?.moderation, true),
      automod: normalizeModuleState(rawGuild.modules?.automod, false),
      logging: normalizeModuleState(rawGuild.modules?.logging, true),
      welcome: normalizeModuleState(rawGuild.modules?.welcome, false),
      utility: normalizeModuleState(rawGuild.modules?.utility, true),
      info: normalizeModuleState(rawGuild.modules?.info, true),
      polls: normalizeModuleState(rawGuild.modules?.polls, true),
      social: normalizeModuleState(rawGuild.modules?.social, true),
      music: normalizeModuleState(rawGuild.modules?.music, true),
      'client-content': normalizeModuleState(rawGuild.modules?.['client-content'], true),
      system: normalizeModuleState(rawGuild.modules?.system, true),
      admin: normalizeModuleState(rawGuild.modules?.admin, true),
    },
    commandAccess: rawGuild.commandAccess && typeof rawGuild.commandAccess === 'object' ? rawGuild.commandAccess : {},
    logging: normalizeLoggingConfig({
      ...rawGuild.logging,
      modLogChannelId: rawGuild.logging?.channels?.moderation || rootConfig.modLogChannelId || null,
      announceLogChannelId: rawGuild.logging?.channels?.content || rootConfig.announceLogChannelId || null,
    }),
    welcome: normalizeWelcomerConfig({ ...legacyWelcomer, ...rawGuild.welcome }),
    automod: normalizeAutomodConfig(rawGuild.automod),
    settings: {
      downloadLogChannelId: rawGuild.settings?.downloadLogChannelId || rootConfig.downloadLogChannelId || null,
      prisonLogChannelId: rawGuild.settings?.prisonLogChannelId || rootConfig.prisonLogChannelId || null,
      announceLogChannelId: rawGuild.settings?.announceLogChannelId || rootConfig.announceLogChannelId || null,
    },
  };
}

function normalizeRootConfig(raw = {}) {
  const root = {
    ...DEFAULT_CONFIG,
    ...raw,
    guilds: raw?.guilds && typeof raw.guilds === 'object' ? raw.guilds : {},
    welcomers: raw?.welcomers && typeof raw.welcomers === 'object' ? raw.welcomers : {},
  };

  const normalizedGuilds = {};
  for (const guildId of new Set([...Object.keys(root.guilds), ...Object.keys(root.welcomers)])) {
    normalizedGuilds[guildId] = normalizeGuildConfig(guildId, root.guilds[guildId], root);
  }

  return {
    ...root,
    guilds: normalizedGuilds,
  };
}

function getConfiguredLogChannelId(config, key, guildId = null) {
  if (guildId) {
    const guildConfig = config?.guilds?.[guildId] ? normalizeGuildConfig(guildId, config.guilds[guildId], config) : null;
    const map = {
      downloadLogChannelId: guildConfig?.settings?.downloadLogChannelId,
      modLogChannelId: guildConfig?.logging?.channels?.moderation,
      prisonLogChannelId: guildConfig?.settings?.prisonLogChannelId,
      announceLogChannelId: guildConfig?.logging?.channels?.content,
      messageLogChannelId: guildConfig?.logging?.channels?.messages,
      memberLogChannelId: guildConfig?.logging?.channels?.members,
      automodLogChannelId: guildConfig?.logging?.channels?.automod,
      joinLogChannelId: guildConfig?.logging?.channels?.joins,
      leaveLogChannelId: guildConfig?.logging?.channels?.leave,
      serverLogChannelId: guildConfig?.logging?.channels?.server,
    };
    if (map[key]) return map[key];
  }

  return config?.[key] || ENV_LOG_FALLBACKS[key] || null;
}

function getConfigDisplayRows(config, guildId = null) {
  const guildConfig = guildId ? getGuildConfigFromRoot(config, guildId) : null;

  return [
    ['Download log', guildConfig?.settings?.downloadLogChannelId || config.downloadLogChannelId],
    ['Moderation log', guildConfig?.logging?.channels?.moderation || config.modLogChannelId],
    ['Prison log', guildConfig?.settings?.prisonLogChannelId || config.prisonLogChannelId],
    ['Announcement log', guildConfig?.logging?.channels?.content || config.announceLogChannelId],
    ['Message log', guildConfig?.logging?.channels?.messages || null],
    ['Member log', guildConfig?.logging?.channels?.members || null],
    ['Automod log', guildConfig?.logging?.channels?.automod || null],
  ];
}

async function ensureConfigStorage() {
  await ensureConfigStore(DEFAULT_CONFIG);
}

async function loadConfig() {
  const raw = await loadConfigRaw(DEFAULT_CONFIG);
  return normalizeRootConfig(raw);
}

async function saveConfig(config) {
  const normalized = normalizeRootConfig(config);

  const legacyWelcomers = {};
  for (const [guildId, guildConfig] of Object.entries(normalized.guilds)) {
    legacyWelcomers[guildId] = guildConfig.welcome;
  }

  await saveConfigRaw({
    ...normalized,
    welcomers: legacyWelcomers,
  });
}

function getGuildConfigFromRoot(config, guildId) {
  return normalizeGuildConfig(guildId, config?.guilds?.[guildId], config || DEFAULT_CONFIG);
}

async function getGuildConfig(guildId) {
  const config = await loadConfig();
  return getGuildConfigFromRoot(config, guildId);
}

async function updateGuildConfig(guildId, updater) {
  const config = await loadConfig();
  const current = getGuildConfigFromRoot(config, guildId);
  const nextValue = typeof updater === 'function' ? await updater(current) : { ...current, ...updater };
  config.guilds[guildId] = normalizeGuildConfig(guildId, nextValue, config);
  await saveConfig(config);
  return config.guilds[guildId];
}

async function setGuildLogChannel(guildId, logType, channelId) {
  return updateGuildConfig(guildId, (guildConfig) => ({
    ...guildConfig,
    logging: {
      ...guildConfig.logging,
      channels: {
        ...guildConfig.logging.channels,
        [logType]: channelId || null,
      },
    },
  }));
}

async function setCommandAccessRule(guildId, commandName, payload) {
  return updateGuildConfig(guildId, (guildConfig) => ({
    ...guildConfig,
    commandAccess: {
      ...guildConfig.commandAccess,
      [commandName]: {
        allowedRoleIds: uniqueIds(payload.allowedRoleIds),
        deniedRoleIds: uniqueIds(payload.deniedRoleIds),
        allowedChannelIds: uniqueIds(payload.allowedChannelIds),
        deniedChannelIds: uniqueIds(payload.deniedChannelIds),
      },
    },
  }));
}

module.exports = {
  DEFAULT_AUTOMOD_RULE,
  DEFAULT_CONFIG,
  ensureConfigStorage,
  getConfigDisplayRows,
  getConfiguredLogChannelId,
  getGuildConfig,
  getGuildConfigFromRoot,
  loadConfig,
  normalizeAutomodConfig,
  normalizeGuildConfig,
  normalizeRootConfig,
  normalizeWelcomerConfig,
  saveConfig,
  setCommandAccessRule,
  setGuildLogChannel,
  uniqueIds,
  updateGuildConfig,
};
