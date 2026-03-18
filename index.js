require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const {
  Events,
  buildCommandRegistry,
  createInteractionHandler,
  registerCommands,
} = require('./handlers/interactionHandler');
const { createMessageHandler } = require('./handlers/messageHandler');
const { ensureClientsStore } = require('./storage/clientsStore');
const { ensureConfigStorage } = require('./services/configService');
const { ensureModerationStore } = require('./storage/moderationStore');
const { ensureYoutubeStore } = require('./storage/youtubeStore');
const { startTempbanScheduler } = require('./services/moderationService');
const { startYoutubePolling } = require('./services/youtubeService');

const PREFIX_NAME = process.env.BOT_PREFIX_NAME || 'Serenity';

function validateEnv() {
  const required = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

function loadCommandModules(commandsPath) {
  if (!fs.existsSync(commandsPath)) {
    console.warn(`Commands path not found: ${commandsPath}`);
    return [];
  }

  return fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith('.js'))
    .sort()
    .map((file) => {
      const filePath = path.join(commandsPath, file);
      delete require.cache[require.resolve(filePath)];
      const mod = require(filePath);
      if (!mod || !Array.isArray(mod.commands)) {
        throw new Error(`Invalid command module: ${file}`);
      }
      console.log(`Loaded command module: ${file} (${mod.commands.length} commands)`);
      return mod;
    });
}

async function initializeStorage() {
  await Promise.all([
    ensureClientsStore(),
    ensureConfigStorage(),
    ensureModerationStore(),
    ensureYoutubeStore(),
  ]);
}

function createDiscordClient() {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
    ],
  });
}

function attachHandlers(client, commandRegistry) {
  client.on(Events.InteractionCreate, createInteractionHandler(client, commandRegistry));
  client.on(Events.MessageCreate, createMessageHandler(client, commandRegistry, PREFIX_NAME));
}

function startBackgroundJobs(client) {
  startTempbanScheduler(client);
  startYoutubePolling(client);
}

async function bootstrap() {
  validateEnv();
  await initializeStorage();

  const client = createDiscordClient();
  const commandModules = loadCommandModules(path.join(__dirname, 'commands'));
  const commandRegistry = buildCommandRegistry(commandModules);

  client.commands = new Collection([...commandRegistry.entries()].map(([name, command]) => [name, command]));
  attachHandlers(client, commandRegistry);

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
    console.log(`Loaded ${commandRegistry.size} slash command(s).`);
    console.log(`Prefix trigger: ${PREFIX_NAME}`);

    await registerCommands(commandRegistry);
    startBackgroundJobs(client);
    console.log('Slash commands registered successfully.');
  });

  process.on('unhandledRejection', (error) => console.error('Unhandled promise rejection:', error));
  process.on('uncaughtException', (error) => console.error('Uncaught exception:', error));

  await client.login(process.env.DISCORD_TOKEN);
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap bot:', error);
  process.exit(1);
});
