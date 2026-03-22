const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('./configService');
const { makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');
const { trimText, slugify } = require('../utils/helpers');

function normalizeTicketPanel(entry = {}) {
  return {
    id: entry.id || `${Date.now()}`,
    name: trimText(entry.name || 'support', 80),
    style: String(entry.style || 'support').toLowerCase(),
    channelId: entry.channelId || null,
    messageId: entry.messageId || null,
    categoryId: entry.categoryId || null,
    supportRoleId: entry.supportRoleId || null,
    welcomeMessage: trimText(entry.welcomeMessage || 'A Serenity support thread has been created. A staff member will be with you shortly.', 1000),
    ticketPrefix: trimText(entry.ticketPrefix || 'ticket', 30),
  };
}

async function getTicketPanels(guildId) {
  const config = await getGuildConfig(guildId);
  return (config.modules.support.panels || []).map(normalizeTicketPanel);
}

async function saveTicketPanels(guildId, panels) {
  await updateGuildConfig(guildId, { modules: { support: { panels: panels.map(normalizeTicketPanel) } } });
  return getTicketPanels(guildId);
}

async function upsertTicketPanel(guildId, payload) {
  const panels = await getTicketPanels(guildId);
  const next = normalizeTicketPanel(payload);
  const index = panels.findIndex((panel) => panel.name.toLowerCase() === next.name.toLowerCase());
  if (index >= 0) panels[index] = { ...panels[index], ...next };
  else panels.push(next);
  await saveTicketPanels(guildId, panels);
  return next;
}

async function attachTicketPanelMessage(guildId, name, channelId, messageId) {
  const panels = await getTicketPanels(guildId);
  const index = panels.findIndex((panel) => panel.name.toLowerCase() === String(name || '').toLowerCase());
  if (index < 0) return null;
  panels[index] = { ...panels[index], channelId, messageId };
  await saveTicketPanels(guildId, panels);
  return panels[index];
}

async function getTicketPanelByMessage(guildId, messageId) {
  const panels = await getTicketPanels(guildId);
  return panels.find((panel) => panel.messageId === messageId) || null;
}

function buildTicketPanelEmbed(panel) {
  return makeInfoEmbed({
    title: `${panel.name} tickets`,
    description: panel.welcomeMessage,
    fields: [
      { name: 'Panel Type', value: panel.style, inline: true },
      { name: 'Routing Category', value: panel.categoryId ? `<#${panel.categoryId}>` : 'Current category / root', inline: true },
      { name: 'Support Role', value: panel.supportRoleId ? `<@&${panel.supportRoleId}>` : 'Not configured', inline: true },
    ],
    footer: 'SERENITY • Ticket center',
  });
}

function buildTicketPanelComponents(panel) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`serenity:ticket:create:${panel.id}`).setLabel('Open Ticket').setStyle(ButtonStyle.Primary),
  )];
}

async function createTicketFromPanel(interaction, panelId) {
  const panels = await getTicketPanels(interaction.guildId);
  const panel = panels.find((entry) => entry.id === panelId || entry.messageId === interaction.message.id);
  if (!panel) {
    return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Ticket panel unavailable', description: 'That ticket panel could not be found.' })], ephemeral: true });
  }

  const baseName = `${panel.ticketPrefix}-${slugify(interaction.user.username).slice(0, 20) || interaction.user.id}`;
  const existing = interaction.guild.channels.cache.find((channel) => channel.name === baseName);
  if (existing) {
    return interaction.reply({ embeds: [makeInfoEmbed({ title: 'Ticket already open', description: `You already have an open ticket in ${existing}.` })], ephemeral: true });
  }

  const permissionOverwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: interaction.guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
  ];
  if (panel.supportRoleId) {
    permissionOverwrites.push({ id: panel.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }

  const channel = await interaction.guild.channels.create({
    name: baseName,
    type: ChannelType.GuildText,
    parent: panel.categoryId || undefined,
    permissionOverwrites,
    reason: `Serenity ticket created by ${interaction.user.tag}`,
  });

  await channel.send({
    content: panel.supportRoleId ? `<@&${panel.supportRoleId}> ${interaction.user}` : `${interaction.user}`,
    allowedMentions: { users: [interaction.user.id], roles: panel.supportRoleId ? [panel.supportRoleId] : [] },
    embeds: [makeInfoEmbed({ title: `${panel.name} ticket`, description: panel.welcomeMessage, footer: 'SERENITY • Ticket center' })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`serenity:ticket:close:${panel.id}`).setLabel('Close').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`serenity:ticket:claim:${panel.id}`).setLabel('Claim').setStyle(ButtonStyle.Secondary),
    )],
  });

  return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Ticket opened', description: `Your private ticket is ready in ${channel}.` })], ephemeral: true });
}

async function closeTicket(interaction) {
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Ticket unavailable', description: 'This action can only be used inside a server text ticket.' })], ephemeral: true });
  }

  await interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Ticket closing', description: 'This ticket will be deleted in 5 seconds.' })], ephemeral: true });
  setTimeout(() => interaction.channel.delete('Serenity ticket close action').catch(() => null), 5000);
  return true;
}

async function claimTicket(interaction) {
  return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Ticket claimed', description: `${interaction.user} is now handling this ticket.` })], ephemeral: false });
}

module.exports = {
  attachTicketPanelMessage,
  buildTicketPanelComponents,
  buildTicketPanelEmbed,
  closeTicket,
  claimTicket,
  createTicketFromPanel,
  getTicketPanelByMessage,
  getTicketPanels,
  normalizeTicketPanel,
  upsertTicketPanel,
};
