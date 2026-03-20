const { makeEmbed, makeInfoEmbed, makeWarningEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');

const FIELD_LIMIT = 1024;
const SAFE_FIELD_LIMIT = 900;
const EMBED_DESCRIPTION_LIMIT = 4096;
const MAX_FIELDS_PER_EMBED = 6;

function trim(text, max) {
  return trimText(text, max);
}

function toTitleCase(value) {
  return String(value || 'other')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function uniqueByName(commands) {
  const seen = new Set();
  const result = [];

  for (const command of commands) {
    const name = command?.name || command?.data?.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(command);
  }

  return result;
}

function getAllCommands(commandRegistry) {
  if (!commandRegistry) return [];

  if (commandRegistry instanceof Map) {
    return uniqueByName([...commandRegistry.values()]);
  }

  if (Array.isArray(commandRegistry)) {
    return uniqueByName(commandRegistry);
  }

  if (Array.isArray(commandRegistry.commands)) {
    return uniqueByName(commandRegistry.commands);
  }

  if (typeof commandRegistry === 'object') {
    return uniqueByName(Object.values(commandRegistry));
  }

  return [];
}

function getCommandName(command) {
  return command?.name || command?.data?.name || 'unknown';
}

function getMeta(command) {
  return command?.metadata || command?.meta || {};
}

function getCommandCategory(command) {
  return command?.category || getMeta(command).category || 'other';
}

function getCommandDescription(command) {
  return command?.description || getMeta(command).description || command?.data?.description || 'No description provided.';
}

function getCommandUsage(command) {
  const usage = command?.usage || getMeta(command).usage;
  if (Array.isArray(usage)) {
    return usage.join('\n');
  }
  return usage || `/${getCommandName(command)}`;
}

function getCommandExamples(command) {
  const examples = command?.examples || getMeta(command).examples || [];
  return Array.isArray(examples) ? examples : [examples];
}

function getCommandPrefixUsage(command, prefixName) {
  const meta = getMeta(command);
  const prefixUsage = meta.prefixUsage || command?.prefixUsage;
  if (Array.isArray(prefixUsage) && prefixUsage.length) {
    return prefixUsage.join('\n');
  }
  if (typeof prefixUsage === 'string' && prefixUsage.trim()) {
    return prefixUsage;
  }
  return supportsPrefix(command) ? `${prefixName} ${getCommandName(command)}` : 'Not supported';
}

function getCommandPermissions(command) {
  const permissions = command?.permissions || getMeta(command).permissions || command?.defaultMemberPermissions || null;
  if (!permissions) return 'Everyone';
  if (Array.isArray(permissions)) return permissions.join(', ');
  return String(permissions);
}

function supportsPrefix(command) {
  const meta = getMeta(command);
  if (meta.prefixEnabled === false) return false;
  if (command?.prefix === false) return false;
  if (command?.meta?.prefix === false) return false;
  return typeof command?.executePrefix === 'function' || meta.prefixEnabled === true;
}

function findCommand(commandRegistry, query) {
  const commands = getAllCommands(commandRegistry);
  const normalized = String(query || '').trim().toLowerCase();

  return commands.find((command) => {
    const name = getCommandName(command).toLowerCase();
    if (name === normalized) return true;

    const aliases = command?.aliases || getMeta(command).aliases || [];
    return aliases.map((alias) => String(alias).toLowerCase()).includes(normalized);
  });
}

function chunkLines(lines, maxLen = SAFE_FIELD_LIMIT) {
  const chunks = [];
  let current = '';

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;

    if (candidate.length <= maxLen) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = '';
    }

    if (line.length <= maxLen) {
      current = line;
      continue;
    }

    let remaining = line;
    while (remaining.length > maxLen) {
      chunks.push(`${remaining.slice(0, maxLen - 3)}...`);
      remaining = remaining.slice(maxLen - 3);
    }

    current = remaining;
  }

  if (current) chunks.push(current);

  return chunks;
}

function groupCommandsByCategory(commands) {
  const grouped = new Map();

  for (const command of commands) {
    const category = getCommandCategory(command);
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(command);
  }

  return grouped;
}

function formatOverviewLine(command) {
  const slash = `/${getCommandName(command)}`;
  const description = trim(getCommandDescription(command), 110);
  const prefixBadge = supportsPrefix(command) ? ' • Prefix' : '';
  return `**${slash}**${prefixBadge}\n${description}`;
}

function buildHelpOverviewEmbeds(commandRegistry, prefixName = 'Serenity') {
  const commands = getAllCommands(commandRegistry).sort((a, b) => getCommandName(a).localeCompare(getCommandName(b)));

  if (!commands.length) {
    return [
      makeWarningEmbed({
        title: 'Help unavailable',
        description: 'No commands are currently loaded.',
      }),
    ];
  }

  const grouped = groupCommandsByCategory(commands);
  const fieldQueue = [];

  for (const [category, categoryCommands] of grouped.entries()) {
    const lines = categoryCommands.map(formatOverviewLine);
    const chunks = chunkLines(lines);

    chunks.forEach((chunk, index) => {
      fieldQueue.push({
        name: index === 0 ? `${toTitleCase(category)} Commands` : `${toTitleCase(category)} Commands (cont.)`,
        value: trim(chunk, FIELD_LIMIT),
        inline: false,
      });
    });
  }

  const embeds = [];
  for (let index = 0; index < fieldQueue.length; index += MAX_FIELDS_PER_EMBED) {
    const fields = fieldQueue.slice(index, index + MAX_FIELDS_PER_EMBED);
    embeds.push(makeEmbed({
      title: index === 0 ? 'Redline Help Desk' : 'Redline Help Desk (cont.)',
      description: index === 0
        ? trim(
          `Browse commands by category below. Use \`/help command:<name>\` for detail cards, or \`${prefixName} help <command>\` where prefix support is available.`,
          EMBED_DESCRIPTION_LIMIT,
        )
        : 'More commands from the current runtime registry.',
      fields,
      footer: `REDLINE • ${commands.length} command${commands.length === 1 ? '' : 's'} loaded`,
    }));
  }

  return embeds;
}

function buildHelpCommandEmbed(commandRegistry, query, prefixName = 'Serenity') {
  const command = findCommand(commandRegistry, query);

  if (!command) {
    return makeWarningEmbed({
      title: 'Unknown command',
      description: `No help entry was found for \`${query}\`.`,
    });
  }

  const name = getCommandName(command);
  const description = trim(getCommandDescription(command), EMBED_DESCRIPTION_LIMIT);
  const usage = getCommandUsage(command)
    .split('\n')
    .filter(Boolean)
    .map((entry) => `• \`${trim(entry, 140)}\``)
    .join('\n') || 'None';
  const examples = getCommandExamples(command)
    .filter(Boolean)
    .map((example) => `• \`${trim(example, 140)}\``)
    .join('\n') || 'None';
  const aliases = command?.aliases || getMeta(command).aliases || [];
  const prefixUsage = getCommandPrefixUsage(command, prefixName);
  const permissions = trim(getCommandPermissions(command), FIELD_LIMIT);
  const responseMode = String(getMeta(command).response || 'public');

  return makeInfoEmbed({
    title: `Help • /${name}`,
    description,
    fields: [
      { name: 'Category', value: toTitleCase(getCommandCategory(command)), inline: true },
      { name: 'Response', value: toTitleCase(responseMode), inline: true },
      { name: 'Permissions', value: permissions, inline: true },
      { name: 'Slash Usage', value: `• \`/${name}\``, inline: false },
      { name: 'Full Usage', value: usage, inline: false },
      { name: 'Prefix Usage', value: supportsPrefix(command) ? prefixUsage.split('\n').map((entry) => `• \`${trim(entry, 140)}\``).join('\n') : 'Not supported', inline: false },
      { name: 'Examples', value: examples, inline: false },
      { name: 'Aliases', value: aliases.length ? aliases.map((alias) => `\`${alias}\``).join(', ') : 'None', inline: false },
    ],
    footer: `REDLINE • ${supportsPrefix(command) ? 'Slash + prefix ready' : 'Slash only'}`,
  });
}

module.exports = {
  buildHelpCommandEmbed,
  buildHelpOverviewEmbeds,
  findCommand,
  getAllCommands,
};
