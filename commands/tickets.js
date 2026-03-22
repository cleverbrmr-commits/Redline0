const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { attachTicketPanelMessage, buildTicketPanelComponents, buildTicketPanelEmbed, getTicketPanels, upsertTicketPanel } = require('../services/ticketService');
const { makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');

const STYLES = ['support', 'purchase', 'report', 'application'].map((value) => ({ name: value, value }));

module.exports = {
  commands: [
    {
      name: 'tickets',
      metadata: {
        category: 'support',
        description: 'Build premium support ticket panels with routing, support roles, and guided starter messaging.',
        usage: ['/tickets create name:<name> style:<style>', '/tickets publish name:<name> channel:#support', '/tickets list'],
        examples: ['/tickets create name:Support style:support support_role:@Support team', '/tickets publish name:Support channel:#open-a-ticket'],
        permissions: ['Manage Channels'],
        response: 'ephemeral',
        configDependencies: ['modules.support.panels', 'modules.logging.channels.tickets'],
      },
      data: new SlashCommandBuilder()
        .setName('tickets')
        .setDescription('Configure Serenity ticket panels')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand((sub) => sub.setName('list').setDescription('List configured ticket panels'))
        .addSubcommand((sub) =>
          sub
            .setName('create')
            .setDescription('Create or update a ticket panel')
            .addStringOption((option) => option.setName('name').setDescription('Panel name').setRequired(true))
            .addStringOption((option) => option.setName('style').setDescription('Panel style').addChoices(...STYLES))
            .addChannelOption((option) => option.setName('category').setDescription('Optional ticket category').addChannelTypes(ChannelType.GuildCategory))
            .addRoleOption((option) => option.setName('support_role').setDescription('Role that can access the tickets'))
            .addStringOption((option) => option.setName('welcome_message').setDescription('Message sent when a ticket opens'))
            .addStringOption((option) => option.setName('ticket_prefix').setDescription('Prefix for new ticket channel names')))
        .addSubcommand((sub) =>
          sub
            .setName('publish')
            .setDescription('Publish a ticket panel into a channel')
            .addStringOption((option) => option.setName('name').setDescription('Panel name').setRequired(true))
            .addChannelOption((option) => option.setName('channel').setDescription('Target channel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))),
      async execute({ interaction }) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (subcommand === 'list') {
          const panels = await getTicketPanels(guildId);
          if (!panels.length) {
            return interaction.reply({ embeds: [makeInfoEmbed({ title: 'Ticket panels', description: 'No ticket panels are configured yet.' })], ephemeral: true });
          }
          return interaction.reply({ embeds: [makeInfoEmbed({ title: 'Ticket panels', description: panels.map((panel) => `• **${panel.name}** — ${panel.style} • ${panel.messageId ? 'published' : 'draft'}`).join('\n') })], ephemeral: true });
        }

        if (subcommand === 'create') {
          const panel = await upsertTicketPanel(guildId, {
            name: interaction.options.getString('name', true),
            style: interaction.options.getString('style') || 'support',
            categoryId: interaction.options.getChannel('category')?.id || null,
            supportRoleId: interaction.options.getRole('support_role')?.id || null,
            welcomeMessage: interaction.options.getString('welcome_message') || 'A Serenity ticket has been opened. Share the details you want staff to review.',
            ticketPrefix: interaction.options.getString('ticket_prefix') || 'ticket',
          });
          return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Ticket panel saved', description: `Saved the **${panel.name}** ticket panel.` })], ephemeral: true });
        }

        const name = interaction.options.getString('name', true);
        const panel = (await getTicketPanels(guildId)).find((entry) => entry.name.toLowerCase() === name.toLowerCase());
        if (!panel) {
          return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Ticket panel not found', description: `No ticket panel named **${name}** exists yet.` })], ephemeral: true });
        }

        const channel = interaction.options.getChannel('channel', true);
        const message = await channel.send({ embeds: [buildTicketPanelEmbed(panel)], components: buildTicketPanelComponents(panel) });
        await attachTicketPanelMessage(guildId, name, channel.id, message.id);
        return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Ticket panel published', description: `Published **${panel.name}** in <#${channel.id}>.` })], ephemeral: true });
      },
    },
  ],
};
