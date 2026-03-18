const { ChannelType, SlashCommandBuilder } = require("discord.js");
const { loadModules, getVisibleCategories } = require("../services/clientService");
const { buildPublicPanelMessage, resolveSendableInteractionChannel } = require("../services/panelService");
const { makeSuccessEmbed } = require("../utils/embeds");
const { resolveInteractionContext } = require("../utils/helpers");

module.exports = {
  commands: [
    {
      name: "say",
      metadata: {
        category: "admin",
        description: "Send a message as the bot into a chosen channel.",
        usage: ["/say message:<text> channel:#channel"],
        prefixEnabled: false,
        examples: ["/say message:Hello channel:#general"],
        permissions: ["Manage Guild"],
        response: "ephemeral",
      },
      data: new SlashCommandBuilder()
        .setName("say")
        .setDescription("Send a message as the bot")
        .addStringOption((o) => o.setName("message").setDescription("Message to send").setRequired(true))
        .addChannelOption((o) => o.setName("channel").setDescription("Target channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
      async execute({ interaction }) {
        const message = interaction.options.getString("message", true);
        const channel = interaction.options.getChannel("channel") || interaction.channel;
        if (!channel || typeof channel.send !== "function") {
          return interaction.reply({ content: "Could not resolve a sendable channel.", ephemeral: true });
        }
        await channel.send({ content: message });
        return interaction.reply({ content: `Sent message to <#${channel.id}>.`, ephemeral: true });
      },
    },
    {
      name: "panel",
      data: new SlashCommandBuilder().setName("panel").setDescription("Send the public Redline client panel"),
      async execute({ client, interaction }) {
        const targetChannel = await resolveSendableInteractionChannel(client, interaction);
        if (!targetChannel) {
          return interaction.reply({ content: "Use this command in a sendable server channel.", ephemeral: true });
        }

        const modules = await loadModules();
        const { actorMember } = await resolveInteractionContext(client, interaction);
        const visibleCategories = getVisibleCategories(modules, actorMember || interaction.member);
        if (!visibleCategories.length) {
          return interaction.reply({ content: "No visible client categories are currently available.", ephemeral: true });
        }

        await targetChannel.send(await buildPublicPanelMessage(visibleCategories));
        return interaction.reply({ embeds: [makeSuccessEmbed({ title: "Panel sent", description: `Public panel sent to <#${targetChannel.id}>.` })], ephemeral: true });
      },
    },
  ],
};
