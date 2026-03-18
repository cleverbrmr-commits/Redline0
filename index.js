require("dotenv").config();

const { Client, Events, GatewayIntentBits } = require("discord.js");
const clientsCommand = require("./commands/clients");
const clientpanelCommand = require("./commands/clientpanel");
const uploadCommand = require("./commands/upload");
const editclientCommand = require("./commands/editclient");
const removeclientCommand = require("./commands/removeclient");
const setCommand = require("./commands/set");
const embedCommand = require("./commands/embed");
const moderationCommand = require("./commands/moderation");
const { buildCommandRegistry, createInteractionHandler, registerCommands } = require("./handlers/interactionHandler");
const { ensureClientsStore } = require("./storage/clientsStore");
const { ensureEmbedsStore } = require("./storage/embedsStore");
const { ensureConfigStorage } = require("./services/configService");
const { validateEnv } = require("./utils/helpers");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commandRegistry = buildCommandRegistry([
  clientsCommand,
  clientpanelCommand,
  uploadCommand,
  editclientCommand,
  removeclientCommand,
  setCommand,
  embedCommand,
  moderationCommand,
]);

async function handleReady() {
  try {
    validateEnv();
    await ensureClientsStore();
    await ensureConfigStorage();
    await ensureEmbedsStore();
    await registerCommands(commandRegistry);
    console.log(`Logged in as ${client.user.tag}`);
    console.log("Bot ready");
  } catch (err) {
    console.error("Startup error:", err);
  }
}

client.once(Events.ClientReady, handleReady);
client.on(Events.InteractionCreate, createInteractionHandler(client, commandRegistry));

client.login(process.env.DISCORD_TOKEN);
