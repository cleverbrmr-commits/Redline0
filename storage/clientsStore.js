const fsp = require("fs/promises");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "modules.json");
const PRISON_FILE = path.join(__dirname, "..", "prison-state.json");
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
const BACKUPS_DIR = path.join(__dirname, "..", "backups");

async function ensureClientsStore() {
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

async function loadModulesRaw() {
  return loadJson(DATA_FILE, {});
}

async function saveModulesRaw(modules) {
  await writeJson(DATA_FILE, modules);
}

async function loadPrisonState() {
  return loadJson(PRISON_FILE, {});
}

async function savePrisonState(state) {
  await writeJson(PRISON_FILE, state);
}

module.exports = {
  BACKUPS_DIR,
  DATA_FILE,
  PRISON_FILE,
  UPLOADS_DIR,
  ensureClientsStore,
  loadJson,
  loadModulesRaw,
  loadPrisonState,
  saveModulesRaw,
  savePrisonState,
  writeJson,
};
