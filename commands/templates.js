const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('../services/configService');
const { buildTemplatePreviewFields, describeTemplateFamily, getTemplateFamily, listTemplateFamilies } = require('../services/templateService');
const { makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');

module.exports = {
  commands: [
    {
      name: 'templates',
      metadata: {
        category: 'system',
        description: 'Browse Serenity template families and set module defaults for welcome, announcements, tickets, polls, embeds, and auto responders.',
        usage: ['/templates browse family:<family>', '/templates set family:<family> style:<style>'],
        examples: ['/templates browse family:welcome', '/templates set family:ticket style:report'],
        permissions: ['Manage Guild'],
        response: 'ephemeral',
        configDependencies: ['modules.templates.defaults'],
      },
      data: new SlashCommandBuilder()
        .setName('templates')
        .setDescription('Browse Serenity template presets')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) => sub.setName('list').setDescription('List all template families'))
        .addSubcommand((sub) =>
          sub
            .setName('browse')
            .setDescription('Browse one template family')
            .addStringOption((option) => option.setName('family').setDescription('Template family').setRequired(true).addChoices(...listTemplateFamilies().map((entry) => ({ name: entry.label, value: entry.key }))))
        )
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setDescription('Set a default template style for one family')
            .addStringOption((option) => option.setName('family').setDescription('Template family').setRequired(true).addChoices(...listTemplateFamilies().map((entry) => ({ name: entry.label, value: entry.key }))))
            .addStringOption((option) => option.setName('style').setDescription('Style key').setRequired(true))
        ),
      async execute({ interaction }) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (subcommand === 'list') {
          const config = await getGuildConfig(guildId);
          return interaction.reply({
            embeds: [makeInfoEmbed({
              title: 'Template families',
              description: 'Serenity uses reusable template families to keep public-facing modules visually consistent.',
              fields: listTemplateFamilies().map((entry) => ({
                name: entry.label,
                value: `${describeTemplateFamily(entry.key)}\nDefault • **${config.modules.templates.defaults[entry.key] || 'n/a'}**`,
                inline: false,
              })),
              footer: 'SERENITY • Template system',
            })],
            ephemeral: true,
          });
        }

        const familyKey = interaction.options.getString('family', true);
        const family = getTemplateFamily(familyKey);
        if (!family) {
          return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Template family unavailable', description: `No template family matched **${familyKey}**.` })], ephemeral: true });
        }

        if (subcommand === 'browse') {
          return interaction.reply({
            embeds: [makeInfoEmbed({
              title: `${family.label}`,
              description: describeTemplateFamily(family.key),
              fields: buildTemplatePreviewFields(family.key),
              footer: 'SERENITY • Template system',
            })],
            ephemeral: true,
          });
        }

        const style = interaction.options.getString('style', true).toLowerCase();
        if (!family.styles[style]) {
          return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Template style unavailable', description: `**${style}** is not available for the **${family.label}** family.` })], ephemeral: true });
        }
        await updateGuildConfig(guildId, { modules: { templates: { defaults: { [family.key]: style } } } });
        return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Template default updated', description: `The **${family.label}** family now defaults to **${style}**.` })], ephemeral: true });
      },
    },
  ],
};
