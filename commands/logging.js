const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { getGuildConfig, setGuildLogChannel, updateGuildConfig } = require('../services/configService');
const { makeInfoEmbed, makeSuccessEmbed } = require('../utils/embeds');
const { resolveChannelFromToken } = require('../services/prefixService');
const { hasGuildPermission } = require('../utils/permissions');

const LOG_TYPES = [
  ['moderation', 'Moderation'],
  ['messages', 'Messages'],
  ['members', 'Members'],
  ['automod', 'Automod'],
  ['joins', 'Joins'],
  ['leave', 'Leaves'],
  ['server', 'System'],
  ['content', 'Content'],
];

function buildLoggingStatusEmbed(guildConfig) {
  return makeInfoEmbed({
    title: 'Logging status',
    description: guildConfig.modules.logging.enabled
      ? 'Serenity audit feeds are enabled and ready to post structured logs.'
      : 'Serenity logging is currently disabled.',
    fields: LOG_TYPES.map(([key, label]) => ({
      name: label,
      value: guildConfig.logging.channels[key] ? `<#${guildConfig.logging.channels[key]}>` : 'Not configured',
      inline: true,
    })),
    footer: 'SERENITY • Audit routing',
  });
}

module.exports = {
  commands: [
    {
      name: 'logging',
      metadata: {
        category: 'logging',
        description: 'Configure Serenity logging channels for moderation, message, member, and security events.',
        usage: ['/logging status', '/logging set type:messages channel:#logs', '/logging toggle enabled:true'],
        prefixEnabled: true,
        prefixUsage: ['Serenity logging status', 'Serenity logging set messages #logs'],
        examples: ['/logging set type:automod channel:#security', 'Serenity logging toggle on'],
        permissions: ['Manage Guild'],
        response: 'ephemeral',
      },
      data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('Configure Serenity logging channels')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) => sub.setName('status').setDescription('Show current logging routing'))
        .addSubcommand((sub) =>
          sub
            .setName('toggle')
            .setDescription('Enable or disable logging module')
            .addBooleanOption((option) => option.setName('enabled').setDescription('Whether logging is enabled').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setDescription('Set a channel for one log type')
            .addStringOption((option) => option.setName('type').setDescription('Log stream to route').setRequired(true).addChoices(...LOG_TYPES.map(([value, label]) => ({ name: label, value }))))
            .addChannelOption((option) => option.setName('channel').setDescription('Destination log channel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        ),
      async execute({ interaction }) {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'status') return interaction.reply({ embeds: [buildLoggingStatusEmbed(await getGuildConfig(interaction.guildId))], ephemeral: true });
        if (subcommand === 'toggle') {
          const enabled = interaction.options.getBoolean('enabled', true);
          const updated = await updateGuildConfig(interaction.guildId, (guildConfig) => ({
            ...guildConfig,
            modules: { ...guildConfig.modules, logging: { ...guildConfig.modules.logging, enabled } },
            logging: { ...guildConfig.logging, enabled },
          }));
          return interaction.reply({ embeds: [buildLoggingStatusEmbed(updated)], ephemeral: true });
        }
        if (subcommand === 'set') {
          const type = interaction.options.getString('type', true);
          const channel = interaction.options.getChannel('channel', true);
          await setGuildLogChannel(interaction.guildId, type, channel.id);
          return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Logging updated', description: `${type} events will now be routed to <#${channel.id}>.` })], ephemeral: true });
        }
        return null;
      },
      async executePrefix({ message, args }) {
        if (!hasGuildPermission(message.member, PermissionFlagsBits.ManageGuild)) throw new Error('You need **Manage Guild** to configure logging.');
        const action = String(args[0] || '').toLowerCase();
        if (!action || action === 'status') return message.reply({ embeds: [buildLoggingStatusEmbed(await getGuildConfig(message.guild.id))] });
        if (action === 'toggle') {
          const enabled = ['on', 'true', 'enable', 'enabled'].includes(String(args[1] || '').toLowerCase());
          const updated = await updateGuildConfig(message.guild.id, (guildConfig) => ({
            ...guildConfig,
            modules: { ...guildConfig.modules, logging: { ...guildConfig.modules.logging, enabled } },
            logging: { ...guildConfig.logging, enabled },
          }));
          return message.reply({ embeds: [buildLoggingStatusEmbed(updated)] });
        }
        if (action === 'set') {
          const type = String(args[1] || '').toLowerCase();
          const channel = await resolveChannelFromToken(message.guild, args[2]);
          if (!channel) throw new Error('Mention a valid text channel for the logging route.');
          await setGuildLogChannel(message.guild.id, type, channel.id);
          return message.reply({ embeds: [makeSuccessEmbed({ title: 'Logging updated', description: `${type} events will now be routed to <#${channel.id}>.` })] });
        }
        throw new Error('Unknown logging action.');
      },
    },
  ],
};
