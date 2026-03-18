const { makeWarningEmbed } = require('../utils/embeds');
const { parsePrefixInvocation } = require('../services/prefixService');

function createMessageHandler(client, commandRegistry, prefixName) {
  return async function onMessage(message) {
    if (!message?.guild || message.author?.bot) {
      return false;
    }

    const invocation = parsePrefixInvocation(message.content, prefixName);
    if (!invocation || !invocation.commandName) {
      return false;
    }

    console.log(`[prefix] matched "${message.content}" from ${message.author?.tag || message.author?.id}`);

    const command = commandRegistry.get(invocation.commandName);
    if (!command?.executePrefix) {
      console.warn(`[prefix] no prefix handler found for "${invocation.commandName}"`);
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
      console.log(`[prefix] executed "${invocation.commandName}" successfully`);
      return true;
    } catch (error) {
      console.error('Prefix command error:', error);
      await message.reply({ embeds: [makeWarningEmbed({ title: 'Command failed', description: error?.message || 'Something went wrong.' })] }).catch(() => null);
      return false;
    }
  };
}

module.exports = {
  createMessageHandler,
};
