const { PermissionFlagsBits, REST, Routes } = require("discord.js");
const { loadConfig } = require("../services/configService");
const { handleButton, handleStringSelect } = require("../services/panelService");
const { makeWarningEmbed } = require("../utils/embeds");
const { prettyError } = require("../utils/helpers");
const { hasCommandAccess } = require("../utils/permissions");

const COMMAND_ACCESS = {
  clients: { group: "everyone" },
  userinfo: { group: "everyone" },
  serverinfo: { group: "everyone" },
  roleinfo: { group: "everyone" },
  avatar: { group: "everyone" },
  ping: { group: "everyone" },
  botinfo: { group: "everyone" },
  warn: { group: "trustedMods", nativePermissions: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages] },
  warnings: { group: "trustedMods", nativePermissions: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages] },
  timeout: { group: "trustedMods", nativePermission: PermissionFlagsBits.ModerateMembers },
  untimeout: { group: "trustedMods", nativePermission: PermissionFlagsBits.ModerateMembers },
  purge: { group: "trustedMods", nativePermission: PermissionFlagsBits.ManageMessages },
  slowmode: { group: "trustedMods", nativePermission: PermissionFlagsBits.ManageChannels },
  lock: { group: "trustedMods", nativePermission: PermissionFlagsBits.ManageChannels },
  unlock: { group: "trustedMods", nativePermission: PermissionFlagsBits.ManageChannels },
  kick: { group: "admins", nativePermission: PermissionFlagsBits.KickMembers },
  ban: { group: "admins", nativePermission: PermissionFlagsBits.BanMembers },
  clearwarns: { group: "admins", nativePermissions: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.KickMembers] },
  announce: { group: "admins", nativePermission: PermissionFlagsBits.ManageGuild },
  embed: { group: "admins", nativePermission: PermissionFlagsBits.ManageGuild },
  say: { group: "admins", nativePermission: PermissionFlagsBits.ManageGuild },
  panel: { group: "admins", nativePermission: PermissionFlagsBits.ManageGuild },
  clientpanel: { group: "admins", nativePermission: PermissionFlagsBits.ManageGuild },
  set: { group: "admins", nativePermission: PermissionFlagsBits.ManageGuild },
  upload: { group: "contentManagers", nativePermission: PermissionFlagsBits.ManageGuild },
  removeclient: { group: "contentManagers", nativePermission: PermissionFlagsBits.ManageGuild },
  editclient: { group: "contentManagers", nativePermission: PermissionFlagsBits.ManageGuild },
  announceclient: { group: "contentManagers", nativePermission: PermissionFlagsBits.ManageGuild },
  exportclients: { group: "contentManagers", nativePermission: PermissionFlagsBits.ManageGuild },
  backup: { group: "contentManagers", nativePermission: PermissionFlagsBits.ManageGuild },
  prison: { group: "contentManagers", nativePermission: PermissionFlagsBits.ManageRoles },
  unprison: { group: "contentManagers", nativePermission: PermissionFlagsBits.ManageRoles },
  prisonlist: { group: "contentManagers", nativePermission: PermissionFlagsBits.ManageRoles },
  prisonreason: { group: "contentManagers", nativePermission: PermissionFlagsBits.ManageRoles },
};

function buildCommandRegistry(commandModules) {
  const commands = commandModules.flatMap((entry) => entry.commands || []);
  return new Map(commands.map((command) => [command.name, command]));
}

async function registerCommands(commandRegistry) {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const body = [...commandRegistry.values()].map((command) => command.data.toJSON());

  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
    body,
  });
}

async function enforceAccess(interaction) {
  const access = COMMAND_ACCESS[interaction.commandName];
  if (!access || access.group === "everyone") return true;

  const config = await loadConfig();
  const allowed = hasCommandAccess(interaction.member, interaction.guild, access, config);
  if (allowed) return true;

  if (!interaction.replied && !interaction.deferred) {
    await interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
  }
  return false;
}

function createInteractionHandler(client, commandRegistry) {
  return async function onInteraction(interaction) {
    try {
      if (interaction.isAutocomplete()) {
        const command = commandRegistry.get(interaction.commandName);
        if (command?.autocomplete) {
          return await command.autocomplete({ client, interaction, commandRegistry });
        }

        return interaction.respond([]);
      }

      if (interaction.isChatInputCommand()) {
        const command = commandRegistry.get(interaction.commandName);
        if (!command) return false;
        if (!(await enforceAccess(interaction))) return true;
        return await command.execute({ client, interaction, commandRegistry });
      }

      if (interaction.isStringSelectMenu()) {
        const handled = await handleStringSelect(client, interaction);
        return handled || false;
      }

      if (interaction.isButton()) {
        const handled = await handleButton(client, interaction);
        return handled || false;
      }

      return false;
    } catch (err) {
      console.error("Interaction error:", err);
      const embed = makeWarningEmbed({ title: "Operation failed", description: prettyError(err) });

      if (interaction.deferred) {
        try {
          await interaction.editReply({ content: "", embeds: [embed] });
        } catch {}
      } else if (interaction.replied) {
        try {
          await interaction.followUp({ embeds: [embed], ephemeral: true });
        } catch {}
      } else {
        try {
          await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch {}
      }

      return false;
    }
  };
}

module.exports = {
  buildCommandRegistry,
  createInteractionHandler,
  registerCommands,
};
