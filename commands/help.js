const { SlashCommandBuilder } = require("discord.js");
const {
  buildHelpOverviewEmbeds,
  buildHelpCommandEmbed,
} = require("../services/helpService");

module.exports = {
  commands: [
    {
      name: "help",
      category: "utility",
      description: "Show all commands or detailed help for one command.",
      usage: "/help [command]",
      examples: [
        "/help",
        "/help command:ban",
        "Serenity help",
        "Serenity help ban",
      ],
      data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show all commands or detailed help for one command")
        .addStringOption((option) =>
          option
            .setName("command")
            .setDescription("Specific command name")
            .setRequired(false)
        ),

      async execute({ interaction, commandRegistry }) {
        const query = interaction.options.getString("command");

        if (query) {
          const embed = buildHelpCommandEmbed(commandRegistry, query, "Serenity");
          return interaction.reply({ embeds: [embed] });
        }

        const embeds = buildHelpOverviewEmbeds(commandRegistry, "Serenity");
        return interaction.reply({ embeds });
      },

      async prefixExecute({ message, args, commandRegistry }) {
        const query = args.join(" ").trim();

        if (query) {
          const embed = buildHelpCommandEmbed(commandRegistry, query, "Serenity");
          return message.reply({ embeds: [embed] });
        }

        const embeds = buildHelpOverviewEmbeds(commandRegistry, "Serenity");
        return message.reply({ embeds });
      },
    },
  ],
};
