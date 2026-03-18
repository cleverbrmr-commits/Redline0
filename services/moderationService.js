const { ChannelType, Colors, PermissionFlagsBits } = require('discord.js');
const { loadModerationState, saveModerationState } = require('../storage/moderationStore');
const { makeEmbed, makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');
const { brandEmoji, trimText } = require('../utils/helpers');
const { formatDuration } = require('../utils/duration');

const MUTE_ROLE_NAME = 'Muted';
const TEMPBAN_CHECK_INTERVAL_MS = Math.max(30_000, Number(process.env.TEMPBAN_CHECK_INTERVAL_MS) || 60_000);
let tempbanTimer = null;
let tempbanSweepRunning = false;

function getGuildState(state, guildId) {
  if (!state.guilds[guildId]) {
    state.guilds[guildId] = {
      infractions: {},
      tempbans: [],
      muteRoleId: null,
      lockedChannels: {},
    };
  }

  const guildState = state.guilds[guildId];
  guildState.infractions = guildState.infractions && typeof guildState.infractions === 'object' ? guildState.infractions : {};
  guildState.tempbans = Array.isArray(guildState.tempbans) ? guildState.tempbans : [];
  guildState.lockedChannels = guildState.lockedChannels && typeof guildState.lockedChannels === 'object' ? guildState.lockedChannels : {};
  guildState.muteRoleId = guildState.muteRoleId || null;
  return guildState;
}

function getUserInfractions(guildState, userId) {
  if (!guildState.infractions[userId]) {
    guildState.infractions[userId] = [];
  }

  return guildState.infractions[userId];
}

async function recordInfraction({ guildId, targetUserId, type, moderatorId, reason, expiresAt = null, details = {} }) {
  const state = await loadModerationState();
  const guildState = getGuildState(state, guildId);
  const infractions = getUserInfractions(guildState, targetUserId);
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    moderatorId,
    reason,
    details,
    createdAt: new Date().toISOString(),
    expiresAt,
  };

  infractions.push(entry);
  await saveModerationState(state);
  return entry;
}

async function getInfractionsForUser(guildId, userId) {
  const state = await loadModerationState();
  const guildState = getGuildState(state, guildId);
  return [...getUserInfractions(guildState, userId)].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function clearWarningsForUser(guildId, userId) {
  const state = await loadModerationState();
  const guildState = getGuildState(state, guildId);
  const entries = getUserInfractions(guildState, userId);
  const remaining = entries.filter((entry) => entry.type !== 'warn');
  const removed = entries.length - remaining.length;
  guildState.infractions[userId] = remaining;
  await saveModerationState(state);
  return removed;
}

async function getWarningCount(guildId, userId) {
  const infractions = await getInfractionsForUser(guildId, userId);
  return infractions.filter((entry) => entry.type === 'warn').length;
}

function assertTargetRules({ actorMember, botMember, targetMember, allowSelf = false }) {
  if (!actorMember || !botMember || !targetMember) {
    return 'Could not resolve the full guild member context for this action.';
  }

  if (!allowSelf && actorMember.id === targetMember.id) {
    return 'You cannot target yourself with this command.';
  }

  if (targetMember.id === targetMember.guild.ownerId) {
    return 'You cannot target the server owner.';
  }

  if (targetMember.id === botMember.id) {
    return 'You cannot target the bot.';
  }

  if (actorMember.roles.highest.position <= targetMember.roles.highest.position && actorMember.id !== targetMember.guild.ownerId) {
    return 'You cannot act on a member with an equal or higher top role.';
  }

  if (botMember.roles.highest.position <= targetMember.roles.highest.position) {
    return 'The bot role must be above the target member to do that.';
  }

  return null;
}

async function ensureMuteRole(guild, botMember) {
  const state = await loadModerationState();
  const guildState = getGuildState(state, guild.id);
  let role = guildState.muteRoleId ? guild.roles.cache.get(guildState.muteRoleId) || await guild.roles.fetch(guildState.muteRoleId).catch(() => null) : null;

  if (!role) {
    role = guild.roles.cache.find((entry) => entry.name === MUTE_ROLE_NAME) || null;
  }

  if (!role) {
    role = await guild.roles.create({
      name: MUTE_ROLE_NAME,
      color: Colors.DarkGrey,
      permissions: [],
      reason: 'Mute system initialization',
    });
  }

  if (role.position >= botMember.roles.highest.position) {
    throw new Error('Move the bot role above the mute role, then try again.');
  }

  const channels = guild.channels.cache.filter((channel) => [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice,
  ].includes(channel.type));

  for (const [, channel] of channels) {
    try {
      await channel.permissionOverwrites.edit(role, {
        SendMessages: false,
        AddReactions: false,
        Speak: false,
        Connect: false,
        SendMessagesInThreads: false,
        CreatePrivateThreads: false,
        CreatePublicThreads: false,
      }, { reason: 'Mute system permissions sync' });
    } catch (error) {
      console.warn('Failed to sync mute permissions for channel', channel.id, error.message);
    }
  }

  guildState.muteRoleId = role.id;
  await saveModerationState(state);
  return role;
}

function buildModerationEmbed({ title, actorId, targetUser, reason, extraFields = [], color }) {
  return makeEmbed({
    title,
    color,
    fields: [
      { name: 'Moderator', value: `<@${actorId}>`, inline: true },
      { name: 'Target', value: targetUser ? `<@${targetUser.id}>` : 'Unknown', inline: true },
      { name: 'Reason', value: trimText(reason || 'No reason provided', 1024) },
      ...extraFields,
    ],
  });
}

async function setChannelLock(channel, actorMember, reason) {
  const everyoneRole = channel.guild.roles.everyone;
  const existing = channel.permissionOverwrites.cache.get(everyoneRole.id);
  const state = await loadModerationState();
  const guildState = getGuildState(state, channel.guild.id);

  guildState.lockedChannels[channel.id] = {
    previousSendMessages: existing?.deny?.has(PermissionFlagsBits.SendMessages)
      ? false
      : existing?.allow?.has(PermissionFlagsBits.SendMessages)
        ? true
        : null,
    updatedAt: new Date().toISOString(),
    updatedBy: actorMember.id,
    reason,
  };

  await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: false }, { reason });
  await saveModerationState(state);
}

async function clearChannelLock(channel, reason) {
  const everyoneRole = channel.guild.roles.everyone;
  const state = await loadModerationState();
  const guildState = getGuildState(state, channel.guild.id);
  const stored = guildState.lockedChannels[channel.id] || null;

  if (stored?.previousSendMessages === null) {
    await channel.permissionOverwrites.delete(everyoneRole, reason).catch(async () => {
      await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: null }, { reason });
    });
  } else {
    await channel.permissionOverwrites.edit(everyoneRole, { SendMessages: stored?.previousSendMessages }, { reason });
  }

  delete guildState.lockedChannels[channel.id];
  await saveModerationState(state);
}

async function scheduleTempban({ guildId, userId, moderatorId, reason, expiresAt }) {
  const state = await loadModerationState();
  const guildState = getGuildState(state, guildId);
  guildState.tempbans = guildState.tempbans.filter((entry) => entry.userId !== userId);
  guildState.tempbans.push({ userId, moderatorId, reason, expiresAt, createdAt: new Date().toISOString() });
  await saveModerationState(state);
  await recordInfraction({ guildId, targetUserId: userId, type: 'tempban', moderatorId, reason, expiresAt });
}

async function processExpiredTempbans(client) {
  if (tempbanSweepRunning) return;
  tempbanSweepRunning = true;

  try {
    const state = await loadModerationState();
    let changed = false;

    for (const [guildId, guildState] of Object.entries(state.guilds)) {
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;

      const keep = [];
      for (const entry of guildState.tempbans || []) {
        if (new Date(entry.expiresAt).getTime() > Date.now()) {
          keep.push(entry);
          continue;
        }

        try {
          await guild.members.unban(entry.userId, `Tempban expired: ${entry.reason || 'No reason provided'}`);
          await recordInfraction({ guildId, targetUserId: entry.userId, type: 'tempban-expired', moderatorId: client.user?.id || entry.moderatorId, reason: entry.reason || 'Tempban expired automatically' });
          changed = true;
        } catch (error) {
          console.error('Failed to automatically unban tempban target', guildId, entry.userId, error);
          keep.push(entry);
        }
      }

      guildState.tempbans = keep;
    }

    if (changed) {
      await saveModerationState(state);
    }
  } finally {
    tempbanSweepRunning = false;
  }
}

function startTempbanScheduler(client) {
  if (tempbanTimer) return tempbanTimer;
  processExpiredTempbans(client).catch((error) => console.error('Initial tempban sweep failed:', error));
  tempbanTimer = setInterval(() => {
    processExpiredTempbans(client).catch((error) => console.error('Scheduled tempban sweep failed:', error));
  }, TEMPBAN_CHECK_INTERVAL_MS);
  return tempbanTimer;
}

function buildInfractionsEmbed(targetUser, infractions) {
  return makeEmbed({
    title: `Infractions • ${targetUser?.tag || targetUser?.username || targetUser?.id || 'User'}`,
    description: infractions.length
      ? infractions.slice(0, 10).map((entry, index) => `${index + 1}. **${entry.type}** • <t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:F>\nReason: ${trimText(entry.reason || 'No reason provided', 160)}\nModerator: <@${entry.moderatorId}>${entry.expiresAt ? `\nExpires: <t:${Math.floor(new Date(entry.expiresAt).getTime() / 1000)}:R>` : ''}`).join('\n\n')
      : 'No stored warnings or punishments were found for this user.',
  });
}

function buildShortConfirmation(message) {
  return `${brandEmoji()} ${message}`;
}

module.exports = {
  MUTE_ROLE_NAME,
  TEMPBAN_CHECK_INTERVAL_MS,
  assertTargetRules,
  buildInfractionsEmbed,
  buildModerationEmbed,
  buildShortConfirmation,
  clearChannelLock,
  clearWarningsForUser,
  ensureMuteRole,
  getInfractionsForUser,
  getWarningCount,
  processExpiredTempbans,
  recordInfraction,
  scheduleTempban,
  setChannelLock,
  startTempbanScheduler,
};
