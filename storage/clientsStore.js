const fsp = require("fs/promises");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "modules.json");
const PRISON_FILE = path.join(__dirname, "..", "prison-state.json");
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
const BACKUPS_DIR = path.join(__dirname, "..", "backups");

let ensurePromise = null;

async function ensureFile(filePath, fallbackContents = "{}") {
  try {
    await fsp.access(filePath);
  } catch {
    await fsp.writeFile(filePath, fallbackContents, "utf8");
  }
}

async function ensureClientsStore() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await fsp.mkdir(UPLOADS_DIR, { recursive: true });
      await fsp.mkdir(BACKUPS_DIR, { recursive: true });
      await ensureFile(DATA_FILE, "{}");
      await ensureFile(PRISON_FILE, "{}");
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }

  return ensurePromise;
}

async function loadJson(filePath, fallback = {}) {
  await ensureClientsStore();

  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await ensureClientsStore();

  const tempPath = `${filePath}.tmp`;
  await fsp.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fsp.rename(tempPath, filePath);
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
