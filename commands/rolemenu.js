const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { attachRoleMenuMessage, buildRoleMenuComponents, buildRoleMenuEmbed, getRoleMenus, upsertRoleMenu } = require('../services/roleMenuService');
const { makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');

const STYLES = ['buttons', 'compact', 'premium'].map((value) => ({ name: value, value }));

module.exports = {
  commands: [
    {
      name: 'rolemenu',
      metadata: {
        category: 'roles',
        description: 'Create premium self-assign role menus with descriptions, menu ownership, and single-select behavior.',
        usage: ['/rolemenu create name:<name> role_1:@role ...', '/rolemenu publish name:<name> channel:#roles', '/rolemenu list'],
        examples: ['/rolemenu create name:Interests role_1:@Announcements label_1:Announcements description_1:Get news first', '/rolemenu publish name:Interests channel:#roles'],
        permissions: ['Manage Roles'],
        response: 'ephemeral',
        configDependencies: ['modules.roles.menus', 'modules.logging.channels.rolemenus'],
      },
      data: new SlashCommandBuilder()
        .setName('rolemenu')
        .setDescription('Configure Serenity role menus')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand((sub) => sub.setName('list').setDescription('List configured role menus'))
        .addSubcommand((sub) =>
          sub
            .setName('create')
            .setDescription('Create or update a role menu definition')
            .addStringOption((option) => option.setName('name').setDescription('Menu name').setRequired(true))
            .addStringOption((option) => option.setName('description').setDescription('Menu description'))
            .addStringOption((option) => option.setName('style').setDescription('Visual style').addChoices(...STYLES))
            .addBooleanOption((option) => option.setName('single_select').setDescription('Only allow one role from this menu'))
            .addRoleOption((option) => option.setName('role_1').setDescription('First role').setRequired(true))
            .addStringOption((option) => option.setName('label_1').setDescription('First role label'))
            .addStringOption((option) => option.setName('description_1').setDescription('First role description'))
            .addStringOption((option) => option.setName('emoji_1').setDescription('First role emoji'))
            .addRoleOption((option) => option.setName('role_2').setDescription('Second role'))
            .addStringOption((option) => option.setName('label_2').setDescription('Second role label'))
            .addStringOption((option) => option.setName('description_2').setDescription('Second role description'))
            .addStringOption((option) => option.setName('emoji_2').setDescription('Second role emoji'))
            .addRoleOption((option) => option.setName('role_3').setDescription('Third role'))
            .addStringOption((option) => option.setName('label_3').setDescription('Third role label'))
            .addStringOption((option) => option.setName('description_3').setDescription('Third role description'))
            .addStringOption((option) => option.setName('emoji_3').setDescription('Third role emoji')))
        .addSubcommand((sub) =>
          sub
            .setName('publish')
            .setDescription('Publish a configured role menu into a channel')
            .addStringOption((option) => option.setName('name').setDescription('Menu name').setRequired(true))
            .addChannelOption((option) => option.setName('channel').setDescription('Target channel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))),
      async execute({ interaction }) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (subcommand === 'list') {
          const menus = await getRoleMenus(guildId);
          if (!menus.length) {
            return interaction.reply({ embeds: [makeInfoEmbed({ title: 'Role menus', description: 'No role menus are configured yet.' })], ephemeral: true });
          }
          return interaction.reply({ embeds: [makeInfoEmbed({ title: 'Role menus', description: menus.map((menu) => `• **${menu.name}** — ${menu.options.length} option(s) • ${menu.messageId ? 'published' : 'draft'}`).join('\n') })], ephemeral: true });
        }

        if (subcommand === 'create') {
          const options = [1, 2, 3].map((index) => {
            const role = interaction.options.getRole(`role_${index}`);
            if (!role) return null;
            return {
              roleId: role.id,
              label: interaction.options.getString(`label_${index}`) || role.name,
              description: interaction.options.getString(`description_${index}`) || 'Self-assign this role.',
              emoji: interaction.options.getString(`emoji_${index}`) || null,
            };
          }).filter(Boolean);

          const menu = await upsertRoleMenu(guildId, {
            name: interaction.options.getString('name', true),
            description: interaction.options.getString('description') || 'Choose the roles that match your interests.',
            style: interaction.options.getString('style') || 'buttons',
            singleSelect: interaction.options.getBoolean('single_select') || false,
            options,
          });
          return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Role menu saved', description: `Saved **${menu.name}** with **${menu.options.length}** role option(s).` })], ephemeral: true });
        }

        const name = interaction.options.getString('name', true);
        const menu = (await getRoleMenus(guildId)).find((entry) => entry.name.toLowerCase() === name.toLowerCase());
        if (!menu) {
          return interaction.reply({ embeds: [makeWarningEmbed({ title: 'Role menu not found', description: `No role menu named **${name}** exists yet.` })], ephemeral: true });
        }

        const channel = interaction.options.getChannel('channel', true);
        const message = await channel.send({ embeds: [buildRoleMenuEmbed(menu)], components: buildRoleMenuComponents(menu) });
        await attachRoleMenuMessage(guildId, name, channel.id, message.id);
        return interaction.reply({ embeds: [makeSuccessEmbed({ title: 'Role menu published', description: `Published **${menu.name}** in <#${channel.id}>.` })], ephemeral: true });
      },
    },
  ],
};
