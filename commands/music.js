const { SlashCommandBuilder } = require('discord.js');
const {
  clearCommand,
  leaveCommand,
  loopCommand,
  nowPlayingCommand,
  pauseCommand,
  playCommand,
  queueCommand,
  removeCommand,
  resumeCommand,
  shuffleCommand,
  skipCommand,
  stopCommand,
  volumeCommand,
} = require('../services/musicService');

async function replyToSource(source, payload) {
  if (source.interaction) return source.interaction.reply(payload);
  return source.message.reply(payload);
}

function createSourceFromInteraction(interaction) {
  return {
    interaction,
    guild: interaction.guild,
    member: interaction.member,
    user: interaction.user,
    channel: interaction.channel,
    channelId: interaction.channelId,
  };
}

function createSourceFromMessage(message) {
  return {
    message,
    guild: message.guild,
    member: message.member,
    author: message.author,
    channel: message.channel,
    channelId: message.channelId,
  };
}

function buildCommand({
  name,
  description,
  usage,
  examples,
  data,
  handler,
  prefixHandler,
}) {
  return {
    name,
    metadata: {
      category: 'music',
      description,
      usage,
      prefixEnabled: true,
      prefixUsage: examples.filter((example) => example.startsWith('Serenity ')),
      examples,
      permissions: ['Everyone'],
      response: 'public',
      restrictions: [
        'Most control commands require the user to be in the same voice channel as Serenity.',
        'Spotify links are metadata-only and require Lavalink/extractor support to resolve into a playable source.',
      ],
    },
    data,
    async execute({ interaction }) {
      const payload = await handler(createSourceFromInteraction(interaction), interaction);
      return replyToSource({ interaction }, payload);
    },
    async executePrefix({ message, args }) {
      const payload = await prefixHandler(createSourceFromMessage(message), args, message);
      return replyToSource({ message }, payload);
    },
  };
}

module.exports = {
  commands: [
    buildCommand({
      name: 'play',
      description: 'Join your voice channel and play a track, playlist, or supported search result through Serenity\'s Lavalink-backed player.',
      usage: ['/play query_or_url:<text>'],
      examples: ['/play query_or_url:deadmau5 strobe', '/play query_or_url:https://youtu.be/dQw4w9WgXcQ', 'Serenity play lofi hip hop', 'Serenity play https://open.spotify.com/track/...'],
      data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play music from a URL or search query')
        .addStringOption((option) => option.setName('query_or_url').setDescription('URL or search text').setRequired(true)),
      handler: async (source, interaction) => playCommand(source, interaction.options.getString('query_or_url', true)),
      prefixHandler: async (source, args) => playCommand(source, args.join(' ').trim()),
    }),
    buildCommand({
      name: 'pause',
      description: 'Pause the current track.',
      usage: ['/pause'],
      examples: ['/pause', 'Serenity pause'],
      data: new SlashCommandBuilder().setName('pause').setDescription('Pause the current track'),
      handler: pauseCommand,
      prefixHandler: pauseCommand,
    }),
    buildCommand({
      name: 'resume',
      description: 'Resume the current track.',
      usage: ['/resume'],
      examples: ['/resume', 'Serenity resume'],
      data: new SlashCommandBuilder().setName('resume').setDescription('Resume the current track'),
      handler: resumeCommand,
      prefixHandler: resumeCommand,
    }),
    buildCommand({
      name: 'skip',
      description: 'Skip the current track.',
      usage: ['/skip'],
      examples: ['/skip', 'Serenity skip'],
      data: new SlashCommandBuilder().setName('skip').setDescription('Skip the current track'),
      handler: skipCommand,
      prefixHandler: skipCommand,
    }),
    buildCommand({
      name: 'stop',
      description: 'Stop playback and clear the queue.',
      usage: ['/stop'],
      examples: ['/stop', 'Serenity stop'],
      data: new SlashCommandBuilder().setName('stop').setDescription('Stop playback and clear the queue'),
      handler: stopCommand,
      prefixHandler: stopCommand,
    }),
    buildCommand({
      name: 'queue',
      description: 'Show the current queue.',
      usage: ['/queue [page]'],
      examples: ['/queue', '/queue page:2', 'Serenity queue', 'Serenity queue 2'],
      data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the music queue')
        .addIntegerOption((option) => option.setName('page').setDescription('Queue page').setMinValue(1)),
      handler: async (source, interaction) => queueCommand(source, interaction.options.getInteger('page') || 1),
      prefixHandler: async (source, args) => queueCommand(source, Number(args[0]) || 1),
    }),
    buildCommand({
      name: 'nowplaying',
      description: 'Show the currently playing track.',
      usage: ['/nowplaying'],
      examples: ['/nowplaying', 'Serenity nowplaying'],
      data: new SlashCommandBuilder().setName('nowplaying').setDescription('Show the current track'),
      handler: nowPlayingCommand,
      prefixHandler: nowPlayingCommand,
    }),
    buildCommand({
      name: 'remove',
      description: 'Remove one upcoming queue entry by position.',
      usage: ['/remove position:<number>'],
      examples: ['/remove position:3', 'Serenity remove 3'],
      data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove a queued track by position')
        .addIntegerOption((option) => option.setName('position').setDescription('Queue position to remove').setRequired(true).setMinValue(2)),
      handler: async (source, interaction) => removeCommand(source, interaction.options.getInteger('position', true)),
      prefixHandler: async (source, args) => removeCommand(source, Number(args[0])),
    }),
    buildCommand({
      name: 'clear',
      description: 'Clear all upcoming tracks while keeping the current one playing.',
      usage: ['/clear'],
      examples: ['/clear', 'Serenity clear'],
      data: new SlashCommandBuilder().setName('clear').setDescription('Clear the upcoming queue'),
      handler: clearCommand,
      prefixHandler: clearCommand,
    }),
    buildCommand({
      name: 'shuffle',
      description: 'Shuffle the upcoming queue.',
      usage: ['/shuffle'],
      examples: ['/shuffle', 'Serenity shuffle'],
      data: new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the upcoming queue'),
      handler: shuffleCommand,
      prefixHandler: shuffleCommand,
    }),
    buildCommand({
      name: 'loop',
      description: 'Set loop mode for the active queue.',
      usage: ['/loop mode:<off|track|queue>'],
      examples: ['/loop mode:track', '/loop mode:queue', 'Serenity loop off', 'Serenity loop track'],
      data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Set the loop mode')
        .addStringOption((option) =>
          option
            .setName('mode')
            .setDescription('Loop mode')
            .setRequired(true)
            .addChoices(
              { name: 'Off', value: 'off' },
              { name: 'Track', value: 'track' },
              { name: 'Queue', value: 'queue' },
            )
        ),
      handler: async (source, interaction) => loopCommand(source, interaction.options.getString('mode', true)),
      prefixHandler: async (source, args) => loopCommand(source, args[0] || 'off'),
    }),
    buildCommand({
      name: 'volume',
      description: 'Set playback volume from 0 to 200% on the active Lavalink player.',
      usage: ['/volume value:<0-200>'],
      examples: ['/volume value:80', 'Serenity volume 120'],
      data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Set playback volume')
        .addIntegerOption((option) => option.setName('value').setDescription('Volume percent').setRequired(true).setMinValue(0).setMaxValue(200)),
      handler: async (source, interaction) => volumeCommand(source, interaction.options.getInteger('value', true)),
      prefixHandler: async (source, args) => volumeCommand(source, Number(args[0])),
    }),
    buildCommand({
      name: 'leave',
      description: 'Disconnect Serenity from voice and clear the queue.',
      usage: ['/leave'],
      examples: ['/leave', 'Serenity leave'],
      data: new SlashCommandBuilder().setName('leave').setDescription('Leave the voice channel and clear the queue'),
      handler: leaveCommand,
      prefixHandler: leaveCommand,
    }),
  ],
};
