const { SlashCommandBuilder } = require("discord.js");
const { sendPrivateClientPanel } = require("../services/panelService");

module.exports = {
  commands: [
    {
      name: "clients",
      data: new SlashCommandBuilder().setName("clients").setDescription("Open the private client panel"),
      async execute({ client, interaction }) {
        return sendPrivateClientPanel(client, interaction);
      },
    },
  ],
};
