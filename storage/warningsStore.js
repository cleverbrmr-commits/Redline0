const fsp = require("fs/promises");
const path = require("path");

const WARNINGS_FILE = path.join(__dirname, "..", "warnings.json");

async function ensureWarningsStore() {
  try {
    await fsp.access(WARNINGS_FILE);
  } catch {
    await fsp.writeFile(WARNINGS_FILE, "{}", "utf8");
  }
}

async function loadWarningsRaw(fallback = {}) {
  try {
    const raw = await fsp.readFile(WARNINGS_FILE, "utf8");
    return JSON.parse(raw || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

async function saveWarningsRaw(warnings) {
  await fsp.writeFile(WARNINGS_FILE, JSON.stringify(warnings, null, 2), "utf8");
}

module.exports = {
  WARNINGS_FILE,
  ensureWarningsStore,
  loadWarningsRaw,
  saveWarningsRaw,
};
