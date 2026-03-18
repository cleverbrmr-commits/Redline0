const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { loadModules, getVisibleCategories } = require("../services/clientService");
const { buildPublicPanelMessage, resolveSendableInteractionChannel } = require("../services/panelService");
const { makeSuccessEmbed, makeWarningEmbed } = require("../utils/embeds");
const { brandEmoji, resolveInteractionContext } = require("../utils/helpers");

module.exports = {
  commands: [
    {
      name: "clientpanel",
      data: new SlashCommandBuilder()
        .setName("clientpanel")
        .setDescription("Client panel tools")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) => sub.setName("send").setDescription("Send the public client panel")),
      async execute({ client, interaction }) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand !== "send") {
          return null;
        }

        const targetChannel = await resolveSendableInteractionChannel(client, interaction);

        if (!targetChannel) {
          return interaction.reply({
            embeds: [
              makeWarningEmbed({
                title: "Panel send failed",
                description: "Use this command in a server text channel where I can post messages.",
              }),
            ],
            ephemeral: true,
          });
        }

        const modules = await loadModules();
        const { actorMember } = await resolveInteractionContext(client, interaction);
        const member = actorMember || interaction.member;
        const visibleCategories = getVisibleCategories(modules, member);

        if (!visibleCategories.length) {
          return interaction.reply({
            embeds: [
              makeWarningEmbed({
                title: "Panel not sent",
                description: "No categories are currently visible from your access scope.",
              }),
            ],
            ephemeral: true,
          });
        }

        await targetChannel.send(buildPublicPanelMessage(visibleCategories));

        return interaction.reply({
          embeds: [
            makeSuccessEmbed({
              title: `${brandEmoji()} Public panel sent`,
              description: `The client panel is now live in <#${targetChannel.id}>.`,
            }),
          ],
          ephemeral: true,
        });
      },
    },
  ],
};
