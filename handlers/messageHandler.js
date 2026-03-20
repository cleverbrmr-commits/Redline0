const { validateCommandAccess } = require('../services/accessService');
const { handleAutomodMessage } = require('../services/automodService');
const { parsePrefixInvocation } = require('../services/prefixService');
const { logCommandUsage } = require('../services/logService');
const { makeWarningEmbed } = require('../utils/embeds');
const { prettyError } = require('../utils/helpers');

function createMessageHandler(client, commandRegistry, prefixName) {
  return async function onMessage(message) {
    if (!message?.guild || message.author?.bot) return false;

    await handleAutomodMessage(client, message).catch((error) => {
      console.error('Automod message handling failed:', error);
    });

    const invocation = parsePrefixInvocation(message.content, prefixName);
    if (!invocation || !invocation.commandName) return false;

    const command = commandRegistry.get(invocation.commandName);
    if (!command?.executePrefix) return false;

    const access = await validateCommandAccess({ guildId: message.guild.id, command, member: message.member, channelId: message.channelId });
    if (!access.allowed) {
      return message.reply({
        embeds: [makeWarningEmbed({ title: 'Command unavailable here', description: access.reason || 'This command is restricted by Serenity command access settings.' })],
      }).catch(() => null);
    }

    try {
      await command.executePrefix({
        client,
        message,
        args: invocation.args.slice(1),
        commandRegistry,
        prefixName,
      });

      if (command.metadata?.permissions?.length && !command.metadata.permissions.includes('Everyone')) {
        await logCommandUsage(client, message, command);
      }
      return true;
    } catch (error) {
      console.error('Prefix command error:', error);
      await message.reply({
        embeds: [makeWarningEmbed({ title: 'Prefix command could not be completed', description: prettyError(error) })],
      }).catch(() => null);
      return false;
    }
  };
}

module.exports = {
  createMessageHandler,
};
