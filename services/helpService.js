const { makeEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');

const CATEGORY_ORDER = ['moderation', 'utility', 'admin', 'youtube', 'client/content management', 'misc'];
const MAX_FIELD_VALUE_LENGTH = 1024;

function normalizeCategory(category) {
  return String(category || 'misc').trim().toLowerCase();
}

function getCommandMetadata(command) {
  const meta = command?.metadata || {};
  return {
    name: command?.name,
    category: normalizeCategory(meta.category),
    description: meta.description || command?.data?.description || 'No description provided.',
    usage: Array.isArray(meta.usage) ? meta.usage : meta.usage ? [meta.usage] : [`/${command?.name}`],
    examples: Array.isArray(meta.examples) ? meta.examples : meta.examples ? [meta.examples] : [],
    permissions: Array.isArray(meta.permissions) ? meta.permissions : meta.permissions ? [meta.permissions] : ['Everyone'],
    aliases: Array.isArray(meta.aliases) ? meta.aliases : [],
    prefixUsage: Array.isArray(meta.prefixUsage) ? meta.prefixUsage : meta.prefixUsage ? [meta.prefixUsage] : [],
    prefixEnabled: Boolean(meta.prefixEnabled),
    response: meta.response || 'public',
    restrictions: Array.isArray(meta.restrictions) ? meta.restrictions : meta.restrictions ? [meta.restrictions] : [],
  };
}

function listDocumentedCommands(commandRegistry) {
  return [...commandRegistry.values()]
    .map((command) => getCommandMetadata(command))
    .filter((entry) => entry.name && entry.description)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function findCommandMetadata(commandRegistry, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return null;

  return listDocumentedCommands(commandRegistry).find((entry) => {
    if (entry.name === needle) return true;
    return entry.aliases.some((alias) => alias.toLowerCase() === needle);
  }) || null;
}

function buildHelpOverviewEmbed(commandRegistry) {
  const commands = listDocumentedCommands(commandRegistry);
  const byCategory = new Map();

  for (const command of commands) {
    const bucket = byCategory.get(command.category) || [];
    bucket.push(command);
    byCategory.set(command.category, bucket);
  }

  const fields = CATEGORY_ORDER
    .filter((category) => byCategory.has(category))
    .flatMap((category) => {
      const title = category.replace(/\b\w/g, (char) => char.toUpperCase());
      const lines = byCategory.get(category)
        .map((command) => `• **/${command.name}** — ${trimText(command.description, 90)}\n  Usage: ${trimText(command.usage[0], 90)}`);
      const chunks = [];
      let current = '';

      for (const line of lines) {
        const nextValue = current ? `${current}\n${line}` : line;
        if (nextValue.length > MAX_FIELD_VALUE_LENGTH) {
          if (current) {
            chunks.push(current);
            current = line;
          } else {
            chunks.push(trimText(line, MAX_FIELD_VALUE_LENGTH));
            current = '';
          }
        } else {
          current = nextValue;
        }
      }

      if (current) {
        chunks.push(current);
      }

      return chunks.map((value, index) => ({
        name: index === 0 ? title : `${title} (cont.)`,
        value,
      }));
    });

  return makeEmbed({
    title: 'Help Center',
    description: 'Slash commands are available everywhere the bot is installed. Prefix commands use the bot name, for example `Serenity help ban`.',
    fields,
  });
}

function buildHelpDetailEmbed(commandRegistry, query) {
  const command = findCommandMetadata(commandRegistry, query);
  if (!command) {
    return null;
  }

  return makeEmbed({
    title: `Help • /${command.name}`,
    description: command.description,
    fields: [
      { name: 'Category', value: command.category.replace(/\b\w/g, (char) => char.toUpperCase()), inline: true },
      { name: 'Response', value: command.response, inline: true },
      { name: 'Permissions', value: command.permissions.join('\n'), inline: true },
      { name: 'Slash Usage', value: command.usage.join('\n') },
      { name: 'Prefix Usage', value: command.prefixEnabled ? command.prefixUsage.join('\n') || 'Supported' : 'Not supported' },
      { name: 'Examples', value: command.examples.length ? command.examples.join('\n') : 'No examples documented.' },
      { name: 'Restrictions / Notes', value: command.restrictions.length ? command.restrictions.join('\n') : 'No special restrictions documented.' },
      { name: 'Aliases', value: command.aliases.length ? command.aliases.join(', ') : 'None' },
    ],
  });
}

module.exports = {
  buildHelpDetailEmbed,
  buildHelpOverviewEmbed,
  findCommandMetadata,
  getCommandMetadata,
  listDocumentedCommands,
};
