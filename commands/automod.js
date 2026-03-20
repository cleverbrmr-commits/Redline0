const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const {
  buildAutomodStatusEmbed,
  getGuildAutomodBundle,
  setRuleEnabled,
  updateAntiRaidConfig,
  updateRuleConfig,
} = require('../services/automodService');
const { makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');
const { hasGuildPermission } = require('../utils/permissions');

const RULE_CHOICES = [
  ['spam', 'spam'],
  ['links', 'links'],
  ['invites', 'invites'],
  ['mentions', 'mentions'],
  ['caps', 'caps'],
  ['repetition', 'repetition'],
  ['badwords', 'badwords'],
].map(([name, value]) => ({ name, value }));

const ACTION_CHOICES = ['log', 'warn', 'delete', 'timeout', 'mute', 'kick', 'ban'].map((value) => ({ name: value, value }));

module.exports = {
  commands: [
    {
      name: 'automod',
      metadata: {
        category: 'automod',
        description: 'Configure Serenity auto moderation, thresholds, blocked phrases, and anti-raid protection.',
        usage: ['/automod status', '/automod toggle rule:<rule> enabled:<true|false>', '/automod tune ...', '/automod badwords ...', '/automod antiraid ...'],
        examples: ['/automod toggle rule:spam enabled:true', '/automod tune rule:links action:delete threshold:1 duration_minutes:10', '/automod antiraid enabled:true threshold:5 window_seconds:20 response:alert'],
        permissions: ['Manage Guild'],
        response: 'ephemeral',
        prefixEnabled: true,
        prefixUsage: ['Serenity automod status', 'Serenity automod toggle spam on', 'Serenity automod antiraid on 5 20 alert'],
      },
      data: new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Configure Serenity auto moderation and protection')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) => sub.setName('status').setDescription('Show the current automod and anti-raid status'))
        .addSubcommand((sub) =>
          sub
            .setName('toggle')
            .setDescription('Enable or disable one automod rule')
            .addStringOption((option) => option.setName('rule').setDescription('Rule name').setRequired(true).addChoices(...RULE_CHOICES))
            .addBooleanOption((option) => option.setName('enabled').setDescription('Whether the rule should be enabled').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName('tune')
            .setDescription('Tune a rule threshold, window, or action')
            .addStringOption((option) => option.setName('rule').setDescription('Rule name').setRequired(true).addChoices(...RULE_CHOICES))
            .addStringOption((option) => option.setName('action').setDescription('Primary automod response').setRequired(false).addChoices(...ACTION_CHOICES))
            .addIntegerOption((option) => option.setName('threshold').setDescription('Trigger threshold').setMinValue(1))
            .addIntegerOption((option) => option.setName('window_seconds').setDescription('Cooldown window in seconds').setMinValue(1))
            .addIntegerOption((option) => option.setName('duration_minutes').setDescription('Timeout / restriction duration in minutes').setMinValue(1))
            .addChannelOption((option) => option.setName('ignore_channel').setDescription('Append a channel to the ignore list').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
            .addRoleOption((option) => option.setName('ignore_role').setDescription('Append a role to the ignore list'))
            .addRoleOption((option) => option.setName('allow_role').setDescription('Append a role to the allow list'))
        )
        .addSubcommand((sub) =>
          sub
            .setName('badwords')
            .setDescription('Add blocked words or phrases for the badwords rule')
            .addStringOption((option) => option.setName('phrases').setDescription('Comma separated blocked phrases').setRequired(true))
            .addStringOption((option) => option.setName('action').setDescription('Action when matched').addChoices(...ACTION_CHOICES))
        )
        .addSubcommand((sub) =>
          sub
            .setName('antiraid')
            .setDescription('Configure anti-raid detection')
            .addBooleanOption((option) => option.setName('enabled').setDescription('Enable anti-raid').setRequired(true))
            .addIntegerOption((option) => option.setName('threshold').setDescription('Join burst threshold').setMinValue(2))
            .addIntegerOption((option) => option.setName('window_seconds').setDescription('Detection window in seconds').setMinValue(5))
            .addStringOption((option) => option.setName('response').setDescription('Emergency response').addChoices(
              { name: 'alert', value: 'alert' },
              { name: 'quarantine', value: 'quarantine' },
              { name: 'kick', value: 'kick' },
              { name: 'ban', value: 'ban' }
            ))
            .addChannelOption((option) => option.setName('alert_channel').setDescription('Alert target channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
            .addRoleOption((option) => option.setName('quarantine_role').setDescription('Role to apply if quarantine is used'))
        ),
      async execute({ interaction }) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (subcommand === 'status') {
          const bundle = await getGuildAutomodBundle(guildId);
          return interaction.reply({ embeds: [buildAutomodStatusEmbed(interaction.guild?.name, bundle)], ephemeral: true });
        }

        if (subcommand === 'toggle') {
          const rule = interaction.options.getString('rule', true);
          const enabled = interaction.options.getBoolean('enabled', true);
          const updated = await setRuleEnabled(guildId, rule, enabled);
          return interaction.reply({
            embeds: [makeSuccessEmbed({ title: 'Automod rule updated', description: `**${rule}** is now **${updated.enabled ? 'enabled' : 'disabled'}**.`, fields: [{ name: 'Action', value: updated.action, inline: true }] })],
            ephemeral: true,
          });
        }

        if (subcommand === 'tune') {
          const rule = interaction.options.getString('rule', true);
          const existing = (await getGuildAutomodBundle(guildId)).rules[rule];
          const ignoreChannel = interaction.options.getChannel('ignore_channel');
          const ignoreRole = interaction.options.getRole('ignore_role');
          const allowRole = interaction.options.getRole('allow_role');
          const updated = await updateRuleConfig(guildId, rule, {
            action: interaction.options.getString('action') || existing.action,
            threshold: interaction.options.getInteger('threshold') ?? existing.threshold,
            windowSeconds: interaction.options.getInteger('window_seconds') ?? existing.windowSeconds,
            durationMinutes: interaction.options.getInteger('duration_minutes') ?? existing.durationMinutes,
            ignoredChannelIds: ignoreChannel ? [...new Set([...(existing.ignoredChannelIds || []), ignoreChannel.id])] : existing.ignoredChannelIds,
            ignoredRoleIds: ignoreRole ? [...new Set([...(existing.ignoredRoleIds || []), ignoreRole.id])] : existing.ignoredRoleIds,
            allowedRoleIds: allowRole ? [...new Set([...(existing.allowedRoleIds || []), allowRole.id])] : existing.allowedRoleIds,
          });
          return interaction.reply({
            embeds: [makeSuccessEmbed({
              title: 'Automod rule tuned',
              description: `Updated **${rule}** with premium safety controls.`,
              fields: [
                { name: 'Action', value: updated.action, inline: true },
                { name: 'Threshold', value: String(updated.threshold ?? 'n/a'), inline: true },
                { name: 'Window', value: `${updated.windowSeconds ?? 'n/a'}s`, inline: true },
                { name: 'Duration', value: `${updated.durationMinutes ?? 0}m`, inline: true },
              ],
            })],
            ephemeral: true,
          });
        }

        if (subcommand === 'badwords') {
          const existing = (await getGuildAutomodBundle(guildId)).rules.badwords;
          const phrases = interaction.options.getString('phrases', true).split(',').map((entry) => entry.trim()).filter(Boolean);
          const updated = await updateRuleConfig(guildId, 'badwords', {
            enabled: true,
            action: interaction.options.getString('action') || existing.action,
            blockedPhrases: [...new Set([...(existing.blockedPhrases || []), ...phrases])],
          });
          return interaction.reply({
            embeds: [makeSuccessEmbed({ title: 'Blocked phrases updated', description: `Stored **${phrases.length}** additional blocked phrase(s).`, fields: [{ name: 'Total phrases', value: String(updated.blockedPhrases.length), inline: true }, { name: 'Action', value: updated.action, inline: true }] })],
            ephemeral: true,
          });
        }

        if (subcommand === 'antiraid') {
          const updated = await updateAntiRaidConfig(guildId, {
            enabled: interaction.options.getBoolean('enabled', true),
            threshold: interaction.options.getInteger('threshold') ?? 5,
            windowSeconds: interaction.options.getInteger('window_seconds') ?? 20,
            emergencyAction: interaction.options.getString('response') || 'alert',
            alertChannelId: interaction.options.getChannel('alert_channel')?.id || null,
            quarantineRoleId: interaction.options.getRole('quarantine_role')?.id || null,
          });
          return interaction.reply({
            embeds: [makeSuccessEmbed({ title: 'Anti-raid updated', description: updated.enabled ? 'Join burst protection is active.' : 'Join burst protection is disabled.', fields: [{ name: 'Threshold', value: `${updated.threshold} joins`, inline: true }, { name: 'Window', value: `${updated.windowSeconds}s`, inline: true }, { name: 'Response', value: updated.emergencyAction, inline: true }] })],
            ephemeral: true,
          });
        }

        return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Unknown automod action', description: 'That automod action is not available.' })], ephemeral: true });
      },
      async executePrefix({ message, args }) {
        if (!hasGuildPermission(message.member, PermissionFlagsBits.ManageGuild)) {
          throw new Error('You need **Manage Guild** to configure Serenity automod.');
        }

        const action = String(args[0] || 'status').toLowerCase();
        if (action === 'status') {
          const bundle = await getGuildAutomodBundle(message.guild.id);
          return message.reply({ embeds: [buildAutomodStatusEmbed(message.guild.name, bundle)] });
        }

        if (action === 'toggle') {
          const rule = String(args[1] || '').toLowerCase();
          const enabled = ['on', 'true', 'enabled', 'yes'].includes(String(args[2] || '').toLowerCase());
          if (!RULE_CHOICES.some((entry) => entry.value === rule)) {
            return message.reply({ embeds: [makeWarningEmbed({ title: 'Usage', description: 'Try `Serenity automod toggle <rule> <on|off>`.' })] });
          }
          const updated = await setRuleEnabled(message.guild.id, rule, enabled);
          return message.reply({ embeds: [makeSuccessEmbed({ title: 'Automod rule updated', description: `**${rule}** is now **${updated.enabled ? 'enabled' : 'disabled'}**.` })] });
        }

        if (action === 'antiraid') {
          const enabled = ['on', 'true', 'enabled', 'yes'].includes(String(args[1] || '').toLowerCase());
          const threshold = Number(args[2] || 5);
          const windowSeconds = Number(args[3] || 20);
          const response = String(args[4] || 'alert').toLowerCase();
          const updated = await updateAntiRaidConfig(message.guild.id, { enabled, threshold, windowSeconds, emergencyAction: response });
          return message.reply({ embeds: [makeSuccessEmbed({ title: 'Anti-raid updated', description: updated.enabled ? 'Join burst protection is active.' : 'Join burst protection is disabled.' })] });
        }

        return message.reply({ embeds: [makeWarningEmbed({ title: 'Usage', description: 'Try `Serenity automod status`, `Serenity automod toggle spam on`, or `Serenity automod antiraid on 5 20 alert`.' })] });
      },
    },
  ],
};
