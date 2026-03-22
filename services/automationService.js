const { getGuildConfig, updateGuildConfig } = require('./configService');
const { makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');
const { maybeLogFeature, buildLogEmbed } = require('./logService');

function normalizeResponderTrigger(trigger) {
  const raw = String(trigger || '').trim().toLowerCase();
  if (!raw) throw new Error('Provide a trigger phrase first.');
  return raw;
}

function normalizeResponderMode(mode) {
  const normalized = String(mode || 'contains').trim().toLowerCase();
  return ['contains', 'exact', 'regex'].includes(normalized) ? normalized : 'contains';
}

function normalizeResponseMode(mode) {
  const normalized = String(mode || 'text').trim().toLowerCase();
  return ['text', 'embed'].includes(normalized) ? normalized : 'text';
}

function normalizeResponder(entry = {}) {
  return {
    id: entry.id || `${Date.now()}`,
    trigger: normalizeResponderTrigger(entry.trigger || 'trigger'),
    triggerMode: normalizeResponderMode(entry.triggerMode),
    responseMode: normalizeResponseMode(entry.responseMode),
    response: trimText(String(entry.response || '').trim(), 1900),
    style: String(entry.style || 'minimal').toLowerCase(),
    enabled: entry.enabled !== false,
    cooldownSeconds: Math.max(0, Number(entry.cooldownSeconds || 0)),
    channelIds: Array.isArray(entry.channelIds) ? [...new Set(entry.channelIds.filter(Boolean))] : [],
    roleIds: Array.isArray(entry.roleIds) ? [...new Set(entry.roleIds.filter(Boolean))] : [],
    createdAt: entry.createdAt || new Date().toISOString(),
  };
}

async function getGuildResponders(guildId) {
  const config = await getGuildConfig(guildId);
  return (config.modules.autoresponders.items || []).map(normalizeResponder);
}

async function saveGuildResponders(guildId, items) {
  await updateGuildConfig(guildId, {
    modules: {
      autoresponders: {
        items: items.map(normalizeResponder),
      },
    },
  });
  return getGuildResponders(guildId);
}

async function upsertResponder(guildId, payload) {
  const responders = await getGuildResponders(guildId);
  const normalized = normalizeResponder(payload);
  const index = responders.findIndex((entry) => entry.trigger === normalized.trigger);
  if (index >= 0) responders[index] = { ...responders[index], ...normalized };
  else responders.push(normalized);
  await saveGuildResponders(guildId, responders);
  return normalized;
}

async function deleteResponder(guildId, trigger) {
  const normalizedTrigger = normalizeResponderTrigger(trigger);
  const responders = await getGuildResponders(guildId);
  const next = responders.filter((entry) => entry.trigger !== normalizedTrigger);
  const removed = responders.length - next.length;
  if (removed) await saveGuildResponders(guildId, next);
  return removed;
}

function memberMatchesRoleScope(member, responder) {
  if (!responder.roleIds.length) return true;
  const memberRoles = member?.roles?.cache ? [...member.roles.cache.keys()] : [];
  return responder.roleIds.some((roleId) => memberRoles.includes(roleId));
}

function channelMatchesScope(channelId, responder) {
  if (!responder.channelIds.length) return true;
  return responder.channelIds.includes(channelId);
}

function triggerMatches(content, responder) {
  const raw = String(content || '').trim();
  const lowered = raw.toLowerCase();
  if (!raw) return false;
  if (responder.triggerMode === 'exact') return lowered === responder.trigger;
  if (responder.triggerMode === 'regex') {
    try {
      return new RegExp(responder.trigger, 'i').test(raw);
    } catch {
      return false;
    }
  }
  return lowered.includes(responder.trigger);
}

const responderCooldowns = new Map();

function getCooldownKey(guildId, channelId, userId, responderId) {
  return `${guildId}:${channelId}:${userId}:${responderId}`;
}

function cooldownReady(guildId, channelId, userId, responder) {
  if (!responder.cooldownSeconds) return true;
  const key = getCooldownKey(guildId, channelId, userId, responder.id);
  const endsAt = responderCooldowns.get(key) || 0;
  if (endsAt > Date.now()) return false;
  responderCooldowns.set(key, Date.now() + (responder.cooldownSeconds * 1000));
  return true;
}

async function findMatchingResponder(message) {
  const responders = await getGuildResponders(message.guild.id);
  return responders.find((responder) => responder.enabled
    && responder.response
    && channelMatchesScope(message.channelId, responder)
    && memberMatchesRoleScope(message.member, responder)
    && triggerMatches(message.content, responder)
    && cooldownReady(message.guild.id, message.channelId, message.author.id, responder)) || null;
}

function buildResponderStatusEmbed(items) {
  if (!items.length) {
    return makeInfoEmbed({
      title: 'Auto responders',
      description: 'No auto responders are configured yet. Add one to create a premium FAQ or reminder layer.',
      footer: 'SERENITY • Automation suite',
    });
  }

  return makeInfoEmbed({
    title: 'Auto responders',
    description: 'Configured responders are listed below with trigger mode, response mode, and scope.',
    fields: items.slice(0, 12).map((item) => ({
      name: item.trigger,
      value: [
        `Mode • **${item.triggerMode}**`,
        `Response • **${item.responseMode}**`,
        `Cooldown • **${item.cooldownSeconds || 0}s**`,
        `Channels • **${item.channelIds.length || 0}**`,
        `Roles • **${item.roleIds.length || 0}**`,
      ].join('\n'),
      inline: true,
    })),
    footer: 'SERENITY • Automation suite',
  });
}

async function maybeHandleAutoresponder(client, message) {
  if (!message?.guild || !message.content || message.author?.bot) return false;
  const responder = await findMatchingResponder(message);
  if (!responder) return false;

  if (responder.responseMode === 'embed') {
    await message.channel.send({
      embeds: [makeInfoEmbed({
        title: 'Automatic Response',
        description: responder.response,
        footer: `SERENITY • Auto responder • ${responder.style}`,
      })],
    });
  } else {
    await message.channel.send({ content: responder.response });
  }

  await maybeLogFeature(client, message.guild.id, 'commands', buildLogEmbed({
    title: 'Auto responder triggered',
    description: `Responder **${responder.trigger}** replied automatically.`,
    fields: [
      { name: 'Member', value: `<@${message.author.id}>`, inline: true },
      { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
      { name: 'Mode', value: responder.responseMode, inline: true },
    ],
    footer: 'SERENITY • Automation suite',
  }));

  return true;
}

module.exports = {
  buildResponderStatusEmbed,
  deleteResponder,
  findMatchingResponder,
  getGuildResponders,
  maybeHandleAutoresponder,
  normalizeResponder,
  upsertResponder,
};
