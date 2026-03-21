const { normalizeVisibility } = require('./helpers');

function getMemberLikeId(member) {
  return member?.user?.id || member?.id || null;
}

function getBotOwnerId() {
  const raw = String(process.env.BOT_OWNER_ID || '').trim();
  return /^\d{16,20}$/.test(raw) ? raw : null;
}

function isBotOwner(memberOrUser) {
  const ownerId = getBotOwnerId();
  if (!ownerId) return false;
  return getMemberLikeId(memberOrUser) === ownerId;
}

function canActOn(actorMember, targetMember) {
  if (!actorMember || !targetMember) return false;
  if (actorMember.id === targetMember.id) return false;
  if (targetMember.id === targetMember.guild.ownerId) return false;
  return actorMember.roles.highest.position > targetMember.roles.highest.position;
}

function extractRoleIds(member) {
  if (!member) return new Set();
  if (member.roles?.cache) return new Set(member.roles.cache.keys());
  if (Array.isArray(member.roles)) return new Set(member.roles);
  if (Array.isArray(member.roleIds)) return new Set(member.roleIds);
  return new Set();
}

function memberHasRoleAccess(member, mod) {
  if (isBotOwner(member)) return true;
  if (!mod.accessRoleId) return true;
  return extractRoleIds(member).has(mod.accessRoleId);
}

function isVisibleToMember(member, mod) {
  const visibility = normalizeVisibility(mod.visibility);
  const hasRoleAccess = memberHasRoleAccess(member, mod);

  if (visibility === 'hidden') {
    return hasRoleAccess && !!mod.accessRoleId;
  }

  return hasRoleAccess;
}

function hasGuildPermission(member, permission) {
  if (isBotOwner(member)) return true;
  return Boolean(member?.permissions?.has?.(permission));
}

function ensureMemberPermission(member, permission, errorMessage = 'You do not have permission to use this command.') {
  if (!hasGuildPermission(member, permission)) {
    throw new Error(errorMessage);
  }
}

module.exports = {
  canActOn,
  ensureMemberPermission,
  extractRoleIds,
  getBotOwnerId,
  hasGuildPermission,
  isBotOwner,
  isVisibleToMember,
  memberHasRoleAccess,
};
