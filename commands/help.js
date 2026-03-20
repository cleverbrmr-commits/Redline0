const { SlashCommandBuilder } = require('discord.js');
const {
  buildHelpOverviewEmbeds,
  buildHelpCommandEmbed,
  buildHelpOverviewComponents,
} = require('../services/helpService');

module.exports = {
  commands: [
    {
      name: 'help',
      metadata: {
        category: 'system',
        description: 'Browse Serenity modules, premium help cards, and detailed command documentation.',
        usage: ['/help', '/help command:<name>'],
        prefixEnabled: true,
        prefixUsage: ['Serenity help', 'Serenity help ban'],
        examples: ['/help', '/help command:automod', 'Serenity help welcomer'],
        permissions: ['Everyone'],
        response: 'public',
      },
      data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Browse Serenity modules and detailed command help')
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
        const components = buildHelpOverviewComponents(commandRegistry);
        return interaction.reply({ embeds, components });
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
