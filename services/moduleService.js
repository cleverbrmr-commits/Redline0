const { PermissionFlagsBits } = require('discord.js');
const { trimText } = require('../utils/helpers');

const MODULES = {
  moderation: {
    key: 'moderation',
    label: 'Moderation',
    emoji: '🛡️',
    description: 'Core staff actions, sanctions, and infraction history.',
    accent: 'Staff Tools',
    dashboardSection: 'Moderation',
  },
  automod: {
    key: 'automod',
    label: 'Auto Moderation',
    emoji: '🤖',
    description: 'Automated message safety, filters, thresholds, and escalations.',
    accent: 'Safety Engine',
    dashboardSection: 'Automod',
  },
  logging: {
    key: 'logging',
    label: 'Logging',
    emoji: '🗂️',
    description: 'Structured audit trails for member activity, staff actions, and protection events.',
    accent: 'Audit Trail',
    dashboardSection: 'Logging',
  },
  onboarding: {
    key: 'onboarding',
    label: 'Welcome & Goodbye',
    emoji: '👋',
    description: 'Join and leave experiences, onboarding messaging, and starter role automation.',
    accent: 'Member Journey',
    dashboardSection: 'Welcome',
  },
  utility: {
    key: 'utility',
    label: 'Utility',
    emoji: '🧰',
    description: 'Everyday server tools, lookups, and quick productivity commands.',
    accent: 'Daily Tools',
    dashboardSection: 'Utility',
  },
  info: {
    key: 'info',
    label: 'Info',
    emoji: '📊',
    description: 'Profiles, server stats, runtime insights, and status summaries.',
    accent: 'Insights',
    dashboardSection: 'Stats',
  },
  polls: {
    key: 'polls',
    label: 'Polls',
    emoji: '📮',
    description: 'Structured public voting experiences and community prompts.',
    accent: 'Community Votes',
    dashboardSection: 'Polls',
  },
  roles: {
    key: 'roles',
    label: 'Role Menus',
    emoji: '🎛️',
    description: 'Role-driven access, menus, and role workflow utilities.',
    accent: 'Access Control',
    dashboardSection: 'Role Menus',
  },
  alerts: {
    key: 'alerts',
    label: 'Social Alerts',
    emoji: '📺',
    description: 'External content subscriptions and announcement delivery.',
    accent: 'Notifications',
    dashboardSection: 'Social Alerts',
  },
  music: {
    key: 'music',
    label: 'Music',
    emoji: '🎵',
    description: 'Voice playback, queue controls, and music session management.',
    accent: 'Audio',
    dashboardSection: 'Music',
  },
  content: {
    key: 'content',
    label: 'Client & Content',
    emoji: '📦',
    description: 'Client delivery, panels, uploads, exports, and content operations.',
    accent: 'Content Ops',
    dashboardSection: 'Content',
  },
  support: {
    key: 'support',
    label: 'Tickets & Support',
    emoji: '🎫',
    description: 'Support workflow entry points and staff assistance features.',
    accent: 'Support',
    dashboardSection: 'Tickets',
  },
  system: {
    key: 'system',
    label: 'System & Configuration',
    emoji: '⚙️',
    description: 'Module setup, channels, defaults, toggles, and bot-wide guild configuration.',
    accent: 'Configuration',
    dashboardSection: 'Overview',
  },
  admin: {
    key: 'admin',
    label: 'Owner & Admin',
    emoji: '👑',
    description: 'Higher-privilege administrative workflows and controlled broadcasts.',
    accent: 'Administrative',
    dashboardSection: 'Commands',
  },
};

const CATEGORY_ALIASES = {
  admin: 'system',
  'client/content management': 'content',
  youtube: 'alerts',
  moderation: 'moderation',
  utility: 'utility',
  info: 'info',
  polls: 'polls',
  music: 'music',
  onboarding: 'onboarding',
  logging: 'logging',
  automod: 'automod',
  roles: 'roles',
  system: 'system',
};

const COMMAND_OVERRIDES = {
  help: { category: 'system', aliases: ['commands', 'support'] },
  userinfo: { category: 'info' },
  serverinfo: { category: 'info' },
  roleinfo: { category: 'info' },
  avatar: { category: 'info' },
  ping: { category: 'info' },
  botinfo: { category: 'info' },
  poll: { category: 'polls' },
  welcomer: { category: 'onboarding' },
  set: { category: 'system' },
  say: { category: 'admin' },
  panel: { category: 'content' },
  clientpanel: { category: 'content' },
  clients: { category: 'content' },
  announceclient: { category: 'content' },
  exportclients: { category: 'content' },
  backup: { category: 'content' },
  editclient: { category: 'content' },
  upload: { category: 'content' },
  embed: { category: 'content' },
  'yt-search': { category: 'alerts' },
  'yt-notify': { category: 'alerts' },
  automod: { category: 'automod' },
};

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function normalizePermissionBits(command) {
  const permissions = [];
  const metaPermissions = toArray(command?.metadata?.permissions || command?.permissions);
  permissions.push(...metaPermissions);

  const rawBits = command?.data?.default_member_permissions ?? command?.data?.defaultMemberPermissions ?? null;
  if (rawBits) {
    try {
      const numeric = BigInt(rawBits.toString());
      for (const [name, bit] of Object.entries(PermissionFlagsBits)) {
        if ((numeric & BigInt(bit)) === BigInt(bit)) {
          permissions.push(name);
        }
      }
    } catch {}
  }

  return [...new Set(permissions.length ? permissions : ['Everyone'])];
}

function getCommandName(command) {
  return command?.name || command?.data?.name || 'unknown';
}

function resolveCategory(rawCategory, commandName) {
  const override = COMMAND_OVERRIDES[commandName]?.category;
  if (override && MODULES[override]) return override;
  const normalized = String(rawCategory || '').trim().toLowerCase();
  return CATEGORY_ALIASES[normalized] || 'system';
}

function normalizeCommandMetadata(command) {
  const name = getCommandName(command);
  const metadata = command.metadata || {};
  const override = COMMAND_OVERRIDES[name] || {};
  const category = resolveCategory(command.category || metadata.category, name);
  const usage = toArray(command.usage || metadata.usage);
  const examples = toArray(command.examples || metadata.examples);
  const aliases = [...new Set([...toArray(command.aliases), ...toArray(metadata.aliases), ...toArray(override.aliases)])];
  const permissions = normalizePermissionBits(command);
  const prefixEnabled = metadata.prefixEnabled !== false && (typeof command.executePrefix === 'function' || metadata.prefixEnabled === true);
  const prefixUsage = toArray(metadata.prefixUsage || command.prefixUsage || (prefixEnabled ? [`Serenity ${name}`] : []));
  const response = metadata.response || command.response || 'public';
  const configDependencies = toArray(metadata.configDependencies || command.configDependencies);

  return {
    name,
    category,
    module: MODULES[category],
    description: metadata.description || command.description || command?.data?.description || 'No description provided.',
    usage: usage.length ? usage : [`/${name}`],
    examples,
    permissions,
    aliases,
    response,
    prefixEnabled,
    prefixUsage,
    restrictions: toArray(metadata.restrictions || command.restrictions),
    configDependencies,
    public: !String(response).toLowerCase().includes('ephemeral'),
    ephemeral: String(response).toLowerCase().includes('ephemeral'),
  };
}

function normalizeCommand(command) {
  const metadata = normalizeCommandMetadata(command);
  return {
    ...command,
    category: metadata.category,
    metadata,
  };
}

function listModules() {
  return Object.values(MODULES);
}

function getModule(key) {
  return MODULES[key] || MODULES.system;
}

function summarizeModule(commands, moduleKey) {
  const module = getModule(moduleKey);
  const filtered = commands.filter((command) => command.metadata?.category === moduleKey);
  return {
    ...module,
    commands: filtered,
    commandCount: filtered.length,
    summary: trimText(module.description, 220),
  };
}

module.exports = {
  COMMAND_OVERRIDES,
  MODULES,
  getCommandName,
  getModule,
  listModules,
  normalizeCommand,
  normalizeCommandMetadata,
  summarizeModule,
};
