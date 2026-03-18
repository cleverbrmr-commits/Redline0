const fsp = require("fs/promises");
const path = require("path");

const CONFIG_FILE = path.join(__dirname, "..", "config.json");

async function ensureConfigStore(defaultConfig) {
  try {
    await fsp.access(CONFIG_FILE);
  } catch {
    await fsp.writeFile(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), "utf8");
  }
}

async function loadConfigRaw(fallback = {}) {
  try {
    const raw = await fsp.readFile(CONFIG_FILE, "utf8");
    return JSON.parse(raw || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

async function saveConfigRaw(config) {
  await fsp.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

module.exports = {
  CONFIG_FILE,
  ensureConfigStore,
  loadConfigRaw,
  saveConfigRaw,
};
