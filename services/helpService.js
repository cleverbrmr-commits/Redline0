const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { makeEmbed, makeInfoEmbed, makeWarningEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');
const { getModule, listModules } = require('./moduleService');

const FIELD_LIMIT = 1024;
const MODULE_SELECT_ID = 'serenity:help:module';
const COMMAND_SELECT_ID = 'serenity:help:command';
const HOME_BUTTON_ID = 'serenity:help:home';

function uniqueByName(commands) {
  const seen = new Set();
  return commands.filter((command) => {
    const name = command?.metadata?.name || command?.name;
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

function getAllCommands(commandRegistry) {
  if (!commandRegistry) return [];
  if (commandRegistry instanceof Map) return uniqueByName([...commandRegistry.values()]);
  if (Array.isArray(commandRegistry)) return uniqueByName(commandRegistry);
  if (typeof commandRegistry === 'object') return uniqueByName(Object.values(commandRegistry));
  return [];
}

function getCategoryCommands(commandRegistry, category) {
  return getAllCommands(commandRegistry)
    .filter((command) => command.metadata?.category === category)
    .sort((a, b) => commandLabel(a).localeCompare(commandLabel(b)));
}

function commandLabel(command) {
  return command?.metadata?.name || command?.name || 'unknown';
}

function getCommandPermissions(command) {
  return (command.metadata?.permissions || ['Everyone']).join(', ');
}

function findCommand(commandRegistry, query) {
  const normalized = String(query || '').trim().toLowerCase();
  return getAllCommands(commandRegistry).find((command) => {
    if (commandLabel(command).toLowerCase() === normalized) return true;
    return (command.metadata?.aliases || []).some((alias) => String(alias).toLowerCase() === normalized);
  }) || null;
}

function getCategorySummary(commandRegistry) {
  return listModules()
    .map((module) => ({
      ...module,
      commands: getCategoryCommands(commandRegistry, module.key),
    }))
    .filter((module) => module.commands.length);
}

function buildHomeEmbed(commandRegistry, prefixName = 'Serenity') {
  const modules = getCategorySummary(commandRegistry);
  const totalCommands = getAllCommands(commandRegistry).length;

  return makeEmbed({
    title: 'Serenity Command Center',
    description: [
      'Premium module-driven navigation for the current command runtime.',
      `Use the menu below to browse modules, or run \`/help command:<name>\` for a detailed command card. Prefix-compatible commands still respond to \`${prefixName} <command>\`.`,
    ].join('\n\n'),
    fields: modules.slice(0, 12).map((module) => ({
      name: `${module.emoji} ${module.label}`,
      value: `${trimText(module.description, 120)}\n**Commands:** ${module.commands.length}`,
      inline: true,
    })),
    footer: `SERENITY • ${modules.length} modules • ${totalCommands} commands`,
  });
}

function buildModuleEmbed(commandRegistry, moduleKey, prefixName = 'Serenity') {
  const module = getModule(moduleKey);
  const commands = getCategoryCommands(commandRegistry, moduleKey);

  if (!commands.length) {
    return makeWarningEmbed({
      title: `Module unavailable • ${module.label}`,
      description: 'No commands are currently registered under that module.',
      footer: 'SERENITY • Help center',
    });
  }

  return makeInfoEmbed({
    title: `${module.emoji} ${module.label}`,
    description: `${module.description}\n\nChoose a command from the second menu for full usage and examples. Prefix-ready commands use \`${prefixName} <command>\`.`,
    fields: commands.slice(0, 15).map((command) => ({
      name: `/${commandLabel(command)}`,
      value: `${trimText(command.metadata?.description || 'No description provided.', 120)}\n**Permissions:** ${trimText(getCommandPermissions(command), 80)}`,
      inline: true,
    })),
    footer: `SERENITY • ${commands.length} command${commands.length === 1 ? '' : 's'} in this module`,
  });
}

function buildHelpCommandEmbed(commandRegistry, query, prefixName = 'Serenity') {
  const command = typeof query === 'string' ? findCommand(commandRegistry, query) : query;

  if (!command) {
    return makeWarningEmbed({
      title: 'Unknown command',
      description: `No help entry was found for \`${query}\`.`,
      footer: 'SERENITY • Help center',
    });
  }

  const module = getModule(command.metadata?.category);
  const usage = (command.metadata?.usage || [`/${commandLabel(command)}`])
    .map((entry) => `• \`${trimText(entry, 160)}\``)
    .join('\n');
  const examples = (command.metadata?.examples || [])
    .map((entry) => `• \`${trimText(entry, 160)}\``)
    .join('\n') || 'None provided.';
  const prefixUsage = command.metadata?.prefixEnabled
    ? (command.metadata?.prefixUsage || []).map((entry) => `• \`${trimText(entry, 160)}\``).join('\n')
    : 'Not supported';

  return makeInfoEmbed({
    title: `/${commandLabel(command)}`,
    description: trimText(command.metadata?.description || 'No description provided.', 4096),
    fields: [
      { name: 'Module', value: `${module.emoji} ${module.label}`, inline: true },
      { name: 'Response', value: command.metadata?.response || 'public', inline: true },
      { name: 'Permissions', value: trimText(getCommandPermissions(command), FIELD_LIMIT), inline: true },
      { name: 'Slash Usage', value: usage, inline: false },
      { name: 'Prefix Usage', value: prefixUsage, inline: false },
      { name: 'Examples', value: examples, inline: false },
      { name: 'Aliases', value: command.metadata?.aliases?.length ? command.metadata.aliases.map((alias) => `\`${alias}\``).join(', ') : 'None', inline: false },
      { name: 'Restrictions', value: command.metadata?.restrictions?.length ? command.metadata.restrictions.map((entry) => `• ${trimText(entry, 180)}`).join('\n') : 'No extra restrictions documented.', inline: false },
    ],
    footer: `SERENITY • ${command.metadata?.prefixEnabled ? 'Slash + prefix ready' : 'Slash only'}`,
  });
}

function buildHelpComponents(commandRegistry, selectedModule = null) {
  const modules = getCategorySummary(commandRegistry);
  const moduleMenu = new StringSelectMenuBuilder()
    .setCustomId(MODULE_SELECT_ID)
    .setPlaceholder('Browse a module')
    .addOptions(modules.slice(0, 25).map((module) => ({
      label: module.label,
      description: trimText(`${module.commands.length} commands • ${module.accent}`, 100),
      value: module.key,
      emoji: module.emoji,
      default: selectedModule === module.key,
    })));

  const commandOptions = selectedModule
    ? getCategoryCommands(commandRegistry, selectedModule).slice(0, 25).map((command) => ({
      label: `/${commandLabel(command)}`,
      description: trimText(command.metadata?.description || 'No description', 100),
      value: commandLabel(command),
    }))
    : [{ label: 'Select a module first', description: 'Pick a module to load command choices.', value: '__none__' }];

  const commandMenu = new StringSelectMenuBuilder()
    .setCustomId(COMMAND_SELECT_ID)
    .setPlaceholder(selectedModule ? 'Open a command card' : 'Select a module first')
    .setDisabled(!selectedModule)
    .addOptions(commandOptions);

  const homeButton = new ButtonBuilder()
    .setCustomId(HOME_BUTTON_ID)
    .setLabel('Home')
    .setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder().addComponents(moduleMenu),
    new ActionRowBuilder().addComponents(commandMenu),
    new ActionRowBuilder().addComponents(homeButton),
  ];
}

function buildHelpHomePayload(commandRegistry, prefixName = 'Serenity') {
  return {
    embeds: [buildHomeEmbed(commandRegistry, prefixName)],
    components: buildHelpComponents(commandRegistry, null),
  };
}

function buildHelpModulePayload(commandRegistry, moduleKey, prefixName = 'Serenity') {
  return {
    embeds: [buildModuleEmbed(commandRegistry, moduleKey, prefixName)],
    components: buildHelpComponents(commandRegistry, moduleKey),
  };
}

function buildHelpCommandPayload(commandRegistry, query, prefixName = 'Serenity') {
  const command = findCommand(commandRegistry, query);
  return {
    embeds: [buildHelpCommandEmbed(commandRegistry, command || query, prefixName)],
    components: buildHelpComponents(commandRegistry, command?.metadata?.category || null),
  };
}

module.exports = {
  COMMAND_SELECT_ID,
  HOME_BUTTON_ID,
  MODULE_SELECT_ID,
  buildHelpCommandEmbed,
  buildHelpCommandPayload,
  buildHelpComponents,
  buildHelpHomePayload,
  buildHelpModulePayload,
  findCommand,
  getAllCommands,
};
