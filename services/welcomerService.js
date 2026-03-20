const { ChannelType, Colors } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('./configService');
const { makeEmbed, makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');

const WELCOMER_FOOTER = 'SERENITY • Welcome & onboarding';
const SUPPORTED_WELCOME_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

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
    bodyTemplate: rawConfig.bodyTemplate || 'You are member **#{member_count}** in **{server_name}**. Read the important channels, settle in, and enjoy your stay.',
    goodbyeTemplate: rawConfig.goodbyeTemplate || '{user_tag} has left **{server_name}**.',
  };
}

async function getWelcomerConfig(guildId) {
  const guildConfig = await getGuildConfig(guildId);
  return normalizeWelcomerConfig(guildConfig.welcome);
}

async function saveWelcomerConfig(guildId, nextConfig) {
  const guildConfig = await updateGuildConfig(guildId, (current) => ({
    ...current,
    modules: {
      ...current.modules,
      welcome: { ...current.modules.welcome, enabled: nextConfig.enabled !== undefined ? Boolean(nextConfig.enabled) : current.modules.welcome.enabled },
    },
    welcome: normalizeWelcomerConfig({
      ...current.welcome,
      ...nextConfig,
    }),
  }));

  return guildConfig.welcome;
}

async function setWelcomerChannel(guildId, channelId) {
  return saveWelcomerConfig(guildId, { channelId });
}

async function setGoodbyeChannel(guildId, channelId) {
  return saveWelcomerConfig(guildId, { goodbyeChannelId: channelId });
}

async function setWelcomerEnabled(guildId, enabled) {
  const current = await getWelcomerConfig(guildId);
  if (enabled && !current.channelId) {
    throw new Error('Set a welcome channel first with `/welcomer channel` before enabling the welcomer.');
  }
  return saveWelcomerConfig(guildId, { enabled: Boolean(enabled) });
}

async function setGoodbyeEnabled(guildId, enabled) {
  const current = await getWelcomerConfig(guildId);
  if (enabled && !current.goodbyeChannelId) {
    throw new Error('Set a goodbye channel first with `/welcomer goodbye-channel` before enabling goodbye messages.');
  }
  return saveWelcomerConfig(guildId, { goodbyeEnabled: Boolean(enabled) });
}

function isSupportedWelcomeChannel(channel) {
  return Boolean(channel && SUPPORTED_WELCOME_CHANNEL_TYPES.includes(channel.type) && typeof channel.send === 'function');
}

function getWelcomeAvatarUrl(member) {
  return member.displayAvatarURL({ extension: 'png', size: 4096, forceStatic: false });
}

function renderTemplate(template, member) {
  const replacements = {
    '{user}': `${member}`,
    '{user_tag}': trimText(member.user.tag || member.user.username, 60),
    '{user_name}': trimText(member.user.username, 60),
    '{server_name}': trimText(member.guild.name || 'Redline Hub', 80),
    '{member_count}': String(member.guild.memberCount || member.guild.members.cache.size || 0),
    '{join_number}': String(member.guild.memberCount || member.guild.members.cache.size || 0),
    '{timestamp}': `<t:${Math.floor(Date.now() / 1000)}:F>`,
  };

  let output = String(template || '');
  for (const [key, value] of Object.entries(replacements)) {
    output = output.split(key).join(value);
  }
  return output;
}

function buildWelcomerStatusEmbed(config) {
  const welcomer = normalizeWelcomerConfig(config);

  return makeInfoEmbed({
    title: 'Welcome module status',
    description: welcomer.enabled
      ? 'Serenity onboarding is enabled and ready to greet new members with a premium card.'
      : 'Serenity onboarding is currently disabled.',
    fields: [
      { name: 'Welcome', value: welcomer.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Welcome Channel', value: welcomer.channelId ? `<#${welcomer.channelId}>` : 'Not configured', inline: true },
      { name: 'Ping Member', value: welcomer.pingMember ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Goodbye', value: welcomer.goodbyeEnabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Goodbye Channel', value: welcomer.goodbyeChannelId ? `<#${welcomer.goodbyeChannelId}>` : 'Not configured', inline: true },
      { name: 'Auto Role', value: welcomer.autoRoleId ? `<@&${welcomer.autoRoleId}>` : 'Not configured', inline: true },
      { name: 'Title Template', value: trimText(welcomer.titleTemplate, 256), inline: false },
      { name: 'Body Template', value: trimText(welcomer.bodyTemplate, 512), inline: false },
    ],
    footer: WELCOMER_FOOTER,
  });
}

function buildWelcomerSetEmbed(channel, label = 'Welcome') {
  return makeSuccessEmbed({
    title: `${label} channel updated`,
    description: `${label} messages will be sent in <#${channel.id}>.`,
    fields: [
      { name: 'Channel', value: `${channel}`, inline: true },
      { name: 'Type', value: channel.type === ChannelType.GuildAnnouncement ? 'Announcement' : 'Text', inline: true },
    ],
    footer: WELCOMER_FOOTER,
  });
}

function buildWelcomerToggleEmbed(enabled, channelId, label = 'Welcome') {
  return makeSuccessEmbed({
    title: enabled ? `${label} enabled` : `${label} disabled`,
    description: enabled
      ? `${label} messages are now live${channelId ? ` in <#${channelId}>` : ''}.`
      : `${label} messages have been turned off for this server.`,
    footer: WELCOMER_FOOTER,
  });
}

function buildWelcomerValidationEmbed(message) {
  return makeWarningEmbed({
    title: 'Welcome setup required',
    description: message,
    footer: WELCOMER_FOOTER,
  });
}

function buildWelcomeEmbed(member, config) {
  const avatarUrl = getWelcomeAvatarUrl(member);
  const memberCount = member.guild.memberCount || member.guild.members.cache.size || 0;
  const welcomer = normalizeWelcomerConfig(config);

  return makeEmbed({
    title: renderTemplate(welcomer.titleTemplate, member),
    description: [
      `${member}`,
      renderTemplate(welcomer.subtitleTemplate, member),
      renderTemplate(welcomer.bodyTemplate, member),
    ].filter(Boolean).join('\n\n'),
    color: Colors.Blurple,
    author: {
      name: 'Serenity Onboarding',
      iconURL: member.guild.iconURL({ extension: 'png', size: 512 }) || avatarUrl,
    },
    thumbnail: avatarUrl,
    image: avatarUrl,
    fields: [
      { name: 'Member', value: `${member} • \`${member.user.id}\``, inline: false },
      { name: 'Join number', value: `#${memberCount}`, inline: true },
      { name: 'Server', value: trimText(member.guild.name || 'Redline Hub', 100), inline: true },
      { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
    ],
    footer: WELCOMER_FOOTER,
    timestamp: true,
  });
}

function buildGoodbyeEmbed(member, config) {
  const welcomer = normalizeWelcomerConfig(config);
  return makeEmbed({
    title: 'Goodbye from Redline Hub',
    description: renderTemplate(welcomer.goodbyeTemplate, member),
    color: Colors.Orange,
    thumbnail: member.user.displayAvatarURL({ extension: 'png', size: 1024 }),
    fields: [
      { name: 'Member', value: `${member.user.tag || member.user.username} • \`${member.id}\``, inline: true },
      { name: 'Server size', value: `#${member.guild.memberCount}`, inline: true },
      { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
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
      await member.roles.add(role, 'Serenity welcome auto role').catch(() => null);
    }
  }

  await channel.send({
    content: config.pingMember ? `${member}` : null,
    embeds: [buildWelcomeEmbed(member, config)],
    allowedMentions: config.pingMember ? { users: [member.id] } : { parse: [] },
  });

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
    `${prefixName} welcomer channel #welcome`,
    `${prefixName} welcomer on`,
    `${prefixName} welcomer goodbye-channel #goodbye`,
    `${prefixName} welcomer goodbye-on`,
    `${prefixName} welcomer role @Member`,
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
  setGoodbyeEnabled,
  setWelcomerChannel,
  setWelcomerEnabled,
};
