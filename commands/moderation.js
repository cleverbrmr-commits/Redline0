const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { logModeration } = require('../services/logService');
const {
  assertTargetRules,
  buildInfractionsEmbed,
  buildModerationEmbed,
  buildShortConfirmation,
  clearChannelLock,
  clearWarningsForUser,
  ensureMuteRole,
  getInfractionsForUser,
  getWarningCount,
  recordInfraction,
  scheduleTempban,
  setChannelLock,
} = require('../services/moderationService');
const { parseDuration, formatDuration } = require('../utils/duration');
const { makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');
const { ensureMemberPermission } = require('../utils/permissions');
const { resolveChannelFromToken, resolveMemberFromToken, resolveRoleFromToken, resolveUserFromToken, extractSnowflake } = require('../services/prefixService');

function fakeInteractionFromMessage(message) {
  return { user: message.author, channel: message.channel };
}

async function getRuntime(client, source) {
  const isInteraction = Boolean(source?.isChatInputCommand);
  const guild = source.guild || (source.guildId ? await client.guilds.fetch(source.guildId).catch(() => null) : null);
  const actorUser = source.user || source.author;
  const actorMember = guild ? await guild.members.fetch(actorUser.id).catch(() => source.member || null) : null;
  const botMember = guild ? await guild.members.fetchMe().catch(() => null) : null;
  return { guild, actorUser, actorMember, botMember, isInteraction };
}

async function respond(source, payload, fallbackEphemeral = false) {
  if (source.reply && typeof source.reply === 'function') {
    return source.reply({ ...payload, ephemeral: payload.ephemeral ?? fallbackEphemeral });
  }

  if (payload.content || payload.embeds) {
    return source.channel.send({ content: payload.content, embeds: payload.embeds });
  }

  return null;
}

async function requireTarget(client, source, userOrMemberId) {
  const runtime = await getRuntime(client, source);
  const member = await runtime.guild.members.fetch(userOrMemberId).catch(() => null);
  if (!member) {
    throw new Error('That user is not currently in this server.');
  }
  return { ...runtime, targetMember: member, targetUser: member.user };
}

function parseReason(args, startIndex, fallback = 'No reason provided') {
  const reason = args.slice(startIndex).join(' ').trim();
  return reason || fallback;
}

function commandMeta(name, category, description, usage, prefixUsage, examples, permissions, response = 'public', restrictions = []) {
  return { name, category, description, usage, prefixEnabled: true, prefixUsage, examples, permissions, response, restrictions };
}

const commands = [
  {
    name: 'ban',
    metadata: commandMeta('ban', 'moderation', 'Permanently ban a user with hierarchy protection.', ['/ban user:@member reason:<text>'], ['Serenity ban @user spamming'], ['/ban @User reason:Repeated scams'], ['Ban Members'], 'public', ['Cannot ban yourself, the owner, the bot, or equal/higher staff.']),
    data: new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Ban a member from the server')
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption((option) => option.setName('user').setDescription('Member to ban').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Reason for the ban')),
    async execute({ client, interaction }) {
      const runtime = await getRuntime(client, interaction);
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const member = await runtime.guild.members.fetch(user.id).catch(() => null);

      if (member) {
        const targetError = assertTargetRules({ actorMember: runtime.actorMember, botMember: runtime.botMember, targetMember: member });
        if (targetError) {
          return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Ban denied', description: targetError })], ephemeral: true });
        }
      }

      await runtime.guild.members.ban(user.id, { reason });
      await recordInfraction({ guildId: runtime.guild.id, targetUserId: user.id, type: 'ban', moderatorId: runtime.actorUser.id, reason });
      await logModeration(client, 'Ban', interaction, user, reason);
      return interaction.reply({ embeds: [buildModerationEmbed({ title: 'Member banned', actorId: runtime.actorUser.id, targetUser: user, reason })] });
    },
    async executePrefix({ client, message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.BanMembers, 'You need Ban Members to use this command.');
      const target = await resolveMemberFromToken(message.guild, args[0]);
      if (!target) return message.reply({ content: 'Usage: `Serenity ban @user <reason>`' });
      const targetError = assertTargetRules({ actorMember: message.member, botMember: await message.guild.members.fetchMe(), targetMember: target });
      if (targetError) return message.reply({ embeds: [makeWarningEmbed({ title: 'Ban denied', description: targetError })] });
      const reason = parseReason(args, 1);
      await message.guild.members.ban(target.id, { reason });
      await recordInfraction({ guildId: message.guild.id, targetUserId: target.id, type: 'ban', moderatorId: message.author.id, reason });
      await logModeration(client, 'Ban', fakeInteractionFromMessage(message), target.user, reason);
      return message.reply({ embeds: [buildModerationEmbed({ title: 'Member banned', actorId: message.author.id, targetUser: target.user, reason })] });
    },
  },
  {
    name: 'kick',
    metadata: commandMeta('kick', 'moderation', 'Kick a user from the server.', ['/kick user:@member reason:<text>'], ['Serenity kick @user rule spam'], ['/kick @User reason:Raiding'], ['Kick Members']),
    data: new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kick a member from the server')
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .addUserOption((option) => option.setName('user').setDescription('Member to kick').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Reason for the kick')),
    async execute({ client, interaction }) {
      const { guild, actorUser, actorMember, botMember } = await getRuntime(client, interaction);
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Kick failed', description: 'That user is not currently in this server.' })], ephemeral: true });
      const targetError = assertTargetRules({ actorMember, botMember, targetMember: member });
      if (targetError) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Kick denied', description: targetError })], ephemeral: true });
      await member.kick(reason);
      await recordInfraction({ guildId: guild.id, targetUserId: user.id, type: 'kick', moderatorId: actorUser.id, reason });
      await logModeration(client, 'Kick', interaction, user, reason);
      return interaction.reply({ embeds: [buildModerationEmbed({ title: 'Member kicked', actorId: actorUser.id, targetUser: user, reason })] });
    },
    async executePrefix({ client, message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.KickMembers, 'You need Kick Members to use this command.');
      const target = await resolveMemberFromToken(message.guild, args[0]);
      if (!target) return message.reply({ content: 'Usage: `Serenity kick @user <reason>`' });
      const botMember = await message.guild.members.fetchMe();
      const targetError = assertTargetRules({ actorMember: message.member, botMember, targetMember: target });
      if (targetError) return message.reply({ embeds: [makeWarningEmbed({ title: 'Kick denied', description: targetError })] });
      const reason = parseReason(args, 1);
      await target.kick(reason);
      await recordInfraction({ guildId: message.guild.id, targetUserId: target.id, type: 'kick', moderatorId: message.author.id, reason });
      await logModeration(client, 'Kick', fakeInteractionFromMessage(message), target.user, reason);
      return message.reply({ embeds: [buildModerationEmbed({ title: 'Member kicked', actorId: message.author.id, targetUser: target.user, reason })] });
    },
  },
  {
    name: 'timeout',
    metadata: commandMeta('timeout', 'moderation', 'Temporarily block a user from sending messages.', ['/timeout user:@member duration:10m reason:<text>'], ['Serenity timeout @user 10m spamming'], ['/timeout @User duration:2h reason:Cooldown'], ['Moderate Members']),
    data: new SlashCommandBuilder()
      .setName('timeout')
      .setDescription('Temporarily timeout a member')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((option) => option.setName('user').setDescription('Member to timeout').setRequired(true))
      .addStringOption((option) => option.setName('duration').setDescription('Duration like 10m, 2h, 1d').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Reason for the timeout')),
    async execute({ client, interaction }) {
      const { guild, actorUser, actorMember, botMember } = await getRuntime(client, interaction);
      const user = interaction.options.getUser('user', true);
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Timeout failed', description: 'That user is not currently in this server.' })], ephemeral: true });
      const targetError = assertTargetRules({ actorMember, botMember, targetMember: member });
      if (targetError) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Timeout denied', description: targetError })], ephemeral: true });
      const parsed = parseDuration(interaction.options.getString('duration', true));
      if (!parsed.ok) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Invalid duration', description: parsed.error })], ephemeral: true });
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await member.timeout(parsed.ms, reason);
      await recordInfraction({ guildId: guild.id, targetUserId: user.id, type: 'timeout', moderatorId: actorUser.id, reason, expiresAt: new Date(Date.now() + parsed.ms).toISOString() });
      await logModeration(client, 'Timeout', interaction, user, reason);
      return interaction.reply({ embeds: [buildModerationEmbed({ title: 'Member timed out', actorId: actorUser.id, targetUser: user, reason, extraFields: [{ name: 'Duration', value: formatDuration(parsed.ms), inline: true }] })] });
    },
    async executePrefix({ client, message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.ModerateMembers, 'You need Moderate Members to use this command.');
      const target = await resolveMemberFromToken(message.guild, args[0]);
      if (!target) return message.reply({ content: 'Usage: `Serenity timeout @user <duration> <reason>`' });
      const parsed = parseDuration(args[1]);
      if (!parsed.ok) return message.reply({ embeds: [makeWarningEmbed({ title: 'Invalid duration', description: parsed.error })] });
      const botMember = await message.guild.members.fetchMe();
      const targetError = assertTargetRules({ actorMember: message.member, botMember, targetMember: target });
      if (targetError) return message.reply({ embeds: [makeWarningEmbed({ title: 'Timeout denied', description: targetError })] });
      const reason = parseReason(args, 2);
      await target.timeout(parsed.ms, reason);
      await recordInfraction({ guildId: message.guild.id, targetUserId: target.id, type: 'timeout', moderatorId: message.author.id, reason, expiresAt: new Date(Date.now() + parsed.ms).toISOString() });
      await logModeration(client, 'Timeout', fakeInteractionFromMessage(message), target.user, reason);
      return message.reply({ embeds: [buildModerationEmbed({ title: 'Member timed out', actorId: message.author.id, targetUser: target.user, reason, extraFields: [{ name: 'Duration', value: formatDuration(parsed.ms), inline: true }] })] });
    },
  },
  {
    name: 'unban',
    metadata: commandMeta('unban', 'moderation', 'Unban a user by Discord ID.', ['/unban user_id:<id> reason:<text>'], ['Serenity unban 123456789012345678 appeal accepted'], ['/unban user_id:123456789012345678'], ['Ban Members']),
    data: new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Unban a user by ID')
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addStringOption((option) => option.setName('user_id').setDescription('User ID to unban').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Reason for the unban')),
    async execute({ client, interaction }) {
      const { guild, actorUser } = await getRuntime(client, interaction);
      const userId = extractSnowflake(interaction.options.getString('user_id', true));
      if (!userId) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Invalid user ID', description: 'Provide a valid Discord user ID.' })], ephemeral: true });
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await guild.members.unban(userId, reason);
      const user = await client.users.fetch(userId).catch(() => ({ id: userId }));
      await recordInfraction({ guildId: guild.id, targetUserId: userId, type: 'unban', moderatorId: actorUser.id, reason });
      await logModeration(client, 'Unban', interaction, user, reason);
      return interaction.reply({ embeds: [buildModerationEmbed({ title: 'User unbanned', actorId: actorUser.id, targetUser: user, reason })] });
    },
    async executePrefix({ client, message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.BanMembers, 'You need Ban Members to use this command.');
      const userId = extractSnowflake(args[0]);
      if (!userId) return message.reply({ content: 'Usage: `Serenity unban <user-id> <reason>`' });
      const reason = parseReason(args, 1);
      await message.guild.members.unban(userId, reason);
      const user = await client.users.fetch(userId).catch(() => ({ id: userId }));
      await recordInfraction({ guildId: message.guild.id, targetUserId: userId, type: 'unban', moderatorId: message.author.id, reason });
      await logModeration(client, 'Unban', fakeInteractionFromMessage(message), user, reason);
      return message.reply({ embeds: [buildModerationEmbed({ title: 'User unbanned', actorId: message.author.id, targetUser: user, reason })] });
    },
  },
  {
    name: 'mute',
    metadata: commandMeta('mute', 'moderation', 'Apply a role-based mute that blocks chatting and speaking.', ['/mute user:@member reason:<text>'], ['Serenity mute @user repeated slurs'], ['/mute @User reason:Appeal review'], ['Manage Roles']),
    data: new SlashCommandBuilder().setName('mute').setDescription('Mute a member with the shared mute role').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).addUserOption((option) => option.setName('user').setDescription('Member to mute').setRequired(true)).addStringOption((option) => option.setName('reason').setDescription('Reason for the mute')),
    async execute({ client, interaction }) {
      const { guild, actorUser, actorMember, botMember } = await getRuntime(client, interaction);
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Mute failed', description: 'That user is not currently in this server.' })], ephemeral: true });
      const targetError = assertTargetRules({ actorMember, botMember, targetMember: member });
      if (targetError) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Mute denied', description: targetError })], ephemeral: true });
      const muteRole = await ensureMuteRole(guild, botMember);
      await member.roles.add(muteRole, reason);
      await recordInfraction({ guildId: guild.id, targetUserId: user.id, type: 'mute', moderatorId: actorUser.id, reason });
      await logModeration(client, 'Mute', interaction, user, reason);
      return interaction.reply({ embeds: [buildModerationEmbed({ title: 'Member muted', actorId: actorUser.id, targetUser: user, reason, extraFields: [{ name: 'Mute Role', value: `<@&${muteRole.id}>`, inline: true }] })] });
    },
    async executePrefix({ client, message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.ManageRoles, 'You need Manage Roles to use this command.');
      const target = await resolveMemberFromToken(message.guild, args[0]);
      if (!target) return message.reply({ content: 'Usage: `Serenity mute @user <reason>`' });
      const botMember = await message.guild.members.fetchMe();
      const targetError = assertTargetRules({ actorMember: message.member, botMember, targetMember: target });
      if (targetError) return message.reply({ embeds: [makeWarningEmbed({ title: 'Mute denied', description: targetError })] });
      const reason = parseReason(args, 1);
      const muteRole = await ensureMuteRole(message.guild, botMember);
      await target.roles.add(muteRole, reason);
      await recordInfraction({ guildId: message.guild.id, targetUserId: target.id, type: 'mute', moderatorId: message.author.id, reason });
      await logModeration(client, 'Mute', fakeInteractionFromMessage(message), target.user, reason);
      return message.reply({ embeds: [buildModerationEmbed({ title: 'Member muted', actorId: message.author.id, targetUser: target.user, reason, extraFields: [{ name: 'Mute Role', value: `<@&${muteRole.id}>`, inline: true }] })] });
    },
  },
  {
    name: 'unmute',
    metadata: commandMeta('unmute', 'moderation', 'Remove the configured mute role from a member.', ['/unmute user:@member reason:<text>'], ['Serenity unmute @user appeal approved'], ['/unmute @User'], ['Manage Roles']),
    data: new SlashCommandBuilder().setName('unmute').setDescription('Remove the shared mute role').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).addUserOption((option) => option.setName('user').setDescription('Member to unmute').setRequired(true)).addStringOption((option) => option.setName('reason').setDescription('Reason for the unmute')),
    async execute({ client, interaction }) {
      const { guild, actorUser, botMember } = await getRuntime(client, interaction);
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Unmute failed', description: 'That user is not currently in this server.' })], ephemeral: true });
      const muteRole = await ensureMuteRole(guild, botMember);
      await member.roles.remove(muteRole, reason);
      await recordInfraction({ guildId: guild.id, targetUserId: user.id, type: 'unmute', moderatorId: actorUser.id, reason });
      await logModeration(client, 'Unmute', interaction, user, reason);
      return interaction.reply({ embeds: [buildModerationEmbed({ title: 'Member unmuted', actorId: actorUser.id, targetUser: user, reason })] });
    },
    async executePrefix({ client, message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.ManageRoles, 'You need Manage Roles to use this command.');
      const target = await resolveMemberFromToken(message.guild, args[0]);
      if (!target) return message.reply({ content: 'Usage: `Serenity unmute @user <reason>`' });
      const muteRole = await ensureMuteRole(message.guild, await message.guild.members.fetchMe());
      const reason = parseReason(args, 1);
      await target.roles.remove(muteRole, reason);
      await recordInfraction({ guildId: message.guild.id, targetUserId: target.id, type: 'unmute', moderatorId: message.author.id, reason });
      await logModeration(client, 'Unmute', fakeInteractionFromMessage(message), target.user, reason);
      return message.reply({ embeds: [buildModerationEmbed({ title: 'Member unmuted', actorId: message.author.id, targetUser: target.user, reason })] });
    },
  },
  {
    name: 'warn',
    metadata: commandMeta('warn', 'moderation', 'Store a persistent warning for a member.', ['/warn user:@member reason:<text>'], ['Serenity warn @user stop advertising'], ['/warn @User reason:Advertising'], ['Manage Messages']),
    data: new SlashCommandBuilder().setName('warn').setDescription('Warn a member').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addUserOption((option) => option.setName('user').setDescription('Member to warn').setRequired(true)).addStringOption((option) => option.setName('reason').setDescription('Reason for the warning').setRequired(true)),
    async execute({ client, interaction }) {
      const { guild, actorUser, actorMember, botMember } = await getRuntime(client, interaction);
      const user = interaction.options.getUser('user', true);
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (member) {
        const targetError = assertTargetRules({ actorMember, botMember, targetMember: member });
        if (targetError) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Warn denied', description: targetError })], ephemeral: true });
      }
      const reason = interaction.options.getString('reason', true);
      await recordInfraction({ guildId: guild.id, targetUserId: user.id, type: 'warn', moderatorId: actorUser.id, reason });
      const warningCount = await getWarningCount(guild.id, user.id);
      await logModeration(client, 'Warn', interaction, user, reason);
      return interaction.reply({ embeds: [buildModerationEmbed({ title: 'Warning recorded', actorId: actorUser.id, targetUser: user, reason, extraFields: [{ name: 'Warning Count', value: String(warningCount), inline: true }] })] });
    },
    async executePrefix({ client, message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.ManageMessages, 'You need Manage Messages to use this command.');
      const target = await resolveMemberFromToken(message.guild, args[0]);
      const reason = parseReason(args, 1, '');
      if (!target || !reason) return message.reply({ content: 'Usage: `Serenity warn @user <reason>`' });
      const botMember = await message.guild.members.fetchMe();
      const targetError = assertTargetRules({ actorMember: message.member, botMember, targetMember: target });
      if (targetError) return message.reply({ embeds: [makeWarningEmbed({ title: 'Warn denied', description: targetError })] });
      await recordInfraction({ guildId: message.guild.id, targetUserId: target.id, type: 'warn', moderatorId: message.author.id, reason });
      const warningCount = await getWarningCount(message.guild.id, target.id);
      await logModeration(client, 'Warn', fakeInteractionFromMessage(message), target.user, reason);
      return message.reply({ embeds: [buildModerationEmbed({ title: 'Warning recorded', actorId: message.author.id, targetUser: target.user, reason, extraFields: [{ name: 'Warning Count', value: String(warningCount), inline: true }] })] });
    },
  },
  {
    name: 'purge',
    metadata: commandMeta('purge', 'moderation', 'Delete a batch of recent messages in the current channel.', ['/purge amount:15'], ['Serenity purge 15'], ['/purge amount:50'], ['Manage Messages'], 'public', ['Only messages newer than 14 days can be bulk deleted by Discord.']),
    data: new SlashCommandBuilder().setName('purge').setDescription('Delete recent messages from this channel').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption((option) => option.setName('amount').setDescription('How many messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
    async execute({ interaction }) {
      const amount = interaction.options.getInteger('amount', true);
      const deleted = await interaction.channel.bulkDelete(amount, true);
      return interaction.reply({ content: buildShortConfirmation(`Deleted ${deleted.size} message(s) in ${interaction.channel}.`) });
    },
    async executePrefix({ message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.ManageMessages, 'You need Manage Messages to use this command.');
      const amount = Number(args[0]);
      if (!Number.isInteger(amount) || amount < 1 || amount > 100) return message.reply({ content: 'Usage: `Serenity purge <1-100>`' });
      const deleted = await message.channel.bulkDelete(amount, true);
      return message.reply({ content: buildShortConfirmation(`Deleted ${deleted.size} message(s).`) });
    },
  },
  {
    name: 'slowmode',
    metadata: commandMeta('slowmode', 'moderation', 'Set or disable slowmode in the current channel.', ['/slowmode value:15', '/slowmode value:off'], ['Serenity slowmode 15', 'Serenity slowmode off'], ['/slowmode value:off'], ['Manage Channels']),
    data: new SlashCommandBuilder().setName('slowmode').setDescription('Set slowmode or turn it off').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).addStringOption((option) => option.setName('value').setDescription('Seconds or "off"').setRequired(true)),
    async execute({ interaction }) {
      const raw = interaction.options.getString('value', true).toLowerCase();
      const seconds = raw === 'off' ? 0 : Number(raw);
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
        return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Invalid slowmode value', description: 'Use `off` or an integer between 0 and 21600 seconds.' })], ephemeral: true });
      }
      await interaction.channel.setRateLimitPerUser(seconds, `Slowmode updated by ${interaction.user.tag}`);
      return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Slowmode updated', description: seconds ? `Slowmode is now **${seconds}s** in ${interaction.channel}.` : `Slowmode has been disabled in ${interaction.channel}.` })] });
    },
    async executePrefix({ message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.ManageChannels, 'You need Manage Channels to use this command.');
      const raw = String(args[0] || '').toLowerCase();
      const seconds = raw === 'off' ? 0 : Number(raw);
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) return message.reply({ content: 'Usage: `Serenity slowmode <seconds|off>`' });
      await message.channel.setRateLimitPerUser(seconds, `Slowmode updated by ${message.author.tag}`);
      return message.reply({ embeds: [makeSuccessEmbed({ title: 'Slowmode updated', description: seconds ? `Slowmode is now **${seconds}s** in ${message.channel}.` : `Slowmode has been disabled in ${message.channel}.` })] });
    },
  },
  {
    name: 'lock',
    metadata: commandMeta('lock', 'moderation', 'Lock a channel so regular members cannot send messages.', ['/lock channel:#general reason:<text>'], ['Serenity lock #general raid cleanup'], ['/lock reason:Night maintenance'], ['Manage Channels']),
    data: new SlashCommandBuilder().setName('lock').setDescription('Lock a channel').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).addChannelOption((option) => option.setName('channel').setDescription('Channel to lock').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)).addStringOption((option) => option.setName('reason').setDescription('Reason for the lock')),
    async execute({ client, interaction }) {
      const { actorMember } = await getRuntime(client, interaction);
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await setChannelLock(channel, actorMember, reason);
      await logModeration(client, 'Lock', interaction, null, `${channel.id}: ${reason}`);
      return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Channel locked', description: `${channel} is now locked.`, fields: [{ name: 'Reason', value: trimText(reason, 1024) }] })] });
    },
    async executePrefix({ client, message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.ManageChannels, 'You need Manage Channels to use this command.');
      const mentionedChannel = await resolveChannelFromToken(message.guild, args[0]);
      const channel = mentionedChannel || message.channel;
      const reason = parseReason(args, mentionedChannel ? 1 : 0);
      await setChannelLock(channel, message.member, reason);
      await logModeration(client, 'Lock', fakeInteractionFromMessage(message), null, `${channel.id}: ${reason}`);
      return message.reply({ embeds: [makeSuccessEmbed({ title: 'Channel locked', description: `${channel} is now locked.`, fields: [{ name: 'Reason', value: trimText(reason, 1024) }] })] });
    },
  },
  {
    name: 'unlock',
    metadata: commandMeta('unlock', 'moderation', 'Unlock a previously locked channel.', ['/unlock channel:#general reason:<text>'], ['Serenity unlock #general all clear'], ['/unlock'], ['Manage Channels']),
    data: new SlashCommandBuilder().setName('unlock').setDescription('Unlock a channel').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).addChannelOption((option) => option.setName('channel').setDescription('Channel to unlock').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)).addStringOption((option) => option.setName('reason').setDescription('Reason for unlocking')),
    async execute({ client, interaction }) {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await clearChannelLock(channel, reason);
      await logModeration(client, 'Unlock', interaction, null, `${channel.id}: ${reason}`);
      return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Channel unlocked', description: `${channel} is now unlocked.`, fields: [{ name: 'Reason', value: trimText(reason, 1024) }] })] });
    },
    async executePrefix({ client, message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.ManageChannels, 'You need Manage Channels to use this command.');
      const mentionedChannel = await resolveChannelFromToken(message.guild, args[0]);
      const channel = mentionedChannel || message.channel;
      const reason = parseReason(args, mentionedChannel ? 1 : 0);
      await clearChannelLock(channel, reason);
      await logModeration(client, 'Unlock', fakeInteractionFromMessage(message), null, `${channel.id}: ${reason}`);
      return message.reply({ embeds: [makeSuccessEmbed({ title: 'Channel unlocked', description: `${channel} is now unlocked.`, fields: [{ name: 'Reason', value: trimText(reason, 1024) }] })] });
    },
  },
  {
    name: 'softban',
    metadata: commandMeta('softban', 'moderation', 'Ban and immediately unban a user to clear recent messages.', ['/softban user:@member reason:<text>'], ['Serenity softban @user raid cleanup'], ['/softban @User reason:Spam wipe'], ['Ban Members']),
    data: new SlashCommandBuilder().setName('softban').setDescription('Softban a member').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption((option) => option.setName('user').setDescription('Member to softban').setRequired(true)).addStringOption((option) => option.setName('reason').setDescription('Reason for the softban')),
    async execute({ client, interaction }) {
      const { guild, actorUser, actorMember, botMember } = await getRuntime(client, interaction);
      const user = interaction.options.getUser('user', true);
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Softban failed', description: 'That user is not currently in this server.' })], ephemeral: true });
      const targetError = assertTargetRules({ actorMember, botMember, targetMember: member });
      if (targetError) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Softban denied', description: targetError })], ephemeral: true });
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await guild.members.ban(user.id, { reason, deleteMessageSeconds: 86400 });
      await guild.members.unban(user.id, `Softban completed: ${reason}`);
      await recordInfraction({ guildId: guild.id, targetUserId: user.id, type: 'softban', moderatorId: actorUser.id, reason });
      await logModeration(client, 'Softban', interaction, user, reason);
      return interaction.reply({ embeds: [buildModerationEmbed({ title: 'Member softbanned', actorId: actorUser.id, targetUser: user, reason })] });
    },
    async executePrefix({ client, message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.BanMembers, 'You need Ban Members to use this command.');
      const target = await resolveMemberFromToken(message.guild, args[0]);
      if (!target) return message.reply({ content: 'Usage: `Serenity softban @user <reason>`' });
      const botMember = await message.guild.members.fetchMe();
      const targetError = assertTargetRules({ actorMember: message.member, botMember, targetMember: target });
      if (targetError) return message.reply({ embeds: [makeWarningEmbed({ title: 'Softban denied', description: targetError })] });
      const reason = parseReason(args, 1);
      await message.guild.members.ban(target.id, { reason, deleteMessageSeconds: 86400 });
      await message.guild.members.unban(target.id, `Softban completed: ${reason}`);
      await recordInfraction({ guildId: message.guild.id, targetUserId: target.id, type: 'softban', moderatorId: message.author.id, reason });
      await logModeration(client, 'Softban', fakeInteractionFromMessage(message), target.user, reason);
      return message.reply({ embeds: [buildModerationEmbed({ title: 'Member softbanned', actorId: message.author.id, targetUser: target.user, reason })] });
    },
  },
  {
    name: 'tempban',
    metadata: commandMeta('tempban', 'moderation', 'Ban a user temporarily and unban them automatically when it expires.', ['/tempban user:@member duration:7d reason:<text>'], ['Serenity tempban @user 7d repeated scams'], ['/tempban @User duration:3d reason:Appeal pending'], ['Ban Members']),
    data: new SlashCommandBuilder().setName('tempban').setDescription('Temporarily ban a member').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption((option) => option.setName('user').setDescription('Member to tempban').setRequired(true)).addStringOption((option) => option.setName('duration').setDescription('Duration like 1d, 7d, 2w').setRequired(true)).addStringOption((option) => option.setName('reason').setDescription('Reason for the tempban')),
    async execute({ client, interaction }) {
      const { guild, actorUser, actorMember, botMember } = await getRuntime(client, interaction);
      const user = interaction.options.getUser('user', true);
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Tempban failed', description: 'That user is not currently in this server.' })], ephemeral: true });
      const targetError = assertTargetRules({ actorMember, botMember, targetMember: member });
      if (targetError) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Tempban denied', description: targetError })], ephemeral: true });
      const parsed = parseDuration(interaction.options.getString('duration', true));
      if (!parsed.ok) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Invalid duration', description: parsed.error })], ephemeral: true });
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const expiresAt = new Date(Date.now() + parsed.ms).toISOString();
      await guild.members.ban(user.id, { reason });
      await scheduleTempban({ guildId: guild.id, userId: user.id, moderatorId: actorUser.id, reason, expiresAt });
      await logModeration(client, 'Tempban', interaction, user, reason);
      return interaction.reply({ embeds: [buildModerationEmbed({ title: 'Member tempbanned', actorId: actorUser.id, targetUser: user, reason, extraFields: [{ name: 'Duration', value: formatDuration(parsed.ms), inline: true }, { name: 'Expires', value: `<t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:F>`, inline: true }] })] });
    },
    async executePrefix({ client, message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.BanMembers, 'You need Ban Members to use this command.');
      const target = await resolveMemberFromToken(message.guild, args[0]);
      if (!target) return message.reply({ content: 'Usage: `Serenity tempban @user <duration> <reason>`' });
      const parsed = parseDuration(args[1]);
      if (!parsed.ok) return message.reply({ embeds: [makeWarningEmbed({ title: 'Invalid duration', description: parsed.error })] });
      const botMember = await message.guild.members.fetchMe();
      const targetError = assertTargetRules({ actorMember: message.member, botMember, targetMember: target });
      if (targetError) return message.reply({ embeds: [makeWarningEmbed({ title: 'Tempban denied', description: targetError })] });
      const reason = parseReason(args, 2);
      const expiresAt = new Date(Date.now() + parsed.ms).toISOString();
      await message.guild.members.ban(target.id, { reason });
      await scheduleTempban({ guildId: message.guild.id, userId: target.id, moderatorId: message.author.id, reason, expiresAt });
      await logModeration(client, 'Tempban', fakeInteractionFromMessage(message), target.user, reason);
      return message.reply({ embeds: [buildModerationEmbed({ title: 'Member tempbanned', actorId: message.author.id, targetUser: target.user, reason, extraFields: [{ name: 'Duration', value: formatDuration(parsed.ms), inline: true }, { name: 'Expires', value: `<t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:F>`, inline: true }] })] });
    },
  },
  {
    name: 'infractions',
    metadata: commandMeta('infractions', 'moderation', 'Show stored warnings and punishments for a member.', ['/infractions user:@member'], ['Serenity infractions @user'], ['/infractions @User'], ['Moderate Members']),
    data: new SlashCommandBuilder().setName('infractions').setDescription('Show stored infractions for a user').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption((option) => option.setName('user').setDescription('User to inspect').setRequired(true)),
    async execute({ client, interaction }) {
      const user = interaction.options.getUser('user', true);
      const infractions = await getInfractionsForUser(interaction.guildId, user.id);
      return interaction.reply({ embeds: [buildInfractionsEmbed(user, infractions)] });
    },
    async executePrefix({ client, message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.ModerateMembers, 'You need Moderate Members to use this command.');
      const user = (await resolveMemberFromToken(message.guild, args[0]))?.user || await resolveUserFromToken(client, args[0]);
      if (!user) return message.reply({ content: 'Usage: `Serenity infractions @user`' });
      const infractions = await getInfractionsForUser(message.guild.id, user.id);
      return message.reply({ embeds: [buildInfractionsEmbed(user, infractions)] });
    },
  },
  {
    name: 'clearwarns',
    metadata: commandMeta('clearwarns', 'moderation', 'Clear all stored warning records for a user.', ['/clearwarns user:@member'], ['Serenity clearwarns @user'], ['/clearwarns @User'], ['Moderate Members']),
    data: new SlashCommandBuilder().setName('clearwarns').setDescription('Clear stored warnings for a user').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption((option) => option.setName('user').setDescription('User whose warnings should be cleared').setRequired(true)),
    async execute({ client, interaction }) {
      const user = interaction.options.getUser('user', true);
      const removed = await clearWarningsForUser(interaction.guildId, user.id);
      await logModeration(client, 'Clear Warnings', interaction, user, `Removed ${removed} warning(s)`);
      return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Warnings cleared', description: `Removed **${removed}** warning(s) for <@${user.id}>.` })] });
    },
    async executePrefix({ client, message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.ModerateMembers, 'You need Moderate Members to use this command.');
      const user = (await resolveMemberFromToken(message.guild, args[0]))?.user || await resolveUserFromToken(client, args[0]);
      if (!user) return message.reply({ content: 'Usage: `Serenity clearwarns @user`' });
      const removed = await clearWarningsForUser(message.guild.id, user.id);
      await logModeration(client, 'Clear Warnings', fakeInteractionFromMessage(message), user, `Removed ${removed} warning(s)`);
      return message.reply({ embeds: [makeSuccessEmbed({ title: 'Warnings cleared', description: `Removed **${removed}** warning(s) for <@${user.id}>.` })] });
    },
  },
  {
    name: 'nickname',
    metadata: commandMeta('nickname', 'moderation', 'Change a member nickname with hierarchy checks.', ['/nickname user:@member nickname:<new name>'], ['Serenity nickname @user Better Name'], ['/nickname @User nickname:Helper'], ['Manage Nicknames']),
    data: new SlashCommandBuilder().setName('nickname').setDescription('Change a member nickname').setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames).addUserOption((option) => option.setName('user').setDescription('Member to rename').setRequired(true)).addStringOption((option) => option.setName('nickname').setDescription('New nickname').setRequired(true)),
    async execute({ client, interaction }) {
      const { guild, actorUser, actorMember, botMember } = await getRuntime(client, interaction);
      const user = interaction.options.getUser('user', true);
      const nickname = interaction.options.getString('nickname', true);
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Nickname failed', description: 'That user is not currently in this server.' })], ephemeral: true });
      const targetError = assertTargetRules({ actorMember, botMember, targetMember: member });
      if (targetError) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Nickname denied', description: targetError })], ephemeral: true });
      await member.setNickname(nickname, `Nickname updated by ${actorUser.tag}`);
      await recordInfraction({ guildId: guild.id, targetUserId: user.id, type: 'nickname', moderatorId: actorUser.id, reason: `Nickname set to ${nickname}` });
      return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Nickname updated', description: `<@${user.id}> is now **${trimText(nickname, 80)}**.` })] });
    },
    async executePrefix({ client, message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.ManageNicknames, 'You need Manage Nicknames to use this command.');
      const target = await resolveMemberFromToken(message.guild, args[0]);
      const nickname = args.slice(1).join(' ').trim();
      if (!target || !nickname) return message.reply({ content: 'Usage: `Serenity nickname @user <new nickname>`' });
      const botMember = await message.guild.members.fetchMe();
      const targetError = assertTargetRules({ actorMember: message.member, botMember, targetMember: target });
      if (targetError) return message.reply({ embeds: [makeWarningEmbed({ title: 'Nickname denied', description: targetError })] });
      await target.setNickname(nickname, `Nickname updated by ${message.author.tag}`);
      await recordInfraction({ guildId: message.guild.id, targetUserId: target.id, type: 'nickname', moderatorId: message.author.id, reason: `Nickname set to ${nickname}` });
      return message.reply({ embeds: [makeSuccessEmbed({ title: 'Nickname updated', description: `<@${target.id}> is now **${trimText(nickname, 80)}**.` })] });
    },
  },
  {
    name: 'role',
    metadata: commandMeta('role', 'moderation', 'Add or remove roles with proper hierarchy checks.', ['/role add user:@member role:@role', '/role remove user:@member role:@role'], ['Serenity role add @user @Member', 'Serenity role remove @user @Member'], ['/role add @User @Verified'], ['Manage Roles']),
    data: new SlashCommandBuilder()
      .setName('role')
      .setDescription('Add or remove roles from a member')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addSubcommand((subcommand) => subcommand.setName('add').setDescription('Add a role to a member').addUserOption((option) => option.setName('user').setDescription('Target member').setRequired(true)).addRoleOption((option) => option.setName('role').setDescription('Role to add').setRequired(true)))
      .addSubcommand((subcommand) => subcommand.setName('remove').setDescription('Remove a role from a member').addUserOption((option) => option.setName('user').setDescription('Target member').setRequired(true)).addRoleOption((option) => option.setName('role').setDescription('Role to remove').setRequired(true))),
    async execute({ client, interaction }) {
      const { guild, actorUser, actorMember, botMember } = await getRuntime(client, interaction);
      const subcommand = interaction.options.getSubcommand();
      const user = interaction.options.getUser('user', true);
      const role = interaction.options.getRole('role', true);
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Role update failed', description: 'That user is not currently in this server.' })], ephemeral: true });
      const targetError = assertTargetRules({ actorMember, botMember, targetMember: member });
      if (targetError) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Role update denied', description: targetError })], ephemeral: true });
      if (role.managed || role.position >= actorMember.roles.highest.position || role.position >= botMember.roles.highest.position) {
        return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Role update denied', description: 'That role cannot be managed by you or the bot.' })], ephemeral: true });
      }
      if (subcommand === 'add') {
        await member.roles.add(role, `Role added by ${actorUser.tag}`);
      } else {
        await member.roles.remove(role, `Role removed by ${actorUser.tag}`);
      }
      await recordInfraction({ guildId: guild.id, targetUserId: user.id, type: `role-${subcommand}`, moderatorId: actorUser.id, reason: `${subcommand} ${role.name}` });
      return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Role updated', description: `${subcommand === 'add' ? 'Added' : 'Removed'} ${role} ${subcommand === 'add' ? 'to' : 'from'} <@${user.id}>.` })] });
    },
    async executePrefix({ client, message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.ManageRoles, 'You need Manage Roles to use this command.');
      const action = String(args[0] || '').toLowerCase();
      const target = await resolveMemberFromToken(message.guild, args[1]);
      const role = await resolveRoleFromToken(message.guild, args[2]);
      if (!['add', 'remove'].includes(action) || !target || !role) return message.reply({ content: 'Usage: `Serenity role <add|remove> @user @role`' });
      const botMember = await message.guild.members.fetchMe();
      const targetError = assertTargetRules({ actorMember: message.member, botMember, targetMember: target });
      if (targetError) return message.reply({ embeds: [makeWarningEmbed({ title: 'Role update denied', description: targetError })] });
      if (role.managed || role.position >= message.member.roles.highest.position || role.position >= botMember.roles.highest.position) {
        return message.reply({ embeds: [makeWarningEmbed({ title: 'Role update denied', description: 'That role cannot be managed by you or the bot.' })] });
      }
      if (action === 'add') await target.roles.add(role, `Role added by ${message.author.tag}`);
      else await target.roles.remove(role, `Role removed by ${message.author.tag}`);
      await recordInfraction({ guildId: message.guild.id, targetUserId: target.id, type: `role-${action}`, moderatorId: message.author.id, reason: `${action} ${role.name}` });
      return message.reply({ embeds: [makeSuccessEmbed({ title: 'Role updated', description: `${action === 'add' ? 'Added' : 'Removed'} ${role} ${action === 'add' ? 'to' : 'from'} <@${target.id}>.` })] });
    },
  },
  {
    name: 'vckick',
    metadata: commandMeta('vckick', 'moderation', 'Disconnect a member from voice chat.', ['/vckick user:@member reason:<text>'], ['Serenity vckick @user channel hopping'], ['/vckick @User reason:Mic spam'], ['Move Members']),
    data: new SlashCommandBuilder().setName('vckick').setDescription('Disconnect a member from voice chat').setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers).addUserOption((option) => option.setName('user').setDescription('Voice member to disconnect').setRequired(true)).addStringOption((option) => option.setName('reason').setDescription('Reason for the disconnect')),
    async execute({ client, interaction }) {
      const { guild, actorUser, actorMember, botMember } = await getRuntime(client, interaction);
      const user = interaction.options.getUser('user', true);
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member?.voice?.channel) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'VC kick failed', description: 'That user is not connected to voice.' })], ephemeral: true });
      const targetError = assertTargetRules({ actorMember, botMember, targetMember: member });
      if (targetError) return interaction.reply({ embeds: [makeWarningEmbed({ title: 'VC kick denied', description: targetError })], ephemeral: true });
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await member.voice.disconnect(reason);
      await recordInfraction({ guildId: guild.id, targetUserId: user.id, type: 'vckick', moderatorId: actorUser.id, reason });
      return interaction.reply({ embeds: [buildModerationEmbed({ title: 'Voice disconnect applied', actorId: actorUser.id, targetUser: user, reason })] });
    },
    async executePrefix({ client, message, args }) {
      ensureMemberPermission(message.member, PermissionFlagsBits.MoveMembers, 'You need Move Members to use this command.');
      const target = await resolveMemberFromToken(message.guild, args[0]);
      if (!target?.voice?.channel) return message.reply({ content: 'Usage: `Serenity vckick @user <reason>`' });
      const botMember = await message.guild.members.fetchMe();
      const targetError = assertTargetRules({ actorMember: message.member, botMember, targetMember: target });
      if (targetError) return message.reply({ embeds: [makeWarningEmbed({ title: 'VC kick denied', description: targetError })] });
      const reason = parseReason(args, 1);
      await target.voice.disconnect(reason);
      await recordInfraction({ guildId: message.guild.id, targetUserId: target.id, type: 'vckick', moderatorId: message.author.id, reason });
      return message.reply({ embeds: [buildModerationEmbed({ title: 'Voice disconnect applied', actorId: message.author.id, targetUser: target.user, reason })] });
    },
  },
];

module.exports = { commands };
