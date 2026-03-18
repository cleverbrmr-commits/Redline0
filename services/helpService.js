const { makeEmbed, makeInfoEmbed, makeWarningEmbed } = require('../utils/embeds');

const FIELD_LIMIT = 1024;
const SAFE_FIELD_LIMIT = 900;
const EMBED_DESCRIPTION_LIMIT = 4096;
const MAX_FIELDS_PER_EMBED = 6;

function trim(text, max) {
  const value = String(text ?? '');
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3))}...`;
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


function formatCommandList(value) {
  return String(value || '')
    .split('\n')
    .filter(Boolean)
    .map((entry) => `• \`${trim(entry, 120)}\``)
    .join('\n') || 'None';
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
  const usage = trim(getCommandUsage(command).split('\n')[0], 80);
  const description = trim(getCommandDescription(command), 120);
  return `**${slash}** — ${description}\nUsage: \`${usage}\``;
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
  for (let i = 0; i < fieldQueue.length; i += MAX_FIELDS_PER_EMBED) {
    const fields = fieldQueue.slice(i, i + MAX_FIELDS_PER_EMBED);

    embeds.push(makeEmbed({
      title: i === 0 ? 'Help Menu' : 'Help Menu (cont.)',
      description: i === 0
        ? trim(
          `Use \`/help command:<name>\` for detailed help on one command. Prefix commands can be used like \`${prefixName} help ban\` where supported.`,
          EMBED_DESCRIPTION_LIMIT,
        )
        : undefined,
      fields,
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
  const usage = getCommandUsage(command);
  const examples = getCommandExamples(command)
    .filter(Boolean)
    .map((example) => `• \`${trim(example, 120)}\``)
    .join('\n') || 'None';
  const aliases = command?.aliases || getMeta(command).aliases || [];
  const slashUsage = `/${name}`;
  const prefixUsage = getCommandPrefixUsage(command, prefixName);
  const permissions = trim(getCommandPermissions(command), FIELD_LIMIT);

  return makeInfoEmbed({
    title: `Help • /${name}`,
    description,
    fields: [
      { name: 'Category', value: toTitleCase(getCommandCategory(command)), inline: true },
      { name: 'Permissions', value: permissions, inline: true },
      { name: 'Slash Usage', value: `\`${slashUsage}\``, inline: false },
      { name: 'Prefix Usage', value: formatCommandList(prefixUsage), inline: false },
      { name: 'Full Usage', value: formatCommandList(usage), inline: false },
      {
        name: 'Aliases',
        value: aliases.length ? aliases.map((alias) => `\`${alias}\``).join(', ') : 'None',
        inline: false,
      },
      { name: 'Examples', value: trim(examples, FIELD_LIMIT), inline: false },
    ],
  });
}

module.exports = {
  buildHelpCommandEmbed,
  buildHelpOverviewEmbeds,
  findCommand,
  getAllCommands,
};
