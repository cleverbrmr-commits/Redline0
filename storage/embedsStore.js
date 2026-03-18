const fsp = require("fs/promises");
const path = require("path");

const EMBEDS_FILE = path.join(__dirname, "..", "embeds.json");

async function ensureEmbedsStore() {
  try {
    await fsp.access(EMBEDS_FILE);
  } catch {
    await fsp.writeFile(EMBEDS_FILE, "{}", "utf8");
  }
}

async function loadEmbedsRaw(fallback = {}) {
  try {
    const raw = await fsp.readFile(EMBEDS_FILE, "utf8");
    return JSON.parse(raw || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

async function saveEmbedsRaw(store) {
  await fsp.writeFile(EMBEDS_FILE, JSON.stringify(store, null, 2), "utf8");
}

module.exports = {
  EMBEDS_FILE,
  ensureEmbedsStore,
  loadEmbedsRaw,
  saveEmbedsRaw,
};
