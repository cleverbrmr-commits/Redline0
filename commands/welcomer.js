const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { resolveChannelFromToken, resolveRoleFromToken } = require('../services/prefixService');
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
  saveWelcomerConfig,
  setGoodbyeChannel,
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

async function handleGoodbyeSet(guildId, channel) {
  if (!channel || !isSupportedWelcomeChannel(channel)) {
    throw new Error('Choose a server text or announcement channel for goodbye messages.');
  }
  await setGoodbyeChannel(guildId, channel.id);
  return buildWelcomerSetEmbed(channel, 'goodbye');
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
        category: 'onboarding',
        description: 'Configure premium welcome cards, goodbye cards, placeholder text, pings, and optional starter roles.',
        usage: ['/welcomer set channel:#welcome', '/welcomer templates title:<text> subtitle:<text> body:<text>', '/welcomer role role:@Member', '/welcomer status'],
        prefixEnabled: true,
        prefixUsage: buildWelcomerPrefixUsage('Serenity'),
        examples: ['/welcomer set channel:#welcome', '/welcomer templates title:Welcome to Redline Hub subtitle:You made it body:Read the rules and enjoy your stay.', 'Serenity welcomer status'],
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
            .addChannelOption((option) => option.setName('channel').setDescription('Channel used for welcome messages').setRequired(true).addChannelTypes(...SUPPORTED_WELCOME_CHANNEL_TYPES))
        )
        .addSubcommand((sub) =>
          sub
            .setName('goodbye')
            .setDescription('Set the goodbye channel')
            .addChannelOption((option) => option.setName('channel').setDescription('Channel used for goodbye messages').setRequired(true).addChannelTypes(...SUPPORTED_WELCOME_CHANNEL_TYPES))
        )
        .addSubcommand((sub) => sub.setName('on').setDescription('Enable welcome messages'))
        .addSubcommand((sub) => sub.setName('off').setDescription('Disable welcome messages'))
        .addSubcommand((sub) =>
          sub
            .setName('templates')
            .setDescription('Customize the premium welcome card text')
            .addStringOption((option) => option.setName('title').setDescription('Primary title line'))
            .addStringOption((option) => option.setName('subtitle').setDescription('Short subtitle line'))
            .addStringOption((option) => option.setName('body').setDescription('Main body copy'))
            .addBooleanOption((option) => option.setName('ping_member').setDescription('Mention the joining member'))
            .addBooleanOption((option) => option.setName('show_avatar_banner').setDescription('Use the avatar as the large card image'))
            .addBooleanOption((option) => option.setName('goodbye_enabled').setDescription('Enable goodbye cards'))
        )
        .addSubcommand((sub) =>
          sub
            .setName('role')
            .setDescription('Set an automatic welcome role')
            .addRoleOption((option) => option.setName('role').setDescription('Role to assign on join').setRequired(true))
        )
        .addSubcommand((sub) => sub.setName('status').setDescription('Show welcomer status')),
      async execute({ interaction }) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
          const channel = interaction.options.getChannel('channel', true);
          return interaction.reply({ embeds: [await handleWelcomerSet(interaction.guildId, channel)], ephemeral: true });
        }

        if (subcommand === 'goodbye') {
          const channel = interaction.options.getChannel('channel', true);
          await saveWelcomerConfig(interaction.guildId, { goodbyeEnabled: true });
          return interaction.reply({ embeds: [await handleGoodbyeSet(interaction.guildId, channel)], ephemeral: true });
        }

        if (subcommand === 'on') {
          return interaction.reply({ embeds: [await handleWelcomerToggle(interaction.guildId, true)], ephemeral: true });
        }

        if (subcommand === 'off') {
          return interaction.reply({ embeds: [await handleWelcomerToggle(interaction.guildId, false)], ephemeral: true });
        }

        if (subcommand === 'templates') {
          const updated = await saveWelcomerConfig(interaction.guildId, {
            title: interaction.options.getString('title') || undefined,
            subtitle: interaction.options.getString('subtitle') || undefined,
            body: interaction.options.getString('body') || undefined,
            pingMember: interaction.options.getBoolean('ping_member') ?? undefined,
            includeAvatarBanner: interaction.options.getBoolean('show_avatar_banner') ?? undefined,
            goodbyeEnabled: interaction.options.getBoolean('goodbye_enabled') ?? undefined,
          });
          return interaction.reply({ embeds: [buildWelcomerStatusEmbed(updated)], ephemeral: true });
        }

        if (subcommand === 'role') {
          const role = interaction.options.getRole('role', true);
          const updated = await saveWelcomerConfig(interaction.guildId, { autoRoleId: role.id });
          return interaction.reply({ embeds: [buildWelcomerStatusEmbed(updated)], ephemeral: true });
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
          const channel = await resolveChannelFromToken(message.guild, args[1]);
          return message.reply({ embeds: [await handleWelcomerSet(message.guild.id, channel)] });
        }

        if (action === 'goodbye') {
          const channel = await resolveChannelFromToken(message.guild, args[1]);
          await saveWelcomerConfig(message.guild.id, { goodbyeEnabled: true });
          return message.reply({ embeds: [await handleGoodbyeSet(message.guild.id, channel)] });
        }

        if (action === 'role') {
          const role = await resolveRoleFromToken(message.guild, args[1]);
          if (!role) return message.reply({ embeds: [buildWelcomerValidationEmbed('Mention a valid role for the auto-role setting.')] });
          return message.reply({ embeds: [buildWelcomerStatusEmbed(await saveWelcomerConfig(message.guild.id, { autoRoleId: role.id }))] });
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
