const { ChannelType, Colors, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { loadPrisonState, savePrisonState } = require('../storage/clientsStore');
const { logAnnouncement, logPrison } = require('../services/logService');
const { makeEmbed, makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');
const { PRISON_ROLE_NAME, brandEmoji, resolveInteractionContext, trimText } = require('../utils/helpers');
const { canActOn } = require('../utils/permissions');

async function ensurePrisonRole(guild) {
  let role = guild.roles.cache.find((entry) => entry.name === PRISON_ROLE_NAME);

  if (!role) {
    role = await guild.roles.create({
      name: PRISON_ROLE_NAME,
      color: Colors.DarkGrey,
      permissions: [],
      reason: 'Prison system initialization',
    });
  }

  const channels = guild.channels.cache.filter((channel) => [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.GuildForum,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice,
    ChannelType.GuildMedia,
  ].includes(channel.type));

  for (const [, channel] of channels) {
    try {
      await channel.permissionOverwrites.edit(role, {
        SendMessages: false,
        AddReactions: false,
        SendMessagesInThreads: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        Speak: false,
        Connect: false,
      }, { reason: 'Prison role channel restrictions' });
    } catch {}
  }

  return role;
}

module.exports = {
  commands: [
    {
      name: 'prison',
      metadata: {
        category: 'moderation',
        description: 'Lock a member down with the Prisoner role.',
        usage: ['/prison user:@member reason:<text>'],
        prefixEnabled: false,
        examples: ['/prison @User reason:Appeal review'],
        permissions: ['Manage Roles'],
        response: 'public',
      },
      data: new SlashCommandBuilder()
        .setName('prison')
        .setDescription('Lock a member from sending messages until released')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addUserOption((option) => option.setName('user').setDescription('Member to imprison').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Why they were imprisoned')),
      async execute({ client, interaction }) {
        const { guild, actorMember, botMember } = await resolveInteractionContext(client, interaction);
        if (!guild || !actorMember || !botMember) {
          return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Prison failed', description: 'Guild context was unavailable. Try again in a second.' })], ephemeral: true });
        }

        const user = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const member = await guild.members.fetch(user.id).catch(() => null);

        if (!member) {
          return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Prison failed', description: 'That user is not in this server.' })], ephemeral: true });
        }

        if (!canActOn(actorMember, member)) {
          return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Prison denied', description: 'You cannot prison someone above or equal to your highest role.' })], ephemeral: true });
        }

        const prisonRole = await ensurePrisonRole(guild);
        if (prisonRole.position >= botMember.roles.highest.position) {
          return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Prison setup blocked', description: 'Move the bot role above the Prisoner role, then try again.' })], ephemeral: true });
        }

        const removableRoleIds = member.roles.cache
          .filter((role) => role.id !== guild.id && role.id !== prisonRole.id && role.position < botMember.roles.highest.position)
          .map((role) => role.id);

        if (removableRoleIds.length) {
          await member.roles.remove(removableRoleIds, 'Roles removed during prison');
        }

        await member.roles.add(prisonRole, reason);

        const prisonState = await loadPrisonState();
        prisonState[member.id] = { reason, by: interaction.user.id, at: new Date().toISOString(), removedRoleIds: removableRoleIds };
        await savePrisonState(prisonState);

        await logPrison(client, interaction, 'Prison applied', `**${user.tag}** was imprisoned.`, [
          { name: 'Reason', value: trimText(reason, 1024) },
          { name: 'Roles removed', value: removableRoleIds.length ? removableRoleIds.map((id) => `<@&${id}>`).join(', ') : 'None' },
        ]);

        return interaction.reply({ embeds: [makeInfoEmbed({ title: `${brandEmoji()} Prisoned`, description: `**${user.tag}** has been locked down until released.`, fields: [{ name: 'Reason', value: trimText(reason, 1024) }, { name: 'Role', value: prisonRole.name, inline: true }] })] });
      },
    },
    {
      name: 'unprison',
      data: new SlashCommandBuilder()
        .setName('unprison')
        .setDescription('Release a member from prison')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addUserOption((option) => option.setName('user').setDescription('Member to release').setRequired(true))
        .addStringOption((option) => option.setName('note').setDescription('Optional release note')),
      async execute({ client, interaction }) {
        const { guild, botMember } = await resolveInteractionContext(client, interaction);
        if (!guild || !botMember) {
          return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Release failed', description: 'Guild context was unavailable. Try again in a second.' })], ephemeral: true });
        }

        const user = interaction.options.getUser('user', true);
        const note = interaction.options.getString('note') || 'No release note provided';
        const member = await guild.members.fetch(user.id).catch(() => null);
        const prisonRole = guild.roles.cache.find((entry) => entry.name === PRISON_ROLE_NAME);

        if (!member || !prisonRole) {
          return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Release failed', description: 'That member or the Prisoner role could not be found.' })], ephemeral: true });
        }

        await member.roles.remove(prisonRole, 'Released from prison');

        const prisonState = await loadPrisonState();
        const record = prisonState[member.id];
        const restoreRoleIds = (record?.removedRoleIds || []).filter((roleId) => {
          const role = guild.roles.cache.get(roleId);
          return role && role.position < botMember.roles.highest.position;
        });

        if (restoreRoleIds.length) {
          await member.roles.add(restoreRoleIds, 'Roles restored after prison release');
        }

        delete prisonState[member.id];
        await savePrisonState(prisonState);

        await logPrison(client, interaction, 'Prison released', `**${user.tag}** was released from prison.`, [
          { name: 'Release note', value: trimText(note, 1024) },
          { name: 'Roles restored', value: restoreRoleIds.length ? restoreRoleIds.map((id) => `<@&${id}>`).join(', ') : 'None' },
        ], Colors.Green);

        return interaction.reply({ embeds: [makeSuccessEmbed({ title: `${brandEmoji()} Released`, description: `**${user.tag}** is no longer imprisoned.`, fields: [{ name: 'Release note', value: trimText(note, 1024) }] })] });
      },
    },
    {
      name: 'prisonlist',
      data: new SlashCommandBuilder().setName('prisonlist').setDescription('Show currently imprisoned members').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      async execute({ interaction }) {
        const prisonState = await loadPrisonState();
        const entries = Object.entries(prisonState);
        if (!entries.length) {
          return interaction.reply({ embeds: [makeInfoEmbed({ title: 'Prison list', description: 'Nobody is currently imprisoned.' })], ephemeral: true });
        }
        const lines = entries.slice(0, 20).map(([userId, record]) => `• <@${userId}> — ${trimText(record.reason, 80)} — <t:${Math.floor(new Date(record.at).getTime() / 1000)}:R>`);
        return interaction.reply({ embeds: [makeInfoEmbed({ title: 'Prison list', description: lines.join('\n') })], ephemeral: true });
      },
    },
    {
      name: 'prisonreason',
      data: new SlashCommandBuilder()
        .setName('prisonreason')
        .setDescription('Show the stored prison reason for a user')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addUserOption((option) => option.setName('user').setDescription('Member to inspect').setRequired(true)),
      async execute({ interaction }) {
        const user = interaction.options.getUser('user', true);
        const prisonState = await loadPrisonState();
        const record = prisonState[user.id];

        if (!record) {
          return interaction.reply({ embeds: [makeWarningEmbed({ title: 'No prison record', description: `No active prison record found for **${user.tag}**.` })], ephemeral: true });
        }

        return interaction.reply({
          embeds: [makeInfoEmbed({
            title: `Prison record • ${user.tag}`,
            description: trimText(record.reason, 1024),
            fields: [
              { name: 'Imprisoned by', value: `<@${record.by}>`, inline: true },
              { name: 'When', value: `<t:${Math.floor(new Date(record.at).getTime() / 1000)}:F>`, inline: true },
            ],
          })],
          ephemeral: true,
        });
      },
    },
    {
      name: 'announce',
      metadata: {
        category: 'admin',
        description: 'Send premium broadcast cards with style presets, controlled pings, and cleaner public-facing presentation.',
        usage: ['/announce title:<title> message:<message> style:<broadcast|update|alert|community>'],
        prefixEnabled: false,
        examples: ['/announce title:Maintenance message:Servers restart at 8 PM UTC style:alert ping:here'],
        permissions: ['Manage Guild'],
        response: 'public',
        configDependencies: ['modules.announcements', 'modules.templates.defaults.announcement'],
      },
      data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Send a styled announcement and ping everyone')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption((option) => option.setName('title').setDescription('Announcement title').setRequired(true))
        .addStringOption((option) => option.setName('message').setDescription('Announcement body').setRequired(true))
        .addStringOption((option) => option.setName('style').setDescription('Announcement style').addChoices(
          { name: 'broadcast', value: 'broadcast' },
          { name: 'update', value: 'update' },
          { name: 'alert', value: 'alert' },
          { name: 'community', value: 'community' },
        ))
        .addStringOption((option) => option.setName('ping').setDescription('Optional ping mode').addChoices(
          { name: 'none', value: 'none' },
          { name: 'here', value: 'here' },
          { name: 'everyone', value: 'everyone' },
        ))
        .addStringOption((option) => option.setName('footer').setDescription('Optional footer line'))
        .addStringOption((option) => option.setName('thumbnail').setDescription('Optional thumbnail image URL')),
      async execute({ client, interaction }) {
        const title = interaction.options.getString('title', true);
        const message = interaction.options.getString('message', true);
        const styleKey = interaction.options.getString('style') || 'broadcast';
        const pingMode = interaction.options.getString('ping') || 'none';
        const footer = interaction.options.getString('footer');
        const thumbnail = interaction.options.getString('thumbnail');
        const styles = {
          broadcast: { prefix: 'Broadcast', footer: 'SERENITY • Broadcast center', color: Colors.Blurple },
          update: { prefix: 'Update', footer: 'SERENITY • Changelog stream', color: Colors.Green },
          alert: { prefix: 'Alert', footer: 'SERENITY • Priority notice', color: Colors.Red },
          community: { prefix: 'Community', footer: 'SERENITY • Community board', color: Colors.Gold },
        };
        const style = styles[styleKey] || styles.broadcast;
        const guildName = interaction.guild?.name || 'Serenity';
        const postedAt = Math.floor(Date.now() / 1000);
        const body = trimText(message, 3500);
        const pingContent = pingMode === 'everyone' ? '@everyone' : pingMode === 'here' ? '@here' : null;
        const allowedMentions = pingMode === 'everyone' ? { parse: ['everyone'] } : pingMode === 'here' ? { parse: ['everyone'] } : { parse: [] };

        await logAnnouncement(client, interaction, title);
        return interaction.reply({
          content: pingContent,
          allowedMentions,
          embeds: [makeEmbed({
            title: `${style.prefix} • ${trimText(title, 220)}`,
            description: body,
            author: {
              name: `${guildName} Announcement`,
              iconURL: interaction.guild?.iconURL({ extension: 'png', size: 512 }) || interaction.user.displayAvatarURL({ size: 512 }),
            },
            fields: [
              { name: 'Posted By', value: `${interaction.user}`, inline: true },
              { name: 'Channel', value: `${interaction.channel}`, inline: true },
              { name: 'Published', value: `<t:${postedAt}:F>`, inline: true },
              { name: 'Style', value: styleKey, inline: true },
              { name: 'Ping', value: pingMode, inline: true },
            ],
            footer: footer || style.footer,
            color: style.color,
            thumbnail: thumbnail || interaction.guild?.iconURL({ extension: 'png', size: 512 }) || null,
          })],
        });
      },
    },
  ],
};
