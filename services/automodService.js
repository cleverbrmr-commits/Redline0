const { AuditLogEvent, ChannelType } = require('discord.js');
const { loadConfig, saveConfig, updateGuildConfig, getGuildConfig, normalizeGuildConfig } = require('./configService');
const { maybeLogFeature, buildLogEmbed } = require('./logService');
const { recordInfraction } = require('./moderationService');
const { trimText } = require('../utils/helpers');

const DEFAULT_AUTOMOD_RULES = {
  spam: { enabled: false, action: 'timeout', threshold: 6, windowSeconds: 8, durationMinutes: 10, ignoredChannelIds: [], ignoredRoleIds: [], allowedRoleIds: [] },
  links: { enabled: false, action: 'delete', threshold: 1, windowSeconds: 15, durationMinutes: 10, ignoredChannelIds: [], ignoredRoleIds: [], allowedRoleIds: [], allowInvites: false },
  invites: { enabled: false, action: 'delete', threshold: 1, windowSeconds: 20, durationMinutes: 10, ignoredChannelIds: [], ignoredRoleIds: [], allowedRoleIds: [] },
  mentions: { enabled: false, action: 'timeout', threshold: 6, windowSeconds: 10, durationMinutes: 15, ignoredChannelIds: [], ignoredRoleIds: [], allowedRoleIds: [] },
  caps: { enabled: false, action: 'warn', threshold: 0.75, minLength: 12, durationMinutes: 5, ignoredChannelIds: [], ignoredRoleIds: [], allowedRoleIds: [] },
  repetition: { enabled: false, action: 'warn', threshold: 3, windowSeconds: 30, durationMinutes: 5, ignoredChannelIds: [], ignoredRoleIds: [], allowedRoleIds: [] },
  badwords: { enabled: false, action: 'delete', threshold: 1, durationMinutes: 20, ignoredChannelIds: [], ignoredRoleIds: [], allowedRoleIds: [], blockedPhrases: [] },
};

const DEFAULT_PROTECTION = {
  antiRaid: { enabled: false, threshold: 5, windowSeconds: 20, trustedRoleIds: [], trustedUserIds: [], emergencyAction: 'alert', quarantineRoleId: null, alertChannelId: null },
};

const automodRuntime = {
  messageEvents: new Map(),
  joinEvents: new Map(),
};

function toSet(values) {
  return new Set(Array.isArray(values) ? values.filter(Boolean) : []);
}

function mergeRule(rule, fallback) {
  return {
    ...fallback,
    ...(rule || {}),
    ignoredChannelIds: [...new Set([...(fallback.ignoredChannelIds || []), ...((rule && rule.ignoredChannelIds) || [])])],
    ignoredRoleIds: [...new Set([...(fallback.ignoredRoleIds || []), ...((rule && rule.ignoredRoleIds) || [])])],
    allowedRoleIds: [...new Set([...(fallback.allowedRoleIds || []), ...((rule && rule.allowedRoleIds) || [])])],
  };
}

function getAutomodConfig(guildConfig) {
  const normalized = normalizeGuildConfig(guildConfig || {});
  return {
    rules: Object.fromEntries(Object.entries(DEFAULT_AUTOMOD_RULES).map(([key, fallback]) => [key, mergeRule(normalized.modules.automod.rules[key], fallback)])),
    protection: {
      antiRaid: {
        ...DEFAULT_PROTECTION.antiRaid,
        ...(normalized.modules.protection.antiRaid || {}),
      },
    },
  };
}

async function getGuildAutomodBundle(guildId) {
  const guildConfig = await getGuildConfig(guildId);
  return getAutomodConfig(guildConfig);
}

async function setRuleEnabled(guildId, ruleKey, enabled) {
  const guildConfig = await getGuildConfig(guildId);
  const bundle = getAutomodConfig(guildConfig);
  bundle.rules[ruleKey] = { ...bundle.rules[ruleKey], enabled: Boolean(enabled) };
  await updateGuildConfig(guildId, {
    modules: {
      automod: {
        rules: {
          [ruleKey]: bundle.rules[ruleKey],
        },
      },
    },
  });
  return bundle.rules[ruleKey];
}

async function updateRuleConfig(guildId, ruleKey, patch) {
  const guildConfig = await getGuildConfig(guildId);
  const bundle = getAutomodConfig(guildConfig);
  const next = { ...bundle.rules[ruleKey], ...patch };
  await updateGuildConfig(guildId, {
    modules: {
      automod: {
        rules: {
          [ruleKey]: next,
        },
      },
    },
  });
  return next;
}

async function updateAntiRaidConfig(guildId, patch) {
  const guildConfig = await getGuildConfig(guildId);
  const bundle = getAutomodConfig(guildConfig);
  const next = { ...bundle.protection.antiRaid, ...patch };
  await updateGuildConfig(guildId, {
    modules: {
      protection: {
        antiRaid: next,
      },
    },
  });
  return next;
}

function memberExempt(member, rule) {
  if (!member) return true;
  if (member.permissions?.has?.('Administrator')) return true;
  const roleIds = member.roles?.cache ? [...member.roles.cache.keys()] : [];
  const ignored = toSet(rule.ignoredRoleIds);
  const allowed = toSet(rule.allowedRoleIds);
  if (roleIds.some((id) => allowed.has(id))) return true;
  if (roleIds.some((id) => ignored.has(id))) return true;
  return false;
}

function channelIgnored(channelId, rule) {
  return toSet(rule.ignoredChannelIds).has(channelId);
}

function recordMessageEvent(guildId, userId, content) {
  const key = `${guildId}:${userId}`;
  const events = automodRuntime.messageEvents.get(key) || [];
  const event = { at: Date.now(), content: String(content || '') };
  events.push(event);
  automodRuntime.messageEvents.set(key, events.slice(-25));
  return automodRuntime.messageEvents.get(key);
}

function getRecentEvents(guildId, userId, windowSeconds) {
  const key = `${guildId}:${userId}`;
  const cutoff = Date.now() - (windowSeconds * 1000);
  const recent = (automodRuntime.messageEvents.get(key) || []).filter((entry) => entry.at >= cutoff);
  automodRuntime.messageEvents.set(key, recent);
  return recent;
}

function isLink(content) {
  return /(https?:\/\/|www\.)\S+/i.test(content);
}

function isInvite(content) {
  return /(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+/i.test(content);
}

function capsRatio(content) {
  const letters = content.replace(/[^a-z]/gi, '');
  if (!letters.length) return 0;
  const upper = letters.replace(/[^A-Z]/g, '');
  return upper.length / letters.length;
}

function repeatedMessageCount(events, content) {
  return events.filter((entry) => entry.content.toLowerCase() === String(content || '').toLowerCase()).length;
}

function countMentions(message) {
  return message.mentions?.users?.size || 0;
}

function getBadwordMatches(content, blockedPhrases = []) {
  const lower = String(content || '').toLowerCase();
  return blockedPhrases.filter((phrase) => phrase && lower.includes(String(phrase).toLowerCase()));
}

async function applyAutomodAction({ client, message, member, ruleKey, rule, summary, deleteMessage = false }) {
  const action = String(rule.action || 'log').toLowerCase();
  const targetUser = member?.user || message.author;
  let outcome = 'Logged only';

  if (deleteMessage && message.deletable) {
    await message.delete().catch(() => null);
  }

  if (action === 'warn') {
    await recordInfraction({ guildId: message.guild.id, targetUserId: targetUser.id, type: `automod-${ruleKey}`, moderatorId: client.user.id, reason: summary, details: { source: 'automod', rule: ruleKey } });
    outcome = 'Warning stored';
  } else if (action === 'timeout' && member?.moderatable) {
    const ms = Math.max(60_000, Number(rule.durationMinutes || 10) * 60_000);
    await member.timeout(ms, `Automod ${ruleKey}: ${summary}`).catch(() => null);
    await recordInfraction({ guildId: message.guild.id, targetUserId: targetUser.id, type: 'timeout', moderatorId: client.user.id, reason: `Automod ${ruleKey}: ${summary}`, expiresAt: new Date(Date.now() + ms).toISOString(), details: { source: 'automod', rule: ruleKey } });
    outcome = `Timed out for ${rule.durationMinutes || 10} minute(s)`;
  } else if (action === 'kick' && member?.kickable) {
    await member.kick(`Automod ${ruleKey}: ${summary}`).catch(() => null);
    await recordInfraction({ guildId: message.guild.id, targetUserId: targetUser.id, type: 'kick', moderatorId: client.user.id, reason: `Automod ${ruleKey}: ${summary}`, details: { source: 'automod', rule: ruleKey } });
    outcome = 'Member kicked';
  } else if (action === 'ban' && member?.bannable) {
    await member.ban({ reason: `Automod ${ruleKey}: ${summary}` }).catch(() => null);
    await recordInfraction({ guildId: message.guild.id, targetUserId: targetUser.id, type: 'ban', moderatorId: client.user.id, reason: `Automod ${ruleKey}: ${summary}`, details: { source: 'automod', rule: ruleKey } });
    outcome = 'Member banned';
  } else if (action === 'mute' && member?.moderatable) {
    const ms = Math.max(300_000, Number(rule.durationMinutes || 15) * 60_000);
    await member.timeout(ms, `Automod ${ruleKey}: ${summary}`).catch(() => null);
    outcome = `Restricted for ${rule.durationMinutes || 15} minute(s)`;
  }

  await maybeLogFeature(client, message.guild.id, 'security', buildLogEmbed({
    title: `Auto Moderation • ${ruleKey}`,
    description: trimText(summary, 500),
    severity: action === 'ban' || action === 'kick' ? 'high' : action === 'timeout' || deleteMessage ? 'medium' : 'low',
    fields: [
      { name: 'Rule', value: ruleKey, inline: true },
      { name: 'Action', value: action, inline: true },
      { name: 'Outcome', value: outcome, inline: true },
      { name: 'Member', value: `<@${targetUser.id}>`, inline: true },
      { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
      { name: 'Message', value: trimText(message.content || 'No text content', 900), inline: false },
    ],
    footer: 'SERENITY • Protection engine',
  }));

  return outcome;
}

async function evaluateMessageRule(client, message, ruleKey, rule) {
  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!rule.enabled || !message.guild || !message.author || message.author.bot) return false;
  if (channelIgnored(message.channelId, rule) || memberExempt(member, rule)) return false;

  const events = recordMessageEvent(message.guild.id, message.author.id, message.content);
  const recent = getRecentEvents(message.guild.id, message.author.id, rule.windowSeconds || 10);
  let matched = false;
  let summary = '';
  let deleteMessage = false;

  if (ruleKey === 'spam' && recent.length >= Number(rule.threshold || 6)) {
    matched = true;
    deleteMessage = true;
    summary = `Sent ${recent.length} messages inside ${rule.windowSeconds}s.`;
  }

  if (ruleKey === 'links' && isLink(message.content) && (!rule.allowInvites || !isInvite(message.content))) {
    matched = true;
    deleteMessage = true;
    summary = 'Posted a blocked external link.';
  }

  if (ruleKey === 'invites' && isInvite(message.content)) {
    matched = true;
    deleteMessage = true;
    summary = 'Posted a blocked Discord invite.';
  }

  if (ruleKey === 'mentions' && countMentions(message) >= Number(rule.threshold || 6)) {
    matched = true;
    deleteMessage = true;
    summary = `Mentioned ${countMentions(message)} users in one message.`;
  }

  if (ruleKey === 'caps' && message.content.length >= Number(rule.minLength || 12) && capsRatio(message.content) >= Number(rule.threshold || 0.75)) {
    matched = true;
    summary = `Message exceeded the caps threshold (${Math.round(capsRatio(message.content) * 100)}% uppercase).`;
  }

  if (ruleKey === 'repetition' && repeatedMessageCount(events, message.content) >= Number(rule.threshold || 3)) {
    matched = true;
    summary = `Repeated the same message ${repeatedMessageCount(events, message.content)} times.`;
  }

  if (ruleKey === 'badwords') {
    const matches = getBadwordMatches(message.content, rule.blockedPhrases || []);
    if (matches.length) {
      matched = true;
      deleteMessage = true;
      summary = `Matched blocked phrase list: ${trimText(matches.join(', '), 200)}.`;
    }
  }

  if (!matched) return false;

  await applyAutomodAction({ client, message, member, ruleKey, rule, summary, deleteMessage });
  return true;
}

async function handleAutomodMessage(client, message) {
  if (!message?.guild || !message.content || message.author?.bot) return false;
  const bundle = await getGuildAutomodBundle(message.guild.id);
  for (const [ruleKey, rule] of Object.entries(bundle.rules)) {
    const matched = await evaluateMessageRule(client, message, ruleKey, rule);
    if (matched) return true;
  }
  return false;
}

function recordJoin(guildId, userId) {
  const events = automodRuntime.joinEvents.get(guildId) || [];
  events.push({ at: Date.now(), userId });
  automodRuntime.joinEvents.set(guildId, events.slice(-100));
  return automodRuntime.joinEvents.get(guildId);
}

async function handleMemberJoinSecurity(client, member) {
  if (!member?.guild?.id) return false;
  const bundle = await getGuildAutomodBundle(member.guild.id);
  const antiRaid = bundle.protection.antiRaid;
  if (!antiRaid.enabled) return false;

  const events = recordJoin(member.guild.id, member.id);
  const cutoff = Date.now() - (Number(antiRaid.windowSeconds || 20) * 1000);
  const recent = events.filter((entry) => entry.at >= cutoff);
  automodRuntime.joinEvents.set(member.guild.id, recent);

  if (recent.length < Number(antiRaid.threshold || 5)) return false;

  let actionSummary = 'Alert dispatched to staff.';

  if (antiRaid.emergencyAction === 'quarantine' && antiRaid.quarantineRoleId) {
    const role = member.guild.roles.cache.get(antiRaid.quarantineRoleId) || await member.guild.roles.fetch(antiRaid.quarantineRoleId).catch(() => null);
    if (role) {
      await member.roles.add(role, 'Serenity anti-raid quarantine').catch(() => null);
      actionSummary = `Applied quarantine role <@&${role.id}> to the newest join.`;
    }
  }

  if (antiRaid.emergencyAction === 'kick' && member.kickable) {
    await member.kick('Serenity anti-raid protection trigger').catch(() => null);
    actionSummary = 'Newest member was kicked by anti-raid response.';
  }

  if (antiRaid.emergencyAction === 'ban' && member.bannable) {
    await member.ban({ reason: 'Serenity anti-raid protection trigger' }).catch(() => null);
    actionSummary = 'Newest member was banned by anti-raid response.';
  }

  const embed = buildLogEmbed({
    title: 'Protection Alert • Join burst detected',
    description: `Detected **${recent.length} joins** inside **${antiRaid.windowSeconds}s**. ${actionSummary}`,
    severity: 'high',
    fields: [
      { name: 'Newest Member', value: `<@${member.id}>`, inline: true },
      { name: 'Threshold', value: `${antiRaid.threshold} joins`, inline: true },
      { name: 'Window', value: `${antiRaid.windowSeconds}s`, inline: true },
      { name: 'Response', value: antiRaid.emergencyAction || 'alert', inline: true },
      { name: 'Guild', value: trimText(member.guild.name, 100), inline: true },
      { name: 'Alert Target', value: antiRaid.alertChannelId ? `<#${antiRaid.alertChannelId}>` : 'Security log fallback', inline: true },
    ],
    footer: 'SERENITY • Anti-raid monitoring',
  });

  const targetChannelId = antiRaid.alertChannelId || null;
  if (targetChannelId) {
    const channel = member.guild.channels.cache.get(targetChannelId) || await client.channels.fetch(targetChannelId).catch(() => null);
    if (channel?.isTextBased()) {
      await channel.send({ embeds: [embed] }).catch(() => null);
    }
  }

  await maybeLogFeature(client, member.guild.id, 'security', embed);
  return true;
}

async function handleMemberLeaveLog(client, member) {
  if (!member?.guild?.id) return false;
  await maybeLogFeature(client, member.guild.id, 'members', buildLogEmbed({
    title: 'Member Left',
    description: `${member.user} left the server.`,
    severity: 'low',
    fields: [
      { name: 'User', value: `${member.user.tag} • \`${member.id}\``, inline: true },
      { name: 'Joined', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true },
      { name: 'Guild', value: trimText(member.guild.name, 80), inline: true },
    ],
    footer: 'SERENITY • Member activity',
  }));
  return true;
}

function buildAutomodStatusEmbed(guildName, bundle) {
  const { makeEmbed } = require('../utils/embeds');
  const fields = Object.entries(bundle.rules).map(([ruleKey, rule]) => ({
    name: ruleKey,
    value: `State • **${rule.enabled ? 'Enabled' : 'Disabled'}**\nAction • **${rule.action}**\nThreshold • **${rule.threshold ?? 'n/a'}**`,
    inline: true,
  }));
  fields.push({
    name: 'Anti-Raid',
    value: `State • **${bundle.protection.antiRaid.enabled ? 'Enabled' : 'Disabled'}**\nThreshold • **${bundle.protection.antiRaid.threshold} joins**\nResponse • **${bundle.protection.antiRaid.emergencyAction}**`,
    inline: false,
  });

  return makeEmbed({
    title: 'Security Center',
    description: `Premium protection overview for **${trimText(guildName || 'this server', 80)}**.`,
    fields,
    footer: 'SERENITY • Auto moderation + protection',
  });
}

module.exports = {
  DEFAULT_AUTOMOD_RULES,
  DEFAULT_PROTECTION,
  buildAutomodStatusEmbed,
  getAutomodConfig,
  getGuildAutomodBundle,
  handleAutomodMessage,
  handleMemberJoinSecurity,
  handleMemberLeaveLog,
  setRuleEnabled,
  updateAntiRaidConfig,
  updateRuleConfig,
};
