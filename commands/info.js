const { SlashCommandBuilder } = require('discord.js');
const { loadModerationState } = require('../storage/moderationStore');
const { makeEmbed, makeInfoEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');
const { resolveMemberFromToken, resolveUserFromToken } = require('../services/prefixService');

function formatTimestamp(timestamp, fallback = 'Unknown') {
  if (!timestamp) return fallback;
  return `<t:${Math.floor(new Date(timestamp).getTime() / 1000)}:F>`;
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
    roleList: roleMentions.length ? trimText(roleMentions.slice(0, 10).join(', '), 1024) : 'None',
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

async function buildUserInfoEmbed(source, requestedUser) {
  const user = requestedUser || source.user || source.author;
  const member = await resolveTargetMember(source, user);
  const roleSummary = getMemberRoleSummary(member);

  return makeEmbed({
    title: `User Info • ${formatUserLabel(user)}`,
    description: [
      `${user}`,
      user?.globalName && user.globalName !== user.username ? `Display name: **${trimText(user.globalName, 80)}**` : null,
    ].filter(Boolean).join('\n'),
    fields: [
      { name: 'Username', value: trimText(user.username || 'Unknown', 100), inline: true },
      { name: 'Tag', value: trimText(user.tag || user.username || 'Unknown', 100), inline: true },
      { name: 'User ID', value: user.id, inline: true },
      { name: 'Account Created', value: formatTimestamp(user.createdTimestamp), inline: true },
      { name: 'Server Joined', value: formatTimestamp(member?.joinedTimestamp, source.guild ? 'Not in this server' : 'Outside a server'), inline: true },
      { name: 'Top Role', value: roleSummary.topRole, inline: true },
      { name: 'Role Count', value: roleSummary.count, inline: true },
      { name: 'Moderation Status', value: await getModerationStatus(member), inline: true },
      { name: 'Roles', value: roleSummary.roleList },
    ],
    thumbnail: user.displayAvatarURL({ size: 1024 }),
    image: user.displayAvatarURL({ size: 1024 }),
  });
}

async function buildServerInfoEmbed(guild) {
  const owner = guild.ownerId ? `<@${guild.ownerId}>` : 'Unknown';
  return makeEmbed({
    title: `Server Info • ${guild.name}`,
    fields: [
      { name: 'Owner', value: owner, inline: true },
      { name: 'Members', value: String(guild.memberCount), inline: true },
      { name: 'Roles', value: String(guild.roles.cache.size), inline: true },
      { name: 'Channels', value: String(guild.channels.cache.size), inline: true },
      { name: 'Boost Level', value: `Tier ${guild.premiumTier || 0}`, inline: true },
      { name: 'Boost Count', value: String(guild.premiumSubscriptionCount || 0), inline: true },
      { name: 'Created', value: formatTimestamp(guild.createdTimestamp) },
    ],
    thumbnail: guild.iconURL() || null,
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
        description: 'Show a user avatar.',
        usage: ['/avatar', '/avatar user:@member'],
        prefixEnabled: false,
        examples: ['/avatar @User'],
        permissions: ['Everyone'],
        response: 'ephemeral',
      },
      data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Show a user avatar')
        .addUserOption((option) => option.setName('user').setDescription('User whose avatar to show')),
      async execute({ interaction }) {
        const user = interaction.options.getUser('user') || interaction.user;
        return interaction.reply({ embeds: [makeEmbed({ title: `Avatar • ${user.tag}`, image: user.displayAvatarURL({ size: 1024 }) })], ephemeral: true });
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
