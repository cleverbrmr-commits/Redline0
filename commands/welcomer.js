const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { resolveChannelFromToken, resolveRoleFromToken } = require('../services/prefixService');
const {
  SUPPORTED_WELCOME_CHANNEL_TYPES,
  buildWelcomeEmbed,
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
  setGoodbyeEnabled,
  setWelcomerChannel,
  setWelcomerEnabled,
} = require('../services/welcomerService');
const { hasGuildPermission } = require('../utils/permissions');

async function handleWelcomerSet(guildId, channel, label = 'Welcome') {
  if (!channel || !isSupportedWelcomeChannel(channel)) {
    throw new Error('Choose a server text or announcement channel for onboarding messages.');
  }

  if (label === 'Goodbye') {
    await setGoodbyeChannel(guildId, channel.id);
    return buildWelcomerSetEmbed(channel, label);
  }

  await setWelcomerChannel(guildId, channel.id);
  return buildWelcomerSetEmbed(channel, label);
}

async function handleWelcomerToggle(guildId, enabled, label = 'Welcome') {
  const current = await getWelcomerConfig(guildId);

  if (enabled && label === 'Welcome' && !current.channelId) {
    return buildWelcomerValidationEmbed('Set a welcome channel first with `/welcomer channel` before enabling the module.');
  }

  if (enabled && label === 'Goodbye' && !current.goodbyeChannelId) {
    return buildWelcomerValidationEmbed('Set a goodbye channel first with `/welcomer goodbye-channel` before enabling goodbye messages.');
  }

  const updated = label === 'Goodbye'
    ? await setGoodbyeEnabled(guildId, enabled)
    : await setWelcomerEnabled(guildId, enabled);
  return buildWelcomerToggleEmbed(Boolean(enabled), label === 'Goodbye' ? updated.goodbyeChannelId : updated.channelId, label);
}

module.exports = {
  commands: [
    {
      name: 'welcomer',
      metadata: {
        category: 'welcome',
        description: 'Configure Serenity onboarding, premium welcome cards, goodbye cards, and join-role automation.',
        usage: [
          '/welcomer channel channel:#welcome',
          '/welcomer on',
          '/welcomer goodbye-channel channel:#goodbye',
          '/welcomer template title:<text> subtitle:<text> body:<text>',
          '/welcomer role role:@Member',
          '/welcomer status',
        ],
        prefixEnabled: true,
        prefixUsage: buildWelcomerPrefixUsage('Serenity'),
        examples: ['/welcomer on', '/welcomer role role:@Member', 'Serenity welcomer template Welcome to Redline Hub | You made it in. | Read the rules and enjoy your stay.'],
        permissions: ['Manage Guild'],
        response: 'ephemeral',
      },
      data: new SlashCommandBuilder()
        .setName('welcomer')
        .setDescription('Configure the premium onboarding module')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
          sub
            .setName('channel')
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
        .addSubcommand((sub) =>
          sub
            .setName('goodbye-channel')
            .setDescription('Set the goodbye channel')
            .addChannelOption((option) =>
              option
                .setName('channel')
                .setDescription('Channel used for goodbye messages')
                .setRequired(true)
                .addChannelTypes(...SUPPORTED_WELCOME_CHANNEL_TYPES)
            )
        )
        .addSubcommand((sub) => sub.setName('goodbye-on').setDescription('Enable goodbye messages'))
        .addSubcommand((sub) => sub.setName('goodbye-off').setDescription('Disable goodbye messages'))
        .addSubcommand((sub) =>
          sub
            .setName('role')
            .setDescription('Set an auto role for newly joined members')
            .addRoleOption((option) => option.setName('role').setDescription('Role given when a member joins').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName('template')
            .setDescription('Customize the welcome card text')
            .addStringOption((option) => option.setName('title').setDescription('Welcome title').setRequired(true))
            .addStringOption((option) => option.setName('subtitle').setDescription('Welcome subtitle').setRequired(true))
            .addStringOption((option) => option.setName('body').setDescription('Welcome body').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName('goodbye-template')
            .setDescription('Customize the goodbye card text')
            .addStringOption((option) => option.setName('body').setDescription('Goodbye body').setRequired(true))
        )
        .addSubcommand((sub) => sub.setName('preview').setDescription('Preview the current welcome card'))
        .addSubcommand((sub) => sub.setName('status').setDescription('Show welcomer status')),
      async execute({ interaction }) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'channel') {
          const channel = interaction.options.getChannel('channel', true);
          return interaction.reply({ embeds: [await handleWelcomerSet(interaction.guildId, channel, 'Welcome')], ephemeral: true });
        }

        if (subcommand === 'on') return interaction.reply({ embeds: [await handleWelcomerToggle(interaction.guildId, true, 'Welcome')], ephemeral: true });
        if (subcommand === 'off') return interaction.reply({ embeds: [await handleWelcomerToggle(interaction.guildId, false, 'Welcome')], ephemeral: true });

        if (subcommand === 'goodbye-channel') {
          const channel = interaction.options.getChannel('channel', true);
          return interaction.reply({ embeds: [await handleWelcomerSet(interaction.guildId, channel, 'Goodbye')], ephemeral: true });
        }

        if (subcommand === 'goodbye-on') return interaction.reply({ embeds: [await handleWelcomerToggle(interaction.guildId, true, 'Goodbye')], ephemeral: true });
        if (subcommand === 'goodbye-off') return interaction.reply({ embeds: [await handleWelcomerToggle(interaction.guildId, false, 'Goodbye')], ephemeral: true });

        if (subcommand === 'role') {
          const role = interaction.options.getRole('role', true);
          await saveWelcomerConfig(interaction.guildId, { autoRoleId: role.id });
          return interaction.reply({ embeds: [buildWelcomerToggleEmbed(true, role.id, 'Auto role')], ephemeral: true });
        }

        if (subcommand === 'template') {
          await saveWelcomerConfig(interaction.guildId, {
            titleTemplate: interaction.options.getString('title', true),
            subtitleTemplate: interaction.options.getString('subtitle', true),
            bodyTemplate: interaction.options.getString('body', true),
          });
          return interaction.reply({ embeds: [buildWelcomerToggleEmbed(true, null, 'Welcome template')], ephemeral: true });
        }

        if (subcommand === 'goodbye-template') {
          await saveWelcomerConfig(interaction.guildId, { goodbyeTemplate: interaction.options.getString('body', true) });
          return interaction.reply({ embeds: [buildWelcomerToggleEmbed(true, null, 'Goodbye template')], ephemeral: true });
        }

        if (subcommand === 'preview') {
          const config = await getWelcomerConfig(interaction.guildId);
          return interaction.reply({ embeds: [buildWelcomeEmbed(interaction.member, config)], ephemeral: true });
        }

        return interaction.reply({ embeds: [buildWelcomerStatusEmbed(await getWelcomerConfig(interaction.guildId))], ephemeral: true });
      },
      async executePrefix({ message, args, prefixName }) {
        if (!hasGuildPermission(message.member, PermissionFlagsBits.ManageGuild)) {
          throw new Error('You need **Manage Guild** to use the welcomer command.');
        }

        const action = String(args[0] || '').toLowerCase();
        if (!action) return message.reply({ embeds: [buildWelcomerUnknownActionEmbed(prefixName)] });

        if (action === 'channel') {
          const channel = await resolveChannelFromToken(message.guild, args[1]);
          return message.reply({ embeds: [await handleWelcomerSet(message.guild.id, channel, 'Welcome')] });
        }
        if (action === 'on') return message.reply({ embeds: [await handleWelcomerToggle(message.guild.id, true, 'Welcome')] });
        if (action === 'off') return message.reply({ embeds: [await handleWelcomerToggle(message.guild.id, false, 'Welcome')] });
        if (action === 'goodbye-channel') {
          const channel = await resolveChannelFromToken(message.guild, args[1]);
          return message.reply({ embeds: [await handleWelcomerSet(message.guild.id, channel, 'Goodbye')] });
        }
        if (action === 'goodbye-on') return message.reply({ embeds: [await handleWelcomerToggle(message.guild.id, true, 'Goodbye')] });
        if (action === 'goodbye-off') return message.reply({ embeds: [await handleWelcomerToggle(message.guild.id, false, 'Goodbye')] });
        if (action === 'role') {
          const role = await resolveRoleFromToken(message.guild, args[1]);
          if (!role) return message.reply({ embeds: [buildWelcomerValidationEmbed('Mention a valid role to use as the join role.')] });
          await saveWelcomerConfig(message.guild.id, { autoRoleId: role.id });
          return message.reply({ embeds: [buildWelcomerToggleEmbed(true, role.id, 'Auto role')] });
        }
        if (action === 'template') {
          const parts = args.slice(1).join(' ').split('|').map((entry) => entry.trim());
          if (parts.length < 3) return message.reply({ embeds: [buildWelcomerValidationEmbed('Use `Serenity welcomer template Title | Subtitle | Body` to update the welcome card.')] });
          await saveWelcomerConfig(message.guild.id, { titleTemplate: parts[0], subtitleTemplate: parts[1], bodyTemplate: parts.slice(2).join(' | ') });
          return message.reply({ embeds: [buildWelcomerToggleEmbed(true, null, 'Welcome template')] });
        }
        if (action === 'goodbye-template') {
          const body = args.slice(1).join(' ').trim();
          if (!body) return message.reply({ embeds: [buildWelcomerValidationEmbed('Provide a goodbye message body.')] });
          await saveWelcomerConfig(message.guild.id, { goodbyeTemplate: body });
          return message.reply({ embeds: [buildWelcomerToggleEmbed(true, null, 'Goodbye template')] });
        }
        if (action === 'preview') {
          const config = await getWelcomerConfig(message.guild.id);
          return message.reply({ embeds: [buildWelcomeEmbed(message.member, config)] });
        }
        if (action === 'status') return message.reply({ embeds: [buildWelcomerStatusEmbed(await getWelcomerConfig(message.guild.id))] });

        return message.reply({ embeds: [buildWelcomerUnknownActionEmbed(prefixName)] });
      },
    },
  ],
};
