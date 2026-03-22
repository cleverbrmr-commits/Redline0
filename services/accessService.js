const { getGuildConfig } = require('./configService');
const { makeWarningEmbed } = require('../utils/embeds');
const { isBotOwner } = require('../utils/permissions');

function hasAny(ids, values) {
  const set = new Set(Array.isArray(ids) ? ids : []);
  return Array.isArray(values) ? values.some((value) => set.has(value)) : false;
}

function getRequiredPermissionBits(command) {
  const rawBits = command?.data?.default_member_permissions ?? command?.data?.defaultMemberPermissions ?? null;
  if (rawBits === null || rawBits === undefined || rawBits === '') return null;

  try {
    return BigInt(rawBits);
  } catch {
    return null;
  }
}

function validateCommandPermissionGating(command, member) {
  if (!command || !member) {
    return { allowed: true };
  }

  if (isBotOwner(member)) {
    return { allowed: true, ownerOverride: true };
  }

  const requiredPermissionBits = getRequiredPermissionBits(command);
  if (!requiredPermissionBits) {
    return { allowed: true };
  }

  if (member.permissions?.has?.(requiredPermissionBits)) {
    return { allowed: true };
  }

  const requiredPermissions = command.metadata?.permissions?.length
    ? command.metadata.permissions.join(', ')
    : 'the required Discord permissions';

  return {
    allowed: false,
    reason: `You need ${requiredPermissions} to use this command.`,
  };
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

  const permissionGate = validateCommandPermissionGating(command, member);
  if (!permissionGate.allowed || permissionGate.ownerOverride) {
    return permissionGate;
  }

  const guildConfig = await getGuildConfig(guildId);
  const moduleKey = command.metadata?.category;
  const moduleConfig = moduleKey ? guildConfig.modules?.[moduleKey] : null;
  if (moduleConfig && moduleConfig.enabled === false) {
    return { allowed: false, reason: 'That Serenity module is currently disabled in this server.' };
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
  validateCommandPermissionGating,
};
