const {
  normalizeVisibility,
} = require("./helpers");

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

module.exports = {
  canActOn,
  extractRoleIds,
  isVisibleToMember,
  memberHasRoleAccess,
};
