const { SlashCommandBuilder } = require('discord.js');
const {
  buildHelpOverviewEmbeds,
  buildHelpCommandEmbed,
} = require('../services/helpService');

module.exports = {
  commands: [
    {
      name: 'help',
      category: 'utility',
      description: 'Show all commands or detailed help for one command.',
      usage: '/help [command]',
      examples: [
        '/help',
        '/help command:ban',
        'Serenity help',
        'Serenity help ban',
      ],
      data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all commands or detailed help for one command')
        .addStringOption((option) =>
          option
            .setName('command')
            .setDescription('Specific command name')
            .setRequired(false)
        ),

      async execute({ interaction, commandRegistry, prefixName }) {
        const query = interaction.options.getString('command');
        const resolvedPrefix = prefixName || 'Serenity';

        if (query) {
          const embed = buildHelpCommandEmbed(commandRegistry, query, resolvedPrefix);
          return interaction.reply({ embeds: [embed] });
        }

        const embeds = buildHelpOverviewEmbeds(commandRegistry, resolvedPrefix);
        return interaction.reply({ embeds });
      },

      async executePrefix({ message, args, commandRegistry, prefixName }) {
        const query = args.join(' ').trim();
        const resolvedPrefix = prefixName || 'Serenity';

        if (query) {
          const embed = buildHelpCommandEmbed(commandRegistry, query, resolvedPrefix);
          return message.reply({ embeds: [embed] });
        }

        const embeds = buildHelpOverviewEmbeds(commandRegistry, resolvedPrefix);
        return message.reply({ embeds });
      },
    },
  ],
};
