const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { loadModerationState } = require('../storage/moderationStore');
const { makeEmbed, makeInfoEmbed } = require('../utils/embeds');
const { buildAvatarEmbed } = require('../services/infoService');
const { trimText } = require('../utils/helpers');
const { resolveUserFromToken } = require('../services/prefixService');

function formatTimestamp(timestamp, fallback = 'Unknown') {
  if (!timestamp) return fallback;
  return `<t:${Math.floor(new Date(timestamp).getTime() / 1000)}:F>`;
}

function formatRelativeTimestamp(timestamp, fallback = 'Unknown') {
  if (!timestamp) return fallback;
  return `<t:${Math.floor(new Date(timestamp).getTime() / 1000)}:R>`;
}

function formatUserLabel(user) {
  const tag = user?.tag && user.tag !== user.username ? user.tag : user?.username || 'Unknown user';
  const globalName = user?.globalName ? ` • ${user.globalName}` : '';
  return `${tag}${globalName}`;
}

function getMemberRoleSummary(member) {
  if (!member?.roles?.cache) {
    return {
      count: '0',
      topRole: 'Not in this server',
      roleList: 'None',
    };
  }

  const roles = member.roles.cache.filter((role) => role.id !== member.guild.id).sort((a, b) => b.position - a.position);
  const topRole = roles.first();
  const roleMentions = roles.map((role) => `<@&${role.id}>`);

  return {
    count: String(roles.size),
    topRole: topRole ? `<@&${topRole.id}>` : '@everyone only',
    roleList: roleMentions.length ? trimText(roleMentions.slice(0, 12).join(', '), 1024) : 'None',
  };
}

async function getModerationStatus(member) {
  if (!member) return 'Not in this server';
  const statuses = [];
  const timeoutUntil = member.communicationDisabledUntilTimestamp || member.communicationDisabledUntil?.getTime?.() || null;
  if (timeoutUntil && timeoutUntil > Date.now()) {
    statuses.push(`Timed out until ${formatTimestamp(timeoutUntil)}`);
  }

  const moderationState = await loadModerationState();
  const guildState = moderationState.guilds[member.guild.id] || {};
  if (guildState.muteRoleId && member.roles.cache.has(guildState.muteRoleId)) {
    statuses.push('Muted');
  }

  return statuses.length ? statuses.join('\n') : 'Clear';
}

async function resolveTargetMember(source, user) {
  if (!source.guild || !user) return null;
  return source.guild.members.fetch(user.id).catch(() => null);
}

function formatPresence(member) {
  const status = member?.presence?.status;
  if (!status) return 'Offline / hidden';
  return status.replace(/\b\w/g, (char) => char.toUpperCase());
}

async function buildUserInfoEmbed(source, requestedUser) {
  const user = requestedUser || source.user || source.author;
  const member = await resolveTargetMember(source, user);
  const roleSummary = getMemberRoleSummary(member);

  return makeEmbed({
    title: `User Profile • ${formatUserLabel(user)}`,
    description: [
      `${user}`,
      user?.globalName && user.globalName !== user.username ? `Display name • **${trimText(user.globalName, 80)}**` : null,
      member?.nickname ? `Server nickname • **${trimText(member.nickname, 80)}**` : null,
    ].filter(Boolean).join('\n'),
    author: {
      name: 'Redline Member Card',
      iconURL: user.displayAvatarURL({ size: 512 }),
    },
    fields: [
      { name: 'Identity', value: `Username • **${trimText(user.username || 'Unknown', 100)}**\nTag • **${trimText(user.tag || user.username || 'Unknown', 100)}**\nUser ID • \`${user.id}\``, inline: true },
      { name: 'Account', value: `Created • ${formatTimestamp(user.createdTimestamp)}\nAge • ${formatRelativeTimestamp(user.createdTimestamp)}`, inline: true },
      { name: 'Server', value: `Joined • ${formatTimestamp(member?.joinedTimestamp, source.guild ? 'Not in this server' : 'Outside a server')}\nPresence • ${formatPresence(member)}`, inline: true },
      { name: 'Roles', value: `Top role • ${roleSummary.topRole}\nRole count • **${roleSummary.count}**`, inline: true },
      { name: 'Moderation', value: await getModerationStatus(member), inline: true },
      { name: 'Avatar', value: `[Open in browser](${user.displayAvatarURL({ size: 4096 })})`, inline: true },
      { name: 'Visible Roles', value: roleSummary.roleList, inline: false },
    ],
    thumbnail: user.displayAvatarURL({ size: 1024 }),
    image: user.bannerURL?.({ size: 2048 }) || null,
    footer: 'REDLINE • Public user profile',
  });
}

async function buildServerInfoEmbed(guild) {
  const owner = guild.ownerId ? `<@${guild.ownerId}>` : 'Unknown';
  const channels = guild.channels.cache;
  const textCount = channels.filter((channel) => [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(channel.type)).size;
  const voiceCount = channels.filter((channel) => [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)).size;

  return makeEmbed({
    title: `Server Overview • ${guild.name}`,
    description: trimText(guild.description || 'Community overview and current server stats.', 512),
    author: {
      name: 'Redline Server Card',
      iconURL: guild.iconURL({ extension: 'png', size: 512 }) || undefined,
    },
    fields: [
      { name: 'Ownership', value: `Owner • ${owner}\nServer ID • \`${guild.id}\``, inline: true },
      { name: 'Members', value: `Total • **${guild.memberCount}**\nBoosts • **${guild.premiumSubscriptionCount || 0}**`, inline: true },
      { name: 'Setup', value: `Roles • **${guild.roles.cache.size}**\nEmojis • **${guild.emojis.cache.size}**`, inline: true },
      { name: 'Channels', value: `Text • **${textCount}**\nVoice • **${voiceCount}**\nTotal • **${channels.size}**`, inline: true },
      { name: 'Boost Tier', value: `Tier **${guild.premiumTier || 0}**`, inline: true },
      { name: 'Created', value: `${formatTimestamp(guild.createdTimestamp)}\n${formatRelativeTimestamp(guild.createdTimestamp)}`, inline: true },
    ],
    thumbnail: guild.iconURL({ extension: 'png', size: 1024 }) || null,
    image: guild.bannerURL({ size: 2048 }) || null,
    footer: 'REDLINE • Public server profile',
  });
}

module.exports = {
  commands: [
    {
      name: 'userinfo',
      metadata: {
        category: 'utility',
        description: 'Show public profile details for yourself or another user.',
        usage: ['/userinfo', '/userinfo user:@member'],
        prefixEnabled: true,
        prefixUsage: ['Serenity userinfo', 'Serenity userinfo @user'],
        examples: ['/userinfo', '/userinfo @Moderator', 'Serenity userinfo 123456789012345678'],
        permissions: ['Everyone'],
        response: 'public',
      },
      data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Show information about a user')
        .addUserOption((option) => option.setName('user').setDescription('User to inspect')),
      async execute({ client, interaction }) {
        const requestedUser = interaction.options.getUser('user') || interaction.user;
        const user = await client.users.fetch(requestedUser.id).catch(() => requestedUser);
        const embed = await buildUserInfoEmbed(interaction, user);
        return interaction.reply({ embeds: [embed] });
      },
      async executePrefix({ client, message, args }) {
        const user = args[0] ? await resolveUserFromToken(client, args[0]).catch(() => null) : message.author;
        const embed = await buildUserInfoEmbed(message, user || message.author);
        return message.reply({ embeds: [embed] });
      },
    },
    {
      name: 'serverinfo',
      metadata: {
        category: 'utility',
        description: 'Show public information about the current server.',
        usage: ['/serverinfo'],
        prefixEnabled: true,
        prefixUsage: ['Serenity serverinfo'],
        examples: ['/serverinfo', 'Serenity serverinfo'],
        permissions: ['Everyone'],
        response: 'public',
      },
      data: new SlashCommandBuilder().setName('serverinfo').setDescription('Show information about this server'),
      async execute({ interaction }) {
        if (!interaction.guild) {
          return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        }
        return interaction.reply({ embeds: [await buildServerInfoEmbed(interaction.guild)] });
      },
      async executePrefix({ message }) {
        return message.reply({ embeds: [await buildServerInfoEmbed(message.guild)] });
      },
    },
    {
      name: 'roleinfo',
      metadata: {
        category: 'utility',
        description: 'Inspect one role in the current server.',
        usage: ['/roleinfo role:@role'],
        prefixEnabled: false,
        examples: ['/roleinfo @Member'],
        permissions: ['Everyone'],
        response: 'ephemeral',
      },
      data: new SlashCommandBuilder()
        .setName('roleinfo')
        .setDescription('Show information about a role')
        .addRoleOption((option) => option.setName('role').setDescription('Role to inspect').setRequired(true)),
      async execute({ interaction }) {
        const role = interaction.options.getRole('role', true);
        return interaction.reply({
          embeds: [makeEmbed({
            title: `Role Info • ${role.name}`,
            fields: [
              { name: 'ID', value: role.id, inline: true },
              { name: 'Color', value: role.hexColor, inline: true },
              { name: 'Members', value: String(role.members.size), inline: true },
              { name: 'Position', value: String(role.position), inline: true },
              { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
              { name: 'Managed', value: role.managed ? 'Yes' : 'No', inline: true },
            ],
          })],
          ephemeral: true,
        });
      },
    },
    {
      name: 'avatar',
      metadata: {
        category: 'utility',
        description: 'Show a user avatar publicly.',
        usage: ['/avatar', '/avatar user:@member'],
        prefixEnabled: true,
        prefixUsage: ['Serenity avatar', 'Serenity avatar @user'],
        examples: ['/avatar', '/avatar user:@User', 'Serenity avatar @User'],
        permissions: ['Everyone'],
        response: 'public',
      },
      data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Show a user avatar')
        .addUserOption((option) => option.setName('user').setDescription('User whose avatar to show')),
      async execute({ interaction }) {
        const user = interaction.options.getUser('user') || interaction.user;
        return interaction.reply({ embeds: [buildAvatarEmbed(user)] });
      },
      async executePrefix({ client, message, args }) {
        const user = args[0] ? await resolveUserFromToken(client, args[0]).catch(() => null) : message.author;
        return message.reply({ embeds: [buildAvatarEmbed(user || message.author)] });
      },
    },
    {
      name: 'ping',
      metadata: {
        category: 'utility',
        description: 'Show the current WebSocket latency.',
        usage: ['/ping'],
        prefixEnabled: false,
        examples: ['/ping'],
        permissions: ['Everyone'],
        response: 'ephemeral',
      },
      data: new SlashCommandBuilder().setName('ping').setDescription('Show bot latency'),
      async execute({ client, interaction }) {
        return interaction.reply({ embeds: [makeInfoEmbed({ title: 'Pong', description: `Gateway heartbeat: **${client.ws.ping}ms**.` })], ephemeral: true });
      },
    },
    {
      name: 'botinfo',
      metadata: {
        category: 'utility',
        description: 'Show a quick overview of the bot runtime.',
        usage: ['/botinfo'],
        prefixEnabled: false,
        examples: ['/botinfo'],
        permissions: ['Everyone'],
        response: 'ephemeral',
      },
      data: new SlashCommandBuilder().setName('botinfo').setDescription('Show information about the bot'),
      async execute({ client, interaction, commandRegistry }) {
        return interaction.reply({
          embeds: [makeEmbed({
            title: 'Bot Info • Redline',
            description: trimText('Modular Discord.js v14 bot for client delivery, moderation, help, and YouTube tooling.', 1024),
            fields: [
              { name: 'Commands', value: String(commandRegistry.size), inline: true },
              { name: 'Guilds', value: String(client.guilds.cache.size), inline: true },
              { name: 'Latency', value: `${client.ws.ping}ms`, inline: true },
            ],
          })],
          ephemeral: true,
        });
      },
    },
  ],
};
