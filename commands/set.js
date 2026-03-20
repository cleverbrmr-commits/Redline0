const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { getConfigDisplayRows, getGuildConfig, updateGuildConfig } = require('../services/configService');
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
].map(([name, value]) => ({ name, value }));

module.exports = {
  commands: [
    {
      name: 'set',
      metadata: {
        category: 'system',
        description: 'Configure Serenity log routing, command access defaults, and onboarding channels from one module-driven control surface.',
        usage: ['/set log channel:<#channel> type:<log>', '/set welcome channel:<#channel>', '/set goodbye channel:<#channel>', '/set access ...', '/set show'],
        prefixEnabled: false,
        examples: ['/set log type:moderation channel:#staff-logs', '/set welcome channel:#welcome', '/set access command:ban allowed_role:@Moderators'],
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
              { name: 'Goodbye', value: config.modules.onboarding.goodbyeEnabled ? 'Enabled' : 'Disabled', inline: true },
              { name: 'Automod', value: config.modules.automod.enabled ? 'Available' : 'Disabled', inline: true },
            ],
          })],
          ephemeral: true,
        });
      },
    },
  ],
};
