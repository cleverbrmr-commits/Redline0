const path = require('path');
const { AttachmentBuilder, Colors, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { BACKUPS_DIR, loadPrisonState, writeJson } = require('../storage/clientsStore');
const { findClientKey, getClientAutocompleteChoices, loadModules } = require('../services/clientService');
const { makeEmbed, makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');
const { brandEmoji, formatRoleMention, trimText } = require('../utils/helpers');

async function clientNameAutocomplete(interaction) {
  const modules = await loadModules();
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'name') {
    return interaction.respond([]);
  }
  return interaction.respond(getClientAutocompleteChoices(modules, focused.value));
}

module.exports = {
  commands: [
    {
      name: 'announceclient',
      metadata: {
        category: 'client/content management',
        description: 'Post a polished announcement for an existing client.',
        usage: ['/announceclient name:<client> highlights:<text>'],
        prefixEnabled: false,
        examples: ['/announceclient name:alpha highlights:New bypasses and fixes'],
        permissions: ['Manage Guild'],
        response: 'public',
      },
      data: new SlashCommandBuilder()
        .setName('announceclient')
        .setDescription('Post a polished announcement for an existing client')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption((option) => option.setName('name').setDescription('Client name or key').setRequired(true).setAutocomplete(true))
        .addStringOption((option) => option.setName('highlights').setDescription('Extra highlights for the release')),
      async execute({ interaction }) {
        const modules = await loadModules();
        const query = interaction.options.getString('name', true);
        const highlights = interaction.options.getString('highlights') || 'Fresh drop ready to use.';
        const key = findClientKey(modules, query);

        if (!key) {
          return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Announcement failed', description: 'That client could not be found.' })], ephemeral: true });
        }

        const mod = modules[key];
        return interaction.reply({
          embeds: [
            makeEmbed({
              title: `${brandEmoji()} New release • ${mod.label}`,
              description: `${trimText(mod.description, 500)}\n\n**Highlights:** ${trimText(highlights, 700)}`,
              fields: [
                { name: 'Version', value: trimText(mod.version, 100), inline: true },
                { name: 'Loader', value: trimText(mod.loader, 100), inline: true },
                { name: 'MC Version', value: trimText(mod.mcVersion, 100), inline: true },
                { name: 'Status', value: trimText(mod.status, 100), inline: true },
                { name: 'Access', value: formatRoleMention(mod.accessRoleId), inline: true },
                { name: 'Get it', value: 'Use `/clients` or the public panel to download it.', inline: true },
              ],
              color: Colors.Gold,
            }),
          ],
        });
      },
      autocomplete: ({ interaction }) => clientNameAutocomplete(interaction),
    },
    {
      name: 'exportclients',
      metadata: {
        category: 'client/content management',
        description: 'Export the current client metadata as JSON.',
        usage: ['/exportclients'],
        prefixEnabled: false,
        examples: ['/exportclients'],
        permissions: ['Manage Guild'],
        response: 'ephemeral',
      },
      data: new SlashCommandBuilder()
        .setName('exportclients')
        .setDescription('Export the current client metadata')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      async execute({ interaction }) {
        const modules = await loadModules();
        const exportPath = path.join(BACKUPS_DIR, `clients-export-${Date.now()}.json`);
        await writeJson(exportPath, modules);

        return interaction.reply({
          embeds: [makeSuccessEmbed({ title: 'Export ready', description: 'Client metadata export generated.' })],
          files: [new AttachmentBuilder(exportPath, { name: path.basename(exportPath) })],
          ephemeral: true,
        });
      },
    },
    {
      name: 'backup',
      metadata: {
        category: 'client/content management',
        description: 'Create a backup snapshot of client metadata and prison state.',
        usage: ['/backup'],
        prefixEnabled: false,
        examples: ['/backup'],
        permissions: ['Manage Guild'],
        response: 'ephemeral',
      },
      data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Create a JSON backup snapshot')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      async execute({ interaction }) {
        const modules = await loadModules();
        const prisonState = await loadPrisonState();
        const backupPath = path.join(BACKUPS_DIR, `backup-${Date.now()}.json`);
        await writeJson(backupPath, { modules, prisonState, createdAt: new Date().toISOString() });

        return interaction.reply({
          embeds: [makeSuccessEmbed({ title: 'Backup created', description: 'Backup snapshot created successfully.' })],
          files: [new AttachmentBuilder(backupPath, { name: path.basename(backupPath) })],
          ephemeral: true,
        });
      },
    },
  ],
};
