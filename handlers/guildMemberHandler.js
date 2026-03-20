const { Events } = require('discord.js');
const { handleMemberJoinSecurity, handleMemberLeaveLog } = require('../services/automodService');
const { logMemberJoin } = require('../services/logService');
const { sendGoodbyeMessage, sendWelcomeMessage } = require('../services/welcomerService');

function createGuildMemberAddHandler(client) {
  return async function onGuildMemberAdd(member) {
    try {
      await Promise.allSettled([
        sendWelcomeMessage(client, member),
        handleMemberJoinSecurity(client, member),
        logMemberJoin(client, member),
      ]);
    } catch (error) {
      console.error('[welcomer] guildMemberAdd handler failed:', error);
    }
  };
}

function createGuildMemberRemoveHandler(client) {
  return async function onGuildMemberRemove(member) {
    try {
      await Promise.allSettled([
        sendGoodbyeMessage(client, member),
        handleMemberLeaveLog(client, member),
      ]);
    } catch (error) {
      console.error('[welcomer] guildMemberRemove handler failed:', error);
    }
  };
}

module.exports = {
  Events,
  createGuildMemberAddHandler,
  createGuildMemberRemoveHandler,
};
