const { PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('./configService');
const { makeEmbed, makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');
const { recordInfraction, getWarningCount } = require('./moderationService');
const { logSecurityEvent, logAutomodEvent } = require('./logService');

const messageWindows = new Map();
const joinWindows = new Map();
const URL_PATTERN = /(https?:\/\/|www\.)\S+/i;
const INVITE_PATTERN = /(discord(?:\.gg|app\.com\/invite)\/[a-z0-9-]+)/i;

function getMemberRoleIds(member) {
  return new Set(member?.roles?.cache?.keys?.() || []);
}

function memberIsIgnored(member, rule) {
  const roles = getMemberRoleIds(member);
  if (member?.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  if (rule.allowedRoleIds?.some((roleId) => roles.has(roleId))) return true;
  if (rule.ignoredRoleIds?.some((roleId) => roles.has(roleId))) return true;
  return false;
}

function channelIsIgnored(channel, rule) {
  return Boolean(channel?.id && rule.ignoredChannelIds?.includes(channel.id));
}

function trackWindow(bucket, key, windowMs) {
  const now = Date.now();
  const current = bucket.get(key) || [];
  const filtered = current.filter((entry) => now - entry <= windowMs);
  filtered.push(now);
  bucket.set(key, filtered);
  return filtered.length;
}

async function applyAction({ client, message, member, reason, action, ruleKey, durationMs, deleteMessage = true }) {
  const guild = message.guild;
  if (!guild || !member) return { ok: false, action: 'none' };

  const botMember = await guild.members.fetchMe().catch(() => null);
  const outcome = { ok: true, action, durationMs: durationMs || null };

  if (deleteMessage && message.deletable) {
    await message.delete().catch(() => null);
  }

  if (action === 'log') {
    return outcome;
  }

  if (action === 'warn') {
    await recordInfraction({ guildId: guild.id, targetUserId: member.id, type: 'warn', moderatorId: client.user.id, reason, details: { source: 'automod', ruleKey } });
    outcome.warningCount = await getWarningCount(guild.id, member.id);
    return outcome;
  }

  if (action === 'timeout') {
    if (!member.moderatable) {
      outcome.ok = false;
      outcome.error = 'Serenity could not timeout the member because of Discord hierarchy.';
      return outcome;
    }
    await member.timeout(durationMs || 300000, reason).catch((error) => {
      outcome.ok = false;
      outcome.error = error.message;
    });
    if (outcome.ok) {
      await recordInfraction({ guildId: guild.id, targetUserId: member.id, type: 'timeout', moderatorId: client.user.id, reason, expiresAt: new Date(Date.now() + (durationMs || 300000)).toISOString(), details: { source: 'automod', ruleKey } });
    }
    return outcome;
  }

  if (action === 'kick') {
    if (!member.kickable) {
      outcome.ok = false;
      outcome.error = 'Serenity could not kick the member because of Discord hierarchy.';
      return outcome;
    }
    await member.kick(reason).catch((error) => {
      outcome.ok = false;
      outcome.error = error.message;
    });
    if (outcome.ok) {
      await recordInfraction({ guildId: guild.id, targetUserId: member.id, type: 'kick', moderatorId: client.user.id, reason, details: { source: 'automod', ruleKey } });
    }
    return outcome;
  }

  if (action === 'ban') {
    if (!member.bannable) {
      outcome.ok = false;
      outcome.error = 'Serenity could not ban the member because of Discord hierarchy.';
      return outcome;
    }
    await member.ban({ reason }).catch((error) => {
      outcome.ok = false;
      outcome.error = error.message;
    });
    if (outcome.ok) {
      await recordInfraction({ guildId: guild.id, targetUserId: member.id, type: 'ban', moderatorId: client.user.id, reason, details: { source: 'automod', ruleKey } });
    }
    return outcome;
  }

  if (action === 'quarantine') {
    const guildConfig = await getGuildConfig(guild.id);
    const roleId = guildConfig.automod.quarantineRoleId;
    const role = roleId ? guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null) : null;
    if (!role || !botMember || role.position >= botMember.roles.highest.position) {
      outcome.ok = false;
      outcome.error = 'Quarantine role is missing or above Serenity.';
      return outcome;
    }
    await member.roles.add(role, reason).catch((error) => {
      outcome.ok = false;
      outcome.error = error.message;
    });
    if (outcome.ok) {
      await recordInfraction({ guildId: guild.id, targetUserId: member.id, type: 'quarantine', moderatorId: client.user.id, reason, details: { source: 'automod', ruleKey, roleId } });
    }
    return outcome;
  }

  return outcome;
}

async function dispatchAutomodResult({ client, message, member, ruleKey, reason, action, outcome, matchedContent }) {
  const embed = makeWarningEmbed({
    title: `Automod • ${formatRuleName(ruleKey)}`,
    description: trimText(reason, 300),
    fields: [
      { name: 'Member', value: `${member} • \`${member.id}\``, inline: true },
      { name: 'Action', value: formatRuleName(action || outcome.action || 'log'), inline: true },
      { name: 'Channel', value: message.channel ? `<#${message.channel.id}>` : 'Unknown', inline: true },
      { name: 'Content preview', value: trimText(matchedContent || message.content || 'No retained content preview.', 1000), inline: false },
      outcome?.warningCount ? { name: 'Warning Count', value: String(outcome.warningCount), inline: true } : null,
      outcome?.error ? { name: 'Action issue', value: trimText(outcome.error, 256), inline: false } : null,
    ].filter(Boolean),
    footer: 'SERENITY • Auto moderation event',
  });

  await logAutomodEvent(client, message.guild?.id, embed);
}

function formatRuleName(key) {
  return String(key || 'rule').replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildAutomodStatusEmbed(guildConfig) {
  const { automod } = guildConfig;
  return makeInfoEmbed({
    title: 'Automod status',
    description: automod.enabled
      ? 'Serenity protection is active. Each rule below can be tuned independently.'
      : 'Serenity protection is currently disabled for this server.',
    fields: [
      { name: 'Core engine', value: automod.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Alert channel', value: automod.alertChannelId ? `<#${automod.alertChannelId}>` : 'Not configured', inline: true },
      { name: 'Quarantine role', value: automod.quarantineRoleId ? `<@&${automod.quarantineRoleId}>` : 'Not configured', inline: true },
      ...['antiSpam', 'antiLink', 'antiInvite', 'antiCaps', 'mentionSpam', 'blockedPhrases'].map((ruleKey) => ({
        name: formatRuleName(ruleKey),
        value: formatRuleStatus(automod[ruleKey]),
        inline: false,
      })),
      { name: 'Anti Raid', value: formatRaidStatus(automod.antiRaid), inline: false },
    ],
    footer: 'SERENITY • Protection suite overview',
  });
}

function formatRuleStatus(rule) {
  return trimText([
    `State • ${rule.enabled ? 'Enabled' : 'Disabled'}`,
    `Action • ${formatRuleName(rule.action || 'log')}`,
    rule.threshold ? `Threshold • ${rule.threshold}` : null,
    rule.windowMs ? `Window • ${Math.round(rule.windowMs / 1000)}s` : null,
    rule.durationMs ? `Duration • ${Math.round(rule.durationMs / 60000)}m` : null,
    Array.isArray(rule.phrases) ? `Phrases • ${rule.phrases.length}` : null,
  ].filter(Boolean).join('\n'), 1024);
}

function formatRaidStatus(rule) {
  return trimText([
    `State • ${rule.enabled ? 'Enabled' : 'Disabled'}`,
    `Threshold • ${rule.joinThreshold} joins / ${Math.round(rule.windowMs / 1000)}s`,
    `Action • ${formatRuleName(rule.action)}`,
    `Alert • ${rule.alertChannelId ? `<#${rule.alertChannelId}>` : 'Not configured'}`,
  ].join('\n'), 1024);
}

async function updateAutomodRule(guildId, ruleKey, changes) {
  return updateGuildConfig(guildId, (guildConfig) => ({
    ...guildConfig,
    modules: {
      ...guildConfig.modules,
      automod: { ...guildConfig.modules.automod, enabled: true },
    },
    automod: {
      ...guildConfig.automod,
      enabled: true,
      [ruleKey]: {
        ...guildConfig.automod[ruleKey],
        ...changes,
      },
    },
  }));
}

async function setAutomodEnabled(guildId, enabled) {
  return updateGuildConfig(guildId, (guildConfig) => ({
    ...guildConfig,
    modules: {
      ...guildConfig.modules,
      automod: { ...guildConfig.modules.automod, enabled: Boolean(enabled) },
    },
    automod: {
      ...guildConfig.automod,
      enabled: Boolean(enabled),
    },
  }));
}

async function configureRaidProtection(guildId, changes) {
  return updateGuildConfig(guildId, (guildConfig) => ({
    ...guildConfig,
    modules: {
      ...guildConfig.modules,
      automod: { ...guildConfig.modules.automod, enabled: true },
    },
    automod: {
      ...guildConfig.automod,
      enabled: true,
      antiRaid: {
        ...guildConfig.automod.antiRaid,
        ...changes,
      },
    },
  }));
}

function evaluateBlockedPhrases(content, phrases) {
  const normalizedContent = String(content || '').toLowerCase();
  return phrases.find((phrase) => normalizedContent.includes(String(phrase).toLowerCase())) || null;
}

async function processAutomodMessage(client, message) {
  if (!message?.guild || !message.member || message.author?.bot || !message.content) return false;

  const guildConfig = await getGuildConfig(message.guild.id);
  if (!guildConfig.modules.automod.enabled || !guildConfig.automod.enabled) return false;

  const { automod } = guildConfig;
  const checks = [
    {
      key: 'antiSpam',
      enabled: automod.antiSpam.enabled,
      triggered: () => {
        const count = trackWindow(messageWindows, `${message.guild.id}:spam:${message.author.id}`, automod.antiSpam.windowMs);
        return count >= automod.antiSpam.threshold;
      },
      reason: `Sent ${automod.antiSpam.threshold}+ messages inside ${Math.round(automod.antiSpam.windowMs / 1000)} seconds.`,
      action: automod.antiSpam.action,
      durationMs: automod.antiSpam.durationMs,
    },
    {
      key: 'antiLink',
      enabled: automod.antiLink.enabled,
      triggered: () => URL_PATTERN.test(message.content) && (!automod.antiLink.allowDiscordInvites || !INVITE_PATTERN.test(message.content)),
      reason: 'Posted a link while the anti-link rule is enabled.',
      action: automod.antiLink.action,
    },
    {
      key: 'antiInvite',
      enabled: automod.antiInvite.enabled,
      triggered: () => INVITE_PATTERN.test(message.content),
      reason: 'Posted a Discord invite while the anti-invite rule is enabled.',
      action: automod.antiInvite.action,
    },
    {
      key: 'antiCaps',
      enabled: automod.antiCaps.enabled,
      triggered: () => {
        const letters = message.content.replace(/[^a-z]/gi, '');
        if (letters.length < automod.antiCaps.minLength) return false;
        const uppercaseRatio = letters.split('').filter((char) => char === char.toUpperCase()).length / Math.max(1, letters.length);
        return uppercaseRatio >= automod.antiCaps.percentage;
      },
      reason: 'Sent a message with excessive capital letters.',
      action: automod.antiCaps.action,
    },
    {
      key: 'mentionSpam',
      enabled: automod.mentionSpam.enabled,
      triggered: () => (message.mentions?.users?.size || 0) >= automod.mentionSpam.threshold,
      reason: `Mentioned ${message.mentions?.users?.size || 0} users in one message.`,
      action: automod.mentionSpam.action,
      durationMs: automod.mentionSpam.durationMs,
    },
    {
      key: 'blockedPhrases',
      enabled: automod.blockedPhrases.enabled && automod.blockedPhrases.phrases.length > 0,
      triggered: () => evaluateBlockedPhrases(message.content, automod.blockedPhrases.phrases),
      reason: 'Used a blocked phrase configured by staff.',
      action: automod.blockedPhrases.action,
    },
  ];

  for (const check of checks) {
    const rule = automod[check.key];
    if (!check.enabled || channelIsIgnored(message.channel, rule) || memberIsIgnored(message.member, rule)) {
      continue;
    }

    const result = check.triggered();
    if (!result) continue;

    const matchedContent = typeof result === 'string' ? result : message.content;
    const outcome = await applyAction({
      client,
      message,
      member: message.member,
      reason: `Automod (${formatRuleName(check.key)}): ${check.reason}`,
      action: check.action,
      ruleKey: check.key,
      durationMs: check.durationMs,
      deleteMessage: check.action !== 'warn' && check.action !== 'log',
    });

    await dispatchAutomodResult({ client, message, member: message.member, ruleKey: check.key, reason: check.reason, action: check.action, outcome, matchedContent });
    return true;
  }

  return false;
}

async function processAutomodJoin(client, member) {
  if (!member?.guild) return false;
  const guildConfig = await getGuildConfig(member.guild.id);
  const rule = guildConfig.automod.antiRaid;

  if (!guildConfig.modules.automod.enabled || !guildConfig.automod.enabled || !rule.enabled) return false;

  const count = trackWindow(joinWindows, `${member.guild.id}:joins`, rule.windowMs);
  if (count < rule.joinThreshold) return false;

  const embed = makeWarningEmbed({
    title: 'Raid pressure detected',
    description: `Serenity detected **${count} joins** inside **${Math.round(rule.windowMs / 1000)} seconds**.`,
    fields: [
      { name: 'Threshold', value: `${rule.joinThreshold} joins`, inline: true },
      { name: 'Window', value: `${Math.round(rule.windowMs / 1000)} seconds`, inline: true },
      { name: 'Response', value: formatRuleName(rule.action), inline: true },
      { name: 'Newest member', value: `${member} • \`${member.id}\``, inline: false },
    ],
    footer: 'SERENITY • Anti-raid alert',
  });

  if (rule.action === 'slowmode') {
    const channel = member.guild.systemChannel;
    if (channel?.manageable) {
      await channel.setRateLimitPerUser(rule.slowmodeSeconds, 'Serenity anti-raid response').catch(() => null);
    }
  }

  await logSecurityEvent(client, member.guild.id, embed, rule.alertChannelId || guildConfig.automod.alertChannelId || guildConfig.logging.channels.automod || guildConfig.logging.channels.moderation);
  return true;
}

module.exports = {
  buildAutomodStatusEmbed,
  configureRaidProtection,
  processAutomodJoin,
  processAutomodMessage,
  setAutomodEnabled,
  updateAutomodRule,
};
