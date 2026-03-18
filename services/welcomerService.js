const { ChannelType, Colors } = require('discord.js');
const { loadConfig, saveConfig } = require('./configService');
const { makeEmbed, makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');

const WELCOMER_FOOTER = 'REDLINE • Welcome system';
const SUPPORTED_WELCOME_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

function normalizeWelcomerConfig(rawConfig = {}) {
  return {
    enabled: Boolean(rawConfig.enabled),
    channelId: rawConfig.channelId || null,
  };
}

async function getWelcomerConfig(guildId) {
  const config = await loadConfig();
  return normalizeWelcomerConfig(config.welcomers?.[guildId]);
}

async function saveWelcomerConfig(guildId, nextConfig) {
  const config = await loadConfig();
  config.welcomers = config.welcomers || {};
  config.welcomers[guildId] = normalizeWelcomerConfig({
    ...config.welcomers[guildId],
    ...nextConfig,
  });
  await saveConfig(config);
  return config.welcomers[guildId];
}

async function setWelcomerChannel(guildId, channelId) {
  return saveWelcomerConfig(guildId, { channelId });
}

async function setWelcomerEnabled(guildId, enabled) {
  const current = await getWelcomerConfig(guildId);

  if (enabled && !current.channelId) {
    throw new Error('Set a welcome channel first with `/welcomer set` before enabling the welcomer.');
  }

  return saveWelcomerConfig(guildId, { enabled: Boolean(enabled) });
}

function isSupportedWelcomeChannel(channel) {
  return Boolean(channel && SUPPORTED_WELCOME_CHANNEL_TYPES.includes(channel.type) && typeof channel.send === 'function');
}

function getWelcomeAvatarUrl(member) {
  return member.displayAvatarURL({ extension: 'png', size: 4096, forceStatic: false });
}

function buildWelcomerStatusEmbed(config) {
  const welcomer = normalizeWelcomerConfig(config);

  return makeInfoEmbed({
    title: 'Welcomer status',
    description: welcomer.enabled
      ? 'The Redline welcome flow is currently **enabled**.'
      : 'The Redline welcome flow is currently **disabled**.',
    fields: [
      { name: 'Enabled', value: welcomer.enabled ? 'Yes' : 'No', inline: true },
      { name: 'Welcome Channel', value: welcomer.channelId ? `<#${welcomer.channelId}>` : 'Not configured', inline: true },
    ],
    footer: WELCOMER_FOOTER,
  });
}

function buildWelcomerSetEmbed(channel) {
  return makeSuccessEmbed({
    title: 'Welcomer channel updated',
    description: `New members will be welcomed in <#${channel.id}> once the welcomer is enabled.`,
    fields: [
      { name: 'Channel', value: `${channel}`, inline: true },
      { name: 'Type', value: channel.type === ChannelType.GuildAnnouncement ? 'Announcement' : 'Text', inline: true },
    ],
    footer: WELCOMER_FOOTER,
  });
}

function buildWelcomerToggleEmbed(enabled, channelId) {
  return makeSuccessEmbed({
    title: enabled ? 'Welcomer enabled' : 'Welcomer disabled',
    description: enabled
      ? `Welcome messages are now live in <#${channelId}>.`
      : 'Welcome messages have been turned off for this server.',
    footer: WELCOMER_FOOTER,
  });
}

function buildWelcomerValidationEmbed(message) {
  return makeWarningEmbed({
    title: 'Welcomer setup required',
    description: message,
    footer: WELCOMER_FOOTER,
  });
}

function buildWelcomeEmbed(member) {
  const avatarUrl = getWelcomeAvatarUrl(member);
  const memberCount = member.guild.memberCount || member.guild.members.cache.size || 0;
  const joinedTimestamp = Math.floor(Date.now() / 1000);

  return makeEmbed({
    title: 'Welcome to Redline Hub',
    description: [
      `${member}, welcome to **${trimText(member.guild.name || 'Redline Hub', 80)}**.`,
      'Get settled in, check the channels, and enjoy your stay.',
    ].join('\n\n'),
    color: Colors.Red,
    author: {
      name: member.guild.name || 'Redline Hub',
      iconURL: member.guild.iconURL({ extension: 'png', size: 512 }) || undefined,
    },
    thumbnail: avatarUrl,
    image: avatarUrl,
    fields: [
      { name: 'Member', value: `${member} • \`${member.user.id}\``, inline: false },
      { name: 'Server', value: trimText(member.guild.name || 'Redline Hub', 100), inline: true },
      { name: 'Member Count', value: memberCount ? `#${memberCount}` : 'Unknown', inline: true },
      { name: 'Joined', value: `<t:${joinedTimestamp}:F>`, inline: true },
    ],
    footer: `Welcome aboard • ${member.user.username}`,
    timestamp: true,
  });
}

async function sendWelcomeMessage(client, member) {
  if (!member?.guild?.id) {
    return false;
  }

  const config = await getWelcomerConfig(member.guild.id);
  if (!config.enabled || !config.channelId) {
    return false;
  }

  const channel = member.guild.channels.cache.get(config.channelId)
    || await client.channels.fetch(config.channelId).catch(() => null);

  if (!isSupportedWelcomeChannel(channel)) {
    console.warn(`[welcomer] configured channel ${config.channelId} is invalid for guild ${member.guild.id}`);
    return false;
  }

  try {
    await channel.send({
      content: `${member}`,
      embeds: [buildWelcomeEmbed(member)],
      allowedMentions: { users: [member.id] },
    });
    return true;
  } catch (error) {
    console.error(`[welcomer] failed to send welcome message in guild ${member.guild.id}:`, error);
    return false;
  }
}

function buildWelcomerPrefixUsage(prefixName = 'Serenity') {
  return [
    `${prefixName} welcomer set #welcome`,
    `${prefixName} welcomer on`,
    `${prefixName} welcomer off`,
    `${prefixName} welcomer status`,
  ];
}

function buildWelcomerUnknownActionEmbed(prefixName = 'Serenity') {
  return makeInfoEmbed({
    title: 'Welcomer usage',
    description: buildWelcomerPrefixUsage(prefixName).map((entry) => `• \`${entry}\``).join('\n'),
    footer: WELCOMER_FOOTER,
  });
}

module.exports = {
  SUPPORTED_WELCOME_CHANNEL_TYPES,
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
  sendWelcomeMessage,
  setWelcomerChannel,
  setWelcomerEnabled,
};
