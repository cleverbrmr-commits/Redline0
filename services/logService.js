const { Colors } = require('discord.js');
const { getConfiguredLogChannelId, loadConfig } = require('./configService');
const { makeEmbed, makeInfoEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');

const SEVERITY_COLORS = {
  low: Colors.Blurple,
  medium: Colors.Orange,
  high: Colors.Red,
};

async function maybeLogEmbed(client, channelId, embed) {
  if (!channelId) return false;

  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isTextBased() && typeof channel.send === 'function') {
      await channel.send({ embeds: [embed] });
      return true;
    }
  } catch (err) {
    console.error('Log channel send failed:', err);
  }

  return false;
}

function buildLogEmbed({ title, description, severity = 'low', fields = [], footer = 'SERENITY • Audit trail' }) {
  return makeEmbed({
    title,
    description,
    color: SEVERITY_COLORS[severity] || Colors.Blurple,
    fields,
    footer,
  });
}

async function maybeLogByKey(client, logKey, embed, guildId = null) {
  const config = await loadConfig();
  const channelId = getConfiguredLogChannelId(config, logKey, guildId);
  return maybeLogEmbed(client, channelId, embed);
}

async function maybeLogFeature(client, guildId, featureKey, embed) {
  return maybeLogByKey(client, featureKey, embed, guildId);
}

async function logDownload(client, interaction, mod) {
  await maybeLogFeature(
    client,
    interaction.guildId,
    'downloads',
    buildLogEmbed({
      title: 'Client Download Logged',
      description: `**${interaction.user.tag}** downloaded **${mod.label}**.`,
      severity: 'low',
      fields: [
        { name: 'Client', value: trimText(mod.label, 100), inline: true },
        { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Channel', value: interaction.channel ? `<#${interaction.channel.id}>` : 'Unknown', inline: true },
        { name: 'At', value: `<t:${Math.floor(Date.now() / 1000)}:F>` },
      ],
      footer: 'SERENITY • Download telemetry',
    })
  );
}

async function logPrison(client, interaction, title, description, fields = [], color = Colors.DarkGrey) {
  await maybeLogFeature(client, interaction?.guildId, 'prison', makeEmbed({ title, description, fields, color, footer: 'SERENITY • Prison system' }));
}

async function logModeration(client, action, interaction, targetUser, reason) {
  await maybeLogFeature(
    client,
    interaction.guildId || interaction.guild?.id,
    'moderation',
    buildLogEmbed({
      title: `Moderation • ${action}`,
      description: `**${interaction.user.tag}** performed **${action}**.`,
      severity: ['ban', 'kick', 'softban', 'tempban'].includes(String(action).toLowerCase()) ? 'high' : 'medium',
      fields: [
        { name: 'Target', value: targetUser ? `<@${targetUser.id}>` : 'Unknown', inline: true },
        { name: 'Staff', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Reason', value: trimText(reason || 'No reason provided', 1024), inline: false },
      ],
      footer: 'SERENITY • Moderation logs',
    })
  );
}

async function logAnnouncement(client, interaction, title) {
  await maybeLogFeature(
    client,
    interaction.guildId,
    'announcements',
    buildLogEmbed({
      title: 'Announcement Sent',
      description: `**${interaction.user.tag}** posted an announcement.`,
      severity: 'low',
      fields: [
        { name: 'Title', value: trimText(title, 200) },
        { name: 'Channel', value: interaction.channel ? `<#${interaction.channel.id}>` : 'Unknown', inline: true },
        { name: 'At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      ],
      footer: 'SERENITY • Announcement logs',
    })
  );
}

async function logCommandUsage(client, source, command) {
  if (!source?.guildId && !source?.guild?.id) return false;
  const guildId = source.guildId || source.guild.id;
  const user = source.user || source.author;
  if (!user) return false;

  return maybeLogFeature(client, guildId, 'commands', buildLogEmbed({
    title: 'Staff Command Used',
    description: `${user} used **/${command.metadata?.name || command.name}**.`,
    severity: 'low',
    fields: [
      { name: 'Member', value: `<@${user.id}>`, inline: true },
      { name: 'Module', value: command.metadata?.module?.label || command.metadata?.category || 'Unknown', inline: true },
      { name: 'Response', value: command.metadata?.response || 'public', inline: true },
    ],
    footer: 'SERENITY • Command activity',
  }));
}

async function logMessageDelete(client, message) {
  if (!message?.guildId) return false;
  return maybeLogFeature(client, message.guildId, 'messages', buildLogEmbed({
    title: 'Message Deleted',
    description: message.author ? `${message.author} had a message removed.` : 'A message was removed.',
    severity: 'medium',
    fields: [
      { name: 'Author', value: message.author ? `${message.author.tag} • \`${message.author.id}\`` : 'Unknown', inline: true },
      { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
      { name: 'Content', value: trimText(message.content || 'No text content', 900), inline: false },
    ],
    footer: 'SERENITY • Message logs',
  }));
}

async function logMessageEdit(client, before, after) {
  if (!after?.guildId) return false;
  return maybeLogFeature(client, after.guildId, 'messages', buildLogEmbed({
    title: 'Message Edited',
    description: after.author ? `${after.author} edited a message.` : 'A message was edited.',
    severity: 'low',
    fields: [
      { name: 'Author', value: after.author ? `${after.author.tag} • \`${after.author.id}\`` : 'Unknown', inline: true },
      { name: 'Channel', value: `<#${after.channelId}>`, inline: true },
      { name: 'Before', value: trimText(before?.content || 'No text content', 450), inline: false },
      { name: 'After', value: trimText(after?.content || 'No text content', 450), inline: false },
    ],
    footer: 'SERENITY • Message logs',
  }));
}

async function logMemberJoin(client, member) {
  return maybeLogFeature(client, member.guild.id, 'members', buildLogEmbed({
    title: 'Member Joined',
    description: `${member.user} joined the server.`,
    severity: 'low',
    fields: [
      { name: 'User', value: `${member.user.tag} • \`${member.id}\``, inline: true },
      { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: 'Member Count', value: String(member.guild.memberCount || 0), inline: true },
    ],
    footer: 'SERENITY • Member activity',
  }));
}

module.exports = {
  buildLogEmbed,
  logAnnouncement,
  logCommandUsage,
  logDownload,
  logMemberJoin,
  logMessageDelete,
  logMessageEdit,
  logModeration,
  logPrison,
  maybeLogByKey,
  maybeLogEmbed,
  maybeLogFeature,
};
