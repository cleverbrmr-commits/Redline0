const { Colors, EmbedBuilder } = require("discord.js");
const { BRAND, brandColor } = require("./helpers");

function makeEmbed({ title, description, color, fields, footer, author, thumbnail, image, timestamp }) {
  const embed = new EmbedBuilder()
    .setColor(color || brandColor())
    .setTitle(title)
    .setFooter({ text: footer || BRAND.footer });

  if (description !== undefined && description !== null && String(description).length) {
    embed.setDescription(String(description));
  }

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
    success: Colors.Green,
    error: Colors.Red,
    warning: Colors.Orange,
    info: Colors.Blurple,
  };

  return makeEmbed({
    title,
    description,
    fields,
    footer,
    color: tones[type] || brandColor(),
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

module.exports = {
  makeEmbed,
  makeErrorEmbed,
  makeInfoEmbed,
  makeStatusEmbed,
  makeSuccessEmbed,
  makeWarningEmbed,
};
