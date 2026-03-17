require("dotenv").config();

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const DATA_FILE = path.join(__dirname, "modules.json");
const UPLOADS_DIR = path.join(__dirname, "uploads");

async function ensureStorage() {
  await fsp.mkdir(UPLOADS_DIR, { recursive: true });

  try {
    await fsp.access(DATA_FILE);
  } catch {
    await fsp.writeFile(DATA_FILE, "{}", "utf8");
  }
}

async function loadModules() {
  const raw = await fsp.readFile(DATA_FILE, "utf8");
  return JSON.parse(raw || "{}");
}

async function saveModules(modules) {
  await fsp.writeFile(DATA_FILE, JSON.stringify(modules, null, 2), "utf8");
}

function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function downloadFile(url, destinationPath) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to download file: ${res.status} ${res.statusText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(destinationPath, buffer);
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("mods")
      .setDescription("Open the mod panel"),

    new SlashCommandBuilder()
      .setName("upload")
      .setDescription("Upload a module")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((o) =>
        o
          .setName("name")
          .setDescription("Module name")
          .setRequired(true)
      )
      .addAttachmentOption((o) =>
        o
          .setName("file")
          .setDescription("File to upload")
          .setRequired(true)
      )
      .addStringOption((o) =>
        o
          .setName("description")
          .setDescription("Optional description")
          .setRequired(false)
      ),
  ].map((c) => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );
}

client.once(Events.ClientReady, async () => {
  try {
    await ensureStorage();
    await registerCommands();
    console.log(`Logged in as ${client.user.tag}`);
    console.log("Bot ready");
  } catch (err) {
    console.error("Startup error:", err);
  }
});

client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isChatInputCommand()) {
      if (i.commandName === "mods") {
        const mods = await loadModules();
        const entries = Object.entries(mods);

        if (!entries.length) {
          return i.reply({
            content: "No modules have been uploaded yet.",
            ephemeral: true,
          });
        }

        const menu = new StringSelectMenuBuilder()
          .setCustomId("mod_select")
          .setPlaceholder("Choose a module...")
          .addOptions(
            entries.slice(0, 25).map(([key, value]) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(String(value.label).slice(0, 100))
                .setValue(key)
                .setDescription(
                  String(value.description || "No description").slice(0, 100)
                )
            )
          );

        const row = new ActionRowBuilder().addComponents(menu);

        return i.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Mod Hub")
              .setDescription("Select a module from the dropdown below"),
          ],
          components: [row],
        });
      }

      if (i.commandName === "upload") {
        const name = i.options.getString("name", true);
        const file = i.options.getAttachment("file", true);
        const description =
          i.options.getString("description") || "No description";

        await i.deferReply({ ephemeral: true });

        const key = slugify(name);

        if (!key) {
          return i.editReply({
            content: "Invalid module name.",
          });
        }

        const originalName = file.name || "module.jar";
        const ext = path.extname(originalName) || ".jar";
        const savedFileName = key + ext;
        const filePath = path.join(UPLOADS_DIR, savedFileName);

        await downloadFile(file.url, filePath);

        const mods = await loadModules();
        mods[key] = {
          label: name,
          description,
          filePath,
          originalName,
        };
        await saveModules(mods);

        return i.editReply({
          content: `Uploaded **${name}** successfully.`,
        });
      }
    }

    if (i.isStringSelectMenu()) {
      if (i.customId !== "mod_select") return;

      const mods = await loadModules();
      const mod = mods[i.values[0]];

      if (!mod) {
        return i.reply({
          content: "That module no longer exists.",
          ephemeral: true,
        });
      }

      if (!fs.existsSync(mod.filePath)) {
        return i.reply({
          content: "The file for that module is missing.",
          ephemeral: true,
        });
      }

      const file = new AttachmentBuilder(mod.filePath, {
        name: mod.originalName || path.basename(mod.filePath),
      });

      return i.reply({
        files: [file],
        ephemeral: true,
      });
    }
  } catch (err) {
    console.error("Interaction error:", err);

    if (i.deferred) {
      try {
        await i.editReply({
          content: "Something broke while handling that interaction.",
        });
      } catch {}
    } else if (i.replied) {
      try {
        await i.followUp({
          content: "Something broke while handling that interaction.",
          ephemeral: true,
        });
      } catch {}
    } else {
      try {
        await i.reply({
          content: "Something broke while handling that interaction.",
          ephemeral: true,
        });
      } catch {}
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
