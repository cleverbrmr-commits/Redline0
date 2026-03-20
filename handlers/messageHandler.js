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

    const command = commandRegistry.get(invocation.commandName);
    if (!command?.executePrefix) {
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
      return true;
    } catch (error) {
      console.error('Prefix command error:', error);
      await message.reply({
        embeds: [
          makeWarningEmbed({
            title: 'Prefix command could not be completed',
            description: prettyError(error),
          }),
        ],
      }).catch(() => null);
      return false;
    }
  };
}

module.exports = {
  createMessageHandler,
};
