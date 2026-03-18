const fs = require("fs");
const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { UPLOADS_DIR } = require("../storage/clientsStore");
const { findClientKey, getClientAutocompleteChoices, loadModules, saveModules } = require("../services/clientService");
const { makeSuccessEmbed, makeWarningEmbed } = require("../utils/embeds");
const { brandEmoji, resolveModulePath } = require("../utils/helpers");

module.exports = {
  commands: [
    {
      name: "removeclient",
      metadata: {
        category: "client/content management",
        description: "Remove a client entry and its stored file.",
        usage: ["/removeclient name:<client>"],
        prefixEnabled: false,
        examples: ["/removeclient name:alpha"],
        permissions: ["Manage Guild"],
        response: "ephemeral",
      },
      data: new SlashCommandBuilder()
        .setName("removeclient")
        .setDescription("Remove a client and delete its stored file")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption((o) => o.setName("name").setDescription("Client name or key").setRequired(true).setAutocomplete(true)),
      async execute({ interaction }) {
        const modules = await loadModules();
        const query = interaction.options.getString("name", true);
        const key = findClientKey(modules, query);

        if (!key) {
          return interaction.reply({ embeds: [makeWarningEmbed({ title: "Remove failed", description: "That client could not be found." })], ephemeral: true });
        }

        const mod = modules[key];
        const filePath = resolveModulePath(mod, UPLOADS_DIR);
        const hadFile = !!(filePath && fs.existsSync(filePath));

        if (filePath) {
          await require("fs/promises").rm(filePath, { force: true }).catch(() => null);
        }

        delete modules[key];
        await saveModules(modules);

        return interaction.reply({
          embeds: [
            makeSuccessEmbed({
              title: `${brandEmoji()} Client removed`,
              description: `**${mod.label}** was removed from the panel and storage.`,
              fields: [{ name: "File removed", value: hadFile ? "Yes" : "No file was present", inline: true }],
            }),
          ],
          ephemeral: true,
        });
      },
      async autocomplete({ interaction }) {
        const modules = await loadModules();
        const focused = interaction.options.getFocused(true);
        if (focused.name !== "name") {
          return interaction.respond([]);
        }
        return interaction.respond(getClientAutocompleteChoices(modules, focused.value));
      },
    },
  ],
};
