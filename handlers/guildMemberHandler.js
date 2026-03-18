const { Events } = require('discord.js');
const { sendWelcomeMessage } = require('../services/welcomerService');

function createGuildMemberAddHandler(client) {
  return async function onGuildMemberAdd(member) {
    try {
      await sendWelcomeMessage(client, member);
    } catch (error) {
      console.error('[welcomer] guildMemberAdd handler failed:', error);
    }
  };
}

module.exports = {
  Events,
  createGuildMemberAddHandler,
};
