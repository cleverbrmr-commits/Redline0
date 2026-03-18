const { SlashCommandBuilder } = require("discord.js");
const { loadPrisonState } = require("../storage/clientsStore");
const { makeEmbed, makeInfoEmbed } = require("../utils/embeds");
const { trimText } = require("../utils/helpers");

function formatTimestamp(timestamp, fallback = "Unknown") {
  if (!timestamp) return fallback;
  return `<t:${Math.floor(new Date(timestamp).getTime() / 1000)}:F>`;
}

function formatUserLabel(user) {
  const tag = user?.tag && user.tag !== user.username ? user.tag : user?.username || "Unknown user";
  const globalName = user?.globalName ? ` • ${user.globalName}` : "";
  return `${tag}${globalName}`;
}

function getMemberRoleSummary(member) {
  if (!member?.roles?.cache) {
    return {
      count: "0",
      topRole: "Not in this server",
      roleList: "None",
    };
  }

  const roles = member.roles.cache.filter((role) => role.id !== member.guild.id).sort((a, b) => b.position - a.position);
  const topRole = roles.first();
  const roleMentions = roles.map((role) => `<@&${role.id}>`);

  return {
    count: String(roles.size),
    topRole: topRole ? `<@&${topRole.id}>` : "@everyone only",
    roleList: roleMentions.length ? trimText(roleMentions.slice(0, 10).join(", "), 1024) : "None",
  };
}

function getModerationStatus(member, prisonState) {
  if (!member) return "Not in this server";

  const statuses = [];
  const timeoutUntil = member.communicationDisabledUntilTimestamp || member.communicationDisabledUntil?.getTime?.() || null;
  if (timeoutUntil && timeoutUntil > Date.now()) {
    statuses.push(`Timed out until ${formatTimestamp(timeoutUntil)}`);
  }

  const prisonRecord = prisonState?.[member.id];
  if (prisonRecord) {
    statuses.push(`Prisoned${prisonRecord.reason ? ` • ${trimText(prisonRecord.reason, 120)}` : ""}`);
  }

  return statuses.length ? statuses.join("\n") : "Clear";
}

async function resolveTargetMember(interaction, user) {
  if (!interaction.guild) return null;

  const optionMember = interaction.options.getMember("user");
  if (optionMember?.user?.id === user.id || optionMember?.id === user.id) {
    return optionMember;
  }

  if (interaction.member?.user?.id === user.id || interaction.member?.id === user.id) {
    return interaction.member;
  }

  return interaction.guild.members.fetch(user.id).catch(() => null);
}

module.exports = {
  commands: [
    {
      name: "userinfo",
      data: new SlashCommandBuilder()
        .setName("userinfo")
        .setDescription("Show information about a user")
        .addUserOption((o) => o.setName("user").setDescription("User to inspect")),
      async execute({ client, interaction }) {
        const requestedUser = interaction.options.getUser("user") || interaction.user;
        const user = await client.users.fetch(requestedUser.id).catch(() => requestedUser);
        const member = await resolveTargetMember(interaction, user);
        const prisonState = interaction.guild ? await loadPrisonState() : {};
        const roleSummary = getMemberRoleSummary(member);

        return interaction.reply({
          embeds: [
            makeEmbed({
              title: `User Info • ${formatUserLabel(user)}`,
              description: [
                `${user}`,
                user?.globalName && user.globalName !== user.username ? `Global display name: **${trimText(user.globalName, 80)}**` : null,
              ]
                .filter(Boolean)
                .join("\n"),
              fields: [
                { name: "Username", value: trimText(user.username || "Unknown", 100), inline: true },
                { name: "Tag", value: trimText(user.tag || user.username || "Unknown", 100), inline: true },
                { name: "User ID", value: user.id, inline: true },
                { name: "Account Created", value: formatTimestamp(user.createdTimestamp), inline: true },
                { name: "Server Joined", value: formatTimestamp(member?.joinedTimestamp, interaction.guild ? "Not in this server" : "Outside a server"), inline: true },
                { name: "Top Role", value: roleSummary.topRole, inline: true },
                { name: "Role Count", value: roleSummary.count, inline: true },
                { name: "Status", value: getModerationStatus(member, prisonState), inline: true },
                { name: "Roles", value: roleSummary.roleList },
              ],
              thumbnail: user.displayAvatarURL({ size: 1024 }),
            }),
          ],
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
