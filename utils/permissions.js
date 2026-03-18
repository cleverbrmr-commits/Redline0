const { PermissionFlagsBits } = require("discord.js");
const { normalizeVisibility, parseRoleId } = require("./helpers");

function canActOn(actorMember, targetMember) {
  if (!actorMember || !targetMember) return false;
  if (actorMember.id === targetMember.id) return false;
  if (targetMember.id === targetMember.guild.ownerId) return false;
  return actorMember.roles.highest.position > targetMember.roles.highest.position;
}

function extractRoleIds(member) {
  if (!member) return new Set();
  if (member.roles?.cache) return new Set(member.roles.cache.keys());
  if (Array.isArray(member.roles)) return new Set(member.roles.map(parseRoleId).filter(Boolean));
  if (Array.isArray(member.roleIds)) return new Set(member.roleIds.map(parseRoleId).filter(Boolean));
  return new Set();
}

function memberHasRoleAccess(member, mod) {
  if (!mod.accessRoleId) return true;
  return extractRoleIds(member).has(mod.accessRoleId);
}

function isVisibleToMember(member, mod) {
  const visibility = normalizeVisibility(mod.visibility);
  const hasRoleAccess = memberHasRoleAccess(member, mod);

  if (visibility === "hidden") {
    return hasRoleAccess && !!mod.accessRoleId;
  }

  return hasRoleAccess;
}

function memberHasAnyRole(member, roleIds = []) {
  const owned = extractRoleIds(member);
  return roleIds.some((roleId) => owned.has(parseRoleId(roleId)));
}

function memberHasNativePermission(member, permission) {
  if (!permission || !member?.permissions?.has) return false;
  return member.permissions.has(permission);
}

function hasCommandAccess(member, guild, access = {}, config = {}) {
  if (!access?.group || access.group === "everyone") return true;
  if (!member || !guild) return false;
  if (member.id === guild.ownerId) return true;

  if (Array.isArray(access.nativePermissions) && access.nativePermissions.some((permission) => memberHasNativePermission(member, permission))) {
    return true;
  }

  if (access.nativePermission && memberHasNativePermission(member, access.nativePermission)) {
    return true;
  }

  const overrides = config?.commandRoleOverrides?.[access.group] || [];
  return memberHasAnyRole(member, overrides);
}

module.exports = {
  PermissionFlagsBits,
  canActOn,
  extractRoleIds,
  hasCommandAccess,
  isVisibleToMember,
  memberHasNativePermission,
  memberHasRoleAccess,
};
