const fs = require("fs");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const { UPLOADS_DIR } = require("../storage/clientsStore");
const { buildClientFields, getVisibleCategories, getVisibleClientEntries, loadModules } = require("./clientService");
const { logDownload } = require("./logService");
const { toggleRoleFromMenu } = require('./roleMenuService');
const { claimTicket, closeTicket, createTicketFromPanel } = require('./ticketService');
const { makeEmbed, makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require("../utils/embeds");
const {
  BRAND,
  DOWNLOAD_COOLDOWN_MS,
  MAX_MENU_OPTIONS,
  brandColor,
  brandEmoji,
  buildClientAttachment,
  resolveInteractionContext,
  resolveModulePath,
  resolveSendableChannel,
} = require("../utils/helpers");
const { isVisibleToMember } = require("../utils/permissions");

const downloadCooldowns = new Map();

function getCooldownRemaining(userId) {
  const endsAt = downloadCooldowns.get(userId) || 0;
  return Math.max(0, endsAt - Date.now());
}

function setCooldown(userId) {
  downloadCooldowns.set(userId, Date.now() + DOWNLOAD_COOLDOWN_MS);
}

function buildCategoryActionRow(categories, customId) {
  if (!categories.length) return null;

  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder("Choose a category...")
    .addOptions(
      categories.slice(0, MAX_MENU_OPTIONS).map((category) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(category)
          .setValue(category)
          .setDescription(`Browse ${category} clients`)
      )
    );

  return new ActionRowBuilder().addComponents(menu);
}

function buildClientActionRow(modules, member, category, mode) {
  const visibleClients = getVisibleClientEntries(modules, member, category).slice(0, MAX_MENU_OPTIONS);

  if (!visibleClients.length) return null;

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`client_select:${mode}:${category}`)
    .setPlaceholder(`Choose a ${category} client...`)
    .addOptions(
      visibleClients.map(([key, mod]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(require("../utils/helpers").trimText(mod.label, 100))
          .setValue(key)
          .setDescription(require("../utils/helpers").trimText(`${mod.version} • ${mod.loader} • ${mod.status}`, 100))
      )
    );

  return new ActionRowBuilder().addComponents(menu);
}

function buildBrowserNavigationRow(mode, category = null) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`browser_refresh:${mode}`)
      .setLabel("Refresh Browser")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`browser_back:${mode}`)
      .setLabel("Back to Categories")
      .setStyle(ButtonStyle.Primary)
  );

  if (category) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`browser_reopen:${mode}:${category}`)
        .setLabel("Reopen Category")
        .setStyle(ButtonStyle.Success)
    );
  }

  return row;
}

function buildCategoryBrowserEmbed(visibleCategories, mode = "private") {
  const isPrivate = mode === "private";

  if (isPrivate) {
    return makeInfoEmbed({
      title: `${brandEmoji()} ${BRAND.name}`,
      description: "Browse by category, then pick a client to get a private metadata card + download.",
      fields: [
        { name: "Categories", value: String(visibleCategories.length), inline: true },
        { name: "Cooldown", value: `${DOWNLOAD_COOLDOWN_MS / 1000}s between downloads`, inline: true },
        { name: "Recovery", value: "If this menu goes stale, use **Refresh Browser** to regenerate a fresh private browser.", inline: false },
      ],
    });
  }

  return makeEmbed({
    title: `🚀 ${BRAND.name}`,
    description: "Premium client access panel. Use the menu to browse categories — all selections and files are delivered privately.",
    color: Colors.Gold,
    fields: [
      { name: "Access", value: "Role-based access is enforced per member.", inline: true },
      { name: "Privacy", value: "Downloads are always ephemeral to the user.", inline: true },
      { name: "Updates", value: "Panel data refreshes automatically when categories/clients change." },
      { name: "How To Use", value: "1) Select category → 2) Select client → 3) Receive private file + metadata." },
    ],
    footer: "REDLINE • Verified releases • Private delivery",
  });
}

function buildCategorySelectionEmbed(category, clientCount) {
  return makeEmbed({
    title: `${brandEmoji()} ${category}`,
    description: "Choose a client below to view metadata and privately download the file.",
    fields: [
      { name: "Visible Clients", value: String(clientCount), inline: true },
      { name: "Recovery", value: "Use **Reopen Category** or **Back to Categories** if you return later and need a fresh menu.", inline: false },
    ],
    color: brandColor(),
  });
}

function buildRecoveryEmbed(title, description, category = null) {
  return makeWarningEmbed({
    title,
    description,
    fields: category ? [{ name: "Recovery", value: `Use **Reopen Category** to rebuild a fresh **${category}** browser.` }] : undefined,
  });
}

async function resolveSendableInteractionChannel(client, interaction) {
  if (!interaction.guildId || !interaction.channelId) return null;
  return resolveSendableChannel(client, interaction.channelId, interaction.channel);
}

async function buildPrivateCategoryBrowserPayload(client, interaction, mode = "private", extraEmbed = null) {
  const { actorMember } = await resolveInteractionContext(client, interaction);
  const modules = await loadModules();
  const member = actorMember || interaction.member;
  const visibleCategories = getVisibleCategories(modules, member);
  const row = buildCategoryActionRow(visibleCategories, `client_category_select:${mode}`);

  if (!row) {
    return {
      embeds: [
        makeInfoEmbed({
          title: `${brandEmoji()} ${BRAND.name}`,
          description: "No clients are visible to you right now.",
          fields: [
            { name: "Status", value: "No eligible client files found", inline: true },
            { name: "Hint", value: "Ask staff for access or upload a client", inline: true },
          ],
        }),
      ],
      components: [buildBrowserNavigationRow(mode)],
      ephemeral: true,
    };
  }

  return {
    embeds: [extraEmbed || buildCategoryBrowserEmbed(visibleCategories, "private")],
    components: [row, buildBrowserNavigationRow(mode)],
    ephemeral: true,
  };
}

async function buildPrivateClientMenuPayload(client, interaction, category, mode = "private", recoveryEmbed = null) {
  if (!category) {
    return buildPrivateCategoryBrowserPayload(
      client,
      interaction,
      mode,
      recoveryEmbed || makeInfoEmbed({ title: `${brandEmoji()} Browser recovered`, description: "The previous category context was unavailable, so a fresh category browser was generated." })
    );
  }

  const modules = await loadModules();
  const { actorMember } = await resolveInteractionContext(client, interaction);
  const member = actorMember || interaction.member;
  const visibleClients = getVisibleClientEntries(modules, member, category);
  const row = buildClientActionRow(modules, member, category, mode);

  if (!visibleClients.length || !row) {
    return {
      embeds: [
        recoveryEmbed ||
          buildRecoveryEmbed(
            "Category unavailable",
            `The **${category}** menu is stale or no longer available to you. Regenerate your browser below.`,
            category
          ),
      ],
      components: [buildBrowserNavigationRow(mode, category)],
      ephemeral: true,
    };
  }

  return {
    embeds: [recoveryEmbed || buildCategorySelectionEmbed(category, visibleClients.length)],
    components: [row, buildBrowserNavigationRow(mode, category)],
    ephemeral: true,
  };
}

async function sendPrivateClientPanel(client, interaction) {
  return interaction.reply(await buildPrivateCategoryBrowserPayload(client, interaction, "private"));
}

function buildPublicPanelMessage(visibleCategories) {
  const row = buildCategoryActionRow(visibleCategories, "client_category_select:public");
  return {
    embeds: [buildCategoryBrowserEmbed(visibleCategories, "public")],
    components: row ? [row] : [],
  };
}

async function handleCategorySelection(client, interaction, mode) {
  const category = interaction.values[0];
  return interaction.reply(await buildPrivateClientMenuPayload(client, interaction, category, mode));
}

async function handleClientSelection(client, interaction, mode, category) {
  if (!category) {
    return interaction.reply(await buildPrivateCategoryBrowserPayload(client, interaction, mode, makeInfoEmbed({
      title: `${brandEmoji()} Browser recovered`,
      description: "That client menu lost its category context, so a fresh private browser was generated.",
    })));
  }

  const remaining = getCooldownRemaining(interaction.user.id);
  if (remaining > 0) {
    return interaction.reply({
      embeds: [
        makeWarningEmbed({
          title: "Slow down",
          description: `Download cooldown active. Try again in **${Math.ceil(remaining / 1000)}s**.`,
        }),
      ],
      components: [buildBrowserNavigationRow(mode, category)],
      ephemeral: true,
    });
  }

  const modules = await loadModules();
  const mod = modules[interaction.values[0]];

  if (!mod) {
    return interaction.reply({
      ...(await buildPrivateClientMenuPayload(
        client,
        interaction,
        category,
        mode,
        buildRecoveryEmbed("Download unavailable", "That client no longer exists. Open a fresh category browser below.", category)
      )),
    });
  }

  const { actorMember } = await resolveInteractionContext(client, interaction);
  const member = actorMember || interaction.member;

  if (!isVisibleToMember(member, mod)) {
    return interaction.reply({
      ...(await buildPrivateClientMenuPayload(
        client,
        interaction,
        category,
        mode,
        buildRecoveryEmbed("Access denied", "You no longer have access to that client. Reopen the category browser to view what is still available.", category)
      )),
    });
  }

  const filePath = resolveModulePath(mod, UPLOADS_DIR);
  if (!filePath || !fs.existsSync(filePath)) {
    return interaction.reply({
      ...(await buildPrivateClientMenuPayload(
        client,
        interaction,
        category,
        mode,
        buildRecoveryEmbed("Missing file", "The file for that client is missing from storage. Regenerate the category browser or choose another client.", category)
      )),
    });
  }

  setCooldown(interaction.user.id);
  const file = buildClientAttachment(mod, filePath);
  await logDownload(client, interaction, mod);

  return interaction.reply({
    embeds: [
      makeSuccessEmbed({
        title: `${brandEmoji()} ${mod.label}`,
        description: "Your client is attached below.",
        fields: [
          ...buildClientFields(mod),
          { name: "Browser Tools", value: "Use **Reopen Category** to regenerate this private menu later.", inline: false },
        ],
      }),
    ],
    files: [file],
    components: [buildBrowserNavigationRow(mode, category)],
    ephemeral: true,
  });
}

async function handleStringSelect(client, interaction) {
  if (interaction.customId.startsWith("client_category_select:")) {
    const [, mode] = interaction.customId.split(":");
    return handleCategorySelection(client, interaction, mode || "private");
  }

  if (interaction.customId.startsWith("client_select:")) {
    const [, mode, category] = interaction.customId.split(":");
    return handleClientSelection(client, interaction, mode || "private", category || null);
  }

  return false;
}

async function handleButton(client, interaction) {

  if (interaction.customId.startsWith('serenity:rolemenu:')) {
    const [, , menuId, optionIndex] = interaction.customId.split(':');
    return toggleRoleFromMenu(interaction, menuId, optionIndex);
  }

  if (interaction.customId.startsWith('serenity:ticket:create:')) {
    const [, , , panelId] = interaction.customId.split(':');
    return createTicketFromPanel(interaction, panelId);
  }

  if (interaction.customId.startsWith('serenity:ticket:close:')) {
    return closeTicket(interaction);
  }

  if (interaction.customId.startsWith('serenity:ticket:claim:')) {
    return claimTicket(interaction);
  }

  if (interaction.customId.startsWith("browser_refresh:")) {
    const [, mode] = interaction.customId.split(":");
    return interaction.reply(await buildPrivateCategoryBrowserPayload(client, interaction, mode || "private", makeInfoEmbed({
      title: `${brandEmoji()} Browser refreshed`,
      description: "A fresh private category browser has been generated for you.",
    })));
  }

  if (interaction.customId.startsWith("browser_back:")) {
    const [, mode] = interaction.customId.split(":");
    return interaction.reply(await buildPrivateCategoryBrowserPayload(client, interaction, mode || "private", makeInfoEmbed({
      title: `${brandEmoji()} Categories reopened`,
      description: "You are back at the private category browser.",
    })));
  }

  if (interaction.customId.startsWith("browser_reopen:")) {
    const [, mode, category] = interaction.customId.split(":");
    return interaction.reply(await buildPrivateClientMenuPayload(client, interaction, category, mode || "private", makeInfoEmbed({
      title: `${brandEmoji()} ${category}`,
      description: "A fresh private client menu has been regenerated for this category.",
      fields: [{ name: "Recovery", value: "Use the menu below or return to categories at any time." }],
    })));
  }

  return false;
}

module.exports = {
  buildPrivateCategoryBrowserPayload,
  buildPrivateClientMenuPayload,
  buildPublicPanelMessage,
  handleButton,
  handleCategorySelection,
  handleClientSelection,
  handleStringSelect,
  resolveSendableInteractionChannel,
  sendPrivateClientPanel,
};
