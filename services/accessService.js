const { getGuildConfig } = require('./configService');
const { makeWarningEmbed } = require('../utils/embeds');

function hasAny(ids, values) {
  const set = new Set(Array.isArray(ids) ? ids : []);
  return Array.isArray(values) ? values.some((value) => set.has(value)) : false;
}

async function getCommandAccess(guildId, commandName) {
  const guildConfig = await getGuildConfig(guildId);
  const defaults = guildConfig.modules.commands.defaultAccess || {};
  const override = guildConfig.modules.commands.overrides?.[commandName] || {};
  return {
    roleAllowIds: override.roleAllowIds || defaults.roleAllowIds || [],
    roleDenyIds: override.roleDenyIds || defaults.roleDenyIds || [],
    channelAllowIds: override.channelAllowIds || defaults.channelAllowIds || [],
    channelDenyIds: override.channelDenyIds || defaults.channelDenyIds || [],
  };
}

async function validateCommandAccess({ guildId, command, member, channelId }) {
  if (!guildId || !command?.metadata?.name || !member) {
    return { allowed: true };
  }

  const access = await getCommandAccess(guildId, command.metadata.name);
  const memberRoleIds = member.roles?.cache ? [...member.roles.cache.keys()] : [];

  if (hasAny(access.channelDenyIds, [channelId])) {
    return { allowed: false, reason: 'This command is disabled in this channel.' };
  }

  if (hasAny(access.roleDenyIds, memberRoleIds)) {
    return { allowed: false, reason: 'One of your roles is blocked from using this command.' };
  }

  if (access.channelAllowIds.length && !hasAny(access.channelAllowIds, [channelId])) {
    return { allowed: false, reason: 'This command is only enabled in configured channels.' };
  }

  if (access.roleAllowIds.length && !hasAny(access.roleAllowIds, memberRoleIds)) {
    return { allowed: false, reason: 'This command requires one of the configured allowed roles.' };
  }

  return { allowed: true };
}

function buildAccessDeniedPayload(reason) {
  return {
    embeds: [makeWarningEmbed({
      title: 'Command unavailable here',
      description: reason || 'This command is restricted by Serenity command access settings.',
      footer: 'SERENITY • Access control',
    })],
    ephemeral: true,
  };
}

module.exports = {
  buildAccessDeniedPayload,
  getCommandAccess,
  validateCommandAccess,
};
