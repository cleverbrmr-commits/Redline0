const { Events, REST, Routes } = require('discord.js');
const { handleButton, handleStringSelect } = require('../services/panelService');
const { makeWarningEmbed } = require('../utils/embeds');
const { prettyError } = require('../utils/helpers');

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

  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
    body,
  });
}

function createInteractionHandler(client, commandRegistry) {
  return async function onInteraction(interaction) {
    try {
      if (interaction.isAutocomplete()) {
        const command = commandRegistry.get(interaction.commandName);
        if (command?.autocomplete) {
          return await command.autocomplete({ client, interaction, commandRegistry });
        }

        return interaction.respond([]);
      }

      if (interaction.isChatInputCommand()) {
        const command = commandRegistry.get(interaction.commandName);
        if (!command) return false;
        return await command.execute({ client, interaction, commandRegistry });
      }

      if (interaction.isStringSelectMenu()) {
        const handled = await handleStringSelect(client, interaction);
        return handled || false;
      }

      if (interaction.isButton()) {
        const handled = await handleButton(client, interaction);
        return handled || false;
      }

      return false;
    } catch (err) {
      console.error('Interaction error:', err);

      const embed = makeWarningEmbed({ title: 'Operation failed', description: prettyError(err) });

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
  Events,
  buildCommandRegistry,
  createInteractionHandler,
  registerCommands,
};
