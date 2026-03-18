const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const {
  buildPollMessagePayload,
  buildPollUsageEmbed,
  parsePrefixPollArgs,
  sendPollMessage,
} = require('../services/pollService');
const { makeSuccessEmbed } = require('../utils/embeds');
const { hasGuildPermission } = require('../utils/permissions');

const MAX_POLL_OPTIONS = 10;

function addPollOptions(subcommand) {
  let builder = subcommand
    .addStringOption((option) => option.setName('question').setDescription('Poll question').setRequired(true))
    .addStringOption((option) => option.setName('option1').setDescription('First option').setRequired(true))
    .addStringOption((option) => option.setName('option2').setDescription('Second option').setRequired(true));

  for (let index = 3; index <= MAX_POLL_OPTIONS; index += 1) {
    builder = builder.addStringOption((option) => option.setName(`option${index}`).setDescription(`Option ${index}`));
  }

  return builder;
}

function extractSlashOptions(interaction) {
  const options = [];
  for (let index = 1; index <= MAX_POLL_OPTIONS; index += 1) {
    const value = interaction.options.getString(`option${index}`);
    if (value) {
      options.push(value);
    }
  }
  return options;
}

async function createPoll({ channel, mode, question, options, authorTag }) {
  const payload = buildPollMessagePayload({ mode, question, options, authorTag });
  return sendPollMessage(channel, payload);
}

module.exports = {
  commands: [
    {
      name: 'poll',
      metadata: {
        category: 'utility',
        description: 'Create modular reaction polls in embed or normal mode.',
        usage: ['/poll embed question option1 option2 [option3...]', '/poll normal question option1 option2 [option3...]'],
        prefixEnabled: true,
        prefixUsage: ['Serenity poll embed Best client? | Volt | Apex | Nova', 'Serenity poll normal Favorite mode? | Survival | PvP | Skyblock'],
        examples: ['/poll embed question:Best client? option1:Volt option2:Apex option3:Nova', 'Serenity poll normal Best mode? | Survival | PvP'],
        permissions: ['Manage Messages'],
        response: 'ephemeral confirmation + public poll message',
      },
      data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a reaction poll')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand((sub) => addPollOptions(sub.setName('embed').setDescription('Create an embed poll')))
        .addSubcommand((sub) => addPollOptions(sub.setName('normal').setDescription('Create a normal text poll'))),
      async execute({ interaction }) {
        const mode = interaction.options.getSubcommand();
        const question = interaction.options.getString('question', true);
        const options = extractSlashOptions(interaction);
        const pollMessage = await createPoll({
          channel: interaction.channel,
          mode,
          question,
          options,
          authorTag: interaction.member?.toString() || interaction.user.toString(),
        });

        return interaction.reply({
          embeds: [
            makeSuccessEmbed({
              title: 'Poll posted',
              description: `Your ${mode} poll is now live in <#${pollMessage.channelId}>.`,
            }),
          ],
          ephemeral: true,
        });
      },
      async executePrefix({ message, args, prefixName }) {
        if (!hasGuildPermission(message.member, PermissionFlagsBits.ManageMessages)) {
          throw new Error('You need **Manage Messages** to create polls.');
        }

        if (!args.length) {
          return message.reply({ embeds: [buildPollUsageEmbed(prefixName)] });
        }

        const parsed = parsePrefixPollArgs(args);
        await createPoll({
          channel: message.channel,
          mode: parsed.mode,
          question: parsed.question,
          options: parsed.options,
          authorTag: message.member?.toString() || message.author.toString(),
        });

        return message.reply({
          embeds: [
            makeSuccessEmbed({
              title: 'Poll posted',
              description: `Your ${parsed.mode} poll is now live in ${message.channel}.`,
            }),
          ],
        });
      },
    },
  ],
};
