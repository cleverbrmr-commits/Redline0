const { getGuildConfig } = require('../services/configService');
const { normalizeCommandMetadata } = require('../services/helpService');
const { logCommandUsage } = require('../services/logService');
const { parsePrefixInvocation } = require('../services/prefixService');
const { processAutomodMessage } = require('../services/automodService');
const { makeWarningEmbed } = require('../utils/embeds');
const { prettyError } = require('../utils/helpers');

function roleIdSet(member) {
  return new Set(member?.roles?.cache?.keys?.() || []);
}

async function getAccessFailure(command, guild, member, channel) {
  if (!guild?.id) return null;
  const guildConfig = await getGuildConfig(guild.id);
  const normalized = normalizeCommandMetadata(command);
  const moduleState = guildConfig.modules[normalized.moduleKey];
  if (moduleState && moduleState.enabled === false) {
    return `${normalized.moduleMeta.name} is currently disabled in this server.`;
  }

  const rule = guildConfig.commandAccess[normalized.name];
  if (!rule) return null;

  const memberRoleIds = roleIdSet(member);
  if (rule.deniedChannelIds?.includes(channel?.id)) return 'This command is disabled in this channel.';
  if (rule.deniedRoleIds?.some((roleId) => memberRoleIds.has(roleId))) return 'Your roles are blocked from using this command.';
  if (rule.allowedChannelIds?.length && !rule.allowedChannelIds.includes(channel?.id)) return 'This command is only enabled in specific channels.';
  if (rule.allowedRoleIds?.length && !rule.allowedRoleIds.some((roleId) => memberRoleIds.has(roleId))) return 'You need one of the configured allowed roles to use this command.';
  return null;
}

function shouldLogCommand(command) {
  return normalizeCommandMetadata(command).permissions !== 'Everyone';
}

function createMessageHandler(client, commandRegistry, prefixName) {
  return async function onMessage(message) {
    if (!message?.guild || message.author?.bot) return false;

    await processAutomodMessage(client, message).catch((error) => {
      console.error('Automod message processing failed:', error);
    });

    const invocation = parsePrefixInvocation(message.content, prefixName);
    if (!invocation || !invocation.commandName) return false;

    const command = commandRegistry.get(invocation.commandName);
    if (!command?.executePrefix) return false;

    try {
      const accessFailure = await getAccessFailure(command, message.guild, message.member, message.channel);
      if (accessFailure) {
        await message.reply({ embeds: [makeWarningEmbed({ title: 'Access restricted', description: accessFailure })] });
        return false;
      }

      await command.executePrefix({
        client,
        message,
        args: invocation.args.slice(1),
        commandRegistry,
        prefixName,
      });
      if (shouldLogCommand(command)) await logCommandUsage(client, message, command).catch(() => null);
      return true;
    } catch (error) {
      console.error('Prefix command error:', error);
      await message.reply({ embeds: [makeWarningEmbed({ title: 'Prefix command could not be completed', description: prettyError(error) })] }).catch(() => null);
      return false;
    }
  };
}

module.exports = {
  createMessageHandler,
};
