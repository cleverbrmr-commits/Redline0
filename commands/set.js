const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { loadConfig, getConfigDisplayRows, getGuildConfig, saveConfig, updateGuildConfig } = require('../services/configService');
const { makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');
const { SETTING_KEYS, SETTING_MAP } = require('../utils/helpers');

module.exports = {
  commands: [
    {
      name: 'set',
      metadata: {
        category: 'system',
        description: 'Configure system channels, view guild module status, and manage dashboard-ready settings.',
        usage: ['/set <downloadlog|modlog|prisonlog|announcelog|show|modules|reset>'],
        prefixEnabled: false,
        examples: ['/set modlog channel:#mod-log', '/set modules'],
        permissions: ['Manage Guild'],
        response: 'ephemeral',
      },
      data: new SlashCommandBuilder()
        .setName('set')
        .setDescription('Configure Serenity system settings')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
          sub
            .setName('downloadlog')
            .setDescription('Set the download log channel')
            .addChannelOption((o) => o.setName('channel').setDescription('Channel used for download logs').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        )
        .addSubcommand((sub) =>
          sub
            .setName('modlog')
            .setDescription('Set the moderation log channel')
            .addChannelOption((o) => o.setName('channel').setDescription('Channel used for moderation logs').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        )
        .addSubcommand((sub) =>
          sub
            .setName('prisonlog')
            .setDescription('Set the prison log channel')
            .addChannelOption((o) => o.setName('channel').setDescription('Channel used for prison logs').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        )
        .addSubcommand((sub) =>
          sub
            .setName('announcelog')
            .setDescription('Set the announcement log channel')
            .addChannelOption((o) => o.setName('channel').setDescription('Channel used for announcement logs').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        )
        .addSubcommand((sub) => sub.setName('show').setDescription('Show current channel settings'))
        .addSubcommand((sub) => sub.setName('modules').setDescription('Show module enablement status'))
        .addSubcommand((sub) =>
          sub
            .setName('reset')
            .setDescription('Reset one setting back to default')
            .addStringOption((o) => o.setName('key').setDescription('Setting key to reset').setRequired(true).addChoices(...SETTING_KEYS.map((key) => ({ name: key, value: key }))))
        ),
      async execute({ interaction }) {
        const subcommand = interaction.options.getSubcommand();
        const config = await loadConfig();

        if (['downloadlog', 'modlog', 'prisonlog', 'announcelog'].includes(subcommand)) {
          const channel = interaction.options.getChannel('channel', true);
          const configKey = SETTING_MAP[subcommand];
          const guildConfig = await updateGuildConfig(interaction.guildId, (current) => ({
            ...current,
            settings: { ...current.settings, [configKey]: channel.id },
            logging: {
              ...current.logging,
              channels: {
                ...current.logging.channels,
                ...(subcommand === 'modlog' ? { moderation: channel.id } : {}),
                ...(subcommand === 'announcelog' ? { content: channel.id } : {}),
              },
            },
          }));
          if (configKey in config) {
            config[configKey] = channel.id;
            await saveConfig(config);
          }

          return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Setting updated', description: `**${subcommand}** is now set to <#${channel.id}>.` })], ephemeral: true });
        }

        if (subcommand === 'show') {
          const rows = getConfigDisplayRows(config, interaction.guildId).map(([label, channelId]) => `• **${label}:** ${channelId ? `<#${channelId}>` : 'Not configured'}`).join('\n');
          return interaction.reply({ embeds: [makeInfoEmbed({ title: 'Current bot settings', description: rows, footer: 'SERENITY • System settings' })], ephemeral: true });
        }

        if (subcommand === 'modules') {
          const guildConfig = await getGuildConfig(interaction.guildId);
          const rows = Object.entries(guildConfig.modules).map(([key, value]) => `• **${key}:** ${value.enabled ? 'Enabled' : 'Disabled'}`).join('\n');
          return interaction.reply({ embeds: [makeInfoEmbed({ title: 'Module status', description: rows, footer: 'SERENITY • Dashboard-ready modules' })], ephemeral: true });
        }

        if (subcommand === 'reset') {
          const key = interaction.options.getString('key', true);
          const configKey = SETTING_MAP[key];
          if (!configKey) {
            return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Reset failed', description: 'That setting key is not recognized.' })], ephemeral: true });
          }

          config[configKey] = null;
          await saveConfig(config);
          await updateGuildConfig(interaction.guildId, (current) => ({
            ...current,
            settings: { ...current.settings, [configKey]: null },
            logging: {
              ...current.logging,
              channels: {
                ...current.logging.channels,
                ...(key === 'modlog' ? { moderation: null } : {}),
                ...(key === 'announcelog' ? { content: null } : {}),
              },
            },
          }));

          return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Setting reset', description: `**${key}** has been reset.` })], ephemeral: true });
        }

        return null;
      },
    },
  ],
};
