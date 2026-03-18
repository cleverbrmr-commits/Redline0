const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const {
  findSavedEmbedKey,
  getEmbedAutocompleteChoices,
  loadEmbedStore,
  parseColorValue,
  parseEmbedFieldsInput,
  renderCustomEmbed,
  saveEmbedStore,
} = require("../services/embedService");
const { makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require("../utils/embeds");
const { slugify, trimText } = require("../utils/helpers");

module.exports = {
  commands: [
    {
      name: "embed",
      metadata: {
        category: "admin",
        description: "Create, store, preview, and send reusable custom embeds.",
        usage: ["/embed <create|list|edit|delete|send|preview> ..."],
        prefixEnabled: false,
        examples: ["/embed list", "/embed create name:rules title:Rules description:Be nice"],
        permissions: ["Manage Guild"],
        response: "ephemeral",
      },
      data: new SlashCommandBuilder()
        .setName("embed")
        .setDescription("Create and manage reusable custom embeds")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
          sub
            .setName("create")
            .setDescription("Create and store a custom embed")
            .addStringOption((o) => o.setName("name").setDescription("Unique embed name").setRequired(true))
            .addStringOption((o) => o.setName("title").setDescription("Embed title").setRequired(true))
            .addStringOption((o) => o.setName("description").setDescription("Embed description").setRequired(true))
            .addStringOption((o) => o.setName("color").setDescription("Hex color like #ff0000"))
            .addStringOption((o) => o.setName("footer").setDescription("Footer text"))
            .addStringOption((o) => o.setName("author").setDescription("Author text"))
            .addStringOption((o) => o.setName("thumbnail").setDescription("Thumbnail URL"))
            .addStringOption((o) => o.setName("image").setDescription("Image URL"))
            .addStringOption((o) => o.setName("fields").setDescription("Fields: name|value|inline;name|value|inline"))
            .addBooleanOption((o) => o.setName("timestamp").setDescription("Include timestamp"))
        )
        .addSubcommand((sub) => sub.setName("list").setDescription("List saved custom embeds"))
        .addSubcommand((sub) =>
          sub
            .setName("edit")
            .setDescription("Edit an existing custom embed")
            .addStringOption((o) => o.setName("name").setDescription("Embed name").setRequired(true).setAutocomplete(true))
            .addStringOption((o) => o.setName("title").setDescription("New title"))
            .addStringOption((o) => o.setName("description").setDescription("New description"))
            .addStringOption((o) => o.setName("color").setDescription("New hex color"))
            .addStringOption((o) => o.setName("footer").setDescription("New footer"))
            .addStringOption((o) => o.setName("author").setDescription("New author"))
            .addStringOption((o) => o.setName("thumbnail").setDescription("New thumbnail URL"))
            .addStringOption((o) => o.setName("image").setDescription("New image URL"))
            .addStringOption((o) => o.setName("fields").setDescription("Replace fields: name|value|inline;..."))
            .addBooleanOption((o) => o.setName("timestamp").setDescription("Enable/disable timestamp"))
        )
        .addSubcommand((sub) =>
          sub
            .setName("delete")
            .setDescription("Delete a saved custom embed")
            .addStringOption((o) => o.setName("name").setDescription("Embed name").setRequired(true).setAutocomplete(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName("send")
            .setDescription("Send a saved embed to a channel")
            .addStringOption((o) => o.setName("name").setDescription("Embed name").setRequired(true).setAutocomplete(true))
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Target channel (defaults to current)")
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("preview")
            .setDescription("Preview a saved embed privately")
            .addStringOption((o) => o.setName("name").setDescription("Embed name").setRequired(true).setAutocomplete(true))
        ),
      async execute({ interaction }) {
        const subcommand = interaction.options.getSubcommand();
        const store = await loadEmbedStore();

        if (subcommand === "create") {
          const name = interaction.options.getString("name", true);
          const key = slugify(name);

          if (!key) {
            return interaction.reply({ embeds: [makeWarningEmbed({ title: "Invalid name", description: "That embed name is not valid." })], ephemeral: true });
          }

          if (store[key]) {
            return interaction.reply({ embeds: [makeWarningEmbed({ title: "Already exists", description: "An embed with that name already exists." })], ephemeral: true });
          }

          const color = interaction.options.getString("color");
          if (color && !parseColorValue(color)) {
            return interaction.reply({ embeds: [makeWarningEmbed({ title: "Invalid color", description: "Use a 6-digit hex color like `#ff0033`." })], ephemeral: true });
          }

          const fields = parseEmbedFieldsInput(interaction.options.getString("fields"));
          store[key] = {
            name,
            title: interaction.options.getString("title", true),
            description: interaction.options.getString("description", true),
            color: color || null,
            footer: interaction.options.getString("footer") || null,
            author: interaction.options.getString("author") || null,
            thumbnail: interaction.options.getString("thumbnail") || null,
            image: interaction.options.getString("image") || null,
            fields,
            timestamp: interaction.options.getBoolean("timestamp") ?? true,
            createdAt: new Date().toISOString(),
            createdBy: interaction.user.id,
          };

          await saveEmbedStore(store);

          return interaction.reply({
            embeds: [
              makeSuccessEmbed({
                title: "Embed created",
                description: `Saved embed **${store[key].name}** as \`${key}\`. Use \`/embed preview name:${key}\` to review it.`,
              }),
            ],
            ephemeral: true,
          });
        }

        if (subcommand === "list") {
          const entries = Object.entries(store);
          if (!entries.length) {
            return interaction.reply({
              embeds: [makeInfoEmbed({ title: "Saved embeds", description: "No custom embeds are saved yet." })],
              ephemeral: true,
            });
          }

          const lines = entries
            .slice(0, 25)
            .map(([key, value]) => `• \`${key}\` — ${trimText(value.title || value.name, 90)}`)
            .join("\n");

          return interaction.reply({
            embeds: [makeInfoEmbed({ title: "Saved embeds", description: lines })],
            ephemeral: true,
          });
        }

        if (["edit", "delete", "send", "preview"].includes(subcommand)) {
          const nameInput = interaction.options.getString("name", true);
          const key = findSavedEmbedKey(store, nameInput);

          if (!key || !store[key]) {
            return interaction.reply({
              embeds: [makeWarningEmbed({ title: "Embed not found", description: "No saved embed matches that name." })],
              ephemeral: true,
            });
          }

          if (subcommand === "delete") {
            const label = store[key].name || key;
            delete store[key];
            await saveEmbedStore(store);

            return interaction.reply({
              embeds: [makeSuccessEmbed({ title: "Embed deleted", description: `Removed **${label}** from storage.` })],
              ephemeral: true,
            });
          }

          if (subcommand === "preview") {
            return interaction.reply({ embeds: [renderCustomEmbed(store[key])], ephemeral: true });
          }

          if (subcommand === "send") {
            const channel = interaction.options.getChannel("channel") || interaction.channel;
            if (!channel || typeof channel.send !== "function") {
              return interaction.reply({ embeds: [makeWarningEmbed({ title: "Send failed", description: "Could not resolve a sendable channel." })], ephemeral: true });
            }

            await channel.send({ embeds: [renderCustomEmbed(store[key])] });
            return interaction.reply({ embeds: [makeSuccessEmbed({ title: "Embed sent", description: `Sent **${store[key].name || key}** to <#${channel.id}>.` })], ephemeral: true });
          }

          if (subcommand === "edit") {
            const updates = {};
            const fieldsRaw = interaction.options.getString("fields");
            const color = interaction.options.getString("color");

            if (color && !parseColorValue(color)) {
              return interaction.reply({ embeds: [makeWarningEmbed({ title: "Invalid color", description: "Use a 6-digit hex color like `#ff0033`." })], ephemeral: true });
            }

            const editableKeys = ["title", "description", "footer", "author", "thumbnail", "image"];
            for (const fieldKey of editableKeys) {
              const value = interaction.options.getString(fieldKey);
              if (value) updates[fieldKey] = value;
            }

            if (color) updates.color = color;
            if (fieldsRaw) updates.fields = parseEmbedFieldsInput(fieldsRaw);

            const timestamp = interaction.options.getBoolean("timestamp");
            if (timestamp !== null) updates.timestamp = timestamp;

            if (!Object.keys(updates).length) {
              return interaction.reply({
                embeds: [makeInfoEmbed({ title: "No changes", description: "Provide at least one field to update." })],
                ephemeral: true,
              });
            }

            store[key] = {
              ...store[key],
              ...updates,
              updatedAt: new Date().toISOString(),
              updatedBy: interaction.user.id,
            };
            await saveEmbedStore(store);

            return interaction.reply({
              embeds: [
                makeSuccessEmbed({
                  title: "Embed updated",
                  description: `Updated **${store[key].name || key}** (${Object.keys(updates).join(", ")}).`,
                }),
              ],
              ephemeral: true,
            });
          }
        }

        return null;
      },
      async autocomplete({ interaction }) {
        const store = await loadEmbedStore();
        const focused = interaction.options.getFocused(true);
        if (focused.name !== "name") {
          return interaction.respond([]);
        }
        return interaction.respond(getEmbedAutocompleteChoices(store, focused.value));
      },
    },
  ],
};
