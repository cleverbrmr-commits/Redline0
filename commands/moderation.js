const { AttachmentBuilder, ChannelType, Colors, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { BACKUPS_DIR, UPLOADS_DIR, loadPrisonState, savePrisonState, writeJson } = require("../storage/clientsStore");
const { loadModules, findClientKey, getClientAutocompleteChoices } = require("../services/clientService");
const { logAnnouncement, logModeration, logPrison } = require("../services/logService");
const { makeEmbed, makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require("../utils/embeds");
const {
  PRISON_ROLE_NAME,
  brandEmoji,
  formatRoleMention,
  pick,
  resolveInteractionContext,
  trimText,
} = require("../utils/helpers");
const { canActOn } = require("../utils/permissions");

async function ensurePrisonRole(guild) {
  let role = guild.roles.cache.find((r) => r.name === PRISON_ROLE_NAME);

  if (!role) {
    role = await guild.roles.create({
      name: PRISON_ROLE_NAME,
      color: Colors.DarkGrey,
      permissions: [],
      reason: "Prison system initialization",
    });
  }

  const channels = guild.channels.cache.filter((ch) =>
    [
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.PublicThread,
      ChannelType.PrivateThread,
      ChannelType.GuildForum,
      ChannelType.GuildVoice,
      ChannelType.GuildStageVoice,
      ChannelType.GuildMedia,
    ].includes(ch.type)
  );

  for (const [, channel] of channels) {
    try {
      await channel.permissionOverwrites.edit(
        role,
        {
          SendMessages: false,
          AddReactions: false,
          SendMessagesInThreads: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
          Speak: false,
          Connect: false,
        },
        { reason: "Prison role channel restrictions" }
      );
    } catch (_) {}
  }

  return role;
}

async function clientNameAutocomplete(interaction) {
  const modules = await loadModules();
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "name") {
    return interaction.respond([]);
  }
  return interaction.respond(getClientAutocompleteChoices(modules, focused.value));
}

const commands = [
  {
    name: "announceclient",
    data: new SlashCommandBuilder()
      .setName("announceclient")
      .setDescription("Post a polished announcement for an existing client")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((o) => o.setName("name").setDescription("Client name or key").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("highlights").setDescription("Extra highlights for the release")),
    async execute({ interaction }) {
      const modules = await loadModules();
      const query = interaction.options.getString("name", true);
      const highlights = interaction.options.getString("highlights") || "Fresh drop ready to use.";
      const key = findClientKey(modules, query);

      if (!key) {
        return interaction.reply({ embeds: [makeWarningEmbed({ title: "Announcement failed", description: "That client could not be found." })], ephemeral: true });
      }

      const mod = modules[key];
      return interaction.reply({
        embeds: [
          makeEmbed({
            title: `${brandEmoji()} New release • ${mod.label}`,
            description: `${trimText(mod.description, 500)}\n\n**Highlights:** ${trimText(highlights, 700)}`,
            fields: [
              { name: "Version", value: trimText(mod.version, 100), inline: true },
              { name: "Loader", value: trimText(mod.loader, 100), inline: true },
              { name: "MC Version", value: trimText(mod.mcVersion, 100), inline: true },
              { name: "Status", value: trimText(mod.status, 100), inline: true },
              { name: "Access", value: formatRoleMention(mod.accessRoleId), inline: true },
              { name: "Get it", value: "Use `/clients` or the public panel to download it.", inline: true },
            ],
            color: Colors.Gold,
          }),
        ],
      });
    },
    autocomplete: ({ interaction }) => clientNameAutocomplete(interaction),
  },
  {
    name: "exportclients",
    data: new SlashCommandBuilder()
      .setName("exportclients")
      .setDescription("Export the current client metadata")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute({ interaction }) {
      const modules = await loadModules();
      const exportPath = require("path").join(BACKUPS_DIR, `clients-export-${Date.now()}.json`);
      await writeJson(exportPath, modules);

      return interaction.reply({
        embeds: [makeSuccessEmbed({ title: "Export ready", description: "Client metadata export generated." })],
        files: [new AttachmentBuilder(exportPath, { name: require("path").basename(exportPath) })],
        ephemeral: true,
      });
    },
  },
  {
    name: "backup",
    data: new SlashCommandBuilder()
      .setName("backup")
      .setDescription("Create a JSON backup snapshot")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute({ interaction }) {
      const modules = await loadModules();
      const prisonState = await loadPrisonState();
      const backupPath = require("path").join(BACKUPS_DIR, `backup-${Date.now()}.json`);
      await writeJson(backupPath, { modules, prisonState, createdAt: new Date().toISOString() });

      return interaction.reply({
        embeds: [makeSuccessEmbed({ title: "Backup created", description: "Backup snapshot created successfully." })],
        files: [new AttachmentBuilder(backupPath, { name: require("path").basename(backupPath) })],
        ephemeral: true,
      });
    },
  },
  {
    name: "kick",
    data: new SlashCommandBuilder()
      .setName("kick")
      .setDescription("Kick a member from the server")
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .addUserOption((o) => o.setName("user").setDescription("Member to kick").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Why they are being kicked")),
    async execute({ client, interaction }) {
      const { guild, actorMember } = await resolveInteractionContext(client, interaction);
      if (!guild || !actorMember) {
        return interaction.reply({ embeds: [makeWarningEmbed({ title: "Kick failed", description: "Guild context was unavailable. Try again in a second." })], ephemeral: true });
      }

      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason") || "No reason provided";
      const member = await guild.members.fetch(user.id).catch(() => null);

      if (!member) {
        return interaction.reply({ embeds: [makeWarningEmbed({ title: "Kick failed", description: "That user is not in this server." })], ephemeral: true });
      }

      if (!canActOn(actorMember, member) || !member.kickable) {
        return interaction.reply({ embeds: [makeWarningEmbed({ title: "Kick denied", description: "Role hierarchy prevents this kick (you or the bot are below the target)." })], ephemeral: true });
      }

      await member.kick(reason);
      await logModeration(client, "Kick", interaction, user, reason);

      return interaction.reply({ embeds: [makeSuccessEmbed({ title: `${brandEmoji()} Member kicked`, description: `**${user.tag}** was kicked.`, fields: [{ name: "Reason", value: trimText(reason, 1024) }] })] });
    },
  },
  {
    name: "ban",
    data: new SlashCommandBuilder()
      .setName("ban")
      .setDescription("Ban a member from the server")
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption((o) => o.setName("user").setDescription("Member to ban").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Why they are being banned"))
      .addIntegerOption((o) => o.setName("delete_days").setDescription("Delete up to 7 days of message history").setMinValue(0).setMaxValue(7)),
    async execute({ client, interaction }) {
      const { guild, actorMember } = await resolveInteractionContext(client, interaction);
      if (!guild || !actorMember) {
        return interaction.reply({ embeds: [makeWarningEmbed({ title: "Ban failed", description: "Guild context was unavailable. Try again in a second." })], ephemeral: true });
      }

      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason") || "No reason provided";
      const deleteDays = interaction.options.getInteger("delete_days") || 0;
      const member = await guild.members.fetch(user.id).catch(() => null);

      if (member && (!canActOn(actorMember, member) || !member.bannable)) {
        return interaction.reply({ embeds: [makeWarningEmbed({ title: "Ban denied", description: "Role hierarchy prevents this ban (you or the bot are below the target)." })], ephemeral: true });
      }

      await guild.members.ban(user.id, {
        reason,
        deleteMessageSeconds: deleteDays * 86400,
      });
      await logModeration(client, "Ban", interaction, user, reason);

      return interaction.reply({ embeds: [makeSuccessEmbed({ title: `${brandEmoji()} Member banned`, description: `**${user.tag}** was banned.`, fields: [{ name: "Reason", value: trimText(reason, 1024) }] })] });
    },
  },
  {
    name: "prison",
    data: new SlashCommandBuilder()
      .setName("prison")
      .setDescription("Lock a member from sending messages until released")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption((o) => o.setName("user").setDescription("Member to imprison").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Why they were imprisoned")),
    async execute({ client, interaction }) {
      const { guild, actorMember, botMember } = await resolveInteractionContext(client, interaction);
      if (!guild || !actorMember || !botMember) {
        return interaction.reply({ embeds: [makeWarningEmbed({ title: "Prison failed", description: "Guild context was unavailable. Try again in a second." })], ephemeral: true });
      }

      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason") || "No reason provided";
      const member = await guild.members.fetch(user.id).catch(() => null);

      if (!member) {
        return interaction.reply({ embeds: [makeWarningEmbed({ title: "Prison failed", description: "That user is not in this server." })], ephemeral: true });
      }

      if (!canActOn(actorMember, member)) {
        return interaction.reply({ embeds: [makeWarningEmbed({ title: "Prison denied", description: "You cannot prison someone above or equal to your highest role." })], ephemeral: true });
      }

      const prisonRole = await ensurePrisonRole(guild);
      if (prisonRole.position >= botMember.roles.highest.position) {
        return interaction.reply({ embeds: [makeWarningEmbed({ title: "Prison setup blocked", description: "Move the bot role above the Prisoner role, then try again." })], ephemeral: true });
      }

      const removableRoleIds = member.roles.cache
        .filter((role) => role.id !== guild.id && role.id !== prisonRole.id && role.position < botMember.roles.highest.position)
        .map((role) => role.id);

      if (removableRoleIds.length) {
        await member.roles.remove(removableRoleIds, "Roles removed during prison");
      }

      await member.roles.add(prisonRole, reason);

      const prisonState = await loadPrisonState();
      prisonState[member.id] = {
        reason,
        by: interaction.user.id,
        at: new Date().toISOString(),
        removedRoleIds: removableRoleIds,
      };
      await savePrisonState(prisonState);

      await logPrison(
        client,
        interaction,
        "Prison applied",
        `**${user.tag}** was imprisoned.`,
        [
          { name: "Reason", value: trimText(reason, 1024) },
          { name: "Roles removed", value: removableRoleIds.length ? removableRoleIds.map((id) => `<@&${id}>`).join(", ") : "None" },
        ]
      );

      return interaction.reply({ embeds: [makeInfoEmbed({ title: `${brandEmoji()} Prisoned`, description: `**${user.tag}** has been locked down until released.`, fields: [{ name: "Reason", value: trimText(reason, 1024) }, { name: "Role", value: prisonRole.name, inline: true }] })] });
    },
  },
  {
    name: "unprison",
    data: new SlashCommandBuilder()
      .setName("unprison")
      .setDescription("Release a member from prison")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption((o) => o.setName("user").setDescription("Member to release").setRequired(true))
      .addStringOption((o) => o.setName("note").setDescription("Optional release note")),
    async execute({ client, interaction }) {
      const { guild, botMember } = await resolveInteractionContext(client, interaction);
      if (!guild || !botMember) {
        return interaction.reply({ embeds: [makeWarningEmbed({ title: "Release failed", description: "Guild context was unavailable. Try again in a second." })], ephemeral: true });
      }

      const user = interaction.options.getUser("user", true);
      const note = interaction.options.getString("note") || "No release note provided";
      const member = await guild.members.fetch(user.id).catch(() => null);
      const prisonRole = guild.roles.cache.find((r) => r.name === PRISON_ROLE_NAME);

      if (!member || !prisonRole) {
        return interaction.reply({ embeds: [makeWarningEmbed({ title: "Release failed", description: "That member or the Prisoner role could not be found." })], ephemeral: true });
      }

      await member.roles.remove(prisonRole, "Released from prison");

      const prisonState = await loadPrisonState();
      const record = prisonState[member.id];
      const restoreRoleIds = (record?.removedRoleIds || []).filter((roleId) => {
        const role = guild.roles.cache.get(roleId);
        return role && role.position < botMember.roles.highest.position;
      });

      if (restoreRoleIds.length) {
        await member.roles.add(restoreRoleIds, "Roles restored after prison release");
      }

      delete prisonState[member.id];
      await savePrisonState(prisonState);

      await logPrison(
        client,
        interaction,
        "Prison released",
        `**${user.tag}** was released from prison.`,
        [
          { name: "Release note", value: trimText(note, 1024) },
          { name: "Roles restored", value: restoreRoleIds.length ? restoreRoleIds.map((id) => `<@&${id}>`).join(", ") : "None" },
        ],
        Colors.Green
      );

      return interaction.reply({ embeds: [makeSuccessEmbed({ title: `${brandEmoji()} Released`, description: `**${user.tag}** is no longer imprisoned.`, fields: [{ name: "Release note", value: trimText(note, 1024) }] })] });
    },
  },
  {
    name: "prisonlist",
    data: new SlashCommandBuilder()
      .setName("prisonlist")
      .setDescription("Show currently imprisoned members")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    async execute({ interaction }) {
      const prisonState = await loadPrisonState();
      const entries = Object.entries(prisonState);

      if (!entries.length) {
        return interaction.reply({ embeds: [makeInfoEmbed({ title: "Prison list", description: "Nobody is currently imprisoned." })], ephemeral: true });
      }

      const lines = entries.slice(0, 20).map(([userId, record]) => `• <@${userId}> — ${trimText(record.reason, 80)} — <t:${Math.floor(new Date(record.at).getTime() / 1000)}:R>`);
      return interaction.reply({ embeds: [makeInfoEmbed({ title: "Prison list", description: lines.join("\n") })], ephemeral: true });
    },
  },
  {
    name: "prisonreason",
    data: new SlashCommandBuilder()
      .setName("prisonreason")
      .setDescription("Show the stored prison reason for a user")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption((o) => o.setName("user").setDescription("Member to inspect").setRequired(true)),
    async execute({ interaction }) {
      const user = interaction.options.getUser("user", true);
      const prisonState = await loadPrisonState();
      const record = prisonState[user.id];

      if (!record) {
        return interaction.reply({ embeds: [makeWarningEmbed({ title: "No prison record", description: `No active prison record found for **${user.tag}**.` })], ephemeral: true });
      }

      return interaction.reply({
        embeds: [makeInfoEmbed({
          title: `Prison record • ${user.tag}`,
          description: trimText(record.reason, 1024),
          fields: [
            { name: "Imprisoned by", value: `<@${record.by}>`, inline: true },
            { name: "When", value: `<t:${Math.floor(new Date(record.at).getTime() / 1000)}:F>`, inline: true },
          ],
        })],
        ephemeral: true,
      });
    },
  },
  {
    name: "announce",
    data: new SlashCommandBuilder()
      .setName("announce")
      .setDescription("Send a styled announcement and ping everyone")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((o) => o.setName("title").setDescription("Announcement title").setRequired(true))
      .addStringOption((o) => o.setName("message").setDescription("Announcement body").setRequired(true)),
    async execute({ client, interaction }) {
      const title = interaction.options.getString("title", true);
      const message = interaction.options.getString("message", true);

      const styles = [
        { prefix: "⚡ Breaking", footer: "REDLINE • Announcement Drop", color: Colors.Red },
        { prefix: "🔥 Live Update", footer: "REDLINE • Signal Boosted", color: Colors.OrangeRed },
        { prefix: "🚀 Heads Up", footer: "REDLINE • Server Broadcast", color: Colors.Blurple },
        { prefix: "🩸 REDLINE Notice", footer: "REDLINE • Priority Broadcast", color: Colors.Gold },
      ];

      const style = pick(styles);
      await logAnnouncement(client, interaction, title);

      return interaction.reply({
        content: "@everyone",
        allowedMentions: { parse: ["everyone"] },
        embeds: [makeEmbed({ title: `${style.prefix} • ${trimText(title, 220)}`, description: message, footer: style.footer, color: style.color })],
      });
    },
  },
];

module.exports = { commands };
