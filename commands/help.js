const { SlashCommandBuilder } = require('discord.js');
const { buildHelpDetailEmbed, buildHelpOverviewEmbed } = require('../services/helpService');

module.exports = {
  commands: [
    {
      name: 'help',
      metadata: {
        category: 'utility',
        description: 'Show a public command overview or detailed help for one command.',
        usage: ['/help', '/help command:<name>'],
        prefixEnabled: true,
        prefixUsage: ['Serenity help', 'Serenity help ban'],
        examples: ['/help', '/help mute', 'Serenity help yt-search'],
        permissions: ['Everyone'],
        response: 'public',
      },
      data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show the public help center')
        .addStringOption((option) => option.setName('command').setDescription('Specific command name to explain')),
      async execute({ interaction, commandRegistry }) {
        const query = interaction.options.getString('command');
        const embed = query ? buildHelpDetailEmbed(commandRegistry, query) : buildHelpOverviewEmbed(commandRegistry);

        if (!embed) {
          return interaction.reply({ content: `No documented command matches \`${query}\`.`, ephemeral: true });
        }

        return interaction.reply({ embeds: [embed] });
      },
      async executePrefix({ message, args, commandRegistry }) {
        const query = args[0] || null;
        const embed = query ? buildHelpDetailEmbed(commandRegistry, query) : buildHelpOverviewEmbed(commandRegistry);

        if (!embed) {
          return message.reply({ content: `No documented command matches \`${query}\`.` });
        }

        return message.reply({ embeds: [embed] });
      },
    },
  ],
};
