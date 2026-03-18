const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const {
  addYoutubeSubscription,
  buildYoutubeSearchEmbed,
  buildYoutubeSubscriptionEmbed,
  buildYoutubeSubscriptionListEmbed,
  listYoutubeSubscriptions,
  removeYoutubeSubscription,
  searchYouTubeVideos,
} = require('../services/youtubeService');
const { makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');
const { resolveChannelFromToken } = require('../services/prefixService');

module.exports = {
  commands: [
    {
      name: 'yt-search',
      metadata: {
        category: 'youtube',
        description: 'Search YouTube and return the top five videos privately.',
        usage: ['/yt-search topic:<search terms>'],
        prefixEnabled: true,
        prefixUsage: ['Serenity yt-search minecraft pvp'],
        examples: ['/yt-search discord bot tutorial', 'Serenity yt-search lo-fi mix'],
        permissions: ['Everyone'],
        response: 'ephemeral',
        restrictions: ['Requires YOUTUBE_API_KEY to be configured.'],
      },
      data: new SlashCommandBuilder()
        .setName('yt-search')
        .setDescription('Search YouTube for videos')
        .addStringOption((option) => option.setName('topic').setDescription('Topic to search').setRequired(true)),
      async execute({ interaction }) {
        const topic = interaction.options.getString('topic', true);
        try {
          const results = await searchYouTubeVideos(topic);
          return interaction.reply({ embeds: [buildYoutubeSearchEmbed(topic, results)], ephemeral: true });
        } catch (error) {
          return interaction.reply({ embeds: [makeWarningEmbed({ title: 'YouTube search unavailable', description: error.message })], ephemeral: true });
        }
      },
      async executePrefix({ message, args }) {
        const topic = args.join(' ').trim();
        if (!topic) {
          return message.reply({ content: 'Usage: `Serenity yt-search <topic>`' });
        }

        try {
          const results = await searchYouTubeVideos(topic);
          return message.reply({ embeds: [buildYoutubeSearchEmbed(topic, results)] });
        } catch (error) {
          return message.reply({ embeds: [makeWarningEmbed({ title: 'YouTube search unavailable', description: error.message })] });
        }
      },
    },
    {
      name: 'yt-notify',
      metadata: {
        category: 'youtube',
        description: 'Configure YouTube upload notifications for a chosen Discord channel.',
        usage: [
          '/yt-notify add youtube_channel_link:<url> discord_channel:#channel ping_everyone:<true|false>',
          '/yt-notify remove youtube_channel_link:<url>',
          '/yt-notify list',
        ],
        prefixEnabled: true,
        prefixUsage: [
          'Serenity yt-notify add <youtube-url> #channel true',
          'Serenity yt-notify remove <youtube-url>',
          'Serenity yt-notify list',
        ],
        examples: [
          '/yt-notify add youtube_channel_link:https://www.youtube.com/@YouTube discord_channel:#uploads ping_everyone:false',
          '/yt-notify list',
          'Serenity yt-notify remove https://www.youtube.com/channel/UC...' ,
        ],
        permissions: ['Manage Guild'],
        response: 'public',
        restrictions: ['Notifications are sent only into the configured Discord channel for each subscription.'],
      },
      data: new SlashCommandBuilder()
        .setName('yt-notify')
        .setDescription('Configure YouTube upload notifications')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((subcommand) =>
          subcommand
            .setName('add')
            .setDescription('Add a YouTube upload notification subscription')
            .addStringOption((option) => option.setName('youtube_channel_link').setDescription('YouTube channel URL').setRequired(true))
            .addChannelOption((option) => option.setName('discord_channel').setDescription('Discord channel for notifications').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
            .addBooleanOption((option) => option.setName('ping_everyone').setDescription('Whether to ping @everyone on new uploads'))
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('remove')
            .setDescription('Remove a YouTube upload notification subscription')
            .addStringOption((option) => option.setName('youtube_channel_link').setDescription('YouTube channel URL').setRequired(true))
        )
        .addSubcommand((subcommand) => subcommand.setName('list').setDescription('List this server\'s YouTube upload subscriptions')),
      async execute({ interaction }) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
          const subscriptions = await listYoutubeSubscriptions(interaction.guildId);
          return interaction.reply({ embeds: [buildYoutubeSubscriptionListEmbed(subscriptions)] });
        }

        if (subcommand === 'add') {
          try {
            const subscription = await addYoutubeSubscription({
              guildId: interaction.guildId,
              youtubeChannelLink: interaction.options.getString('youtube_channel_link', true),
              discordChannelId: interaction.options.getChannel('discord_channel', true).id,
              pingEveryone: interaction.options.getBoolean('ping_everyone') || false,
            });
            return interaction.reply({ embeds: [buildYoutubeSubscriptionEmbed(subscription)] });
          } catch (error) {
            return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Subscription failed', description: error.message })], ephemeral: true });
          }
        }

        if (subcommand === 'remove') {
          try {
            const result = await removeYoutubeSubscription({
              guildId: interaction.guildId,
              youtubeChannelLink: interaction.options.getString('youtube_channel_link', true),
            });

            if (!result.removed) {
              return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Nothing removed', description: 'No matching YouTube subscription was found for this server.' })], ephemeral: true });
            }

            return interaction.reply({
              embeds: [makeSuccessEmbed({ title: 'YouTube notifications removed', description: `Removed ${result.removed} subscription(s) for **${result.channelTitle || result.channelId}**.` })],
            });
          } catch (error) {
            return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Removal failed', description: error.message })], ephemeral: true });
          }
        }

        return null;
      },
      async executePrefix({ message, args }) {
        const subcommand = String(args[0] || '').toLowerCase();
        if (!subcommand || subcommand === 'list') {
          const subscriptions = await listYoutubeSubscriptions(message.guild.id);
          return message.reply({ embeds: [buildYoutubeSubscriptionListEmbed(subscriptions)] });
        }

        if (subcommand === 'add') {
          const youtubeChannelLink = args[1];
          const discordChannel = await resolveChannelFromToken(message.guild, args[2]);
          const pingEveryone = ['true', 'yes', 'on', '1'].includes(String(args[3] || '').toLowerCase());

          if (!youtubeChannelLink || !discordChannel) {
            return message.reply({ content: 'Usage: `Serenity yt-notify add <youtube-channel-url> #channel <true|false>`' });
          }

          try {
            const subscription = await addYoutubeSubscription({
              guildId: message.guild.id,
              youtubeChannelLink,
              discordChannelId: discordChannel.id,
              pingEveryone,
            });
            return message.reply({ embeds: [buildYoutubeSubscriptionEmbed(subscription)] });
          } catch (error) {
            return message.reply({ embeds: [makeWarningEmbed({ title: 'Subscription failed', description: error.message })] });
          }
        }

        if (subcommand === 'remove') {
          const youtubeChannelLink = args[1];
          if (!youtubeChannelLink) {
            return message.reply({ content: 'Usage: `Serenity yt-notify remove <youtube-channel-url>`' });
          }

          try {
            const result = await removeYoutubeSubscription({ guildId: message.guild.id, youtubeChannelLink });
            if (!result.removed) {
              return message.reply({ embeds: [makeWarningEmbed({ title: 'Nothing removed', description: 'No matching YouTube subscription was found for this server.' })] });
            }
            return message.reply({ embeds: [makeSuccessEmbed({ title: 'YouTube notifications removed', description: `Removed ${result.removed} subscription(s) for **${result.channelTitle || result.channelId}**.` })] });
          } catch (error) {
            return message.reply({ embeds: [makeWarningEmbed({ title: 'Removal failed', description: error.message })] });
          }
        }

        return message.reply({ content: 'Usage: `Serenity yt-notify <add|remove|list> ...`' });
      },
    },
  ],
};
