const path = require("path");
const { AttachmentBuilder, Colors } = require("discord.js");

const CATEGORY_OPTIONS = ["Utility", "PvP", "Visual", "Performance", "Beta"];
const VISIBILITY_OPTIONS = ["public", "hidden"];
const STATUS_OPTIONS = ["Stable", "Testing", "Deprecated", "Hotfix"];
const SETTING_KEYS = ["downloadlog", "modlog", "prisonlog", "announcelog"];
const SETTING_MAP = {
  downloadlog: "downloadLogChannelId",
  modlog: "modLogChannelId",
  prisonlog: "prisonLogChannelId",
  announcelog: "announceLogChannelId",
};
const PRISON_ROLE_NAME = "Prisoner";
const DOWNLOAD_COOLDOWN_MS = 8000;
const MAX_MENU_OPTIONS = 25;

const BRAND = {
  name: "REDLINE CLIENT HUB",
  footer: "REDLINE • Redline secure delivery",
  emojiPool: ["🔥", "🩸", "⚠️", "🚨", "🛡️", "📦"],
  colors: [
    Colors.Red,
    Colors.DarkRed,
    Colors.DarkButNotBlack,
    Colors.DarkGrey,
  ],
};

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

function resolveModulePath(mod, uploadsDir) {
  if (mod?.storedFileName) return path.join(uploadsDir, mod.storedFileName);
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

async function resolveInteractionContext(client, interaction) {
  const guild = interaction.guild || (interaction.guildId ? await client.guilds.fetch(interaction.guildId).catch(() => null) : null);
  const actorMember = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
  const botMember = guild ? await guild.members.fetchMe().catch(() => null) : null;
  return { guild, actorMember, botMember };
}

async function resolveSendableChannel(client, channelId, fallbackChannel = null) {
  if (!channelId) return null;
  const channel = fallbackChannel?.id === channelId ? fallbackChannel : await client.channels.fetch(channelId).catch(() => null);
  if (!channel || typeof channel.send !== "function") return null;
  return channel;
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return "0s";
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours ? `${hours}h` : null, minutes ? `${minutes}m` : null, seconds ? `${seconds}s` : null].filter(Boolean).join(" ");
}

module.exports = {
  BRAND,
  CATEGORY_OPTIONS,
  DOWNLOAD_COOLDOWN_MS,
  MAX_MENU_OPTIONS,
  PRISON_ROLE_NAME,
  SETTING_KEYS,
  SETTING_MAP,
  STATUS_OPTIONS,
  VISIBILITY_OPTIONS,
  brandColor,
  brandEmoji,
  buildClientAttachment,
  formatDuration,
  formatRoleMention,
  getStoredFileNameForKey,
  normalizeCategory,
  normalizeStatus,
  normalizeVisibility,
  parseRoleId,
  pick,
  prettyError,
  resolveInteractionContext,
  resolveModulePath,
  resolveSendableChannel,
  slugify,
  trimText,
  validateEnv,
};
