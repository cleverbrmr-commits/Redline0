require("dotenv").config();

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ChannelType,
  Colors,
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const DATA_FILE = path.join(__dirname, "modules.json");
const PRISON_FILE = path.join(__dirname, "prison-state.json");
const UPLOADS_DIR = path.join(__dirname, "uploads");
const BACKUPS_DIR = path.join(__dirname, "backups");
const PRISON_ROLE_NAME = "Prisoner";
const DOWNLOAD_COOLDOWN_MS = 8000;
const MAX_MENU_OPTIONS = 25;

const CATEGORY_OPTIONS = ["Utility", "PvP", "Visual", "Performance", "Beta"];
const VISIBILITY_OPTIONS = ["public", "hidden"];
const STATUS_OPTIONS = ["Stable", "Testing", "Deprecated", "Hotfix"];

const BRAND = {
  name: "REDLINE CLIENT HUB",
  footer: "REDLINE • Clean drops. Fast access.",
  emojiPool: ["🔥", "⚡", "🩸", "🧨", "🚀", "🛠️"],
  colors: [
    Colors.Red,
    Colors.DarkRed,
    Colors.OrangeRed,
    Colors.Gold,
    Colors.Blurple,
    Colors.DarkButNotBlack,
  ],
};

const downloadCooldowns = new Map();

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function brandColor() {
  return pick(BRAND.colors);
}

function brandEmoji() {
  return pick(BRAND.emojiPool);
}

function prettyError(err) {
  return err?.message || "Something went wrong.";
}

function validateEnv() {
  const required = ["DISCORD_TOKEN", "CLIENT_ID", "GUILD_ID"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function trimText(str, max = 100) {
  const text = String(str || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function normalizeCategory(value) {
  return CATEGORY_OPTIONS.find((entry) => entry.toLowerCase() === String(value || "").toLowerCase()) || "Utility";
}

function normalizeVisibility(value) {
  const found = VISIBILITY_OPTIONS.find((entry) => entry === String(value || "").toLowerCase());
  return found || "public";
}

function normalizeStatus(value) {
  return STATUS_OPTIONS.find((entry) => entry.toLowerCase() === String(value || "").toLowerCase()) || "Stable";
}

function parseRoleId(raw) {
  if (!raw) return null;
  const match = String(raw).match(/\d{16,20}/);
  return match ? match[0] : null;
}

function formatRoleMention(roleId) {
  return roleId ? `<@&${roleId}>` : "Everyone eligible";
}

function resolveModulePath(mod) {
  if (mod?.storedFileName) return path.join(UPLOADS_DIR, mod.storedFileName);
  if (mod?.filePath) return mod.filePath;
  return null;
}


function getStoredFileNameForKey(key, originalName, fallbackExt = ".jar") {
  const ext = path.extname(originalName || "") || fallbackExt;
  return `${key}${ext}`;
}

function buildClientAttachment(mod, filePath) {
  return new AttachmentBuilder(filePath, {
    name: mod.originalName || path.basename(filePath),
  });
}

function makeEmbed({ title, description, color, fields, footer }) {
  const embed = new EmbedBuilder()
    .setColor(color || brandColor())
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: footer || BRAND.footer })
    .setTimestamp();

  if (Array.isArray(fields) && fields.length) {
    embed.addFields(fields);
  }

  return embed;
}

function canActOn(actorMember, targetMember) {
  if (!actorMember || !targetMember) return false;
  if (actorMember.id === targetMember.id) return false;
  if (targetMember.id === targetMember.guild.ownerId) return false;
  return actorMember.roles.highest.position > targetMember.roles.highest.position;
}

function extractRoleIds(member) {
  if (!member) return new Set();
  if (member.roles?.cache) return new Set(member.roles.cache.keys());
  if (Array.isArray(member.roles)) return new Set(member.roles);
  if (Array.isArray(member.roleIds)) return new Set(member.roleIds);
  return new Set();
}

function memberHasRoleAccess(member, mod) {
  if (!mod.accessRoleId) return true;
  return extractRoleIds(member).has(mod.accessRoleId);
}

function isVisibleToMember(member, mod) {
  const visibility = normalizeVisibility(mod.visibility);
  const hasRoleAccess = memberHasRoleAccess(member, mod);

  if (visibility === "hidden") {
    return hasRoleAccess && !!mod.accessRoleId;
  }

  return hasRoleAccess;
}

async function resolveInteractionContext(i) {
  const guild = i.guild || (i.guildId ? await client.guilds.fetch(i.guildId).catch(() => null) : null);
  const actorMember = guild ? await guild.members.fetch(i.user.id).catch(() => null) : null;
  const botMember = guild ? await guild.members.fetchMe().catch(() => null) : null;
  return { guild, actorMember, botMember };
}

function normalizeModuleRecord(key, value) {
  const originalName = value.originalName || value.label || `${key}.jar`;
  const ext = path.extname(originalName) || path.extname(value.storedFileName || "") || ".jar";
  const storedFileName = value.storedFileName || `${key}${ext}`;

  return {
    label: value.label || key,
    description: value.description || "Ready to deploy",
    storedFileName,
    originalName,
    uploadedAt: value.uploadedAt || new Date().toISOString(),
    category: normalizeCategory(value.category),
    visibility: normalizeVisibility(value.visibility),
    accessRoleId: parseRoleId(value.accessRoleId),
    version: value.version || "Unknown",
    loader: value.loader || "Unknown",
    mcVersion: value.mcVersion || value.mc_version || "Unknown",
    status: normalizeStatus(value.status),
    changelog: value.changelog || "No changelog yet.",
  };
}

async function ensureStorage() {
  await fsp.mkdir(UPLOADS_DIR, { recursive: true });
  await fsp.mkdir(BACKUPS_DIR, { recursive: true });

  try {
    await fsp.access(DATA_FILE);
  } catch {
    await fsp.writeFile(DATA_FILE, "{}", "utf8");
  }

  try {
    await fsp.access(PRISON_FILE);
  } catch {
    await fsp.writeFile(PRISON_FILE, "{}", "utf8");
  }
}

async function loadJson(filePath, fallback = {}) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function loadModules() {
  const rawModules = await loadJson(DATA_FILE, {});
  const normalized = {};

  for (const [key, value] of Object.entries(rawModules)) {
    normalized[key] = normalizeModuleRecord(key, value || {});
  }

  return normalized;
}

async function saveModules(modules) {
  await writeJson(DATA_FILE, modules);
}

async function loadPrisonState() {
  return loadJson(PRISON_FILE, {});
}

async function savePrisonState(state) {
  await writeJson(PRISON_FILE, state);
}

async function downloadFile(url, destinationPath) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to download file: ${res.status} ${res.statusText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(destinationPath, buffer);
}

function getCooldownRemaining(userId) {
  const endsAt = downloadCooldowns.get(userId) || 0;
  return Math.max(0, endsAt - Date.now());
}

function setCooldown(userId) {
  downloadCooldowns.set(userId, Date.now() + DOWNLOAD_COOLDOWN_MS);
}

async function maybeLogEmbed(channelId, embed) {
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isTextBased()) {
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error("Log channel send failed:", err);
  }
}

async function logDownload(interaction, mod) {
  await maybeLogEmbed(
    process.env.DOWNLOAD_LOG_CHANNEL_ID,
    makeEmbed({
      title: "Download logged",
      description: `**${interaction.user.tag}** downloaded **${mod.label}**.`,
      color: Colors.Blurple,
      fields: [
        { name: "Client", value: trimText(mod.label, 100), inline: true },
        { name: "User", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Channel", value: interaction.channel ? `<#${interaction.channel.id}>` : "Unknown", inline: true },
        { name: "At", value: `<t:${Math.floor(Date.now() / 1000)}:F>` },
      ],
    })
  );
}

async function logPrison(_interaction, title, description, fields = [], color = Colors.DarkGrey) {
  await maybeLogEmbed(
    process.env.PRISON_LOG_CHANNEL_ID,
    makeEmbed({ title, description, fields, color })
  );
}

async function ensurePrisonRole(guild) {
  let role = guild.roles.cache.find((r) => r.name === PRISON_ROLE_NAME);

  if (!role) {
    role = await guild.roles.create({
      name: PRISON_ROLE_NAME,
      color: Colors.DarkGrey,
      permissions: [],
      reason: "Prison system initialization",
    });
  }

  const channels = guild.channels.cache.filter((ch) =>
    [
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.PublicThread,
      ChannelType.PrivateThread,
      ChannelType.GuildForum,
      ChannelType.GuildVoice,
      ChannelType.GuildStageVoice,
      ChannelType.GuildMedia,
    ].includes(ch.type)
  );

  for (const [, channel] of channels) {
    try {
      await channel.permissionOverwrites.edit(
        role,
        {
          SendMessages: false,
          AddReactions: false,
          SendMessagesInThreads: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
          Speak: false,
          Connect: false,
        },
        { reason: "Prison role channel restrictions" }
      );
    } catch (_) {}
  }

  return role;
}

function buildClientFields(mod) {
  return [
    { name: "Version", value: trimText(mod.version || "Unknown", 100), inline: true },
    { name: "Loader", value: trimText(mod.loader || "Unknown", 100), inline: true },
    { name: "MC Version", value: trimText(mod.mcVersion || "Unknown", 100), inline: true },
    { name: "Category", value: trimText(mod.category || "Utility", 100), inline: true },
    { name: "Status", value: trimText(mod.status || "Stable", 100), inline: true },
    { name: "Access", value: formatRoleMention(mod.accessRoleId), inline: true },
    { name: "Description", value: trimText(mod.description || "Ready to deploy", 1024) },
    { name: "Changelog", value: trimText(mod.changelog || "No changelog yet.", 1024) },
  ];
}

function getVisibleClientEntries(modules, member, category = null) {
  return Object.entries(modules).filter(([, mod]) => {
    if (category && mod.category !== category) return false;
    return isVisibleToMember(member, mod);
  });
}

function getVisibleCategories(modules, member) {
  return CATEGORY_OPTIONS.filter((category) => getVisibleClientEntries(modules, member, category).length > 0);
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

function buildClientActionRow(modules, member, category, customIdPrefix) {
  const visibleClients = getVisibleClientEntries(modules, member, category).slice(0, MAX_MENU_OPTIONS);

  if (!visibleClients.length) return null;

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${customIdPrefix}:${category}`)
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

function buildCategoryBrowserEmbed(visibleCategories, mode = "private") {
  const isPrivate = mode === "private";
  return makeEmbed({
    title: `${brandEmoji()} ${BRAND.name}`,
    description: isPrivate
      ? "Pick a category to browse clients. Your selections and downloads are only visible to you."
      : "Pick a category below. Everyone can see this panel, but each person gets private responses.",
    fields: [
      { name: "Visible Categories", value: String(visibleCategories.length), inline: true },
      { name: "Download Cooldown", value: `${DOWNLOAD_COOLDOWN_MS / 1000}s`, inline: true },
      { name: "Privacy", value: "Client selections + files are sent ephemerally.", inline: false },
    ],
  });
}

async function resolveSendableInteractionChannel(interaction) {
  if (!interaction.guildId || !interaction.channelId) return null;
  const targetChannel = interaction.channel || (await client.channels.fetch(interaction.channelId).catch(() => null));
  if (!targetChannel || typeof targetChannel.send !== "function") return null;
  return targetChannel;
}

async function sendPrivateClientPanel(interaction) {
  const { actorMember } = await resolveInteractionContext(interaction);
  const modules = await loadModules();
  const member = actorMember || interaction.member;
  const visibleCategories = getVisibleCategories(modules, member);
  const row = buildCategoryActionRow(visibleCategories, "client_category_select_private");

  if (!row) {
    return interaction.reply({
      embeds: [
        makeEmbed({
          title: `${brandEmoji()} ${BRAND.name}`,
          description: "No clients are visible to you right now.",
          fields: [
            { name: "Status", value: "No eligible client files found", inline: true },
            { name: "Hint", value: "Ask staff for access or upload a client", inline: true },
          ],
        }),
      ],
      ephemeral: true,
    });
  }

  return interaction.reply({
    embeds: [buildCategoryBrowserEmbed(visibleCategories, "private")],
    components: [row],
    ephemeral: true,
  });
}

function buildPublicPanelMessage(visibleCategories) {
  const row = buildCategoryActionRow(visibleCategories, "client_category_select_public");
  return {
    embeds: [buildCategoryBrowserEmbed(visibleCategories, "public")],
    components: row ? [row] : [],
  };
}

async function handleCategorySelection(interaction, mode) {
  const modules = await loadModules();
  const category = interaction.values[0];
  const { actorMember } = await resolveInteractionContext(interaction);
  const member = actorMember || interaction.member;
  const row = buildClientActionRow(modules, member, category, `client_select_${mode}`);

  if (!row) {
    return interaction.reply({
      embeds: [
        makeEmbed({
          title: "Nothing there",
          description: `No visible clients found in **${category}**.`,
          color: Colors.Orange,
        }),
      ],
      ephemeral: true,
    });
  }

  return interaction.reply({
    embeds: [
      makeEmbed({
        title: `${brandEmoji()} ${category}`,
        description: "Choose a client below to view metadata and privately download the file.",
        fields: [{ name: "Tip", value: "Status/loader/version are shown directly in the menu options." }],
        color: brandColor(),
      }),
    ],
    components: [row],
    ephemeral: true,
  });
}

async function handleClientSelection(interaction) {
  const remaining = getCooldownRemaining(interaction.user.id);
  if (remaining > 0) {
    return interaction.reply({
      embeds: [
        makeEmbed({
          title: "Slow down",
          description: `Download cooldown active. Try again in **${Math.ceil(remaining / 1000)}s**.`,
          color: Colors.Orange,
        }),
      ],
      ephemeral: true,
    });
  }

  const modules = await loadModules();
  const mod = modules[interaction.values[0]];

  if (!mod) {
    return interaction.reply({
      embeds: [makeEmbed({ title: "Download failed", description: "That client no longer exists.", color: Colors.Orange })],
      ephemeral: true,
    });
  }

  const { actorMember } = await resolveInteractionContext(interaction);
  const member = actorMember || interaction.member;

  if (!isVisibleToMember(member, mod)) {
    return interaction.reply({
      embeds: [makeEmbed({ title: "Access denied", description: "You do not have access to that client.", color: Colors.Orange })],
      ephemeral: true,
    });
  }

  const filePath = resolveModulePath(mod);
  if (!filePath || !fs.existsSync(filePath)) {
    return interaction.reply({
      embeds: [makeEmbed({ title: "Missing file", description: "The file for that client is missing from storage.", color: Colors.Orange })],
      ephemeral: true,
    });
  }

  setCooldown(interaction.user.id);
  const file = buildClientAttachment(mod, filePath);

  await logDownload(interaction, mod);

  return interaction.reply({
    embeds: [
      makeEmbed({
        title: `${brandEmoji()} ${mod.label}`,
        description: "Your client is attached below.",
        fields: buildClientFields(mod),
        color: Colors.Green,
      }),
    ],
    files: [file],
    ephemeral: true,
  });
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder().setName("clients").setDescription("Open the private client panel"),

    new SlashCommandBuilder()
      .setName("clientpanel")
      .setDescription("Client panel tools")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((sub) =>
        sub.setName("send").setDescription("Send the public client panel")
      ),

    new SlashCommandBuilder()
      .setName("upload")
      .setDescription("Upload a client file and add it to /clients")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((o) => o.setName("name").setDescription("Client name").setRequired(true))
      .addAttachmentOption((o) => o.setName("file").setDescription("Client file").setRequired(true))
      .addStringOption((o) => o.setName("description").setDescription("Short description"))
      .addStringOption((o) =>
        o.setName("category").setDescription("Client category").addChoices(...CATEGORY_OPTIONS.map((v) => ({ name: v, value: v })))
      )
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
      .addStringOption((o) =>
        o.setName("status").setDescription("Release state").addChoices(...STATUS_OPTIONS.map((v) => ({ name: v, value: v })))
      )
      .addStringOption((o) => o.setName("changelog").setDescription("Short changelog snippet")),

    new SlashCommandBuilder()
      .setName("removeclient")
      .setDescription("Remove a client and delete its stored file")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((o) => o.setName("name").setDescription("Client name or key").setRequired(true)),

    new SlashCommandBuilder()
      .setName("editclient")
      .setDescription("Edit client metadata without re-uploading")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((o) => o.setName("name").setDescription("Existing client name or key").setRequired(true))
      .addStringOption((o) => o.setName("new_name").setDescription("New display name"))
      .addStringOption((o) => o.setName("description").setDescription("New description"))
      .addStringOption((o) =>
        o.setName("category").setDescription("New category").addChoices(...CATEGORY_OPTIONS.map((v) => ({ name: v, value: v })))
      )
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
      .addStringOption((o) =>
        o.setName("status").setDescription("Release state").addChoices(...STATUS_OPTIONS.map((v) => ({ name: v, value: v })))
      )
      .addStringOption((o) => o.setName("changelog").setDescription("Changelog snippet")),

    new SlashCommandBuilder()
      .setName("announceclient")
      .setDescription("Post a polished announcement for an existing client")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((o) => o.setName("name").setDescription("Client name or key").setRequired(true))
      .addStringOption((o) => o.setName("highlights").setDescription("Extra highlights for the release")),

    new SlashCommandBuilder()
      .setName("exportclients")
      .setDescription("Export the current client metadata")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName("backup")
      .setDescription("Create a JSON backup snapshot")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName("kick")
      .setDescription("Kick a member from the server")
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .addUserOption((o) => o.setName("user").setDescription("Member to kick").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Why they are being kicked")),

    new SlashCommandBuilder()
      .setName("ban")
      .setDescription("Ban a member from the server")
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption((o) => o.setName("user").setDescription("Member to ban").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Why they are being banned"))
      .addIntegerOption((o) =>
        o.setName("delete_days").setDescription("Delete up to 7 days of message history").setMinValue(0).setMaxValue(7)
      ),

    new SlashCommandBuilder()
      .setName("prison")
      .setDescription("Lock a member from sending messages until released")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption((o) => o.setName("user").setDescription("Member to imprison").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Why they were imprisoned")),

    new SlashCommandBuilder()
      .setName("unprison")
      .setDescription("Release a member from prison")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption((o) => o.setName("user").setDescription("Member to release").setRequired(true))
      .addStringOption((o) => o.setName("note").setDescription("Optional release note")),

    new SlashCommandBuilder()
      .setName("prisonlist")
      .setDescription("Show currently imprisoned members")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
      .setName("prisonreason")
      .setDescription("Show the stored prison reason for a user")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption((o) => o.setName("user").setDescription("Member to inspect").setRequired(true)),

    new SlashCommandBuilder()
      .setName("announce")
      .setDescription("Send a styled announcement and ping everyone")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((o) => o.setName("title").setDescription("Announcement title").setRequired(true))
      .addStringOption((o) => o.setName("message").setDescription("Announcement body").setRequired(true)),
  ].map((c) => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
    body: commands,
  });
}

function findClientKey(modules, query) {
  const raw = String(query || "").trim();
  if (!raw) return null;

  const directKey = slugify(raw);
  if (modules[directKey]) return directKey;

  const found = Object.entries(modules).find(([, mod]) => String(mod.label).toLowerCase() === raw.toLowerCase());
  return found ? found[0] : null;
}

client.once(Events.ClientReady, async () => {
  try {
    validateEnv();
    await ensureStorage();
    await registerCommands();
    console.log(`Logged in as ${client.user.tag}`);
    console.log("Bot ready");
  } catch (err) {
    console.error("Startup error:", err);
  }
});

client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isChatInputCommand()) {
      if (i.commandName === "clients") {
        return await sendPrivateClientPanel(i);
      }

      if (i.commandName === "clientpanel") {
        const subcommand = i.options.getSubcommand();

        if (subcommand === "send") {
          const targetChannel = await resolveSendableInteractionChannel(i);

          if (!targetChannel) {
            return i.reply({
              embeds: [
                makeEmbed({
                  title: "Send failed",
                  description: "Use this inside a server channel where I can send messages.",
                  color: Colors.Orange,
                }),
              ],
              ephemeral: true,
            });
          }

          const modules = await loadModules();
          const { actorMember } = await resolveInteractionContext(i);
          const member = actorMember || i.member;
          const visibleCategories = getVisibleCategories(modules, member);

          if (!visibleCategories.length) {
            return i.reply({
              embeds: [
                makeEmbed({
                  title: "Panel not sent",
                  description: "No categories are currently visible from your access scope.",
                  color: Colors.Orange,
                }),
              ],
              ephemeral: true,
            });
          }

          await targetChannel.send(buildPublicPanelMessage(visibleCategories));

          return i.reply({
            embeds: [
              makeEmbed({
                title: `${brandEmoji()} Panel sent`,
                description: `Public client panel posted in <#${targetChannel.id}>.`,
                color: Colors.Green,
              }),
            ],
            ephemeral: true,
          });
        }
      }

      if (i.commandName === "upload") {
        const name = i.options.getString("name", true);
        const file = i.options.getAttachment("file", true);
        const description = i.options.getString("description") || "Ready to deploy";
        const category = normalizeCategory(i.options.getString("category") || "Utility");
        const visibility = normalizeVisibility(i.options.getString("visibility") || "public");
        const accessRole = i.options.getRole("accessrole");
        const version = i.options.getString("version") || "Unknown";
        const loader = i.options.getString("loader") || "Unknown";
        const mcVersion = i.options.getString("mc_version") || "Unknown";
        const status = normalizeStatus(i.options.getString("status") || "Stable");
        const changelog = i.options.getString("changelog") || "No changelog yet.";

        await i.deferReply({ ephemeral: true });

        const key = slugify(name);
        if (!key) {
          return i.editReply({
            embeds: [makeEmbed({ title: "Upload blocked", description: "That client name turns into an invalid key.", color: Colors.Orange })],
          });
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

        return i.editReply({
          embeds: [
            makeEmbed({
              title: `${brandEmoji()} Client uploaded`,
              description: `**${name}** is now live in \`/clients\`.`,
              fields: [
                { name: "File", value: trimText(originalName, 100), inline: true },
                { name: "Category", value: category, inline: true },
                { name: "Access", value: formatRoleMention(accessRole?.id || null), inline: true },
              ],
              color: Colors.Green,
            }),
          ],
        });
      }

      if (i.commandName === "removeclient") {
        const modules = await loadModules();
        const query = i.options.getString("name", true);
        const key = findClientKey(modules, query);

        if (!key) {
          return i.reply({
            embeds: [makeEmbed({ title: "Remove failed", description: "That client could not be found.", color: Colors.Orange })],
            ephemeral: true,
          });
        }

        const mod = modules[key];
        const filePath = resolveModulePath(mod);

        if (filePath) {
          await fsp.rm(filePath, { force: true }).catch(() => null);
        }

        delete modules[key];
        await saveModules(modules);

        return i.reply({
          embeds: [makeEmbed({ title: `${brandEmoji()} Client removed`, description: `**${mod.label}** was removed from the panel and storage.`, color: Colors.Green })],
          ephemeral: true,
        });
      }

      if (i.commandName === "editclient") {
        const modules = await loadModules();
        const query = i.options.getString("name", true);
        const oldKey = findClientKey(modules, query);

        if (!oldKey) {
          return i.reply({
            embeds: [makeEmbed({ title: "Edit failed", description: "That client could not be found.", color: Colors.Orange })],
            ephemeral: true,
          });
        }

        const mod = { ...modules[oldKey] };
        const newName = i.options.getString("new_name");
        const description = i.options.getString("description");
        const category = i.options.getString("category");
        const visibility = i.options.getString("visibility");
        const accessRole = i.options.getRole("accessrole");
        const clearAccessRole = i.options.getBoolean("clear_accessrole");
        const version = i.options.getString("version");
        const loader = i.options.getString("loader");
        const mcVersion = i.options.getString("mc_version");
        const status = i.options.getString("status");
        const changelog = i.options.getString("changelog");

        if (newName) mod.label = newName;
        if (description) mod.description = description;
        if (category) mod.category = normalizeCategory(category);
        if (visibility) mod.visibility = normalizeVisibility(visibility);
        if (accessRole) mod.accessRoleId = accessRole.id;
        if (clearAccessRole) mod.accessRoleId = null;
        if (version) mod.version = version;
        if (loader) mod.loader = loader;
        if (mcVersion) mod.mcVersion = mcVersion;
        if (status) mod.status = normalizeStatus(status);
        if (changelog) mod.changelog = changelog;

        let newKey = oldKey;
        if (newName) {
          const candidate = slugify(newName);
          if (!candidate) {
            return i.reply({
              embeds: [makeEmbed({ title: "Edit blocked", description: "That new name becomes an invalid key.", color: Colors.Orange })],
              ephemeral: true,
            });
          }
          newKey = candidate;
        }

        const originalPath = resolveModulePath(modules[oldKey]);
        const currentExt = path.extname(mod.originalName || "") || path.extname(mod.storedFileName || "") || ".jar";
        mod.storedFileName = getStoredFileNameForKey(newKey, mod.originalName, currentExt);
        const nextPath = path.join(UPLOADS_DIR, mod.storedFileName);

        if (originalPath && originalPath !== nextPath && fs.existsSync(originalPath)) {
          await fsp.rename(originalPath, nextPath);
        }

        delete modules[oldKey];
        modules[newKey] = normalizeModuleRecord(newKey, mod);
        await saveModules(modules);

        return i.reply({
          embeds: [makeEmbed({ title: `${brandEmoji()} Client updated`, description: `**${modules[newKey].label}** was updated successfully.`, color: Colors.Green })],
          ephemeral: true,
        });
      }

      if (i.commandName === "announceclient") {
        const modules = await loadModules();
        const query = i.options.getString("name", true);
        const highlights = i.options.getString("highlights") || "Fresh drop ready to use.";
        const key = findClientKey(modules, query);

        if (!key) {
          return i.reply({
            embeds: [makeEmbed({ title: "Announcement failed", description: "That client could not be found.", color: Colors.Orange })],
            ephemeral: true,
          });
        }

        const mod = modules[key];
        return i.reply({
          embeds: [
            makeEmbed({
              title: `${brandEmoji()} New release • ${mod.label}`,
              description: `${trimText(mod.description, 500)}\n\n**Highlights:** ${trimText(highlights, 700)}`,
              fields: [
                { name: "Version", value: trimText(mod.version, 100), inline: true },
                { name: "Loader", value: trimText(mod.loader, 100), inline: true },
                { name: "MC Version", value: trimText(mod.mcVersion, 100), inline: true },
                { name: "Status", value: trimText(mod.status, 100), inline: true },
                { name: "Access", value: formatRoleMention(mod.accessRoleId), inline: true },
                { name: "Get it", value: "Use `/clients` or the public panel to download it.", inline: true },
              ],
              color: Colors.Gold,
            }),
          ],
        });
      }

      if (i.commandName === "exportclients") {
        const modules = await loadModules();
        const exportPath = path.join(BACKUPS_DIR, `clients-export-${Date.now()}.json`);
        await writeJson(exportPath, modules);

        return i.reply({
          files: [new AttachmentBuilder(exportPath, { name: path.basename(exportPath) })],
          ephemeral: true,
        });
      }

      if (i.commandName === "backup") {
        const modules = await loadModules();
        const prisonState = await loadPrisonState();
        const backupPath = path.join(BACKUPS_DIR, `backup-${Date.now()}.json`);
        await writeJson(backupPath, { modules, prisonState, createdAt: new Date().toISOString() });

        return i.reply({
          files: [new AttachmentBuilder(backupPath, { name: path.basename(backupPath) })],
          ephemeral: true,
        });
      }

      if (i.commandName === "kick") {
        const { guild, actorMember } = await resolveInteractionContext(i);
        if (!guild || !actorMember) {
          return i.reply({ embeds: [makeEmbed({ title: "Kick failed", description: "Guild context was unavailable. Try again in a second.", color: Colors.Orange })], ephemeral: true });
        }

        const user = i.options.getUser("user", true);
        const reason = i.options.getString("reason") || "No reason provided";
        const member = await guild.members.fetch(user.id).catch(() => null);

        if (!member) {
          return i.reply({ embeds: [makeEmbed({ title: "Kick failed", description: "That user is not in this server.", color: Colors.Orange })], ephemeral: true });
        }

        if (!canActOn(actorMember, member) || !member.kickable) {
          return i.reply({ embeds: [makeEmbed({ title: "Kick denied", description: "You or the bot are below that member in the role stack.", color: Colors.Orange })], ephemeral: true });
        }

        await member.kick(reason);

        return i.reply({ embeds: [makeEmbed({ title: `${brandEmoji()} Member kicked`, description: `**${user.tag}** was kicked.`, fields: [{ name: "Reason", value: trimText(reason, 1024) }], color: Colors.Red })] });
      }

      if (i.commandName === "ban") {
        const { guild, actorMember } = await resolveInteractionContext(i);
        if (!guild || !actorMember) {
          return i.reply({ embeds: [makeEmbed({ title: "Ban failed", description: "Guild context was unavailable. Try again in a second.", color: Colors.Orange })], ephemeral: true });
        }

        const user = i.options.getUser("user", true);
        const reason = i.options.getString("reason") || "No reason provided";
        const deleteDays = i.options.getInteger("delete_days") || 0;
        const member = await guild.members.fetch(user.id).catch(() => null);

        if (member && (!canActOn(actorMember, member) || !member.bannable)) {
          return i.reply({ embeds: [makeEmbed({ title: "Ban denied", description: "You or the bot are below that member in the role stack.", color: Colors.Orange })], ephemeral: true });
        }

        await guild.members.ban(user.id, {
          reason,
          deleteMessageSeconds: deleteDays * 86400,
        });

        return i.reply({ embeds: [makeEmbed({ title: `${brandEmoji()} Member banned`, description: `**${user.tag}** was banned.`, fields: [{ name: "Reason", value: trimText(reason, 1024) }], color: Colors.DarkRed })] });
      }

      if (i.commandName === "prison") {
        const { guild, actorMember, botMember } = await resolveInteractionContext(i);
        if (!guild || !actorMember || !botMember) {
          return i.reply({ embeds: [makeEmbed({ title: "Prison failed", description: "Guild context was unavailable. Try again in a second.", color: Colors.Orange })], ephemeral: true });
        }

        const user = i.options.getUser("user", true);
        const reason = i.options.getString("reason") || "No reason provided";
        const member = await guild.members.fetch(user.id).catch(() => null);

        if (!member) {
          return i.reply({ embeds: [makeEmbed({ title: "Prison failed", description: "That user is not in this server.", color: Colors.Orange })], ephemeral: true });
        }

        if (!canActOn(actorMember, member)) {
          return i.reply({ embeds: [makeEmbed({ title: "Prison denied", description: "You cannot prison someone above or equal to you in the role stack.", color: Colors.Orange })], ephemeral: true });
        }

        const prisonRole = await ensurePrisonRole(guild);
        if (prisonRole.position >= botMember.roles.highest.position) {
          return i.reply({ embeds: [makeEmbed({ title: "Prison setup blocked", description: "Move the bot role above the Prisoner role, then try again.", color: Colors.Orange })], ephemeral: true });
        }

        const removableRoleIds = member.roles.cache
          .filter((role) => role.id !== guild.id && role.id !== prisonRole.id && role.position < botMember.roles.highest.position)
          .map((role) => role.id);

        if (removableRoleIds.length) {
          await member.roles.remove(removableRoleIds, "Roles removed during prison");
        }

        await member.roles.add(prisonRole, reason);

        const prisonState = await loadPrisonState();
        prisonState[member.id] = {
          reason,
          by: i.user.id,
          at: new Date().toISOString(),
          removedRoleIds: removableRoleIds,
        };
        await savePrisonState(prisonState);

        await logPrison(
          i,
          "Prison applied",
          `**${user.tag}** was imprisoned.`,
          [
            { name: "Reason", value: trimText(reason, 1024) },
            { name: "Roles removed", value: removableRoleIds.length ? removableRoleIds.map((id) => `<@&${id}>`).join(", ") : "None" },
          ]
        );

        return i.reply({ embeds: [makeEmbed({ title: `${brandEmoji()} Prisoned`, description: `**${user.tag}** has been locked down until released.`, fields: [{ name: "Reason", value: trimText(reason, 1024) }, { name: "Role", value: prisonRole.name, inline: true }], color: Colors.DarkGrey })] });
      }

      if (i.commandName === "unprison") {
        const { guild, botMember } = await resolveInteractionContext(i);
        if (!guild || !botMember) {
          return i.reply({ embeds: [makeEmbed({ title: "Release failed", description: "Guild context was unavailable. Try again in a second.", color: Colors.Orange })], ephemeral: true });
        }

        const user = i.options.getUser("user", true);
        const note = i.options.getString("note") || "No release note provided";
        const member = await guild.members.fetch(user.id).catch(() => null);
        const prisonRole = guild.roles.cache.find((r) => r.name === PRISON_ROLE_NAME);

        if (!member || !prisonRole) {
          return i.reply({ embeds: [makeEmbed({ title: "Release failed", description: "That member or the Prisoner role could not be found.", color: Colors.Orange })], ephemeral: true });
        }

        await member.roles.remove(prisonRole, "Released from prison");

        const prisonState = await loadPrisonState();
        const record = prisonState[member.id];
        const restoreRoleIds = (record?.removedRoleIds || []).filter((roleId) => {
          const role = guild.roles.cache.get(roleId);
          return role && role.position < botMember.roles.highest.position;
        });

        if (restoreRoleIds.length) {
          await member.roles.add(restoreRoleIds, "Roles restored after prison release");
        }

        delete prisonState[member.id];
        await savePrisonState(prisonState);

        await logPrison(
          i,
          "Prison released",
          `**${user.tag}** was released from prison.`,
          [
            { name: "Release note", value: trimText(note, 1024) },
            { name: "Roles restored", value: restoreRoleIds.length ? restoreRoleIds.map((id) => `<@&${id}>`).join(", ") : "None" },
          ],
          Colors.Green
        );

        return i.reply({ embeds: [makeEmbed({ title: `${brandEmoji()} Released`, description: `**${user.tag}** is no longer imprisoned.`, fields: [{ name: "Release note", value: trimText(note, 1024) }], color: Colors.Green })] });
      }

      if (i.commandName === "prisonlist") {
        const prisonState = await loadPrisonState();
        const entries = Object.entries(prisonState);

        if (!entries.length) {
          return i.reply({ embeds: [makeEmbed({ title: "Prison list", description: "Nobody is currently imprisoned.", color: Colors.Green })], ephemeral: true });
        }

        const lines = entries.slice(0, 20).map(([userId, record]) => `• <@${userId}> — ${trimText(record.reason, 80)} — <t:${Math.floor(new Date(record.at).getTime() / 1000)}:R>`);
        return i.reply({ embeds: [makeEmbed({ title: "Prison list", description: lines.join("\n"), color: Colors.DarkGrey })], ephemeral: true });
      }

      if (i.commandName === "prisonreason") {
        const user = i.options.getUser("user", true);
        const prisonState = await loadPrisonState();
        const record = prisonState[user.id];

        if (!record) {
          return i.reply({ embeds: [makeEmbed({ title: "No prison record", description: `No active prison record found for **${user.tag}**.`, color: Colors.Orange })], ephemeral: true });
        }

        return i.reply({
          embeds: [makeEmbed({
            title: `Prison record • ${user.tag}`,
            description: trimText(record.reason, 1024),
            fields: [
              { name: "Imprisoned by", value: `<@${record.by}>`, inline: true },
              { name: "When", value: `<t:${Math.floor(new Date(record.at).getTime() / 1000)}:F>`, inline: true },
            ],
            color: Colors.DarkGrey,
          })],
          ephemeral: true,
        });
      }

      if (i.commandName === "announce") {
        const title = i.options.getString("title", true);
        const message = i.options.getString("message", true);

        const styles = [
          { prefix: "⚡ Breaking", footer: "REDLINE • Announcement Drop", color: Colors.Red },
          { prefix: "🔥 Live Update", footer: "REDLINE • Signal Boosted", color: Colors.OrangeRed },
          { prefix: "🚀 Heads Up", footer: "REDLINE • Server Broadcast", color: Colors.Blurple },
          { prefix: "🩸 REDLINE Notice", footer: "REDLINE • Priority Broadcast", color: Colors.Gold },
        ];

        const style = pick(styles);
        return i.reply({
          content: "@everyone",
          allowedMentions: { parse: ["everyone"] },
          embeds: [makeEmbed({ title: `${style.prefix} • ${trimText(title, 220)}`, description: message, footer: style.footer, color: style.color })],
        });
      }
    }

    if (i.isStringSelectMenu()) {
      if (i.customId === "client_category_select_private") {
        return await handleCategorySelection(i, "private");
      }

      if (i.customId === "client_category_select_public") {
        return await handleCategorySelection(i, "public");
      }

      if (i.customId.startsWith("client_select_private:") || i.customId.startsWith("client_select_public:")) {
        return await handleClientSelection(i);
      }
    }
  } catch (err) {
    console.error("Interaction error:", err);

    const embed = makeEmbed({ title: "Operation failed", description: prettyError(err), color: Colors.Orange });

    if (i.deferred) {
      try {
        await i.editReply({ embeds: [embed] });
      } catch {}
    } else if (i.replied) {
      try {
        await i.followUp({ embeds: [embed], ephemeral: true });
      } catch {}
    } else {
      try {
        await i.reply({ embeds: [embed], ephemeral: true });
      } catch {}
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
