const { Colors } = require('discord.js');
const { loadConfig, getConfiguredLogChannelId, getGuildConfig } = require('./configService');
const { makeEmbed, makeInfoEmbed, makeWarningEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');

async function maybeLogEmbed(client, channelId, embed) {
  if (!channelId) return false;

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased() && typeof channel.send === 'function') {
      await channel.send({ embeds: [embed] });
      return true;
    }
  } catch (error) {
    console.error('Log channel send failed:', error);
  }

  return false;
}

async function maybeLogByKey(client, guildId, logKey, embed) {
  const config = await loadConfig();
  const channelId = getConfiguredLogChannelId(config, logKey, guildId);
  return maybeLogEmbed(client, channelId, embed);
}

async function resolveGuildLogChannelId(guildId, preferredChannelId, fallbackKey) {
  if (preferredChannelId) return preferredChannelId;
  const guildConfig = await getGuildConfig(guildId);
  return preferredChannelId || guildConfig.logging.channels[fallbackKey] || guildConfig.logging.defaultChannelId || guildConfig.logging.channels.moderation || null;
}

async function logDownload(client, interaction, mod) {
  await maybeLogByKey(client, interaction.guildId, 'downloadLogChannelId', makeInfoEmbed({
    title: 'Client download logged',
    description: `**${interaction.user.tag}** downloaded **${mod.label}**.`,
    fields: [
      { name: 'Client', value: trimText(mod.label, 100), inline: true },
      { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Channel', value: interaction.channel ? `<#${interaction.channel.id}>` : 'Unknown', inline: true },
      { name: 'At', value: `<t:${Math.floor(Date.now() / 1000)}:F>` },
    ],
    footer: 'SERENITY • Content log',
  }));
}

async function logPrison(client, interaction, title, description, fields = [], color = Colors.DarkGrey) {
  await maybeLogByKey(client, interaction?.guildId, 'prisonLogChannelId', makeEmbed({ title, description, fields, color, footer: 'SERENITY • Prison log' }));
}

async function logModeration(client, action, interaction, targetUser, reason, extraFields = []) {
  await maybeLogByKey(client, interaction.guildId, 'modLogChannelId', makeInfoEmbed({
    title: `Moderation • ${action}`,
    description: `**${interaction.user.tag}** performed **${action}**.`,
    fields: [
      { name: 'Target', value: targetUser ? `<@${targetUser.id}>` : 'Unknown', inline: true },
      { name: 'Staff', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Reason', value: trimText(reason || 'No reason provided', 1024), inline: false },
      ...extraFields,
    ],
    footer: 'SERENITY • Moderation audit',
  }));
}

async function logAnnouncement(client, interaction, title) {
  await maybeLogByKey(client, interaction.guildId, 'announceLogChannelId', makeInfoEmbed({
    title: 'Announcement sent',
    description: `**${interaction.user.tag}** posted an announcement.`,
    fields: [
      { name: 'Title', value: trimText(title, 200) },
      { name: 'Channel', value: interaction.channel ? `<#${interaction.channel.id}>` : 'Unknown', inline: true },
      { name: 'At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
    ],
    footer: 'SERENITY • Announcement log',
  }));
}

async function logAutomodEvent(client, guildId, embed) {
  const guildConfig = await getGuildConfig(guildId);
  return maybeLogEmbed(client, guildConfig.logging.channels.automod || guildConfig.logging.channels.moderation, embed);
}

async function logMessageDelete(client, message) {
  if (!message?.guild || message.author?.bot || !message.content) return false;
  return maybeLogByKey(client, message.guild.id, 'messageLogChannelId', makeWarningEmbed({
    title: 'Message deleted',
    description: trimText(message.content, 1500),
    fields: [
      { name: 'Author', value: `${message.author} • \`${message.author.id}\``, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Created', value: `<t:${Math.floor((message.createdTimestamp || Date.now()) / 1000)}:F>`, inline: true },
    ],
    footer: 'SERENITY • Message log',
  }));
}

async function logMessageEdit(client, oldMessage, newMessage) {
  if (!newMessage?.guild || newMessage.author?.bot) return false;
  if (!oldMessage?.content || !newMessage?.content || oldMessage.content === newMessage.content) return false;
  return maybeLogByKey(client, newMessage.guild.id, 'messageLogChannelId', makeInfoEmbed({
    title: 'Message edited',
    fields: [
      { name: 'Author', value: `${newMessage.author} • \`${newMessage.author.id}\``, inline: true },
      { name: 'Channel', value: `<#${newMessage.channel.id}>`, inline: true },
      { name: 'Jump', value: `[Open message](${newMessage.url})`, inline: true },
      { name: 'Before', value: trimText(oldMessage.content, 1000), inline: false },
      { name: 'After', value: trimText(newMessage.content, 1000), inline: false },
    ],
    footer: 'SERENITY • Message log',
  }));
}

async function logMemberJoin(client, member) {
  if (!member?.guild) return false;
  return maybeLogByKey(client, member.guild.id, 'joinLogChannelId', makeSuccessMemberEmbed('Member joined', member, 'Join detected and onboarding flow started.'));
}

async function logMemberLeave(client, member) {
  if (!member?.guild) return false;
  return maybeLogByKey(client, member.guild.id, 'leaveLogChannelId', makeMemberEmbed('Member left', member, 'Member is no longer in the server.', Colors.Orange));
}

async function logMemberUpdate(client, oldMember, newMember) {
  if (!newMember?.guild) return false;
  const changes = [];
  if (oldMember.nickname !== newMember.nickname) {
    changes.push({ name: 'Nickname', value: `Before • ${oldMember.nickname || 'None'}\nAfter • ${newMember.nickname || 'None'}`, inline: false });
  }

  const oldRoles = new Set(oldMember.roles.cache.keys());
  const added = newMember.roles.cache.filter((role) => !oldRoles.has(role.id) && role.id !== newMember.guild.id).map((role) => role.toString());
  const removed = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id) && role.id !== newMember.guild.id).map((role) => role.toString());
  if (added.length) changes.push({ name: 'Roles added', value: trimText(added.join(', '), 1000), inline: false });
  if (removed.length) changes.push({ name: 'Roles removed', value: trimText(removed.join(', '), 1000), inline: false });

  if (!changes.length) return false;

  return maybeLogByKey(client, newMember.guild.id, 'memberLogChannelId', makeInfoEmbed({
    title: 'Member updated',
    fields: [
      { name: 'Member', value: `${newMember} • \`${newMember.id}\``, inline: true },
      ...changes,
    ],
    footer: 'SERENITY • Member log',
  }));
}

async function logCommandUsage(client, source, command) {
  const guildId = source.guildId || source.guild?.id;
  if (!guildId) return false;
  const actor = source.user || source.author;
  return maybeLogByKey(client, guildId, 'serverLogChannelId', makeInfoEmbed({
    title: 'Staff command used',
    fields: [
      { name: 'Command', value: `/${command.name}`, inline: true },
      { name: 'Actor', value: actor ? `<@${actor.id}>` : 'Unknown', inline: true },
      { name: 'Mode', value: source.commandName ? 'Slash' : 'Prefix', inline: true },
    ],
    footer: 'SERENITY • Command telemetry',
  }));
}

function makeMemberEmbed(title, member, description, color) {
  return makeEmbed({
    title,
    description,
    color,
    thumbnail: member.user.displayAvatarURL({ size: 1024 }),
    fields: [
      { name: 'Member', value: `${member} • \`${member.id}\``, inline: true },
      { name: 'Joined Discord', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: 'Server size', value: `#${member.guild.memberCount}`, inline: true },
    ],
    footer: 'SERENITY • Member activity',
  });
}

function makeSuccessMemberEmbed(title, member, description) {
  return makeMemberEmbed(title, member, description, Colors.Green);
}

async function logSecurityEvent(client, guildId, embed, preferredChannelId = null) {
  const channelId = await resolveGuildLogChannelId(guildId, preferredChannelId, 'automod');
  return maybeLogEmbed(client, channelId, embed);
}

module.exports = {
  logAnnouncement,
  logAutomodEvent,
  logCommandUsage,
  logDownload,
  logMemberJoin,
  logMemberLeave,
  logMemberUpdate,
  logMessageDelete,
  logMessageEdit,
  logModeration,
  logPrison,
  logSecurityEvent,
  maybeLogByKey,
  maybeLogEmbed,
};
