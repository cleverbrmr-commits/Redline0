const { SlashCommandBuilder } = require("discord.js");
const { makeEmbed, makeInfoEmbed } = require("../utils/embeds");
const { trimText } = require("../utils/helpers");

function memberRoles(member) {
  if (!member?.roles?.cache) return "None";
  const roles = member.roles.cache.filter((role) => role.id !== member.guild.id).map((role) => `<@&${role.id}>`);
  return roles.length ? roles.slice(0, 10).join(", ") : "None";
}

module.exports = {
  commands: [
    {
      name: "userinfo",
      data: new SlashCommandBuilder()
        .setName("userinfo")
        .setDescription("Show information about a user")
        .addUserOption((o) => o.setName("user").setDescription("User to inspect")),
      async execute({ interaction }) {
        const user = interaction.options.getUser("user") || interaction.user;
        const member = interaction.guild ? await interaction.guild.members.fetch(user.id).catch(() => null) : null;
        return interaction.reply({
          embeds: [makeEmbed({
            title: `User Info • ${user.tag}`,
            description: user.toString(),
            fields: [
              { name: "ID", value: user.id, inline: true },
              { name: "Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: true },
              { name: "Joined", value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : "Unknown", inline: true },
              { name: "Roles", value: member ? memberRoles(member) : "Unknown" },
            ],
            thumbnail: user.displayAvatarURL(),
          })],
          ephemeral: true,
        });
      },
    },
    {
      name: "serverinfo",
      data: new SlashCommandBuilder().setName("serverinfo").setDescription("Show information about this server"),
      async execute({ interaction }) {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        return interaction.reply({
          embeds: [makeEmbed({
            title: `Server Info • ${guild.name}`,
            fields: [
              { name: "Members", value: String(guild.memberCount), inline: true },
              { name: "Roles", value: String(guild.roles.cache.size), inline: true },
              { name: "Channels", value: String(guild.channels.cache.size), inline: true },
              { name: "Owner", value: `<@${guild.ownerId}>`, inline: true },
              { name: "Created", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: true },
            ],
            thumbnail: guild.iconURL() || null,
          })],
          ephemeral: true,
        });
      },
    },
    {
      name: "roleinfo",
      data: new SlashCommandBuilder()
        .setName("roleinfo")
        .setDescription("Show information about a role")
        .addRoleOption((o) => o.setName("role").setDescription("Role to inspect").setRequired(true)),
      async execute({ interaction }) {
        const role = interaction.options.getRole("role", true);
        return interaction.reply({
          embeds: [makeEmbed({
            title: `Role Info • ${role.name}`,
            fields: [
              { name: "ID", value: role.id, inline: true },
              { name: "Color", value: role.hexColor, inline: true },
              { name: "Members", value: String(role.members.size), inline: true },
              { name: "Position", value: String(role.position), inline: true },
              { name: "Mentionable", value: role.mentionable ? "Yes" : "No", inline: true },
              { name: "Managed", value: role.managed ? "Yes" : "No", inline: true },
            ],
          })],
          ephemeral: true,
        });
      },
    },
    {
      name: "avatar",
      data: new SlashCommandBuilder()
        .setName("avatar")
        .setDescription("Show a user avatar")
        .addUserOption((o) => o.setName("user").setDescription("User whose avatar to show")),
      async execute({ interaction }) {
        const user = interaction.options.getUser("user") || interaction.user;
        return interaction.reply({ embeds: [makeEmbed({ title: `Avatar • ${user.tag}`, image: user.displayAvatarURL({ size: 1024 }) })], ephemeral: true });
      },
    },
    {
      name: "ping",
      data: new SlashCommandBuilder().setName("ping").setDescription("Show bot latency"),
      async execute({ client, interaction }) {
        return interaction.reply({ embeds: [makeInfoEmbed({ title: "Pong", description: `Gateway heartbeat: **${client.ws.ping}ms**.` })], ephemeral: true });
      },
    },
    {
      name: "botinfo",
      data: new SlashCommandBuilder().setName("botinfo").setDescription("Show information about the bot"),
      async execute({ client, interaction, commandRegistry }) {
        return interaction.reply({
          embeds: [makeEmbed({
            title: "Bot Info • Redline",
            description: trimText("Modular Discord.js v14 bot for private client delivery, moderation, embeds, and admin tooling.", 1024),
            fields: [
              { name: "Commands", value: String(commandRegistry.size), inline: true },
              { name: "Guilds", value: String(client.guilds.cache.size), inline: true },
              { name: "Latency", value: `${client.ws.ping}ms`, inline: true },
            ],
          })],
          ephemeral: true,
        });
      },
    },
  ],
};
