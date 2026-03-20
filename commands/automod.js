const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { buildAutomodStatusEmbed, configureRaidProtection, setAutomodEnabled, updateAutomodRule } = require('../services/automodService');
const { getGuildConfig, updateGuildConfig } = require('../services/configService');
const { makeSuccessEmbed } = require('../utils/embeds');
const { hasGuildPermission } = require('../utils/permissions');
const { extractSnowflake } = require('../services/prefixService');

function automodMetadata() {
  return {
    category: 'automod',
    description: 'Configure Serenity anti-spam, anti-link, anti-invite, blocked phrase, and anti-raid protection.',
    usage: [
      '/automod status',
      '/automod enable enabled:true',
      '/automod rule rule:anti-spam enabled:true action:timeout threshold:6 window_seconds:7 duration_minutes:10',
      '/automod phrases add phrase:badword',
      '/automod raid enabled:true threshold:6 window_seconds:15 action:alert',
    ],
    prefixEnabled: true,
    prefixUsage: [
      'Serenity automod status',
      'Serenity automod enable on',
      'Serenity automod rule anti-spam on timeout 6 7 10',
      'Serenity automod phrase add scam link',
      'Serenity automod raid on 6 15 alert',
    ],
    examples: ['/automod rule rule:anti-link enabled:true action:delete', 'Serenity automod raid on 8 20 slowmode'],
    permissions: ['Manage Guild'],
    response: 'ephemeral',
  };
}

function parseRuleKey(raw) {
  const value = String(raw || '').toLowerCase();
  const map = {
    'anti-spam': 'antiSpam',
    antispam: 'antiSpam',
    spam: 'antiSpam',
    'anti-link': 'antiLink',
    antilink: 'antiLink',
    link: 'antiLink',
    'anti-invite': 'antiInvite',
    antiinvite: 'antiInvite',
    invite: 'antiInvite',
    caps: 'antiCaps',
    'anti-caps': 'antiCaps',
    mentions: 'mentionSpam',
    'mention-spam': 'mentionSpam',
    phrases: 'blockedPhrases',
    blocked: 'blockedPhrases',
  };
  return map[value] || null;
}

module.exports = {
  commands: [
    {
      name: 'automod',
      metadata: automodMetadata(),
      data: new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Configure Serenity auto moderation and anti-raid protection')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) => sub.setName('status').setDescription('Show automod status'))
        .addSubcommand((sub) =>
          sub
            .setName('enable')
            .setDescription('Enable or disable the automod engine')
            .addBooleanOption((option) => option.setName('enabled').setDescription('Whether automod should run').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName('rule')
            .setDescription('Configure one automod rule')
            .addStringOption((option) =>
              option
                .setName('rule')
                .setDescription('Rule to configure')
                .setRequired(true)
                .addChoices(
                  { name: 'Anti Spam', value: 'antiSpam' },
                  { name: 'Anti Link', value: 'antiLink' },
                  { name: 'Anti Invite', value: 'antiInvite' },
                  { name: 'Anti Caps', value: 'antiCaps' },
                  { name: 'Mention Spam', value: 'mentionSpam' },
                  { name: 'Blocked Phrases', value: 'blockedPhrases' },
                )
            )
            .addBooleanOption((option) => option.setName('enabled').setDescription('Enable or disable the rule').setRequired(true))
            .addStringOption((option) => option.setName('action').setDescription('Action to take').setRequired(true).addChoices(
              { name: 'Log Only', value: 'log' },
              { name: 'Warn', value: 'warn' },
              { name: 'Delete', value: 'delete' },
              { name: 'Timeout', value: 'timeout' },
              { name: 'Kick', value: 'kick' },
              { name: 'Ban', value: 'ban' },
              { name: 'Quarantine', value: 'quarantine' },
            ))
            .addIntegerOption((option) => option.setName('threshold').setDescription('Trigger threshold'))
            .addIntegerOption((option) => option.setName('window_seconds').setDescription('Rolling window in seconds'))
            .addIntegerOption((option) => option.setName('duration_minutes').setDescription('Timeout duration in minutes'))
        )
        .addSubcommand((sub) =>
          sub
            .setName('phrases')
            .setDescription('Add or remove a blocked phrase')
            .addStringOption((option) => option.setName('mode').setDescription('Whether to add or remove').setRequired(true).addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }))
            .addStringOption((option) => option.setName('phrase').setDescription('Blocked phrase').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName('raid')
            .setDescription('Configure anti-raid thresholds and response')
            .addBooleanOption((option) => option.setName('enabled').setDescription('Enable anti-raid').setRequired(true))
            .addIntegerOption((option) => option.setName('threshold').setDescription('Joins required to trigger'))
            .addIntegerOption((option) => option.setName('window_seconds').setDescription('Window in seconds'))
            .addStringOption((option) => option.setName('action').setDescription('Response action').addChoices(
              { name: 'Alert', value: 'alert' },
              { name: 'Slowmode', value: 'slowmode' },
              { name: 'Quarantine', value: 'quarantine' },
            ))
            .addChannelOption((option) => option.setName('alert_channel').setDescription('Optional alert channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        )
        .addSubcommand((sub) =>
          sub
            .setName('quarantine')
            .setDescription('Set the quarantine role used by automod')
            .addRoleOption((option) => option.setName('role').setDescription('Quarantine role').setRequired(true))
        ),
      async execute({ interaction }) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (subcommand === 'status') {
          return interaction.reply({ embeds: [buildAutomodStatusEmbed(await getGuildConfig(guildId))], ephemeral: true });
        }

        if (subcommand === 'enable') {
          const updated = await setAutomodEnabled(guildId, interaction.options.getBoolean('enabled', true));
          return interaction.reply({ embeds: [buildAutomodStatusEmbed(updated)], ephemeral: true });
        }

        if (subcommand === 'rule') {
          const ruleKey = interaction.options.getString('rule', true);
          await updateAutomodRule(guildId, ruleKey, {
            enabled: interaction.options.getBoolean('enabled', true),
            action: interaction.options.getString('action', true),
            threshold: interaction.options.getInteger('threshold') ?? undefined,
            windowMs: interaction.options.getInteger('window_seconds') ? interaction.options.getInteger('window_seconds') * 1000 : undefined,
            durationMs: interaction.options.getInteger('duration_minutes') ? interaction.options.getInteger('duration_minutes') * 60 * 1000 : undefined,
          });
          return interaction.reply({ embeds: [buildAutomodStatusEmbed(await getGuildConfig(guildId))], ephemeral: true });
        }

        if (subcommand === 'phrases') {
          const mode = interaction.options.getString('mode', true);
          const phrase = interaction.options.getString('phrase', true).trim();
          await updateGuildConfig(guildId, (guildConfig) => {
            const set = new Set(guildConfig.automod.blockedPhrases.phrases);
            if (mode === 'add') set.add(phrase);
            else set.delete(phrase);
            return {
              ...guildConfig,
              automod: {
                ...guildConfig.automod,
                enabled: true,
                blockedPhrases: {
                  ...guildConfig.automod.blockedPhrases,
                  enabled: true,
                  phrases: [...set],
                },
              },
            };
          });
          return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Blocked phrases updated', description: `Phrase list updated for automod.` })], ephemeral: true });
        }

        if (subcommand === 'raid') {
          await configureRaidProtection(guildId, {
            enabled: interaction.options.getBoolean('enabled', true),
            joinThreshold: interaction.options.getInteger('threshold') ?? undefined,
            windowMs: interaction.options.getInteger('window_seconds') ? interaction.options.getInteger('window_seconds') * 1000 : undefined,
            action: interaction.options.getString('action') || undefined,
            alertChannelId: interaction.options.getChannel('alert_channel')?.id || undefined,
          });
          return interaction.reply({ embeds: [buildAutomodStatusEmbed(await getGuildConfig(guildId))], ephemeral: true });
        }

        if (subcommand === 'quarantine') {
          const role = interaction.options.getRole('role', true);
          await updateGuildConfig(guildId, (guildConfig) => ({
            ...guildConfig,
            automod: {
              ...guildConfig.automod,
              quarantineRoleId: role.id,
            },
          }));
          return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Quarantine role updated', description: `Automod will use <@&${role.id}> for quarantine actions.` })], ephemeral: true });
        }

        return null;
      },
      async executePrefix({ message, args }) {
        if (!hasGuildPermission(message.member, PermissionFlagsBits.ManageGuild)) {
          throw new Error('You need **Manage Guild** to configure automod.');
        }

        const action = String(args[0] || '').toLowerCase();
        if (!action || action === 'status') {
          return message.reply({ embeds: [buildAutomodStatusEmbed(await getGuildConfig(message.guild.id))] });
        }

        if (action === 'enable') {
          const enabled = ['on', 'true', 'enable', 'enabled'].includes(String(args[1] || '').toLowerCase());
          const updated = await setAutomodEnabled(message.guild.id, enabled);
          return message.reply({ embeds: [buildAutomodStatusEmbed(updated)] });
        }

        if (action === 'rule') {
          const ruleKey = parseRuleKey(args[1]);
          if (!ruleKey) throw new Error('Unknown automod rule. Try anti-spam, anti-link, anti-invite, caps, mentions, or phrases.');
          const enabled = ['on', 'true', 'enable', 'enabled'].includes(String(args[2] || '').toLowerCase());
          const automation = {
            enabled,
            action: String(args[3] || 'delete').toLowerCase(),
          };
          if (args[4]) automation.threshold = Number(args[4]) || undefined;
          if (args[5]) automation.windowMs = (Number(args[5]) || 0) * 1000 || undefined;
          if (args[6]) automation.durationMs = (Number(args[6]) || 0) * 60 * 1000 || undefined;
          await updateAutomodRule(message.guild.id, ruleKey, automation);
          return message.reply({ embeds: [buildAutomodStatusEmbed(await getGuildConfig(message.guild.id))] });
        }

        if (action === 'phrase') {
          const mode = String(args[1] || '').toLowerCase();
          const phrase = args.slice(2).join(' ').trim();
          if (!phrase) throw new Error('Provide a phrase to add or remove.');
          await updateGuildConfig(message.guild.id, (guildConfig) => {
            const set = new Set(guildConfig.automod.blockedPhrases.phrases);
            if (mode === 'add') set.add(phrase);
            else set.delete(phrase);
            return {
              ...guildConfig,
              automod: {
                ...guildConfig.automod,
                enabled: true,
                blockedPhrases: { ...guildConfig.automod.blockedPhrases, enabled: true, phrases: [...set] },
              },
            };
          });
          return message.reply({ embeds: [makeSuccessEmbed({ title: 'Blocked phrases updated', description: `Phrase list updated.` })] });
        }

        if (action === 'raid') {
          const enabled = ['on', 'true', 'enable', 'enabled'].includes(String(args[1] || '').toLowerCase());
          await configureRaidProtection(message.guild.id, {
            enabled,
            joinThreshold: Number(args[2]) || undefined,
            windowMs: (Number(args[3]) || 0) * 1000 || undefined,
            action: args[4] || undefined,
          });
          return message.reply({ embeds: [buildAutomodStatusEmbed(await getGuildConfig(message.guild.id))] });
        }

        if (action === 'quarantine') {
          const roleId = extractSnowflake(args[1]);
          if (!roleId) throw new Error('Mention a valid role to use as quarantine.');
          await updateGuildConfig(message.guild.id, (guildConfig) => ({ ...guildConfig, automod: { ...guildConfig.automod, quarantineRoleId: roleId } }));
          return message.reply({ embeds: [makeSuccessEmbed({ title: 'Quarantine role updated', description: `Automod will use <@&${roleId}> for quarantine actions.` })] });
        }

        throw new Error('Unknown automod action.');
      },
    },
  ],
};
