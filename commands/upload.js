const path = require("path");
const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { UPLOADS_DIR } = require("../storage/clientsStore");
const { downloadFile, loadModules, normalizeModuleRecord, saveModules } = require("../services/clientService");
const { makeSuccessEmbed, makeWarningEmbed } = require("../utils/embeds");
const {
  CATEGORY_OPTIONS,
  brandEmoji,
  formatRoleMention,
  getStoredFileNameForKey,
  normalizeCategory,
  normalizeStatus,
  normalizeVisibility,
  slugify,
  trimText,
  STATUS_OPTIONS,
} = require("../utils/helpers");

module.exports = {
  commands: [
    {
      name: "upload",
      data: new SlashCommandBuilder()
        .setName("upload")
        .setDescription("Upload a client file and add it to /clients")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption((o) => o.setName("name").setDescription("Client name").setRequired(true))
        .addAttachmentOption((o) => o.setName("file").setDescription("Client file").setRequired(true))
        .addStringOption((o) => o.setName("description").setDescription("Short description"))
        .addStringOption((o) => o.setName("category").setDescription("Client category").addChoices(...CATEGORY_OPTIONS.map((v) => ({ name: v, value: v }))))
        .addStringOption((o) =>
          o.setName("visibility").setDescription("Who can see it").addChoices(
            { name: "Public", value: "public" },
            { name: "Hidden unless role matches", value: "hidden" }
          )
        )
        .addRoleOption((o) => o.setName("accessrole").setDescription("Role required to access this client"))
        .addStringOption((o) => o.setName("version").setDescription("Version label, e.g. v2.4.0"))
        .addStringOption((o) => o.setName("loader").setDescription("Loader, e.g. Fabric"))
        .addStringOption((o) => o.setName("mc_version").setDescription("Minecraft version"))
        .addStringOption((o) => o.setName("status").setDescription("Release state").addChoices(...STATUS_OPTIONS.map((v) => ({ name: v, value: v }))))
        .addStringOption((o) => o.setName("changelog").setDescription("Short changelog snippet")),
      async execute({ interaction }) {
        const name = interaction.options.getString("name", true);
        const file = interaction.options.getAttachment("file", true);
        const description = interaction.options.getString("description") || "Ready to deploy";
        const category = normalizeCategory(interaction.options.getString("category") || "Utility");
        const visibility = normalizeVisibility(interaction.options.getString("visibility") || "public");
        const accessRole = interaction.options.getRole("accessrole");
        const version = interaction.options.getString("version") || "Unknown";
        const loader = interaction.options.getString("loader") || "Unknown";
        const mcVersion = interaction.options.getString("mc_version") || "Unknown";
        const status = normalizeStatus(interaction.options.getString("status") || "Stable");
        const changelog = interaction.options.getString("changelog") || "No changelog yet.";

        await interaction.deferReply({ ephemeral: true });

        const key = slugify(name);
        if (!key) {
          return interaction.editReply({ embeds: [makeWarningEmbed({ title: "Upload blocked", description: "That client name becomes an invalid key." })] });
        }

        const originalName = file.name || "client.jar";
        const savedFileName = getStoredFileNameForKey(key, originalName);
        const filePath = path.join(UPLOADS_DIR, savedFileName);

        await downloadFile(file.url, filePath);

        const modules = await loadModules();
        modules[key] = normalizeModuleRecord(key, {
          label: name,
          description,
          storedFileName: savedFileName,
          originalName,
          uploadedAt: new Date().toISOString(),
          category,
          visibility,
          accessRoleId: accessRole?.id || null,
          version,
          loader,
          mcVersion,
          status,
          changelog,
        });
        await saveModules(modules);

        return interaction.editReply({
          embeds: [
            makeSuccessEmbed({
              title: `${brandEmoji()} Client uploaded`,
              description: `**${name}** is now available in \`/clients\`.`,
              fields: [
                { name: "File", value: trimText(originalName, 100), inline: true },
                { name: "Category", value: category, inline: true },
                { name: "Access", value: formatRoleMention(accessRole?.id || null), inline: true },
              ],
            }),
          ],
        });
      },
    },
  ],
};
