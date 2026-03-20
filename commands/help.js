const { SlashCommandBuilder } = require('discord.js');
const {
  buildHelpCommandPayload,
  buildHelpHomePayload,
} = require('../services/helpService');

module.exports = {
  commands: [
    {
      name: 'help',
      metadata: {
        category: 'system',
        description: 'Browse Serenity modules, command cards, and usage guidance through an interactive help center.',
        usage: ['/help', '/help command:<name>'],
        examples: ['/help', '/help command:ban', 'Serenity help', 'Serenity help ban'],
        permissions: ['Everyone'],
        response: 'ephemeral interactive',
        prefixEnabled: true,
        prefixUsage: ['Serenity help', 'Serenity help ban'],
      },
      data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Browse Serenity help and modules')
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
          return interaction.reply({ ...buildHelpCommandPayload(commandRegistry, query, resolvedPrefix), ephemeral: true });
        }

        return interaction.reply({ ...buildHelpHomePayload(commandRegistry, resolvedPrefix), ephemeral: true });
      },

      async executePrefix({ message, args, commandRegistry, prefixName }) {
        const query = args.join(' ').trim();
        const resolvedPrefix = prefixName || 'Serenity';

        if (query) {
          return message.reply(buildHelpCommandPayload(commandRegistry, query, resolvedPrefix));
        }

        return message.reply(buildHelpHomePayload(commandRegistry, resolvedPrefix));
      },
    },
  ],
};
