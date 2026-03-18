const { Colors } = require('discord.js');
const { makeEmbed, makeInfoEmbed, makeWarningEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');

const POLL_OPTION_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const POLL_MODES = {
  embed: 'embed',
  normal: 'normal',
};

function normalizePollMode(mode) {
  return String(mode || '').trim().toLowerCase() === POLL_MODES.normal ? POLL_MODES.normal : POLL_MODES.embed;
}

function sanitizePollQuestion(question) {
  return trimText(String(question || '').trim(), 250);
}

function sanitizePollOptions(options) {
  return (Array.isArray(options) ? options : [])
    .map((option) => trimText(String(option || '').trim(), 100))
    .filter(Boolean);
}

function validatePollPayload(question, options) {
  const cleanQuestion = sanitizePollQuestion(question);
  const cleanOptions = sanitizePollOptions(options);

  if (!cleanQuestion) {
    throw new Error('Provide a poll question first.');
  }

  if (cleanOptions.length < 2) {
    throw new Error('Provide at least 2 poll options.');
  }

  if (cleanOptions.length > POLL_OPTION_EMOJIS.length) {
    throw new Error(`Polls support up to ${POLL_OPTION_EMOJIS.length} options.`);
  }

  return {
    question: cleanQuestion,
    options: cleanOptions,
  };
}

function buildPollLines(options) {
  return options.map((option, index) => `${POLL_OPTION_EMOJIS[index]} ${option}`);
}

function buildPollEmbed({ question, options, authorTag }) {
  return makeEmbed({
    title: `Poll • ${question}`,
    description: buildPollLines(options).join('\n'),
    color: Colors.Red,
    fields: authorTag ? [{ name: 'Created By', value: authorTag, inline: true }] : [],
    footer: 'REDLINE • Reaction poll',
    timestamp: true,
  });
}

function buildPollMessagePayload({ mode, question, options, authorTag }) {
  const normalizedMode = normalizePollMode(mode);
  const validated = validatePollPayload(question, options);
  const optionLines = buildPollLines(validated.options);

  if (normalizedMode === POLL_MODES.normal) {
    return {
      content: [
        `**Poll • ${validated.question}**`,
        authorTag ? `Created by ${authorTag}` : null,
        '',
        ...optionLines,
      ].filter((line) => line !== null).join('\n'),
      embeds: [],
      reactions: POLL_OPTION_EMOJIS.slice(0, validated.options.length),
    };
  }

  return {
    content: null,
    embeds: [buildPollEmbed({ question: validated.question, options: validated.options, authorTag })],
    reactions: POLL_OPTION_EMOJIS.slice(0, validated.options.length),
  };
}

async function sendPollMessage(channel, payload) {
  if (!channel || typeof channel.send !== 'function') {
    throw new Error('This channel cannot receive poll messages.');
  }

  const message = await channel.send({
    content: payload.content || undefined,
    embeds: payload.embeds || [],
  });

  for (const reaction of payload.reactions || []) {
    await message.react(reaction);
  }

  return message;
}

function parsePrefixPollArgs(args) {
  const raw = Array.isArray(args) ? args.join(' ').trim() : '';
  if (!raw) {
    throw new Error('Choose a poll mode and use `|` to split the question from each option.');
  }

  const pieces = raw.split('|').map((piece) => piece.trim()).filter(Boolean);
  const [first = '', ...rest] = pieces;
  const [modeToken, ...questionParts] = first.split(/\s+/).filter(Boolean);
  const normalizedModeToken = String(modeToken || '').toLowerCase();
  if (!Object.values(POLL_MODES).includes(normalizedModeToken)) {
    throw new Error('Start the poll with either `embed` or `normal`.');
  }
  const mode = normalizePollMode(modeToken);
  const question = questionParts.join(' ').trim();

  if (!question) {
    throw new Error('Start with `embed` or `normal`, then write the question before the first `|`.');
  }

  return {
    mode,
    question,
    options: rest,
  };
}

function buildPollValidationEmbed(message) {
  return makeWarningEmbed({
    title: 'Poll setup required',
    description: message,
    footer: 'REDLINE • Reaction poll',
  });
}

function buildPollUsageEmbed(prefixName = 'Serenity') {
  return makeInfoEmbed({
    title: 'Poll usage',
    description: [
      `• \`/poll embed question option1 option2 [option3...]\``,
      `• \`/poll normal question option1 option2 [option3...]\``,
      `• \`${prefixName} poll embed Best client? | Volt | Apex | Nova\``,
      `• \`${prefixName} poll normal Favorite mode? | Survival | PvP | Skyblock\``,
    ].join('\n'),
    footer: 'REDLINE • Reaction poll',
  });
}

module.exports = {
  POLL_MODES,
  POLL_OPTION_EMOJIS,
  buildPollMessagePayload,
  buildPollUsageEmbed,
  buildPollValidationEmbed,
  parsePrefixPollArgs,
  sendPollMessage,
  validatePollPayload,
};
