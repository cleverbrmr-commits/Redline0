const fsp = require("fs/promises");
const path = require("path");
const { UPLOADS_DIR, ensureClientsStore, loadModulesRaw, saveModulesRaw } = require("../storage/clientsStore");
const {
  CATEGORY_OPTIONS,
  formatRoleMention,
  getStoredFileNameForKey,
  normalizeCategory,
  normalizeStatus,
  normalizeVisibility,
  parseRoleId,
  resolveModulePath,
  slugify,
  trimText,
} = require("../utils/helpers");
const { isVisibleToMember } = require("../utils/permissions");

function normalizeModuleRecord(key, value) {
  const originalName = value.originalName || value.label || `${key}.jar`;
  const storedFileName = getStoredFileNameForKey(key, value.storedFileName || originalName);

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

async function loadModules() {
  await ensureClientsStore();

  const rawModules = await loadModulesRaw();
  const normalized = {};

  for (const [key, value] of Object.entries(rawModules)) {
    normalized[key] = normalizeModuleRecord(key, value || {});
  }

  return normalized;
}

async function saveModules(modules) {
  await ensureClientsStore();
  await saveModulesRaw(modules);
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

function findClientKey(modules, query) {
  const raw = String(query || "").trim();
  if (!raw) return null;

  const directKey = slugify(raw);
  if (modules[directKey]) return directKey;

  const found = Object.entries(modules).find(([, mod]) => String(mod.label).toLowerCase() === raw.toLowerCase());
  return found ? found[0] : null;
}

function getClientAutocompleteChoices(modules, focused) {
  const needle = String(focused || "").toLowerCase();
  return Object.entries(modules)
    .map(([key, mod]) => ({
      name: trimText(mod.label, 100),
      value: key,
    }))
    .filter((entry) => entry.name.toLowerCase().includes(needle) || entry.value.toLowerCase().includes(needle))
    .slice(0, 25);
}

async function removeStoredClientFile(mod) {
  const existingPath = resolveModulePath(mod, UPLOADS_DIR);
  if (!existingPath) return;

  await fsp.rm(existingPath, { force: true }).catch(() => null);
}

async function downloadFile(url, destinationPath) {
  await ensureClientsStore();

  if (!destinationPath) {
    throw new Error("Upload destination is invalid.");
  }

  const absoluteDestination = path.resolve(destinationPath);
  const uploadsRoot = path.resolve(UPLOADS_DIR);

  if (!absoluteDestination.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error("Upload destination escapes the uploads directory.");
  }

  await fsp.mkdir(path.dirname(absoluteDestination), { recursive: true });

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to download file: ${res.status} ${res.statusText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const tempPath = `${absoluteDestination}.part`;

  await fsp.writeFile(tempPath, buffer);
  await fsp.rename(tempPath, absoluteDestination);
}

module.exports = {
  buildClientFields,
  downloadFile,
  findClientKey,
  getClientAutocompleteChoices,
  getVisibleCategories,
  getVisibleClientEntries,
  loadModules,
  normalizeModuleRecord,
  removeStoredClientFile,
  saveModules,
};
