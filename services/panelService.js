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
const { loadConfig } = require("./configService");
const { buildClientFields, getVisibleCategories, getVisibleClientEntries, loadModules } = require("./clientService");
const { logDownload } = require("./logService");
const { makeEmbed, makeInfoEmbed, makeSuccessEmbed } = require("../utils/embeds");
const {
  BRAND,
  DOWNLOAD_COOLDOWN_MS,
  MAX_MENU_OPTIONS,
  brandColor,
  brandEmoji,
  buildClientAttachment,
  formatDuration,
  resolveInteractionContext,
  resolveModulePath,
  resolveSendableChannel,
  trimText,
} = require("../utils/helpers");
const { isVisibleToMember } = require("../utils/permissions");

const downloadCooldowns = new Map();
const IDS = {
  category: (mode) => `clients:category:${mode}`,
  item: (mode, category) => `clients:item:${mode}:${category}`,
  refresh: (mode) => `clients:refresh:${mode}`,
  back: (mode) => `clients:back:${mode}`,
  reopen: (mode, category) => `clients:reopen:${mode}:${category}`,
};

async function getCooldownMs() {
  const config = await loadConfig();
  return Number(config.defaultCooldowns?.clientsDownloadMs) || DOWNLOAD_COOLDOWN_MS;
}

function getCooldownRemaining(userId) {
  const endsAt = downloadCooldowns.get(userId) || 0;
  return Math.max(0, endsAt - Date.now());
}

function setCooldown(userId, cooldownMs) {
  downloadCooldowns.set(userId, Date.now() + cooldownMs);
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
    .setCustomId(IDS.item(mode, category))
    .setPlaceholder(`Choose a ${category} client...`)
    .addOptions(
      visibleClients.map(([key, mod]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(trimText(mod.label, 100))
          .setValue(key)
          .setDescription(trimText(`${mod.version} • ${mod.loader} • ${mod.status}`, 100))
      )
    );

  return new ActionRowBuilder().addComponents(menu);
}

function buildBrowserNavigationRow(mode, category = null) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(IDS.refresh(mode)).setLabel("Refresh Browser").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(IDS.back(mode)).setLabel("Back to Categories").setStyle(ButtonStyle.Primary)
  );

  if (category) {
    row.addComponents(new ButtonBuilder().setCustomId(IDS.reopen(mode, category)).setLabel("Reopen Category").setStyle(ButtonStyle.Danger));
  }

  return row;
}

async function buildCategoryBrowserEmbed(visibleCategories, mode = "private") {
  const cooldownMs = await getCooldownMs();
  const isPrivate = mode === "private";

  if (isPrivate) {
    return makeInfoEmbed({
      title: `${brandEmoji()} ${BRAND.name}`,
      description: "Browse by category, then pick a client to receive metadata and files privately.",
      fields: [
        { name: "Categories", value: String(visibleCategories.length), inline: true },
        { name: "Cooldown", value: formatDuration(cooldownMs), inline: true },
        { name: "Privacy", value: "Every client result is returned ephemerally to you only.", inline: false },
      ],
    });
  }

  return makeEmbed({
    title: `🩸 ${BRAND.name}`,
    description: "Use the menu below to open a private client browser. Restricted items stay private and role-gated.",
    color: Colors.DarkRed,
    fields: [
      { name: "Access", value: "Role and permission checks are enforced per user.", inline: true },
      { name: "Privacy", value: "Selections and downloads never post publicly.", inline: true },
      { name: "How it works", value: "Choose a category, then choose a client, and Redline delivers the result privately." },
    ],
  });
}

function buildCategorySelectionEmbed(category, clientCount) {
  return makeEmbed({
    title: `${brandEmoji()} ${category}`,
    description: "Choose a client below to view its metadata and receive the file privately.",
    fields: [
      { name: "Visible clients", value: String(clientCount), inline: true },
      { name: "Recovery", value: "Use Refresh or Back to Categories if Discord loses the previous ephemeral response.", inline: false },
    ],
    color: brandColor(),
  });
}

function buildRecoveryEmbed(title, description, category = null) {
  return makeInfoEmbed({
    title,
    description,
    fields: category ? [{ name: "Recovery", value: `Use Reopen Category to rebuild the ${category} menu.` }] : undefined,
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
  const row = buildCategoryActionRow(visibleCategories, IDS.category(mode));

  if (!row) {
    return {
      content: "No clients are visible to you right now.",
      embeds: extraEmbed ? [extraEmbed] : [],
      components: [buildBrowserNavigationRow(mode)],
      ephemeral: true,
    };
  }

  return {
    embeds: [extraEmbed || await buildCategoryBrowserEmbed(visibleCategories, "private")],
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
      recoveryEmbed || makeInfoEmbed({ title: `${brandEmoji()} Browser recovered`, description: "Category context was missing, so a fresh private browser was generated." })
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
        recoveryEmbed || buildRecoveryEmbed("Category unavailable", `The ${category} browser is stale or empty. Use the controls below to recover.`, category),
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

async function buildPublicPanelMessage(visibleCategories) {
  const row = buildCategoryActionRow(visibleCategories, IDS.category("public"));
  return {
    embeds: [await buildCategoryBrowserEmbed(visibleCategories, "public")],
    components: row ? [row] : [],
  };
}

async function ensureDeferred(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }
}

async function handleCategorySelection(client, interaction, mode) {
  await ensureDeferred(interaction);
  const category = interaction.values[0];
  return interaction.editReply(await buildPrivateClientMenuPayload(client, interaction, category, mode));
}

async function handleClientSelection(client, interaction, mode, category) {
  await ensureDeferred(interaction);

  if (!category) {
    return interaction.editReply(await buildPrivateCategoryBrowserPayload(client, interaction, mode, makeInfoEmbed({
      title: `${brandEmoji()} Browser recovered`,
      description: "That client menu lost category context, so a fresh private browser was generated.",
    })));
  }

  const remaining = getCooldownRemaining(interaction.user.id);
  if (remaining > 0) {
    return interaction.editReply({
      content: `Download cooldown active. Try again in ${formatDuration(remaining)}.`,
      embeds: [],
      components: [buildBrowserNavigationRow(mode, category)],
    });
  }

  const modules = await loadModules();
  const mod = modules[interaction.values[0]];

  if (!mod) {
    return interaction.editReply(await buildPrivateClientMenuPayload(client, interaction, category, mode, buildRecoveryEmbed("Download unavailable", "That client no longer exists. Open a fresh category browser below.", category)));
  }

  const { actorMember } = await resolveInteractionContext(client, interaction);
  const member = actorMember || interaction.member;

  if (!isVisibleToMember(member, mod)) {
    return interaction.editReply({
      content: "You no longer have access to that client.",
      embeds: [],
      components: [buildBrowserNavigationRow(mode, category)],
    });
  }

  const filePath = resolveModulePath(mod, UPLOADS_DIR);
  if (!filePath || !fs.existsSync(filePath)) {
    return interaction.editReply({
      content: "That client file is missing from storage.",
      embeds: [],
      components: [buildBrowserNavigationRow(mode, category)],
    });
  }

  const cooldownMs = await getCooldownMs();
  setCooldown(interaction.user.id, cooldownMs);
  const file = buildClientAttachment(mod, filePath);
  await logDownload(client, interaction, mod);

  return interaction.editReply({
    embeds: [
      makeSuccessEmbed({
        title: `${brandEmoji()} ${mod.label}`,
        description: "Your client is attached below.",
        fields: [...buildClientFields(mod)],
      }),
    ],
    files: [file],
    components: [buildBrowserNavigationRow(mode, category)],
  });
}

async function handleStringSelect(client, interaction) {
  if (interaction.customId.startsWith("clients:category:")) {
    const [, , mode] = interaction.customId.split(":");
    return handleCategorySelection(client, interaction, mode || "private");
  }

  if (interaction.customId.startsWith("clients:item:")) {
    const [, , mode, category] = interaction.customId.split(":");
    return handleClientSelection(client, interaction, mode || "private", category || null);
  }

  return false;
}

async function handleButton(client, interaction) {
  if (interaction.customId.startsWith("clients:refresh:")) {
    const [, , mode] = interaction.customId.split(":");
    await ensureDeferred(interaction);
    return interaction.editReply(await buildPrivateCategoryBrowserPayload(client, interaction, mode || "private", makeInfoEmbed({
      title: `${brandEmoji()} Browser refreshed`,
      description: "A fresh private category browser has been generated.",
    })));
  }

  if (interaction.customId.startsWith("clients:back:")) {
    const [, , mode] = interaction.customId.split(":");
    await ensureDeferred(interaction);
    return interaction.editReply(await buildPrivateCategoryBrowserPayload(client, interaction, mode || "private", makeInfoEmbed({
      title: `${brandEmoji()} Categories reopened`,
      description: "You are back at the private category browser.",
    })));
  }

  if (interaction.customId.startsWith("clients:reopen:")) {
    const [, , mode, category] = interaction.customId.split(":");
    await ensureDeferred(interaction);
    return interaction.editReply(await buildPrivateClientMenuPayload(client, interaction, category, mode || "private", makeInfoEmbed({
      title: `${brandEmoji()} ${category}`,
      description: "A fresh private client menu has been generated for this category.",
    })));
  }

  return false;
}

module.exports = {
  buildPrivateCategoryBrowserPayload,
  buildPrivateClientMenuPayload,
  buildPublicPanelMessage,
  handleButton,
  handleStringSelect,
  resolveSendableInteractionChannel,
  sendPrivateClientPanel,
};
