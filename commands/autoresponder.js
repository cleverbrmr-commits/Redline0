const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { buildResponderStatusEmbed, deleteResponder, getGuildResponders, upsertResponder } = require('../services/automationService');
const { makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');

const TRIGGER_MODES = ['contains', 'exact', 'regex'].map((value) => ({ name: value, value }));
const RESPONSE_MODES = ['text', 'embed'].map((value) => ({ name: value, value }));
const STYLES = ['minimal', 'support', 'alert', 'community'].map((value) => ({ name: value, value }));

module.exports = {
  commands: [
    {
      name: 'autoresponder',
      metadata: {
        category: 'system',
        description: 'Create premium keyword responders with trigger modes, embed replies, cooldowns, and scoped access.',
        usage: ['/autoresponder add trigger:<text> response:<text>', '/autoresponder list', '/autoresponder remove trigger:<text>'],
        examples: ['/autoresponder add trigger:how do i verify response:Check #start-here trigger_mode:contains response_mode:embed style:support', '/autoresponder remove trigger:how do i verify'],
        permissions: ['Manage Guild'],
        response: 'ephemeral',
        configDependencies: ['modules.autoresponders', 'modules.templates.defaults.autoresponder'],
      },
      data: new SlashCommandBuilder()
        .setName('autoresponder')
        .setDescription('Configure Serenity automatic responders')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) => sub.setName('list').setDescription('List all configured auto responders'))
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setDescription('Add or replace an auto responder')
            .addStringOption((option) => option.setName('trigger').setDescription('Trigger phrase or regex').setRequired(true))
            .addStringOption((option) => option.setName('response').setDescription('Response content').setRequired(true))
            .addStringOption((option) => option.setName('trigger_mode').setDescription('How the trigger matches').addChoices(...TRIGGER_MODES))
            .addStringOption((option) => option.setName('response_mode').setDescription('Text or embed response').addChoices(...RESPONSE_MODES))
            .addStringOption((option) => option.setName('style').setDescription('Template style').addChoices(...STYLES))
            .addIntegerOption((option) => option.setName('cooldown_seconds').setDescription('Per-user cooldown').setMinValue(0).setMaxValue(3600))
            .addChannelOption((option) => option.setName('channel').setDescription('Optional channel scope').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
            .addRoleOption((option) => option.setName('role').setDescription('Optional role scope')),
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setDescription('Delete one auto responder by trigger')
            .addStringOption((option) => option.setName('trigger').setDescription('Trigger phrase').setRequired(true)),
        ),
      async execute({ interaction }) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (subcommand === 'list') {
          return interaction.reply({ embeds: [buildResponderStatusEmbed(await getGuildResponders(guildId))], ephemeral: true });
        }

        if (subcommand === 'remove') {
          const trigger = interaction.options.getString('trigger', true);
          const removed = await deleteResponder(guildId, trigger);
          if (!removed) {
            return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Responder not found', description: `No responder matched **${trigger}**.` })], ephemeral: true });
          }
          return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Responder removed', description: `Deleted the responder for **${trigger.toLowerCase()}**.` })], ephemeral: true });
        }

        const channel = interaction.options.getChannel('channel');
        const role = interaction.options.getRole('role');
        const responder = await upsertResponder(guildId, {
          trigger: interaction.options.getString('trigger', true),
          response: interaction.options.getString('response', true),
          triggerMode: interaction.options.getString('trigger_mode') || 'contains',
          responseMode: interaction.options.getString('response_mode') || 'text',
          style: interaction.options.getString('style') || 'support',
          cooldownSeconds: interaction.options.getInteger('cooldown_seconds') || 0,
          channelIds: channel ? [channel.id] : [],
          roleIds: role ? [role.id] : [],
        });

        return interaction.reply({
          embeds: [makeSuccessEmbed({
            title: 'Responder saved',
            description: `The **${responder.trigger}** responder is active.`,
            fields: [
              { name: 'Trigger Mode', value: responder.triggerMode, inline: true },
              { name: 'Response Mode', value: responder.responseMode, inline: true },
              { name: 'Cooldown', value: `${responder.cooldownSeconds}s`, inline: true },
            ],
          })],
          ephemeral: true,
        });
      },
    },
  ],
};
