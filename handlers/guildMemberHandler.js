const { Events } = require('discord.js');
const { processAutomodJoin } = require('../services/automodService');
const { sendGoodbyeMessage, sendWelcomeMessage } = require('../services/welcomerService');
const { logMemberJoin, logMemberLeave } = require('../services/logService');

function createGuildMemberAddHandler(client) {
  return async function onGuildMemberAdd(member) {
    try {
      await processAutomodJoin(client, member);
      await sendWelcomeMessage(client, member);
      await logMemberJoin(client, member);
    } catch (error) {
      console.error('[members] guildMemberAdd handler failed:', error);
    }
  };
}

function createGuildMemberRemoveHandler(client) {
  return async function onGuildMemberRemove(member) {
    try {
      await sendGoodbyeMessage(client, member);
      await logMemberLeave(client, member);
    } catch (error) {
      console.error('[members] guildMemberRemove handler failed:', error);
    }
  };
}

module.exports = {
  Events,
  createGuildMemberAddHandler,
  createGuildMemberRemoveHandler,
};
