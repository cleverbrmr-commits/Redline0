const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { getConfigDisplayRows, getGuildConfig, updateGuildConfig } = require('../services/configService');
const { listTemplateFamilies } = require('../services/templateService');
const { makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');

const LOG_CHOICES = [
  ['downloads', 'downloads'],
  ['moderation', 'moderation'],
  ['prison', 'prison'],
  ['announcements', 'announcements'],
  ['members', 'members'],
  ['messages', 'messages'],
  ['security', 'security'],
  ['commands', 'commands'],
  ['tickets', 'tickets'],
  ['rolemenus', 'rolemenus'],
].map(([name, value]) => ({ name, value }));

const MODULE_CHOICES = [
  'logging', 'onboarding', 'automod', 'announcements', 'support', 'roles', 'autoresponders', 'polls', 'embeds', 'alerts',
].map((value) => ({ name: value, value }));

module.exports = {
  commands: [
    {
      name: 'set',
      metadata: {
        category: 'system',
        description: 'Configure Serenity log routing, module toggles, command access defaults, and template defaults from one control surface.',
        usage: ['/set log channel:<#channel> type:<log>', '/set module module:<module> enabled:<true|false>', '/set access ...', '/set template family:<family> style:<style>', '/set show'],
        prefixEnabled: false,
        examples: ['/set log type:moderation channel:#staff-logs', '/set module module:tickets enabled:true', '/set template family:welcome style:premium'],
        permissions: ['Manage Guild'],
        response: 'ephemeral',
      },
      data: new SlashCommandBuilder()
        .setName('set')
        .setDescription('Configure Serenity modules and log channels')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
          sub
            .setName('log')
            .setDescription('Route one Serenity log stream to a channel')
            .addStringOption((option) => option.setName('type').setDescription('Log stream').setRequired(true).addChoices(...LOG_CHOICES))
            .addChannelOption((option) => option.setName('channel').setDescription('Target log channel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        )
        .addSubcommand((sub) =>
          sub
            .setName('welcome')
            .setDescription('Set the welcome card channel')
            .addChannelOption((option) => option.setName('channel').setDescription('Welcome channel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        )
        .addSubcommand((sub) =>
          sub
            .setName('goodbye')
            .setDescription('Set the goodbye message channel')
            .addChannelOption((option) => option.setName('channel').setDescription('Goodbye channel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        )
        .addSubcommand((sub) =>
          sub
            .setName('module')
            .setDescription('Toggle one Serenity module on or off')
            .addStringOption((option) => option.setName('module').setDescription('Module key').setRequired(true).addChoices(...MODULE_CHOICES))
            .addBooleanOption((option) => option.setName('enabled').setDescription('Whether the module should be enabled').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName('template')
            .setDescription('Set the default template style for one family')
            .addStringOption((option) => option.setName('family').setDescription('Template family').setRequired(true).addChoices(...listTemplateFamilies().map((entry) => ({ name: entry.label, value: entry.key }))))
            .addStringOption((option) => option.setName('style').setDescription('Style key').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName('access')
            .setDescription('Set a role/channel allow or deny override for one command')
            .addStringOption((option) => option.setName('command').setDescription('Command name').setRequired(true))
            .addRoleOption((option) => option.setName('allowed_role').setDescription('Role allowed to use the command'))
            .addRoleOption((option) => option.setName('denied_role').setDescription('Role denied from using the command'))
            .addChannelOption((option) => option.setName('allowed_channel').setDescription('Channel allowed to use the command').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
            .addChannelOption((option) => option.setName('denied_channel').setDescription('Channel denied from using the command').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        )
        .addSubcommand((sub) => sub.setName('show').setDescription('Show the current Serenity guild configuration summary')),
      async execute({ interaction }) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (subcommand === 'log') {
          const type = interaction.options.getString('type', true);
          const channel = interaction.options.getChannel('channel', true);
          await updateGuildConfig(guildId, { modules: { logging: { channels: { [type]: channel.id } } } });
          return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Log route updated', description: `Serenity will now send **${type}** logs to <#${channel.id}>.` })], ephemeral: true });
        }

        if (subcommand === 'welcome') {
          const channel = interaction.options.getChannel('channel', true);
          await updateGuildConfig(guildId, { modules: { onboarding: { channelId: channel.id } } });
          return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Welcome channel updated', description: `Welcome cards will be sent to <#${channel.id}>.` })], ephemeral: true });
        }

        if (subcommand === 'goodbye') {
          const channel = interaction.options.getChannel('channel', true);
          await updateGuildConfig(guildId, { modules: { onboarding: { goodbyeChannelId: channel.id, goodbyeEnabled: true } } });
          return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Goodbye channel updated', description: `Departure cards will be sent to <#${channel.id}>.` })], ephemeral: true });
        }

        if (subcommand === 'module') {
          const moduleKey = interaction.options.getString('module', true);
          const enabled = interaction.options.getBoolean('enabled', true);
          await updateGuildConfig(guildId, { modules: { [moduleKey]: { enabled } } });
          return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Module updated', description: `The **${moduleKey}** module is now **${enabled ? 'enabled' : 'disabled'}**.` })], ephemeral: true });
        }

        if (subcommand === 'template') {
          const family = interaction.options.getString('family', true);
          const style = interaction.options.getString('style', true).toLowerCase();
          await updateGuildConfig(guildId, { modules: { templates: { defaults: { [family]: style } } } });
          return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Template updated', description: `The **${family}** template family now defaults to **${style}**.` })], ephemeral: true });
        }

        if (subcommand === 'access') {
          const command = interaction.options.getString('command', true).toLowerCase();
          const allowedRole = interaction.options.getRole('allowed_role');
          const deniedRole = interaction.options.getRole('denied_role');
          const allowedChannel = interaction.options.getChannel('allowed_channel');
          const deniedChannel = interaction.options.getChannel('denied_channel');
          if (!allowedRole && !deniedRole && !allowedChannel && !deniedChannel) {
            return interaction.reply({ embeds: [makeWarningEmbed({ title: 'No access change provided', description: 'Set at least one role or channel override.' })], ephemeral: true });
          }
          const guildConfig = await getGuildConfig(guildId);
          const current = guildConfig.modules.commands.overrides?.[command] || {};
          const next = {
            roleAllowIds: allowedRole ? [...new Set([...(current.roleAllowIds || []), allowedRole.id])] : (current.roleAllowIds || []),
            roleDenyIds: deniedRole ? [...new Set([...(current.roleDenyIds || []), deniedRole.id])] : (current.roleDenyIds || []),
            channelAllowIds: allowedChannel ? [...new Set([...(current.channelAllowIds || []), allowedChannel.id])] : (current.channelAllowIds || []),
            channelDenyIds: deniedChannel ? [...new Set([...(current.channelDenyIds || []), deniedChannel.id])] : (current.channelDenyIds || []),
          };
          await updateGuildConfig(guildId, { modules: { commands: { overrides: { [command]: next } } } });
          return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Command access updated', description: `Updated access overrides for **/${command}**.` })], ephemeral: true });
        }

        const config = await getGuildConfig(guildId);
        const rows = getConfigDisplayRows({ guilds: { [guildId]: config } }, guildId)
          .map(([label, channelId]) => `• **${label}:** ${channelId ? `<#${channelId}>` : 'Not configured'}`)
          .join('\n');

        return interaction.reply({
          embeds: [makeInfoEmbed({
            title: 'Serenity guild configuration',
            description: rows,
            fields: [
              { name: 'Onboarding', value: config.modules.onboarding.enabled ? 'Enabled' : 'Disabled', inline: true },
              { name: 'Automod', value: config.modules.automod.enabled ? 'Enabled' : 'Disabled', inline: true },
              { name: 'Announcements', value: config.modules.announcements.enabled ? 'Enabled' : 'Disabled', inline: true },
              { name: 'Tickets', value: config.modules.support.enabled ? 'Enabled' : 'Disabled', inline: true },
              { name: 'Role Menus', value: config.modules.roles.enabled ? 'Enabled' : 'Disabled', inline: true },
              { name: 'Auto Responders', value: config.modules.autoresponders.enabled ? 'Enabled' : 'Disabled', inline: true },
            ],
          })],
          ephemeral: true,
        });
      },
    },
  ],
};
