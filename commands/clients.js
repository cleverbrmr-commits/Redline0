const { SlashCommandBuilder } = require("discord.js");
const { sendPrivateClientPanel } = require("../services/panelService");

module.exports = {
  commands: [
    {
      name: "clients",
      metadata: {
        category: "client/content management",
        description: "Open the private client browser panel.",
        usage: ["/clients"],
        prefixEnabled: false,
        examples: ["/clients"],
        permissions: ["Everyone"],
        response: "ephemeral",
      },
      data: new SlashCommandBuilder().setName("clients").setDescription("Open the private client panel"),
      async execute({ client, interaction }) {
        return sendPrivateClientPanel(client, interaction);
      },
    },
  ],
};
