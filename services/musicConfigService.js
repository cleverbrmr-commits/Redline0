const DEFAULT_SEARCH_PLATFORM = 'ytsearch';
const DEFAULT_REST_VERSION = 'v4';

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
}

function normalizeNode(node, index = 0) {
  return {
    name: node.name || `Node ${index + 1}`,
    host: String(node.host || '').trim(),
    port: parseInteger(node.port, 2333),
    password: String(node.password || '').trim(),
    secure: parseBoolean(node.secure, false),
  };
}

function parseNodesFromJson(raw) {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeNode).filter((node) => node.host && node.password);
  } catch (error) {
    console.warn('[music] Failed to parse LAVALINK_NODES JSON. Falling back to single-node env vars.');
    return [];
  }
}

function getLavalinkNodes() {
  const jsonNodes = parseNodesFromJson(process.env.LAVALINK_NODES);
  if (jsonNodes.length) return jsonNodes;

  const node = normalizeNode({
    name: process.env.LAVALINK_NAME || 'Main Node',
    host: process.env.LAVALINK_HOST,
    port: process.env.LAVALINK_PORT,
    password: process.env.LAVALINK_PASSWORD,
    secure: process.env.LAVALINK_SECURE,
  });

  return node.host && node.password ? [node] : [];
}

function getMusicRuntimeConfig() {
  const nodes = getLavalinkNodes();

  return {
    nodes,
    defaultSearchPlatform: process.env.LAVALINK_DEFAULT_SEARCH || DEFAULT_SEARCH_PLATFORM,
    restVersion: process.env.LAVALINK_REST_VERSION || DEFAULT_REST_VERSION,
    autoLeaveOnQueueEnd: parseBoolean(process.env.MUSIC_AUTO_LEAVE_ON_QUEUE_END, true),
  };
}

function getMusicBootstrapIssue() {
  const { nodes } = getMusicRuntimeConfig();
  if (!nodes.length) {
    return 'Music playback is unavailable because no Lavalink node is configured. Set LAVALINK_HOST, LAVALINK_PORT, and LAVALINK_PASSWORD (or provide LAVALINK_NODES JSON).';
  }

  return null;
}

module.exports = {
  DEFAULT_REST_VERSION,
  DEFAULT_SEARCH_PLATFORM,
  getLavalinkNodes,
  getMusicBootstrapIssue,
  getMusicRuntimeConfig,
};
