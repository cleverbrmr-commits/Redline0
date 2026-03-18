const { Colors } = require("discord.js");
const { loadConfig, getConfiguredLogChannelId } = require("./configService");
const { makeEmbed, makeInfoEmbed } = require("../utils/embeds");
const { trimText } = require("../utils/helpers");

async function maybeLogEmbed(client, channelId, embed) {
  if (!channelId) return false;

  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isTextBased() && typeof channel.send === "function") {
      await channel.send({ embeds: [embed] });
      return true;
    }
  } catch (err) {
    console.error("Log channel send failed:", err);
  }

  return false;
}

async function maybeLogByKey(client, logKey, embed) {
  const config = await loadConfig();
  const channelId = getConfiguredLogChannelId(config, logKey);
  return maybeLogEmbed(client, channelId, embed);
}

async function logDownload(client, interaction, mod) {
  await maybeLogByKey(
    client,
    "downloadLogChannelId",
    makeInfoEmbed({
      title: "📥 Client Download Logged",
      description: `**${interaction.user.tag}** downloaded **${mod.label}**.`,
      fields: [
        { name: "Client", value: trimText(mod.label, 100), inline: true },
        { name: "User", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Channel", value: interaction.channel ? `<#${interaction.channel.id}>` : "Unknown", inline: true },
        { name: "At", value: `<t:${Math.floor(Date.now() / 1000)}:F>` },
      ],
    })
  );
}

async function logPrison(client, _interaction, title, description, fields = [], color = Colors.DarkGrey) {
  await maybeLogByKey(client, "prisonLogChannelId", makeEmbed({ title, description, fields, color }));
}

async function logModeration(client, action, interaction, targetUser, reason) {
  await maybeLogByKey(
    client,
    "modLogChannelId",
    makeInfoEmbed({
      title: `🛡️ Moderation • ${action}`,
      description: `**${interaction.user.tag}** performed **${action}**.`,
      fields: [
        { name: "Target", value: targetUser ? `<@${targetUser.id}>` : "Unknown", inline: true },
        { name: "Staff", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Reason", value: trimText(reason || "No reason provided", 1024) },
      ],
    })
  );
}

async function logAnnouncement(client, interaction, title) {
  await maybeLogByKey(
    client,
    "announceLogChannelId",
    makeInfoEmbed({
      title: "📣 Announcement Sent",
      description: `**${interaction.user.tag}** posted an announcement.`,
      fields: [
        { name: "Title", value: trimText(title, 200) },
        { name: "Channel", value: interaction.channel ? `<#${interaction.channel.id}>` : "Unknown", inline: true },
        { name: "At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      ],
    })
  );
}

module.exports = {
  logAnnouncement,
  logDownload,
  logModeration,
  logPrison,
  maybeLogByKey,
  maybeLogEmbed,
};
