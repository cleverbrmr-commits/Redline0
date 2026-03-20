const { Events, REST, Routes } = require('discord.js');
const { handleButton, handleStringSelect } = require('../services/panelService');
const { makeWarningEmbed } = require('../utils/embeds');
const { prettyError } = require('../utils/helpers');

const AUTO_DEFER_DELAY_MS = 1500;

function buildCommandRegistry(commandModules) {
  const commands = commandModules.flatMap((entry) => entry.commands || []);
  const registry = new Map();

  for (const command of commands) {
    if (!command?.name) {
      continue;
    }

    if (registry.has(command.name)) {
      throw new Error(`Duplicate command definition detected for "${command.name}".`);
    }

    registry.set(command.name, command);
  }

  return registry;
}

async function registerCommands(commandRegistry) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const body = [...commandRegistry.values()].map((command) => command.data.toJSON());
  console.log(`[startup] registering ${body.length} slash commands for guild ${process.env.GUILD_ID}`);
  console.log(`[startup] slash command names: ${body.map((command) => command.name).join(', ')}`);

  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
    body,
  });

  return body.length;
}

async function ensureInteractionAcknowledged(interaction, label) {
  if (interaction.deferred || interaction.replied) {
    return true;
  }

  console.error(`[interaction] ${label} completed without acknowledging the interaction.`);
  await interaction.reply({
    embeds: [
      makeWarningEmbed({
        title: 'Command wiring error',
        description: 'This command finished without sending a response. Check the bot logs.',
      }),
    ],
    ephemeral: true,
  }).catch(() => null);

  return false;
}

function shouldAutoDeferEphemeral(command) {
  const responseMode = String(command?.metadata?.response || command?.response || '').toLowerCase();
  return responseMode.includes('ephemeral');
}

function normalizeDeferredPayload(payload = {}) {
  const nextPayload = { ...payload };
  delete nextPayload.ephemeral;
  return nextPayload;
}

function createInteractionFacade(interaction) {
  const reply = interaction.reply.bind(interaction);
  const editReply = interaction.editReply.bind(interaction);
  const followUp = interaction.followUp.bind(interaction);
  const deferReply = interaction.deferReply.bind(interaction);

  const facade = Object.create(interaction);
  facade.reply = async (payload = {}) => {
    if (interaction.deferred && !interaction.replied) {
      return editReply(normalizeDeferredPayload(payload));
    }

    if (interaction.replied) {
      return followUp(payload);
    }

    return reply(payload);
  };
  facade.editReply = async (payload = {}) => editReply(normalizeDeferredPayload(payload));
  facade.followUp = async (payload = {}) => followUp(payload);
  facade.deferReply = async (payload = {}) => deferReply(payload);

  return facade;
}

async function executeSlashCommand({ client, interaction, command, commandRegistry, prefixName }) {
  const interactionFacade = createInteractionFacade(interaction);
  const autoDeferTimer = setTimeout(() => {
    if (!interaction.deferred && !interaction.replied) {
      interaction.deferReply({ ephemeral: shouldAutoDeferEphemeral(command) }).catch(() => null);
    }
  }, AUTO_DEFER_DELAY_MS);

  try {
    await command.execute({
      client,
      interaction: interactionFacade,
      commandRegistry,
      prefixName,
    });
  } finally {
    clearTimeout(autoDeferTimer);
  }
}

function createInteractionHandler(client, commandRegistry, prefixName) {
  return async function onInteraction(interaction) {
    try {
      if (interaction.isAutocomplete()) {
        const command = commandRegistry.get(interaction.commandName);
        if (command?.autocomplete) {
          return await command.autocomplete({ client, interaction, commandRegistry, prefixName });
        }

        return interaction.respond([]);
      }

      if (interaction.isChatInputCommand()) {
        const command = commandRegistry.get(interaction.commandName);
        if (!command) {
          console.error(`[interaction] received unknown slash command "${interaction.commandName}"`);
          await interaction.reply({
            embeds: [
              makeWarningEmbed({
                title: 'Command unavailable',
                description: `The \`/${interaction.commandName}\` command is registered in Discord but is not loaded by the bot.`,
              }),
            ],
            ephemeral: true,
          }).catch(() => null);
          return false;
        }

        await executeSlashCommand({ client, interaction, command, commandRegistry, prefixName });
        await ensureInteractionAcknowledged(interaction, `slash command "${interaction.commandName}"`);
        return true;
      }

      if (interaction.isStringSelectMenu()) {
        const handled = await handleStringSelect(client, interaction);
        if (!handled && !interaction.deferred && !interaction.replied) {
          console.error(`[interaction] unhandled string select "${interaction.customId}"`);
          await interaction.reply({
            embeds: [
              makeWarningEmbed({
                title: 'Component unavailable',
                description: 'That menu is no longer active or could not be handled.',
              }),
            ],
            ephemeral: true,
          }).catch(() => null);
        } else if (handled) {
          await ensureInteractionAcknowledged(interaction, `string select "${interaction.customId}"`);
        }

        return handled || false;
      }

      if (interaction.isButton()) {
        const handled = await handleButton(client, interaction);
        if (!handled && !interaction.deferred && !interaction.replied) {
          console.error(`[interaction] unhandled button "${interaction.customId}"`);
          await interaction.reply({
            embeds: [
              makeWarningEmbed({
                title: 'Component unavailable',
                description: 'That button is no longer active or could not be handled.',
              }),
            ],
            ephemeral: true,
          }).catch(() => null);
        } else if (handled) {
          await ensureInteractionAcknowledged(interaction, `button "${interaction.customId}"`);
        }

        return handled || false;
      }

      return false;
    } catch (err) {
      console.error('Interaction error:', err);

      const embed = makeWarningEmbed({ title: 'Request could not be completed', description: prettyError(err) });

      if (interaction.deferred) {
        try {
          await interaction.editReply({ embeds: [embed] });
        } catch {}
      } else if (interaction.replied) {
        try {
          await interaction.followUp({ embeds: [embed], ephemeral: true });
        } catch {}
      } else {
        try {
          await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch {}
      }

      return false;
    }
  };
}

module.exports = {
  AUTO_DEFER_DELAY_MS,
  Events,
  buildCommandRegistry,
  createInteractionHandler,
  registerCommands,
};
