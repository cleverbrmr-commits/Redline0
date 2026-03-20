const MODULES = {
  moderation: {
    key: 'moderation',
    name: 'Moderation',
    emoji: '🛡️',
    description: 'Staff actions, punishments, infractions, and live intervention tools.',
    accent: 'Moderation suite',
    sortOrder: 10,
    defaultVisibility: 'public',
  },
  automod: {
    key: 'automod',
    name: 'Auto Moderation',
    emoji: '🤖',
    description: 'Automated protection against spam, invites, blocked phrases, and raid pressure.',
    accent: 'Protection engine',
    sortOrder: 20,
    defaultVisibility: 'ephemeral',
  },
  logging: {
    key: 'logging',
    name: 'Logging',
    emoji: '🧾',
    description: 'Structured audit feeds for moderation, members, messages, and security signals.',
    accent: 'Audit trails',
    sortOrder: 30,
    defaultVisibility: 'ephemeral',
  },
  welcome: {
    key: 'welcome',
    name: 'Welcome & Onboarding',
    emoji: '👋',
    description: 'Premium welcome, goodbye, join roles, and first-impression flows.',
    accent: 'Onboarding',
    sortOrder: 40,
    defaultVisibility: 'ephemeral',
  },
  utility: {
    key: 'utility',
    name: 'Utility',
    emoji: '🧰',
    description: 'Daily-use tools, information cards, and lightweight staff helpers.',
    accent: 'Everyday tools',
    sortOrder: 50,
    defaultVisibility: 'public',
  },
  info: {
    key: 'info',
    name: 'Info',
    emoji: '📊',
    description: 'User, server, and runtime insight cards with polished public output.',
    accent: 'Reference cards',
    sortOrder: 60,
    defaultVisibility: 'public',
  },
  polls: {
    key: 'polls',
    name: 'Polls',
    emoji: '🗳️',
    description: 'Community feedback panels and reaction polls.',
    accent: 'Engagement',
    sortOrder: 70,
    defaultVisibility: 'ephemeral',
  },
  'role-menus': {
    key: 'role-menus',
    name: 'Role Menus',
    emoji: '🎛️',
    description: 'Self-service role panels and menu-driven role assignment systems.',
    accent: 'Role access',
    sortOrder: 80,
    defaultVisibility: 'ephemeral',
  },
  social: {
    key: 'social',
    name: 'Social Alerts',
    emoji: '📣',
    description: 'Notification automations and external feed alerts.',
    accent: 'Alerts',
    sortOrder: 90,
    defaultVisibility: 'public',
  },
  music: {
    key: 'music',
    name: 'Music',
    emoji: '🎵',
    description: 'Serenity playback, queues, loop controls, and Lavalink orchestration.',
    accent: 'Playback',
    sortOrder: 100,
    defaultVisibility: 'public',
  },
  'client-content': {
    key: 'client-content',
    name: 'Client & Content',
    emoji: '📦',
    description: 'Redline client delivery, content publishing, and management panels.',
    accent: 'Content ops',
    sortOrder: 110,
    defaultVisibility: 'ephemeral',
  },
  tickets: {
    key: 'tickets',
    name: 'Tickets & Support',
    emoji: '🎫',
    description: 'Support workflows, ticket-style routing, and service desk readiness.',
    accent: 'Support',
    sortOrder: 120,
    defaultVisibility: 'ephemeral',
  },
  system: {
    key: 'system',
    name: 'System & Configuration',
    emoji: '⚙️',
    description: 'Global settings, modules, dashboards, and platform configuration.',
    accent: 'Configuration',
    sortOrder: 130,
    defaultVisibility: 'ephemeral',
  },
  admin: {
    key: 'admin',
    name: 'Owner & Admin',
    emoji: '👑',
    description: 'High-trust setup tools and curated administrative actions.',
    accent: 'Administration',
    sortOrder: 140,
    defaultVisibility: 'ephemeral',
  },
  other: {
    key: 'other',
    name: 'Other',
    emoji: '✨',
    description: 'Commands that do not map cleanly to a focused module yet.',
    accent: 'Miscellaneous',
    sortOrder: 999,
    defaultVisibility: 'public',
  },
};

const LEGACY_CATEGORY_MAP = {
  youtube: 'social',
  'client/content management': 'client-content',
  'client-content': 'client-content',
  utility: 'utility',
  admin: 'admin',
  moderation: 'moderation',
  music: 'music',
  info: 'info',
  polls: 'polls',
  logging: 'logging',
  automod: 'automod',
  welcome: 'welcome',
};

function normalizeModuleKey(rawKey) {
  const direct = String(rawKey || '').trim().toLowerCase();
  if (MODULES[direct]) return direct;
  if (LEGACY_CATEGORY_MAP[direct]) return LEGACY_CATEGORY_MAP[direct];
  return 'other';
}

function getModuleMeta(rawKey) {
  const key = normalizeModuleKey(rawKey);
  return MODULES[key] || MODULES.other;
}

function sortModuleEntries(entries) {
  return [...entries].sort((a, b) => {
    const left = getModuleMeta(a?.key || a?.module || a?.[0]).sortOrder;
    const right = getModuleMeta(b?.key || b?.module || b?.[0]).sortOrder;
    if (left !== right) return left - right;
    return getModuleMeta(a?.key || a?.module || a?.[0]).name.localeCompare(getModuleMeta(b?.key || b?.module || b?.[0]).name);
  });
}

module.exports = {
  MODULES,
  getModuleMeta,
  normalizeModuleKey,
  sortModuleEntries,
};
