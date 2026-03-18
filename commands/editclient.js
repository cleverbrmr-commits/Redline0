const fs = require("fs");
const path = require("path");
const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { UPLOADS_DIR } = require("../storage/clientsStore");
const { findClientKey, getClientAutocompleteChoices, loadModules, normalizeModuleRecord, saveModules } = require("../services/clientService");
const { makeSuccessEmbed, makeWarningEmbed } = require("../utils/embeds");
const {
  CATEGORY_OPTIONS,
  STATUS_OPTIONS,
  brandEmoji,
  getStoredFileNameForKey,
  normalizeCategory,
  normalizeStatus,
  normalizeVisibility,
  resolveModulePath,
  safeResolvePath,
  slugify,
} = require("../utils/helpers");

module.exports = {
  commands: [
    {
      name: "editclient",
      metadata: {
        category: "client/content management",
        description: "Edit stored client metadata without re-uploading the file.",
        usage: ["/editclient name:<client> ..."],
        prefixEnabled: false,
        examples: ["/editclient name:alpha new_name:Alpha Lite status:Stable"],
        permissions: ["Manage Guild"],
        response: "ephemeral",
      },
      data: new SlashCommandBuilder()
        .setName("editclient")
        .setDescription("Edit client metadata without re-uploading")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption((o) => o.setName("name").setDescription("Existing client name or key").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName("new_name").setDescription("New display name"))
        .addStringOption((o) => o.setName("description").setDescription("New description"))
        .addStringOption((o) => o.setName("category").setDescription("New category").addChoices(...CATEGORY_OPTIONS.map((v) => ({ name: v, value: v }))))
        .addStringOption((o) =>
          o.setName("visibility").setDescription("Public or hidden").addChoices(
            { name: "Public", value: "public" },
            { name: "Hidden unless role matches", value: "hidden" }
          )
        )
        .addRoleOption((o) => o.setName("accessrole").setDescription("New access role"))
        .addBooleanOption((o) => o.setName("clear_accessrole").setDescription("Remove any role lock"))
        .addStringOption((o) => o.setName("version").setDescription("Version label"))
        .addStringOption((o) => o.setName("loader").setDescription("Loader name"))
        .addStringOption((o) => o.setName("mc_version").setDescription("Minecraft version"))
        .addStringOption((o) => o.setName("status").setDescription("Release state").addChoices(...STATUS_OPTIONS.map((v) => ({ name: v, value: v }))))
        .addStringOption((o) => o.setName("changelog").setDescription("Changelog snippet")),
      async execute({ interaction }) {
        const modules = await loadModules();
        const query = interaction.options.getString("name", true);
        const oldKey = findClientKey(modules, query);

        if (!oldKey) {
          return interaction.reply({ embeds: [makeWarningEmbed({ title: "Edit failed", description: "That client could not be found." })], ephemeral: true });
        }

        const mod = { ...modules[oldKey] };
        const changed = [];

        const newName = interaction.options.getString("new_name");
        const description = interaction.options.getString("description");
        const category = interaction.options.getString("category");
        const visibility = interaction.options.getString("visibility");
        const accessRole = interaction.options.getRole("accessrole");
        const clearAccessRole = interaction.options.getBoolean("clear_accessrole");
        const version = interaction.options.getString("version");
        const loader = interaction.options.getString("loader");
        const mcVersion = interaction.options.getString("mc_version");
        const status = interaction.options.getString("status");
        const changelog = interaction.options.getString("changelog");

        if (newName) { mod.label = newName; changed.push("name"); }
        if (description) { mod.description = description; changed.push("description"); }
        if (category) { mod.category = normalizeCategory(category); changed.push("category"); }
        if (visibility) { mod.visibility = normalizeVisibility(visibility); changed.push("visibility"); }
        if (accessRole) { mod.accessRoleId = accessRole.id; changed.push("access role"); }
        if (clearAccessRole) { mod.accessRoleId = null; changed.push("access role cleared"); }
        if (version) { mod.version = version; changed.push("version"); }
        if (loader) { mod.loader = loader; changed.push("loader"); }
        if (mcVersion) { mod.mcVersion = mcVersion; changed.push("mc version"); }
        if (status) { mod.status = normalizeStatus(status); changed.push("status"); }
        if (changelog) { mod.changelog = changelog; changed.push("changelog"); }

        let newKey = oldKey;
        if (newName) {
          const candidate = slugify(newName);
          if (!candidate) {
            return interaction.reply({ embeds: [makeWarningEmbed({ title: "Edit blocked", description: "That new name becomes an invalid key." })], ephemeral: true });
          }
          newKey = candidate;
        }

        if (normalizeVisibility(mod.visibility) === "hidden" && !mod.accessRoleId) {
          return interaction.reply({
            embeds: [makeWarningEmbed({ title: "Edit blocked", description: "Hidden clients require an access role, otherwise nobody can see them in `/clients`." })],
            ephemeral: true,
          });
        }

        const originalPath = resolveModulePath(modules[oldKey], UPLOADS_DIR);
        const currentExt = path.extname(mod.originalName || "") || path.extname(mod.storedFileName || "") || ".jar";
        mod.storedFileName = getStoredFileNameForKey(newKey, mod.originalName, currentExt);
        const nextPath = safeResolvePath(UPLOADS_DIR, mod.storedFileName);

        if (!nextPath) {
          return interaction.reply({
            embeds: [makeWarningEmbed({ title: "Edit blocked", description: "The updated file path could not be resolved safely." })],
            ephemeral: true,
          });
        }

        if (originalPath && originalPath !== nextPath && fs.existsSync(originalPath)) {
          await require("fs/promises").rename(originalPath, nextPath);
        }

        delete modules[oldKey];
        modules[newKey] = normalizeModuleRecord(newKey, mod);
        await saveModules(modules);

        return interaction.reply({
          embeds: [
            makeSuccessEmbed({
              title: `${brandEmoji()} Client updated`,
              description: `**${modules[newKey].label}** was updated successfully.`,
              fields: [{ name: "Changes", value: changed.length ? changed.join(", ") : "No metadata changes" }],
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
