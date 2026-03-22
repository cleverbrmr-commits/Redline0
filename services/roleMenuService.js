const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('./configService');
const { makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');

function normalizeRoleMenu(entry = {}) {
  return {
    id: entry.id || `${Date.now()}`,
    name: trimText(entry.name || 'Role Menu', 80),
    description: trimText(entry.description || 'Choose the roles that fit you best.', 300),
    style: String(entry.style || 'buttons').toLowerCase(),
    channelId: entry.channelId || null,
    messageId: entry.messageId || null,
    singleSelect: Boolean(entry.singleSelect),
    maxRoles: Math.max(1, Math.min(5, Number(entry.maxRoles || 5))),
    options: Array.isArray(entry.options) ? entry.options.filter(Boolean).slice(0, 5).map((option) => ({
      roleId: option.roleId,
      label: trimText(option.label || option.roleId || 'Role', 80),
      description: trimText(option.description || 'Self-assignable role.', 100),
      emoji: option.emoji || null,
    })) : [],
  };
}

async function getRoleMenus(guildId) {
  const config = await getGuildConfig(guildId);
  return (config.modules.roles.menus || []).map(normalizeRoleMenu);
}

async function saveRoleMenus(guildId, menus) {
  await updateGuildConfig(guildId, { modules: { roles: { menus: menus.map(normalizeRoleMenu) } } });
  return getRoleMenus(guildId);
}

async function upsertRoleMenu(guildId, payload) {
  const menus = await getRoleMenus(guildId);
  const next = normalizeRoleMenu(payload);
  const index = menus.findIndex((menu) => menu.name.toLowerCase() === next.name.toLowerCase());
  if (index >= 0) menus[index] = { ...menus[index], ...next };
  else menus.push(next);
  await saveRoleMenus(guildId, menus);
  return next;
}

async function attachRoleMenuMessage(guildId, name, channelId, messageId) {
  const menus = await getRoleMenus(guildId);
  const index = menus.findIndex((menu) => menu.name.toLowerCase() === String(name || '').toLowerCase());
  if (index < 0) return null;
  menus[index] = { ...menus[index], channelId, messageId };
  await saveRoleMenus(guildId, menus);
  return menus[index];
}

async function getRoleMenuByMessage(guildId, messageId) {
  const menus = await getRoleMenus(guildId);
  return menus.find((menu) => menu.messageId === messageId) || null;
}

function buildRoleMenuEmbed(menu) {
  return makeInfoEmbed({
    title: `${menu.name}`,
    description: menu.description,
    fields: menu.options.map((option, index) => ({
      name: `${option.emoji ? `${option.emoji} ` : ''}${option.label}`,
      value: `${option.description}\nRole • <@&${option.roleId}>`,
      inline: true,
    })),
    footer: `SERENITY • Role menus • ${menu.singleSelect ? 'Single select' : 'Multi select'}`,
  });
}

function buildRoleMenuComponents(menu) {
  const row = new ActionRowBuilder();
  menu.options.slice(0, 5).forEach((option, index) => {
    row.addComponents(new ButtonBuilder()
      .setCustomId(`serenity:rolemenu:${menu.id}:${index}`)
      .setLabel(trimText(option.label, 80))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(option.emoji || undefined));
  });
  return [row];
}

async function toggleRoleFromMenu(interaction, menuId, optionIndex) {
  const menus = await getRoleMenus(interaction.guildId);
  const menu = menus.find((entry) => entry.id === menuId || entry.messageId === interaction.message.id);
  if (!menu) {
    return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Role menu unavailable', description: 'That role menu could not be found or is no longer active.' })], ephemeral: true });
  }

  const option = menu.options[Number(optionIndex)];
  if (!option) {
    return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Role option unavailable', description: 'That role option does not exist on this menu.' })], ephemeral: true });
  }

  const member = interaction.member;
  const role = interaction.guild.roles.cache.get(option.roleId) || await interaction.guild.roles.fetch(option.roleId).catch(() => null);
  if (!member || !role) {
    return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Role unavailable', description: 'That role could not be resolved in this server.' })], ephemeral: true });
  }

  const hasRole = member.roles?.cache?.has?.(role.id);
  if (menu.singleSelect && !hasRole) {
    const otherRoleIds = menu.options.map((entry) => entry.roleId).filter((id) => id !== role.id);
    const existing = otherRoleIds.filter((id) => member.roles.cache.has(id));
    if (existing.length) {
      await member.roles.remove(existing, 'Serenity single-select role menu swap').catch(() => null);
    }
  }

  if (hasRole) {
    await member.roles.remove(role, `Serenity role menu: ${menu.name}`).catch(() => null);
    return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Role removed', description: `${role} was removed from your profile.` })], ephemeral: true });
  }

  await member.roles.add(role, `Serenity role menu: ${menu.name}`).catch(() => null);
  return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Role added', description: `${role} was added to your profile.` })], ephemeral: true });
}

module.exports = {
  attachRoleMenuMessage,
  buildRoleMenuComponents,
  buildRoleMenuEmbed,
  getRoleMenuByMessage,
  getRoleMenus,
  normalizeRoleMenu,
  toggleRoleFromMenu,
  upsertRoleMenu,
};
