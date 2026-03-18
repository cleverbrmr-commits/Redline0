const { Colors } = require("discord.js");
const { loadEmbedsRaw, saveEmbedsRaw } = require("../storage/embedsStore");
const { BRAND, slugify, trimText } = require("../utils/helpers");
const { makeEmbed } = require("../utils/embeds");

async function loadEmbedStore() {
  return loadEmbedsRaw({});
}

async function saveEmbedStore(store) {
  await saveEmbedsRaw(store);
}

function parseColorValue(input) {
  if (!input) return null;
  const value = String(input).trim();
  const normalized = value.startsWith("#") ? value : `#${value}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : null;
}

function parseEmbedFieldsInput(raw) {
  if (!raw) return [];
  return String(raw)
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, value, inlineRaw] = entry.split("|").map((part) => part?.trim?.() || "");
      if (!name || !value) return null;
      const inline = ["1", "true", "yes", "y"].includes(String(inlineRaw || "").toLowerCase());
      return {
        name: trimText(name, 256),
        value: trimText(value, 1024),
        inline,
      };
    })
    .filter(Boolean)
    .slice(0, 25);
}

function renderCustomEmbed(record) {
  const color = parseColorValue(record.color);
  return makeEmbed({
    title: record.title,
    description: record.description,
    color: color || Colors.Blurple,
    footer: record.footer || BRAND.footer,
    author: record.author || null,
    thumbnail: record.thumbnail || null,
    image: record.image || null,
    fields: Array.isArray(record.fields) ? record.fields : [],
    timestamp: record.timestamp !== false,
  });
}

function findSavedEmbedKey(store, nameInput) {
  const slug = slugify(nameInput);
  if (slug && store[slug]) return slug;
  return Object.keys(store).find((key) => key === nameInput || (store[key].name || "").toLowerCase() === String(nameInput || "").toLowerCase()) || null;
}

function toAutocompleteList(entries, focused) {
  const needle = String(focused || "").toLowerCase();
  return entries
    .filter((entry) => entry.name.toLowerCase().includes(needle) || entry.value.toLowerCase().includes(needle))
    .slice(0, 25);
}

function getEmbedAutocompleteChoices(store, focused) {
  return toAutocompleteList(
    Object.entries(store).map(([key, entry]) => ({
      name: trimText(entry.name || key, 100),
      value: key,
    })),
    focused
  );
}

module.exports = {
  findSavedEmbedKey,
  getEmbedAutocompleteChoices,
  loadEmbedStore,
  parseColorValue,
  parseEmbedFieldsInput,
  renderCustomEmbed,
  saveEmbedStore,
  toAutocompleteList,
};
