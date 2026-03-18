const { Colors, EmbedBuilder } = require("discord.js");
const { BRAND } = require("./helpers");

function makeEmbed({ title, description, color, fields, footer, author, thumbnail, image, timestamp }) {
  const embed = new EmbedBuilder()
    .setColor(color || Colors.DarkRed)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: footer || BRAND.footer });

  if (author) embed.setAuthor(typeof author === "string" ? { name: author } : author);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (timestamp !== false) embed.setTimestamp();

  if (Array.isArray(fields) && fields.length) {
    embed.addFields(fields);
  }

  return embed;
}

function makeStatusEmbed(type, { title, description, fields, footer }) {
  const tones = {
    success: Colors.Red,
    error: Colors.DarkRed,
    warning: Colors.Orange,
    info: Colors.DarkButNotBlack,
  };

  return makeEmbed({
    title,
    description,
    fields,
    footer,
    color: tones[type] || Colors.DarkRed,
  });
}

function makeSuccessEmbed(payload) {
  return makeStatusEmbed("success", payload);
}

function makeErrorEmbed(payload) {
  return makeStatusEmbed("error", payload);
}

function makeWarningEmbed(payload) {
  return makeStatusEmbed("warning", payload);
}

function makeInfoEmbed(payload) {
  return makeStatusEmbed("info", payload);
}

function makeModerationEmbed({ action, moderator, target, reason, extraFields = [], color = Colors.DarkRed }) {
  return makeEmbed({
    title: `🛡️ ${action}`,
    color,
    fields: [
      { name: "Moderator", value: moderator || "Unknown", inline: true },
      { name: "Target", value: target || "Unknown", inline: true },
      { name: "Reason", value: reason || "No reason provided" },
      ...extraFields,
    ],
  });
}

module.exports = {
  makeEmbed,
  makeErrorEmbed,
  makeInfoEmbed,
  makeModerationEmbed,
  makeStatusEmbed,
  makeSuccessEmbed,
  makeWarningEmbed,
};
