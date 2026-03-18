const { makeWarningEmbed } = require('../utils/embeds');
const { parsePrefixInvocation } = require('../services/prefixService');
const { prettyError } = require('../utils/helpers');

function createMessageHandler(client, commandRegistry, prefixName) {
  return async function onMessage(message) {
    if (!message?.guild || message.author?.bot) {
      return false;
    }

    const invocation = parsePrefixInvocation(message.content, prefixName);
    if (!invocation || !invocation.commandName) {
      return false;
    }

    console.log(`[runtime] prefix command invoked: ${invocation.commandName}`);

    const command = commandRegistry.get(invocation.commandName);
    if (!command?.executePrefix) {
      console.error(`[runtime] command failed: ${invocation.commandName} with real error: no prefix handler`);
      await message.reply({
        embeds: [
          makeWarningEmbed({
            title: 'Command unavailable',
            description: `The prefix command \`${invocation.commandName}\` is not loaded or does not support prefix usage.`,
          }),
        ],
      }).catch(() => null);
      return false;
    }

    try {
      await command.executePrefix({
        client,
        message,
        args: invocation.args.slice(1),
        commandRegistry,
        prefixName,
      });
      console.log(`[runtime] command succeeded: ${invocation.commandName}`);
      return true;
    } catch (error) {
      console.error(`[runtime] command failed: ${invocation.commandName} with real error:`, error);
      await message.reply({ embeds: [makeWarningEmbed({ title: 'Command failed', description: prettyError(error) })] }).catch(() => null);
      return false;
    }
  };
}

module.exports = {
  createMessageHandler,
};
