const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { loadConfig, saveConfig, getConfigDisplayRows } = require("../services/configService");
const { makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require("../utils/embeds");
const { SETTING_KEYS, SETTING_MAP } = require("../utils/helpers");

module.exports = {
  commands: [
    {
      name: "set",
      data: new SlashCommandBuilder()
        .setName("set")
        .setDescription("Configure bot channels and runtime settings")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
          sub
            .setName("downloadlog")
            .setDescription("Set the download log channel")
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Channel used for download logs")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("modlog")
            .setDescription("Set the moderation log channel")
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Channel used for moderation logs")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("prisonlog")
            .setDescription("Set the prison log channel")
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Channel used for prison logs")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("announcelog")
            .setDescription("Set the announcement log channel")
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Channel used for announcement logs")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            )
        )
        .addSubcommand((sub) => sub.setName("show").setDescription("Show current channel settings"))
        .addSubcommand((sub) =>
          sub
            .setName("reset")
            .setDescription("Reset one setting back to default")
            .addStringOption((o) =>
              o
                .setName("key")
                .setDescription("Setting key to reset")
                .setRequired(true)
                .addChoices(...SETTING_KEYS.map((key) => ({ name: key, value: key })))
            )
        ),
      async execute({ interaction }) {
        const subcommand = interaction.options.getSubcommand();
        const config = await loadConfig();

        if (["downloadlog", "modlog", "prisonlog", "announcelog"].includes(subcommand)) {
          const channel = interaction.options.getChannel("channel", true);
          const configKey = SETTING_MAP[subcommand];
          config[configKey] = channel.id;
          await saveConfig(config);

          return interaction.reply({
            embeds: [
              makeSuccessEmbed({
                title: "Setting updated",
                description: `**${subcommand}** is now set to <#${channel.id}>.`,
              }),
            ],
            ephemeral: true,
          });
        }

        if (subcommand === "show") {
          const rows = getConfigDisplayRows(config)
            .map(([label, channelId]) => `• **${label}:** ${channelId ? `<#${channelId}>` : "Not configured"}`)
            .join("\n");

          return interaction.reply({
            embeds: [
              makeInfoEmbed({
                title: "Current bot settings",
                description: rows,
              }),
            ],
            ephemeral: true,
          });
        }

        if (subcommand === "reset") {
          const key = interaction.options.getString("key", true);
          const configKey = SETTING_MAP[key];

          if (!configKey) {
            return interaction.reply({
              embeds: [makeWarningEmbed({ title: "Reset failed", description: "That setting key is not recognized." })],
              ephemeral: true,
            });
          }

          config[configKey] = null;
          await saveConfig(config);

          return interaction.reply({
            embeds: [
              makeSuccessEmbed({
                title: "Setting reset",
                description: `**${key}** has been reset.`,
              }),
            ],
            ephemeral: true,
          });
        }

        return null;
      },
    },
  ],
};
