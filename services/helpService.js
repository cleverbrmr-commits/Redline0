const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { makeEmbed, makeInfoEmbed, makeWarningEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');
const { getModuleMeta, normalizeModuleKey, sortModuleEntries } = require('./moduleService');

const HELP_MENU_CUSTOM_ID = 'serenity:help:category';
const FIELD_LIMIT = 1024;

function uniqueByName(commands) {
  const seen = new Set();
  return commands.filter((command) => {
    const name = command?.name || command?.data?.name;
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

function getAllCommands(commandRegistry) {
  if (!commandRegistry) return [];
  if (commandRegistry instanceof Map) return uniqueByName([...commandRegistry.values()]);
  if (Array.isArray(commandRegistry)) return uniqueByName(commandRegistry);
  return uniqueByName(Object.values(commandRegistry));
}

function getMeta(command) {
  return command?.metadata || command?.meta || {};
}

function getCommandName(command) {
  return command?.name || command?.data?.name || 'unknown';
}

function getCommandModule(command) {
  return normalizeModuleKey(command?.category || getMeta(command).category || inferModuleFromName(getCommandName(command)));
}

function inferModuleFromName(name) {
  const lookup = {
    welcomer: 'welcome',
    help: 'system',
    set: 'system',
    poll: 'polls',
    userinfo: 'info',
    serverinfo: 'info',
    roleinfo: 'info',
    avatar: 'info',
    ping: 'system',
    botinfo: 'system',
    'yt-search': 'social',
    'yt-notify': 'social',
    panel: 'role-menus',
    clientpanel: 'role-menus',
  };
  return lookup[name] || 'other';
}

function getCommandDescription(command) {
  return command?.description || getMeta(command).description || command?.data?.description || 'No description provided.';
}

function getCommandUsage(command) {
  const usage = command?.usage || getMeta(command).usage;
  if (Array.isArray(usage)) return usage;
  if (usage) return [String(usage)];
  return [`/${getCommandName(command)}`];
}

function getCommandExamples(command) {
  const examples = command?.examples || getMeta(command).examples || [];
  return Array.isArray(examples) ? examples.filter(Boolean) : [examples].filter(Boolean);
}

function getCommandAliases(command) {
  const aliases = command?.aliases || getMeta(command).aliases || [];
  return Array.isArray(aliases) ? aliases.filter(Boolean) : [aliases].filter(Boolean);
}

function getCommandPermissions(command) {
  const permissions = command?.permissions || getMeta(command).permissions || [];
  if (!permissions || (Array.isArray(permissions) && !permissions.length)) return 'Everyone';
  return Array.isArray(permissions) ? permissions.join(', ') : String(permissions);
}

function supportsPrefix(command) {
  const meta = getMeta(command);
  if (meta.prefixEnabled === false || command?.prefix === false) return false;
  return typeof command.executePrefix === 'function' || meta.prefixEnabled === true;
}

function getPrefixUsage(command, prefixName = 'Serenity') {
  const explicit = getMeta(command).prefixUsage || command?.prefixUsage;
  if (Array.isArray(explicit) && explicit.length) return explicit;
  if (typeof explicit === 'string' && explicit.trim()) return [explicit];
  if (!supportsPrefix(command)) return ['Not supported'];
  return [`${prefixName} ${getCommandName(command)}`];
}

function getResponseMode(command) {
  return String(getMeta(command).response || command?.response || getModuleMeta(getCommandModule(command)).defaultVisibility || 'public');
}

function normalizeCommandMetadata(command) {
  const moduleKey = getCommandModule(command);
  const moduleMeta = getModuleMeta(moduleKey);
  return {
    name: getCommandName(command),
    moduleKey,
    moduleMeta,
    description: getCommandDescription(command),
    usage: getCommandUsage(command),
    examples: getCommandExamples(command),
    aliases: getCommandAliases(command),
    permissions: getCommandPermissions(command),
    prefixEnabled: supportsPrefix(command),
    prefixUsage: getPrefixUsage(command),
    response: getResponseMode(command),
    restrictions: Array.isArray(getMeta(command).restrictions) ? getMeta(command).restrictions : [],
    raw: command,
  };
}

function getNormalizedCommands(commandRegistry) {
  return getAllCommands(commandRegistry)
    .map(normalizeCommandMetadata)
    .sort((a, b) => a.moduleMeta.sortOrder - b.moduleMeta.sortOrder || a.name.localeCompare(b.name));
}

function groupCommandsByModule(commandRegistry) {
  const grouped = new Map();
  for (const command of getNormalizedCommands(commandRegistry)) {
    if (!grouped.has(command.moduleKey)) grouped.set(command.moduleKey, []);
    grouped.get(command.moduleKey).push(command);
  }
  return new Map(sortModuleEntries([...grouped.entries()].map(([key, commands]) => ({ key, commands }))).map((entry) => [entry.key, entry.commands]));
}

function buildCategorySummaryField(moduleMeta, commands) {
  const highlights = commands.slice(0, 4).map((command) => `• \`/${command.name}\``).join('\n');
  return {
    name: `${moduleMeta.emoji} ${moduleMeta.name} • ${commands.length}`,
    value: trimText(`${moduleMeta.description}\n\n${highlights || 'No commands registered yet.'}`, FIELD_LIMIT),
    inline: false,
  };
}

function buildHelpOverviewEmbeds(commandRegistry, prefixName = 'Serenity') {
  const grouped = groupCommandsByModule(commandRegistry);
  if (!grouped.size) {
    return [makeWarningEmbed({ title: 'Help unavailable', description: 'No commands are currently loaded.' })];
  }

  const fields = [...grouped.entries()].map(([moduleKey, commands]) => buildCategorySummaryField(getModuleMeta(moduleKey), commands));
  return [makeEmbed({
    title: 'Serenity Command Center',
    description: `Browse Serenity by module, then drill down into a specific command with \`/help command:<name>\`. Prefix commands still work with \`${prefixName} help <command>\` where enabled.`,
    fields,
    footer: 'SERENITY • Premium module navigation',
  })];
}

function buildHelpOverviewComponents(commandRegistry) {
  const grouped = groupCommandsByModule(commandRegistry);
  const options = [...grouped.entries()].slice(0, 25).map(([moduleKey, commands]) => {
    const moduleMeta = getModuleMeta(moduleKey);
    return {
      label: moduleMeta.name,
      value: moduleKey,
      description: trimText(`${commands.length} command${commands.length === 1 ? '' : 's'} • ${moduleMeta.accent}`, 100),
      emoji: moduleMeta.emoji,
    };
  });

  if (!options.length) return [];

  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(HELP_MENU_CUSTOM_ID)
      .setPlaceholder('Choose a module to browse')
      .addOptions(options),
  )];
}

function buildHelpCategoryEmbed(commandRegistry, moduleKey, prefixName = 'Serenity') {
  const normalizedKey = normalizeModuleKey(moduleKey);
  const moduleMeta = getModuleMeta(normalizedKey);
  const commands = groupCommandsByModule(commandRegistry).get(normalizedKey) || [];

  if (!commands.length) {
    return makeWarningEmbed({ title: `${moduleMeta.name} unavailable`, description: 'This module has no registered commands right now.' });
  }

  return makeInfoEmbed({
    title: `${moduleMeta.emoji} ${moduleMeta.name}`,
    description: `${moduleMeta.description}\n\nUse \`/help command:<name>\` for a deeper command card, or the prefix variant \`${prefixName} help <command>\` when prefix support is enabled.`,
    fields: commands.slice(0, 25).map((command) => ({
      name: `/${command.name}`,
      value: trimText([
        command.description,
        `Permissions • ${command.permissions}`,
        `Prefix • ${command.prefixEnabled ? trimText(command.prefixUsage[0], 80) : 'Not supported'}`,
      ].join('\n'), FIELD_LIMIT),
      inline: false,
    })),
    footer: `SERENITY • ${commands.length} command${commands.length === 1 ? '' : 's'} in ${moduleMeta.name}`,
  });
}

function findCommand(commandRegistry, query) {
  const normalized = String(query || '').trim().toLowerCase();
  return getNormalizedCommands(commandRegistry).find((command) => command.name.toLowerCase() === normalized || command.aliases.some((alias) => String(alias).toLowerCase() === normalized));
}

function buildHelpCommandEmbed(commandRegistry, query, prefixName = 'Serenity') {
  const command = findCommand(commandRegistry, query);
  if (!command) {
    return makeWarningEmbed({ title: 'Unknown command', description: `No help entry was found for \`${query}\`.` });
  }

  return makeInfoEmbed({
    title: `${command.moduleMeta.emoji} /${command.name}`,
    description: command.description,
    fields: [
      { name: 'Module', value: command.moduleMeta.name, inline: true },
      { name: 'Response', value: trimText(command.response, 100), inline: true },
      { name: 'Permissions', value: trimText(command.permissions, FIELD_LIMIT), inline: true },
      { name: 'Slash Usage', value: command.usage.map((entry) => `• \`${trimText(entry, 120)}\``).join('\n'), inline: false },
      { name: 'Prefix Usage', value: command.prefixUsage.map((entry) => `• \`${trimText(entry, 120)}\``).join('\n'), inline: false },
      { name: 'Examples', value: (command.examples.length ? command.examples : ['No examples documented yet.']).map((entry) => `• \`${trimText(entry, 120)}\``).join('\n'), inline: false },
      { name: 'Aliases', value: command.aliases.length ? command.aliases.map((entry) => `\`${entry}\``).join(', ') : 'None', inline: false },
      { name: 'Restrictions', value: command.restrictions.length ? trimText(command.restrictions.join('\n'), FIELD_LIMIT) : 'Standard permission and hierarchy checks.', inline: false },
    ],
    footer: 'SERENITY • Detailed command card',
  });
}

async function handleHelpCategorySelect(interaction, commandRegistry, prefixName = 'Serenity') {
  const selected = interaction.values?.[0];
  if (!selected) {
    await interaction.reply({ embeds: [makeWarningEmbed({ title: 'Selection missing', description: 'Choose a module to continue.' })], ephemeral: true });
    return true;
  }

  await interaction.reply({
    embeds: [buildHelpCategoryEmbed(commandRegistry, selected, prefixName)],
    ephemeral: true,
  });
  return true;
}

module.exports = {
  HELP_MENU_CUSTOM_ID,
  buildHelpCategoryEmbed,
  buildHelpCommandEmbed,
  buildHelpOverviewComponents,
  buildHelpOverviewEmbeds,
  findCommand,
  getNormalizedCommands,
  groupCommandsByModule,
  handleHelpCategorySelect,
  normalizeCommandMetadata,
};
