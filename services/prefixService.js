function tokenizePrefixContent(content) {
  const tokens = [];
  const pattern = /"([^"]+)"|'([^']+)'|(\S+)/g;
  let match = null;

  while ((match = pattern.exec(String(content || ''))) !== null) {
    tokens.push(match[1] || match[2] || match[3]);
  }

  return tokens;
}

function parsePrefixInvocation(content, botName) {
  const trimmed = String(content || '').trim();
  if (!trimmed) return null;

  const escapedName = String(botName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`^${escapedName}(?=\\s|$)`, 'i');
  if (!matcher.test(trimmed)) return null;

  const withoutPrefix = trimmed.replace(matcher, '').trim();
  if (!withoutPrefix) {
    return { botName, args: [], commandName: null };
  }

  const args = tokenizePrefixContent(withoutPrefix);
  return {
    botName,
    args,
    commandName: args[0] ? args[0].toLowerCase() : null,
  };
}

function extractSnowflake(value) {
  const match = String(value || '').match(/\d{16,20}/);
  return match ? match[0] : null;
}

async function resolveMemberFromToken(guild, token) {
  const id = extractSnowflake(token);
  if (!guild || !id) return null;
  return guild.members.fetch(id).catch(() => null);
}

async function resolveRoleFromToken(guild, token) {
  const id = extractSnowflake(token);
  if (!guild || !id) return null;
  return guild.roles.fetch(id).catch(() => guild.roles.cache.get(id) || null);
}

async function resolveChannelFromToken(guild, token) {
  const id = extractSnowflake(token);
  if (!guild || !id) return null;
  return guild.channels.fetch(id).catch(() => null);
}

async function resolveUserFromToken(client, token) {
  const id = extractSnowflake(token) || (String(token || '').match(/^\d{16,20}$/) ? token : null);
  if (!id) return null;
  return client.users.fetch(id).catch(() => null);
}

module.exports = {
  extractSnowflake,
  parsePrefixInvocation,
  resolveChannelFromToken,
  resolveMemberFromToken,
  resolveRoleFromToken,
  resolveUserFromToken,
  tokenizePrefixContent,
};
