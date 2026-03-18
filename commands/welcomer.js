const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { resolveChannelFromToken } = require('../services/prefixService');
const {
  SUPPORTED_WELCOME_CHANNEL_TYPES,
  buildWelcomerPrefixUsage,
  buildWelcomerSetEmbed,
  buildWelcomerStatusEmbed,
  buildWelcomerToggleEmbed,
  buildWelcomerUnknownActionEmbed,
  buildWelcomerValidationEmbed,
  getWelcomerConfig,
  isSupportedWelcomeChannel,
  setWelcomerChannel,
  setWelcomerEnabled,
} = require('../services/welcomerService');
const { hasGuildPermission } = require('../utils/permissions');

async function handleWelcomerSet(guildId, channel) {
  if (!channel || !isSupportedWelcomeChannel(channel)) {
    throw new Error('Choose a server text or announcement channel for welcome messages.');
  }

  await setWelcomerChannel(guildId, channel.id);
  return buildWelcomerSetEmbed(channel);
}

async function handleWelcomerToggle(guildId, enabled) {
  const current = await getWelcomerConfig(guildId);

  if (enabled && !current.channelId) {
    return buildWelcomerValidationEmbed('Set a welcome channel first with `/welcomer set channel:#channel`.');
  }

  const updated = await setWelcomerEnabled(guildId, enabled);
  return buildWelcomerToggleEmbed(Boolean(enabled), updated.channelId);
}

module.exports = {
  commands: [
    {
      name: 'welcomer',
      metadata: {
        category: 'admin',
        description: 'Configure the modular welcome system for new members.',
        usage: ['/welcomer set channel:#welcome', '/welcomer on', '/welcomer off', '/welcomer status'],
        prefixEnabled: true,
        prefixUsage: buildWelcomerPrefixUsage('Serenity'),
        examples: ['/welcomer set channel:#welcome', 'Serenity welcomer set #welcome', 'Serenity welcomer status'],
        permissions: ['Manage Guild'],
        response: 'ephemeral',
      },
      data: new SlashCommandBuilder()
        .setName('welcomer')
        .setDescription('Configure the welcome system')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setDescription('Set the welcome channel')
            .addChannelOption((option) =>
              option
                .setName('channel')
                .setDescription('Channel used for welcome messages')
                .setRequired(true)
                .addChannelTypes(...SUPPORTED_WELCOME_CHANNEL_TYPES)
            )
        )
        .addSubcommand((sub) => sub.setName('on').setDescription('Enable welcome messages'))
        .addSubcommand((sub) => sub.setName('off').setDescription('Disable welcome messages'))
        .addSubcommand((sub) => sub.setName('status').setDescription('Show welcomer status')),
      async execute({ interaction }) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
          const channel = interaction.options.getChannel('channel', true);
          return interaction.reply({ embeds: [await handleWelcomerSet(interaction.guildId, channel)], ephemeral: true });
        }

        if (subcommand === 'on') {
          return interaction.reply({ embeds: [await handleWelcomerToggle(interaction.guildId, true)], ephemeral: true });
        }

        if (subcommand === 'off') {
          return interaction.reply({ embeds: [await handleWelcomerToggle(interaction.guildId, false)], ephemeral: true });
        }

        return interaction.reply({ embeds: [buildWelcomerStatusEmbed(await getWelcomerConfig(interaction.guildId))], ephemeral: true });
      },
      async executePrefix({ message, args, prefixName }) {
        if (!hasGuildPermission(message.member, PermissionFlagsBits.ManageGuild)) {
          throw new Error('You need **Manage Guild** to use the welcomer command.');
        }

        const action = String(args[0] || '').toLowerCase();

        if (!action) {
          return message.reply({ embeds: [buildWelcomerUnknownActionEmbed(prefixName)] });
        }

        if (action === 'set') {
          const channelToken = args[1];
          const channel = await resolveChannelFromToken(message.guild, channelToken);
          return message.reply({ embeds: [await handleWelcomerSet(message.guild.id, channel)] });
        }

        if (action === 'on') {
          return message.reply({ embeds: [await handleWelcomerToggle(message.guild.id, true)] });
        }

        if (action === 'off') {
          return message.reply({ embeds: [await handleWelcomerToggle(message.guild.id, false)] });
        }

        if (action === 'status') {
          return message.reply({ embeds: [buildWelcomerStatusEmbed(await getWelcomerConfig(message.guild.id))] });
        }

        return message.reply({ embeds: [buildWelcomerUnknownActionEmbed(prefixName)] });
      },
    },
  ],
};
