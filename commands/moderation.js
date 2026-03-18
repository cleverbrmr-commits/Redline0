const path = require("path");
const {
  AttachmentBuilder,
  ChannelType,
  Colors,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require("discord.js");
const { BACKUPS_DIR, loadPrisonState, savePrisonState, writeJson } = require("../storage/clientsStore");
const { loadWarningsRaw, saveWarningsRaw } = require("../storage/warningsStore");
const { loadModules, findClientKey, getClientAutocompleteChoices } = require("../services/clientService");
const { loadConfig, saveConfig } = require("../services/configService");
const { logAnnouncement, logModeration, logPrison } = require("../services/logService");
const { makeEmbed, makeInfoEmbed, makeModerationEmbed, makeSuccessEmbed, makeWarningEmbed } = require("../utils/embeds");
const {
  PRISON_ROLE_NAME,
  brandEmoji,
  formatRoleMention,
  formatDuration,
  pick,
  resolveInteractionContext,
  trimText,
} = require("../utils/helpers");
const { canActOn } = require("../utils/permissions");

async function ensurePrisonRole(guild) {
  const config = await loadConfig();
  let role = (config.prisonerRoleId && guild.roles.cache.get(config.prisonerRoleId)) || guild.roles.cache.find((entry) => entry.name === PRISON_ROLE_NAME);

  if (!role) {
    role = await guild.roles.create({
      name: PRISON_ROLE_NAME,
      color: Colors.DarkRed,
      permissions: [],
      reason: "Prison system initialization",
    });
  }

  if (config.prisonerRoleId !== role.id) {
    await saveConfig({ ...config, prisonerRoleId: role.id });
  }

  const channels = guild.channels.cache.filter((channel) =>
    [
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.PublicThread,
      ChannelType.PrivateThread,
      ChannelType.GuildForum,
      ChannelType.GuildVoice,
      ChannelType.GuildStageVoice,
      ChannelType.GuildMedia,
    ].includes(channel.type)
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
    } catch {}
  }

  return role;
}

async function clientNameAutocomplete(interaction) {
  const modules = await loadModules();
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "name") return interaction.respond([]);
  return interaction.respond(getClientAutocompleteChoices(modules, focused.value));
}

async function loadWarnings() {
  return loadWarningsRaw({});
}

async function saveWarnings(warnings) {
  await saveWarningsRaw(warnings);
}

async function appendWarningRecord(userId, record) {
  const warnings = await loadWarnings();
  warnings[userId] = Array.isArray(warnings[userId]) ? warnings[userId] : [];
  warnings[userId].push(record);
  await saveWarnings(warnings);
  return warnings[userId];
}

const commands = [
  {
    name: "announceclient",
    data: new SlashCommandBuilder()
      .setName("announceclient")
      .setDescription("Post a polished announcement for an existing client")
      .addStringOption((o) => o.setName("name").setDescription("Client name or key").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("highlights").setDescription("Extra highlights for the release")),
    async execute({ interaction }) {
      const modules = await loadModules();
      const query = interaction.options.getString("name", true);
      const highlights = interaction.options.getString("highlights") || "Fresh drop ready to use.";
      const key = findClientKey(modules, query);

      if (!key) {
        return interaction.reply({ content: "That client could not be found.", ephemeral: true });
      }

      const mod = modules[key];
      return interaction.reply({
        embeds: [makeEmbed({
          title: `${brandEmoji()} New release • ${mod.label}`,
          description: `${trimText(mod.description, 500)}\n\n**Highlights:** ${trimText(highlights, 700)}`,
          fields: [
            { name: "Version", value: trimText(mod.version, 100), inline: true },
            { name: "Loader", value: trimText(mod.loader, 100), inline: true },
            { name: "MC Version", value: trimText(mod.mcVersion, 100), inline: true },
            { name: "Status", value: trimText(mod.status, 100), inline: true },
            { name: "Access", value: formatRoleMention(mod.accessRoleId), inline: true },
            { name: "Get it", value: "Use `/clients` to open the private browser.", inline: true },
          ],
          color: Colors.DarkRed,
        })],
      });
    },
    autocomplete: ({ interaction }) => clientNameAutocomplete(interaction),
  },
  {
    name: "exportclients",
    data: new SlashCommandBuilder().setName("exportclients").setDescription("Export the current client metadata"),
    async execute({ interaction }) {
      const modules = await loadModules();
      const exportPath = path.join(BACKUPS_DIR, `clients-export-${Date.now()}.json`);
      await writeJson(exportPath, modules);
      return interaction.reply({
        embeds: [makeSuccessEmbed({ title: "Export ready", description: "Client metadata export generated." })],
        files: [new AttachmentBuilder(exportPath, { name: path.basename(exportPath) })],
        ephemeral: true,
      });
    },
  },
  {
    name: "backup",
    data: new SlashCommandBuilder().setName("backup").setDescription("Create a JSON backup snapshot"),
    async execute({ interaction }) {
      const modules = await loadModules();
      const prisonState = await loadPrisonState();
      const warnings = await loadWarnings();
      const backupPath = path.join(BACKUPS_DIR, `backup-${Date.now()}.json`);
      await writeJson(backupPath, { modules, prisonState, warnings, createdAt: new Date().toISOString() });
      return interaction.reply({
        embeds: [makeSuccessEmbed({ title: "Backup created", description: "Backup snapshot created successfully." })],
        files: [new AttachmentBuilder(backupPath, { name: path.basename(backupPath) })],
        ephemeral: true,
      });
    },
  },
  {
    name: "warn",
    data: new SlashCommandBuilder()
      .setName("warn")
      .setDescription("Warn a member")
      .addUserOption((o) => o.setName("user").setDescription("Member to warn").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Reason for the warning").setRequired(true)),
    async execute({ client, interaction }) {
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason", true);
      const records = await appendWarningRecord(user.id, { reason, moderatorId: interaction.user.id, at: new Date().toISOString() });
      await logModeration(client, "Warn", interaction, user, reason);
      return interaction.reply({
        embeds: [makeModerationEmbed({ action: "Warning Issued", moderator: `<@${interaction.user.id}>`, target: `<@${user.id}>`, reason, extraFields: [{ name: "Total warnings", value: String(records.length), inline: true }] })],
      });
    },
  },
  {
    name: "warnings",
    data: new SlashCommandBuilder()
      .setName("warnings")
      .setDescription("Show warnings for a member")
      .addUserOption((o) => o.setName("user").setDescription("Member to inspect").setRequired(true)),
    async execute({ interaction }) {
      const user = interaction.options.getUser("user", true);
      const warnings = await loadWarnings();
      const records = warnings[user.id] || [];
      if (!records.length) {
        return interaction.reply({ content: `No warnings found for ${user.tag}.`, ephemeral: true });
      }
      const description = records.slice(0, 10).map((record, index) => `${index + 1}. ${trimText(record.reason, 120)} • <@${record.moderatorId}> • <t:${Math.floor(new Date(record.at).getTime() / 1000)}:R>`).join("\n");
      return interaction.reply({ embeds: [makeInfoEmbed({ title: `Warnings • ${user.tag}`, description })], ephemeral: true });
    },
  },
  {
    name: "clearwarns",
    data: new SlashCommandBuilder()
      .setName("clearwarns")
      .setDescription("Clear all warnings for a member")
      .addUserOption((o) => o.setName("user").setDescription("Member whose warnings to clear").setRequired(true)),
    async execute({ client, interaction }) {
      const user = interaction.options.getUser("user", true);
      const warnings = await loadWarnings();
      const count = (warnings[user.id] || []).length;
      delete warnings[user.id];
      await saveWarnings(warnings);
      await logModeration(client, "Clear Warns", interaction, user, `Removed ${count} warnings`);
      return interaction.reply({ embeds: [makeSuccessEmbed({ title: "Warnings cleared", description: `Removed **${count}** warning(s) for ${user.tag}.` })] });
    },
  },
  {
    name: "timeout",
    data: new SlashCommandBuilder()
      .setName("timeout")
      .setDescription("Timeout a member")
      .addUserOption((o) => o.setName("user").setDescription("Member to timeout").setRequired(true))
      .addIntegerOption((o) => o.setName("minutes").setDescription("Timeout length in minutes").setRequired(true).setMinValue(1).setMaxValue(40320))
      .addStringOption((o) => o.setName("reason").setDescription("Reason for the timeout")),
    async execute({ client, interaction }) {
      const { guild, actorMember } = await resolveInteractionContext(client, interaction);
      const user = interaction.options.getUser("user", true);
      const minutes = interaction.options.getInteger("minutes", true);
      const reason = interaction.options.getString("reason") || "No reason provided";
      const member = guild ? await guild.members.fetch(user.id).catch(() => null) : null;
      if (!member) return interaction.reply({ content: "That user is not in this server.", ephemeral: true });
      if (!canActOn(actorMember, member) || !member.moderatable) return interaction.reply({ content: "Role hierarchy prevents this timeout.", ephemeral: true });
      await member.timeout(minutes * 60000, reason);
      await logModeration(client, "Timeout", interaction, user, reason);
      return interaction.reply({ embeds: [makeModerationEmbed({ action: "Timeout Applied", moderator: `<@${interaction.user.id}>`, target: `<@${user.id}>`, reason, extraFields: [{ name: "Duration", value: formatDuration(minutes * 60000), inline: true }] })] });
    },
  },
  {
    name: "untimeout",
    data: new SlashCommandBuilder()
      .setName("untimeout")
      .setDescription("Remove a timeout from a member")
      .addUserOption((o) => o.setName("user").setDescription("Member to untimeout").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Reason to remove the timeout")),
    async execute({ client, interaction }) {
      const { guild } = await resolveInteractionContext(client, interaction);
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason") || "Timeout removed";
      const member = guild ? await guild.members.fetch(user.id).catch(() => null) : null;
      if (!member || !member.moderatable) return interaction.reply({ content: "That member cannot be modified.", ephemeral: true });
      await member.timeout(null, reason);
      await logModeration(client, "Untimeout", interaction, user, reason);
      return interaction.reply({ embeds: [makeModerationEmbed({ action: "Timeout Removed", moderator: `<@${interaction.user.id}>`, target: `<@${user.id}>`, reason })] });
    },
  },
  {
    name: "purge",
    data: new SlashCommandBuilder()
      .setName("purge")
      .setDescription("Bulk delete recent messages")
      .addIntegerOption((o) => o.setName("amount").setDescription("Number of messages to delete").setRequired(true).setMinValue(1).setMaxValue(100))
      .addUserOption((o) => o.setName("user").setDescription("Only purge messages from this user")),
    async execute({ client, interaction }) {
      if (!interaction.channel || !interaction.channel.bulkDelete) return interaction.reply({ content: "This channel does not support purge.", ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      const amount = interaction.options.getInteger("amount", true);
      const user = interaction.options.getUser("user");
      const messages = await interaction.channel.messages.fetch({ limit: amount });
      const toDelete = user ? messages.filter((message) => message.author.id === user.id) : messages;
      const deleted = await interaction.channel.bulkDelete(toDelete, true).catch(() => null);
      await logModeration(client, "Purge", interaction, user, `Deleted ${deleted?.size || 0} messages`);
      return interaction.editReply({ content: `Deleted ${deleted?.size || 0} message(s).` });
    },
  },
  {
    name: "slowmode",
    data: new SlashCommandBuilder()
      .setName("slowmode")
      .setDescription("Set channel slowmode")
      .addIntegerOption((o) => o.setName("seconds").setDescription("Slowmode seconds").setRequired(true).setMinValue(0).setMaxValue(21600)),
    async execute({ client, interaction }) {
      if (!interaction.channel || typeof interaction.channel.setRateLimitPerUser !== "function") return interaction.reply({ content: "This channel does not support slowmode.", ephemeral: true });
      const seconds = interaction.options.getInteger("seconds", true);
      await interaction.channel.setRateLimitPerUser(seconds, `Updated by ${interaction.user.tag}`);
      await logModeration(client, "Slowmode", interaction, null, `Set to ${seconds}s`);
      return interaction.reply({ embeds: [makeSuccessEmbed({ title: "Slowmode updated", description: `Slowmode set to **${seconds}s** in ${interaction.channel}.` })], ephemeral: true });
    },
  },
  {
    name: "lock",
    data: new SlashCommandBuilder().setName("lock").setDescription("Lock the current channel"),
    async execute({ client, interaction }) {
      if (!interaction.guild || !interaction.channel) return interaction.reply({ content: "This command can only be used in a server channel.", ephemeral: true });
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false }, { reason: `Locked by ${interaction.user.tag}` });
      await logModeration(client, "Lock", interaction, null, `Locked ${interaction.channel.id}`);
      return interaction.reply({ embeds: [makeSuccessEmbed({ title: "Channel locked", description: `${interaction.channel} is now locked.` })] });
    },
  },
  {
    name: "unlock",
    data: new SlashCommandBuilder().setName("unlock").setDescription("Unlock the current channel"),
    async execute({ client, interaction }) {
      if (!interaction.guild || !interaction.channel) return interaction.reply({ content: "This command can only be used in a server channel.", ephemeral: true });
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null }, { reason: `Unlocked by ${interaction.user.tag}` });
      await logModeration(client, "Unlock", interaction, null, `Unlocked ${interaction.channel.id}`);
      return interaction.reply({ embeds: [makeSuccessEmbed({ title: "Channel unlocked", description: `${interaction.channel} is now unlocked.` })] });
    },
  },
  {
    name: "kick",
    data: new SlashCommandBuilder().setName("kick").setDescription("Kick a member from the server").addUserOption((o) => o.setName("user").setDescription("Member to kick").setRequired(true)).addStringOption((o) => o.setName("reason").setDescription("Why they are being kicked")),
    async execute({ client, interaction }) {
      const { guild, actorMember } = await resolveInteractionContext(client, interaction);
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason") || "No reason provided";
      const member = guild ? await guild.members.fetch(user.id).catch(() => null) : null;
      if (!member) return interaction.reply({ content: "That user is not in this server.", ephemeral: true });
      if (!canActOn(actorMember, member) || !member.kickable) return interaction.reply({ content: "Role hierarchy prevents this kick.", ephemeral: true });
      await member.kick(reason);
      await logModeration(client, "Kick", interaction, user, reason);
      return interaction.reply({ embeds: [makeModerationEmbed({ action: "Member Kicked", moderator: `<@${interaction.user.id}>`, target: `<@${user.id}>`, reason })] });
    },
  },
  {
    name: "ban",
    data: new SlashCommandBuilder().setName("ban").setDescription("Ban a member from the server").addUserOption((o) => o.setName("user").setDescription("Member to ban").setRequired(true)).addStringOption((o) => o.setName("reason").setDescription("Why they are being banned")).addIntegerOption((o) => o.setName("delete_days").setDescription("Delete up to 7 days of message history").setMinValue(0).setMaxValue(7)),
    async execute({ client, interaction }) {
      const { guild, actorMember } = await resolveInteractionContext(client, interaction);
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason") || "No reason provided";
      const deleteDays = interaction.options.getInteger("delete_days") || 0;
      const member = guild ? await guild.members.fetch(user.id).catch(() => null) : null;
      if (member && (!canActOn(actorMember, member) || !member.bannable)) return interaction.reply({ content: "Role hierarchy prevents this ban.", ephemeral: true });
      await guild.members.ban(user.id, { reason, deleteMessageSeconds: deleteDays * 86400 });
      await logModeration(client, "Ban", interaction, user, reason);
      return interaction.reply({ embeds: [makeModerationEmbed({ action: "Member Banned", moderator: `<@${interaction.user.id}>`, target: `<@${user.id}>`, reason, extraFields: [{ name: "Delete days", value: String(deleteDays), inline: true }] })] });
    },
  },
  {
    name: "prison",
    data: new SlashCommandBuilder().setName("prison").setDescription("Lock a member from sending messages until released").addUserOption((o) => o.setName("user").setDescription("Member to imprison").setRequired(true)).addStringOption((o) => o.setName("reason").setDescription("Why they were imprisoned")),
    async execute({ client, interaction }) {
      const { guild, actorMember, botMember } = await resolveInteractionContext(client, interaction);
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason") || "No reason provided";
      const member = guild ? await guild.members.fetch(user.id).catch(() => null) : null;
      if (!member) return interaction.reply({ content: "That user is not in this server.", ephemeral: true });
      if (!canActOn(actorMember, member)) return interaction.reply({ content: "You cannot prison someone above or equal to your highest role.", ephemeral: true });
      const prisonRole = await ensurePrisonRole(guild);
      if (prisonRole.position >= botMember.roles.highest.position) return interaction.reply({ content: "Move the bot role above the prison role, then try again.", ephemeral: true });
      const removableRoleIds = member.roles.cache.filter((role) => role.id !== guild.id && role.id !== prisonRole.id && role.position < botMember.roles.highest.position).map((role) => role.id);
      if (removableRoleIds.length) await member.roles.remove(removableRoleIds, "Roles removed during prison");
      await member.roles.add(prisonRole, reason);
      const prisonState = await loadPrisonState();
      prisonState[member.id] = { reason, by: interaction.user.id, at: new Date().toISOString(), removedRoleIds: removableRoleIds };
      await savePrisonState(prisonState);
      await logPrison(client, interaction, "Prison applied", `**${user.tag}** was imprisoned.`, [{ name: "Reason", value: trimText(reason, 1024) }]);
      return interaction.reply({ embeds: [makeModerationEmbed({ action: "Prison Applied", moderator: `<@${interaction.user.id}>`, target: `<@${user.id}>`, reason, extraFields: [{ name: "Role", value: prisonRole.toString(), inline: true }] })] });
    },
  },
  {
    name: "unprison",
    data: new SlashCommandBuilder().setName("unprison").setDescription("Release a member from prison").addUserOption((o) => o.setName("user").setDescription("Member to release").setRequired(true)).addStringOption((o) => o.setName("note").setDescription("Optional release note")),
    async execute({ client, interaction }) {
      const { guild, botMember } = await resolveInteractionContext(client, interaction);
      const user = interaction.options.getUser("user", true);
      const note = interaction.options.getString("note") || "No release note provided";
      const member = guild ? await guild.members.fetch(user.id).catch(() => null) : null;
      const config = await loadConfig();
      const prisonRole = (config.prisonerRoleId && guild.roles.cache.get(config.prisonerRoleId)) || guild.roles.cache.find((role) => role.name === PRISON_ROLE_NAME);
      if (!member || !prisonRole) return interaction.reply({ content: "That member or prison role could not be found.", ephemeral: true });
      await member.roles.remove(prisonRole, "Released from prison");
      const prisonState = await loadPrisonState();
      const record = prisonState[member.id];
      const restoreRoleIds = (record?.removedRoleIds || []).filter((roleId) => {
        const role = guild.roles.cache.get(roleId);
        return role && role.position < botMember.roles.highest.position;
      });
      if (restoreRoleIds.length) await member.roles.add(restoreRoleIds, "Roles restored after prison release");
      delete prisonState[member.id];
      await savePrisonState(prisonState);
      await logPrison(client, interaction, "Prison released", `**${user.tag}** was released from prison.`, [{ name: "Note", value: trimText(note, 1024) }], Colors.Red);
      return interaction.reply({ embeds: [makeModerationEmbed({ action: "Prison Removed", moderator: `<@${interaction.user.id}>`, target: `<@${user.id}>`, reason: note })] });
    },
  },
  {
    name: "prisonlist",
    data: new SlashCommandBuilder().setName("prisonlist").setDescription("Show currently imprisoned members"),
    async execute({ interaction }) {
      const prisonState = await loadPrisonState();
      const entries = Object.entries(prisonState);
      if (!entries.length) return interaction.reply({ content: "Nobody is currently imprisoned.", ephemeral: true });
      const description = entries.slice(0, 20).map(([userId, record]) => `• <@${userId}> — ${trimText(record.reason, 80)} — <t:${Math.floor(new Date(record.at).getTime() / 1000)}:R>`).join("\n");
      return interaction.reply({ embeds: [makeInfoEmbed({ title: "Prison list", description })], ephemeral: true });
    },
  },
  {
    name: "prisonreason",
    data: new SlashCommandBuilder().setName("prisonreason").setDescription("Show the stored prison reason for a user").addUserOption((o) => o.setName("user").setDescription("Member to inspect").setRequired(true)),
    async execute({ interaction }) {
      const user = interaction.options.getUser("user", true);
      const prisonState = await loadPrisonState();
      const record = prisonState[user.id];
      if (!record) return interaction.reply({ content: `No active prison record found for ${user.tag}.`, ephemeral: true });
      return interaction.reply({ embeds: [makeInfoEmbed({ title: `Prison record • ${user.tag}`, description: trimText(record.reason, 1024), fields: [{ name: "Imprisoned by", value: `<@${record.by}>`, inline: true }, { name: "When", value: `<t:${Math.floor(new Date(record.at).getTime() / 1000)}:F>`, inline: true }] })], ephemeral: true });
    },
  },
  {
    name: "announce",
    data: new SlashCommandBuilder().setName("announce").setDescription("Send a styled announcement and ping everyone").addStringOption((o) => o.setName("title").setDescription("Announcement title").setRequired(true)).addStringOption((o) => o.setName("message").setDescription("Announcement body").setRequired(true)),
    async execute({ client, interaction }) {
      const title = interaction.options.getString("title", true);
      const message = interaction.options.getString("message", true);
      const styles = [
        { prefix: "🩸 Redline Notice", footer: "REDLINE • Broadcast", color: Colors.DarkRed },
        { prefix: "🚨 Staff Update", footer: "REDLINE • Broadcast", color: Colors.Red },
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
