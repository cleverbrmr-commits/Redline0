const { ChannelType, Colors } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('./configService');
const { maybeLogFeature, buildLogEmbed } = require('./logService');
const { makeEmbed, makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');

const WELCOMER_FOOTER = 'SERENITY • Onboarding suite';
const SUPPORTED_WELCOME_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

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
    throw new Error('Set a welcome channel first with `/welcomer channel` before enabling Serenity onboarding.');
  }
  return saveWelcomerConfig(guildId, { enabled: Boolean(enabled) });
}

function isSupportedWelcomeChannel(channel) {
  return Boolean(channel && SUPPORTED_WELCOME_CHANNEL_TYPES.includes(channel.type) && typeof channel.send === 'function');
}

function getWelcomeAvatarUrl(member) {
  return member.displayAvatarURL({ extension: 'png', size: 4096, forceStatic: false });
}

function renderPlaceholders(template, member) {
  const joinedTimestamp = `<t:${Math.floor(Date.now() / 1000)}:F>`;
  return String(template || '')
    .replaceAll('{user}', `${member}`)
    .replaceAll('{server}', trimText(member.guild.name || 'this server', 80))
    .replaceAll('{count}', String(member.guild.memberCount || 0))
    .replaceAll('{joined}', joinedTimestamp);
}

function buildWelcomerStatusEmbed(config) {
  const welcomer = normalizeWelcomerConfig(config);

  return makeInfoEmbed({
    title: 'Onboarding status',
    description: welcomer.enabled
      ? 'Serenity onboarding is **enabled** and ready to welcome new members with a premium card layout.'
      : 'Serenity onboarding is currently **disabled**.',
    fields: [
      { name: 'State', value: welcomer.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Welcome Channel', value: welcomer.channelId ? `<#${welcomer.channelId}>` : 'Not configured', inline: true },
      { name: 'Goodbye Channel', value: welcomer.goodbyeChannelId ? `<#${welcomer.goodbyeChannelId}>` : 'Not configured', inline: true },
      { name: 'Auto Role', value: welcomer.autoRoleId ? `<@&${welcomer.autoRoleId}>` : 'Not configured', inline: true },
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
    description: `${type === 'goodbye' ? 'Departure messages' : 'New member cards'} will be posted in <#${channel.id}>.`,
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
      ? `Welcome cards are now live in <#${channelId}>.`
      : 'Welcome cards have been turned off for this server.',
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

function buildWelcomeEmbed(member, config = {}) {
  const settings = normalizeWelcomerConfig(config);
  const avatarUrl = getWelcomeAvatarUrl(member);
  const memberCount = member.guild.memberCount || member.guild.members.cache.size || 0;
  const joinedTimestamp = Math.floor(Date.now() / 1000);

  return makeEmbed({
    title: trimText(renderPlaceholders(settings.title, member), 256),
    description: [
      `### ${trimText(renderPlaceholders(settings.subtitle, member), 120)}`,
      renderPlaceholders(settings.body, member),
    ].join('\n\n'),
    color: Colors.Blurple,
    author: {
      name: 'Serenity Onboarding',
      iconURL: member.guild.iconURL({ extension: 'png', size: 512 }) || avatarUrl,
    },
    thumbnail: avatarUrl,
    image: settings.includeAvatarBanner ? avatarUrl : null,
    fields: [
      { name: 'Member', value: `${member} • \`${member.user.id}\``, inline: false },
      { name: 'Join Position', value: memberCount ? `#${memberCount}` : 'Unknown', inline: true },
      { name: 'Server', value: trimText(member.guild.name || 'Redline Hub', 100), inline: true },
      { name: 'Arrived', value: `<t:${joinedTimestamp}:F>`, inline: true },
      { name: 'Guidance', value: 'Check the important channels, verify access, and enjoy the community.', inline: false },
    ],
    footer: settings.footer,
    timestamp: true,
  });
}

function buildGoodbyeEmbed(member, config = {}) {
  const settings = normalizeWelcomerConfig(config);
  return makeWarningEmbed({
    title: 'Member departed',
    description: renderPlaceholders(settings.goodbyeMessage, member),
    fields: [
      { name: 'User', value: `${member.user.tag} • \`${member.id}\``, inline: true },
      { name: 'Server', value: trimText(member.guild.name, 100), inline: true },
      { name: 'Joined', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true },
    ],
    footer: WELCOMER_FOOTER,
  });
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

  await channel.send({
    content: config.pingMember ? `${member}` : null,
    embeds: [buildWelcomeEmbed(member, config)],
    allowedMentions: config.pingMember ? { users: [member.id] } : { parse: [] },
  });

  await maybeLogFeature(client, member.guild.id, 'members', buildLogEmbed({
    title: 'Onboarding Delivered',
    description: `${member} received the configured welcome card.`,
    severity: 'low',
    fields: [
      { name: 'Channel', value: `<#${channel.id}>`, inline: true },
      { name: 'Auto Role', value: config.autoRoleId ? `<@&${config.autoRoleId}>` : 'None', inline: true },
      { name: 'Member Count', value: String(member.guild.memberCount || 0), inline: true },
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
  SUPPORTED_WELCOME_CHANNEL_TYPES,
  buildGoodbyeEmbed,
  buildWelcomeEmbed,
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
