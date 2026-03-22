const { ChannelType } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('./configService');
const { maybeLogFeature, buildLogEmbed } = require('./logService');
const { makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');
const { WELCOME_CARD_THEMES, createWelcomeCardAttachment, renderCardPlaceholders } = require('./welcomeCardService');

const WELCOMER_FOOTER = 'SERENITY • Onboarding suite';
const SUPPORTED_WELCOME_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const DEFAULT_WELCOME_LINES = [
  'Hey {user}, welcome to {server}!',
  'Make sure to check out: {channel}',
  'We hope you enjoy your stay here.',
];

function normalizeMessageLines(lines) {
  const fallback = [...DEFAULT_WELCOME_LINES];
  if (!Array.isArray(lines) || !lines.length) return fallback;
  const next = lines.map((entry) => trimText(String(entry || '').trim(), 160)).filter(Boolean).slice(0, 3);
  return next.length ? next : fallback;
}

function normalizeWelcomerConfig(rawConfig = {}) {
  return {
    enabled: Boolean(rawConfig.enabled),
    channelId: rawConfig.channelId || null,
    pingMember: rawConfig.pingMember !== false,
    includeAvatarBanner: rawConfig.includeAvatarBanner !== false,
    style: rawConfig.style || 'premium',
    title: rawConfig.title || 'Welcome to Redline Hub',
    subtitle: rawConfig.subtitle || 'A polished place to get settled in.',
    body: rawConfig.body || 'We are glad to have you here. Read the key channels, meet the community, and enjoy your stay.',
    footer: rawConfig.footer || WELCOMER_FOOTER,
    autoRoleId: rawConfig.autoRoleId || null,
    goodbyeEnabled: Boolean(rawConfig.goodbyeEnabled),
    goodbyeChannelId: rawConfig.goodbyeChannelId || null,
    goodbyeMessage: rawConfig.goodbyeMessage || '{user} has left {server}.',
  };
}

async function getWelcomerConfig(guildId) {
  const guildConfig = await getGuildConfig(guildId);
  return normalizeWelcomerConfig(guildConfig.modules.onboarding);
}

async function saveWelcomerConfig(guildId, nextConfig) {
  const current = await getWelcomerConfig(guildId);
  const merged = normalizeWelcomerConfig({ ...current, ...nextConfig });
  await updateGuildConfig(guildId, {
    modules: {
      onboarding: merged,
    },
  });
  return merged;
}

async function setWelcomerChannel(guildId, channelId) {
  return saveWelcomerConfig(guildId, { channelId });
}

async function setGoodbyeChannel(guildId, goodbyeChannelId) {
  return saveWelcomerConfig(guildId, { goodbyeChannelId });
}

async function setWelcomerEnabled(guildId, enabled) {
  const current = await getWelcomerConfig(guildId);
  if (enabled && !current.channelId) {
    throw new Error('Set a welcome channel first with `/welcomer set channel:#channel` before enabling Serenity onboarding.');
  }
  return saveWelcomerConfig(guildId, { enabled: Boolean(enabled) });
}

function isSupportedWelcomeChannel(channel) {
  return Boolean(channel && SUPPORTED_WELCOME_CHANNEL_TYPES.includes(channel.type) && typeof channel.send === 'function');
}

function buildWelcomeMessageContent(member, config = {}) {
  const settings = normalizeWelcomerConfig(config);
  return settings.messageLines
    .map((line) => renderCardPlaceholders(line, member, settings))
    .join('\n');
}

function buildWelcomerStatusEmbed(config) {
  const welcomer = normalizeWelcomerConfig(config);
  return makeInfoEmbed({
    title: 'Onboarding status',
    description: welcomer.enabled
      ? 'Serenity onboarding is enabled and will send a short welcome message with a generated welcome card image.'
      : 'Serenity onboarding is currently disabled.',
    fields: [
      { name: 'State', value: welcomer.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Welcome Channel', value: welcomer.channelId ? `<#${welcomer.channelId}>` : 'Not configured', inline: true },
      { name: 'Highlight Channel', value: welcomer.highlightChannelId ? `<#${welcomer.highlightChannelId}>` : 'Not configured', inline: true },
      { name: 'Style', value: WELCOME_CARD_THEMES[welcomer.style]?.label || welcomer.style, inline: true },
      { name: 'Ping Member', value: welcomer.pingMember ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Style', value: welcomer.style, inline: true },
      { name: 'Brand Line', value: trimText(welcomer.title, 100), inline: true },
      { name: 'Subtitle', value: trimText(welcomer.subtitle, 180), inline: false },
      { name: 'Body', value: trimText(welcomer.body, 300), inline: false },
    ],
    footer: WELCOMER_FOOTER,
  });
}

function buildWelcomerSetEmbed(channel, type = 'welcome') {
  return makeSuccessEmbed({
    title: `${type === 'goodbye' ? 'Goodbye' : 'Welcome'} channel updated`,
    description: `${type === 'goodbye' ? 'Departure messages' : 'Short welcome messages and card images'} will be posted in <#${channel.id}>.`,
    fields: [
      { name: 'Channel', value: `${channel}`, inline: true },
      { name: 'Type', value: channel.type === ChannelType.GuildAnnouncement ? 'Announcement' : 'Text', inline: true },
    ],
    footer: WELCOMER_FOOTER,
  });
}

function buildWelcomerToggleEmbed(enabled, channelId) {
  return makeSuccessEmbed({
    title: enabled ? 'Onboarding enabled' : 'Onboarding disabled',
    description: enabled
      ? `Short welcome messages and generated cards are now live in <#${channelId}>.`
      : 'Welcome messages and cards have been turned off for this server.',
    footer: WELCOMER_FOOTER,
  });
}

function buildWelcomerValidationEmbed(message) {
  return makeWarningEmbed({
    title: 'Onboarding setup required',
    description: message,
    footer: WELCOMER_FOOTER,
  });
}

function buildGoodbyeEmbed(member, config = {}) {
  const settings = normalizeWelcomerConfig(config);
  return makeWarningEmbed({
    title: 'Member departed',
    description: renderCardPlaceholders(settings.goodbyeMessage, member, settings),
    footer: WELCOMER_FOOTER,
  });
}

async function buildWelcomePreviewPayload(member, config = {}) {
  const settings = normalizeWelcomerConfig(config);
  const attachment = await createWelcomeCardAttachment(member, settings);
  return {
    content: buildWelcomeMessageContent(member, settings),
    files: [attachment],
    allowedMentions: settings.pingMember ? { users: [member.id] } : { parse: [] },
  };
}

async function sendWelcomeMessage(client, member) {
  if (!member?.guild?.id) return false;
  const config = await getWelcomerConfig(member.guild.id);
  if (!config.enabled || !config.channelId) return false;

  const channel = member.guild.channels.cache.get(config.channelId)
    || await client.channels.fetch(config.channelId).catch(() => null);

  if (!isSupportedWelcomeChannel(channel)) {
    console.warn(`[welcomer] configured channel ${config.channelId} is invalid for guild ${member.guild.id}`);
    return false;
  }

  if (config.autoRoleId) {
    const role = member.guild.roles.cache.get(config.autoRoleId) || await member.guild.roles.fetch(config.autoRoleId).catch(() => null);
    if (role && member.manageable) {
      await member.roles.add(role, 'Serenity onboarding auto role').catch(() => null);
    }
  }

  await channel.send(await buildWelcomePreviewPayload(member, config));

  await maybeLogFeature(client, member.guild.id, 'members', buildLogEmbed({
    title: 'Onboarding Delivered',
    description: `${member} received the configured short welcome message and card image.`,
    severity: 'low',
    fields: [
      { name: 'Channel', value: `<#${channel.id}>`, inline: true },
      { name: 'Style', value: config.style, inline: true },
      { name: 'Auto Role', value: config.autoRoleId ? `<@&${config.autoRoleId}>` : 'None', inline: true },
    ],
    footer: WELCOMER_FOOTER,
  }));

  return true;
}

async function sendGoodbyeMessage(client, member) {
  if (!member?.guild?.id) return false;
  const config = await getWelcomerConfig(member.guild.id);
  if (!config.goodbyeEnabled || !config.goodbyeChannelId) return false;

  const channel = member.guild.channels.cache.get(config.goodbyeChannelId)
    || await client.channels.fetch(config.goodbyeChannelId).catch(() => null);
  if (!isSupportedWelcomeChannel(channel)) return false;

  await channel.send({ embeds: [buildGoodbyeEmbed(member, config)] }).catch(() => null);
  return true;
}

function buildWelcomerPrefixUsage(prefixName = 'Serenity') {
  return [
    `${prefixName} welcomer set #welcome`,
    `${prefixName} welcomer goodbye #goodbye`,
    `${prefixName} welcomer on`,
    `${prefixName} welcomer off`,
    `${prefixName} welcomer status`,
    `${prefixName} welcomer preview`,
  ];
}

function buildWelcomerUnknownActionEmbed(prefixName = 'Serenity') {
  return makeInfoEmbed({
    title: 'Onboarding usage',
    description: buildWelcomerPrefixUsage(prefixName).map((entry) => `• \`${entry}\``).join('\n'),
    footer: WELCOMER_FOOTER,
  });
}

module.exports = {
  DEFAULT_WELCOME_LINES,
  SUPPORTED_WELCOME_CHANNEL_TYPES,
  buildGoodbyeEmbed,
  buildWelcomeMessageContent,
  buildWelcomePreviewPayload,
  buildWelcomerPrefixUsage,
  buildWelcomerSetEmbed,
  buildWelcomerStatusEmbed,
  buildWelcomerToggleEmbed,
  buildWelcomerUnknownActionEmbed,
  buildWelcomerValidationEmbed,
  getWelcomerConfig,
  isSupportedWelcomeChannel,
  normalizeWelcomerConfig,
  saveWelcomerConfig,
  sendGoodbyeMessage,
  sendWelcomeMessage,
  setGoodbyeChannel,
  setWelcomerChannel,
  setWelcomerEnabled,
};
