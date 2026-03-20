const { Colors, EmbedBuilder } = require('discord.js');
const { BRAND, brandColor, trimText } = require('./helpers');

const EMBED_LIMITS = {
  title: 256,
  description: 4096,
  footer: 2048,
  author: 256,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
};

function sanitizeText(value, max) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return trimText(text, max);
}

function sanitizeFooter(footer) {
  if (!footer) return { text: BRAND.footer };
  if (typeof footer === 'string') return { text: sanitizeText(footer, EMBED_LIMITS.footer) || BRAND.footer };
  const text = sanitizeText(footer.text, EMBED_LIMITS.footer) || BRAND.footer;
  return { text, iconURL: footer.iconURL || undefined };
}

function sanitizeAuthor(author) {
  if (!author) return null;
  if (typeof author === 'string') {
    const name = sanitizeText(author, EMBED_LIMITS.author);
    return name ? { name } : null;
  }

  const name = sanitizeText(author.name, EMBED_LIMITS.author);
  if (!name) return null;
  return { name, iconURL: author.iconURL || undefined, url: author.url || undefined };
}

function sanitizeFields(fields) {
  if (!Array.isArray(fields) || !fields.length) return [];
  return fields.slice(0, EMBED_LIMITS.fields).map((field) => {
    const name = sanitizeText(field?.name, EMBED_LIMITS.fieldName);
    const value = sanitizeText(field?.value, EMBED_LIMITS.fieldValue);
    if (!name || !value) return null;
    return { name, value, inline: Boolean(field?.inline) };
  }).filter(Boolean);
}

function makeEmbed({ title, description, color, fields, footer, author, thumbnail, image, timestamp }) {
  const embed = new EmbedBuilder().setColor(color || brandColor());
  const safeTitle = sanitizeText(title, EMBED_LIMITS.title);
  const safeDescription = sanitizeText(description, EMBED_LIMITS.description);
  const safeAuthor = sanitizeAuthor(author);
  const safeFooter = sanitizeFooter(footer);
  const safeFields = sanitizeFields(fields);

  if (safeTitle) embed.setTitle(safeTitle);
  if (safeDescription) embed.setDescription(safeDescription);
  if (safeAuthor) embed.setAuthor(safeAuthor);
  else embed.setAuthor({ name: 'Serenity', iconURL: undefined });
  if (safeFooter) embed.setFooter(safeFooter);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (timestamp !== false) embed.setTimestamp();
  if (safeFields.length) embed.addFields(safeFields);
  return embed;
}

function makeStatusEmbed(type, { title, description, fields, footer, author, thumbnail, image, timestamp }) {
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
    author,
    thumbnail,
    image,
    timestamp,
    color: tones[type] || brandColor(),
  });
}

const makeSuccessEmbed = (payload) => makeStatusEmbed('success', payload);
const makeErrorEmbed = (payload) => makeStatusEmbed('error', payload);
const makeWarningEmbed = (payload) => makeStatusEmbed('warning', payload);
const makeInfoEmbed = (payload) => makeStatusEmbed('info', payload);

module.exports = {
  EMBED_LIMITS,
  makeEmbed,
  makeErrorEmbed,
  makeInfoEmbed,
  makeStatusEmbed,
  makeSuccessEmbed,
  makeWarningEmbed,
};
