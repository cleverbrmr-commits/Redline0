const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { resolveChannelFromToken, resolveRoleFromToken } = require('../services/prefixService');
const {
  SUPPORTED_WELCOME_CHANNEL_TYPES,
  buildWelcomePreviewPayload,
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

const STYLE_CHOICES = [
  { name: 'dark clean', value: 'dark-clean' },
  { name: 'blue premium', value: 'blue-premium' },
  { name: 'minimal', value: 'minimal' },
  { name: 'neon dark', value: 'neon-dark' },
];

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

async function buildPreviewForGuildMember(interactionOrMessage, guildConfig) {
  if (interactionOrMessage.member) {
    return buildWelcomePreviewPayload(interactionOrMessage.member, guildConfig);
  }
  const member = await interactionOrMessage.guild.members.fetch(interactionOrMessage.author.id).catch(() => null);
  if (!member) throw new Error('Could not build a preview because your server member record was unavailable.');
  return buildWelcomePreviewPayload(member, guildConfig);
}

module.exports = {
  commands: [
    {
      name: 'welcomer',
      metadata: {
        category: 'onboarding',
        description: 'Configure short welcome chat messages plus generated welcome card images with clean preset themes.',
        usage: ['/welcomer set channel:#welcome', '/welcomer templates line_one:<text> line_two:<text> line_three:<text>', '/welcomer preview', '/welcomer status'],
        prefixEnabled: true,
        prefixUsage: buildWelcomerPrefixUsage('Serenity'),
        examples: ['/welcomer templates line_one:Hey {user}, welcome to {server}! line_two:Make sure to check out: {channel} style:blue-premium', 'Serenity welcomer preview'],
        permissions: ['Manage Guild'],
        response: 'ephemeral',
        configDependencies: ['modules.onboarding.channelId', 'modules.onboarding.messageLines', 'modules.onboarding.style'],
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
            .setDescription('Customize the short welcome text and card appearance')
            .addStringOption((option) => option.setName('line_one').setDescription('First welcome line'))
            .addStringOption((option) => option.setName('line_two').setDescription('Second welcome line'))
            .addStringOption((option) => option.setName('line_three').setDescription('Third welcome line'))
            .addChannelOption((option) => option.setName('highlight_channel').setDescription('Channel mention used in the text message').addChannelTypes(...SUPPORTED_WELCOME_CHANNEL_TYPES))
            .addBooleanOption((option) => option.setName('ping_member').setDescription('Mention the joining member'))
            .addStringOption((option) => option.setName('style').setDescription('Card theme').addChoices(...STYLE_CHOICES))
            .addStringOption((option) => option.setName('background_image_url').setDescription('Optional image URL for the card background'))
            .addStringOption((option) => option.setName('text_color').setDescription('Optional 6-digit hex color for main text'))
            .addBooleanOption((option) => option.setName('show_member_count').setDescription('Show the member count on the card'))
            .addBooleanOption((option) => option.setName('show_avatar').setDescription('Show the member avatar on the card'))
            .addBooleanOption((option) => option.setName('show_join_text').setDescription('Show the join sentence on the card'))
            .addBooleanOption((option) => option.setName('goodbye_enabled').setDescription('Enable goodbye messages'))
        )
        .addSubcommand((sub) =>
          sub
            .setName('role')
            .setDescription('Set an automatic welcome role')
            .addRoleOption((option) => option.setName('role').setDescription('Role to assign on join').setRequired(true))
        )
        .addSubcommand((sub) => sub.setName('preview').setDescription('Preview the current public welcome message + card'))
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
          const current = await getWelcomerConfig(interaction.guildId);
          const updated = await saveWelcomerConfig(interaction.guildId, {
            messageLines: [
              interaction.options.getString('line_one') || current.messageLines[0],
              interaction.options.getString('line_two') || current.messageLines[1],
              interaction.options.getString('line_three') || current.messageLines[2],
            ],
            highlightChannelId: interaction.options.getChannel('highlight_channel')?.id || current.highlightChannelId,
            pingMember: interaction.options.getBoolean('ping_member') ?? undefined,
            style: interaction.options.getString('style') || undefined,
            backgroundImageUrl: interaction.options.getString('background_image_url') ?? undefined,
            textColor: interaction.options.getString('text_color') ?? undefined,
            showMemberCount: interaction.options.getBoolean('show_member_count') ?? undefined,
            showAvatar: interaction.options.getBoolean('show_avatar') ?? undefined,
            showJoinText: interaction.options.getBoolean('show_join_text') ?? undefined,
            goodbyeEnabled: interaction.options.getBoolean('goodbye_enabled') ?? undefined,
          });
          return interaction.reply({ embeds: [buildWelcomerStatusEmbed(updated)], ephemeral: true });
        }

        if (subcommand === 'role') {
          const role = interaction.options.getRole('role', true);
          const updated = await saveWelcomerConfig(interaction.guildId, { autoRoleId: role.id });
          return interaction.reply({ embeds: [buildWelcomerStatusEmbed(updated)], ephemeral: true });
        }

        if (subcommand === 'preview') {
          const config = await getWelcomerConfig(interaction.guildId);
          const previewPayload = await buildPreviewForGuildMember(interaction, config);
          return interaction.reply({ ...previewPayload, ephemeral: true });
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

        if (action === 'preview') {
          const config = await getWelcomerConfig(message.guild.id);
          return message.reply(await buildPreviewForGuildMember(message, config));
        }

        if (action === 'status') {
          return message.reply({ embeds: [buildWelcomerStatusEmbed(await getWelcomerConfig(message.guild.id))] });
        }

        return message.reply({ embeds: [buildWelcomerUnknownActionEmbed(prefixName)] });
      },
    },
  ],
};
