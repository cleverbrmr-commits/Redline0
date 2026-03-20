const { Events } = require('discord.js');
const { logMemberUpdate, logMessageDelete, logMessageEdit } = require('../services/logService');

function createMessageDeleteHandler(client) {
  return async function onMessageDelete(message) {
    try {
      await logMessageDelete(client, message);
    } catch (error) {
      console.error('[audit] messageDelete handler failed:', error);
    }
  };
}

function createMessageUpdateHandler(client) {
  return async function onMessageUpdate(oldMessage, newMessage) {
    try {
      await logMessageEdit(client, oldMessage, newMessage);
    } catch (error) {
      console.error('[audit] messageUpdate handler failed:', error);
    }
  };
}

function createGuildMemberUpdateHandler(client) {
  return async function onGuildMemberUpdate(oldMember, newMember) {
    try {
      await logMemberUpdate(client, oldMember, newMember);
    } catch (error) {
      console.error('[audit] guildMemberUpdate handler failed:', error);
    }
  };
}

module.exports = {
  Events,
  createGuildMemberUpdateHandler,
  createMessageDeleteHandler,
  createMessageUpdateHandler,
};
