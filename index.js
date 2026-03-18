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

  const files = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith('.js'))
    .sort();

  const modules = [];

  for (const file of files) {
    const filePath = path.join(commandsPath, file);

    try {
      delete require.cache[require.resolve(filePath)];
      const mod = require(filePath);

      if (!mod || !Array.isArray(mod.commands)) {
        console.warn(`Skipping invalid command module: ${file}`);
        continue;
      }

      modules.push(mod);
      console.log(`Loaded command module: ${file} (${mod.commands.length} commands)`);
    } catch (error) {
      console.error(`Failed to load command module ${file}:`, error);
    }
  }

  return modules;
}

validateEnv();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const commandModules = loadCommandModules(path.join(__dirname, 'commands'));
const commandRegistry = buildCommandRegistry(commandModules);

client.commands = new Collection(
  [...commandRegistry.entries()].map(([name, command]) => [name, command])
);

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Loaded ${commandRegistry.size} slash command(s).`);

  try {
    await registerCommands(commandRegistry);
    console.log('Slash commands registered successfully.');
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }
});

client.on(Events.InteractionCreate, createInteractionHandler(client, commandRegistry));

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('Failed to log in:', error);
  process.exit(1);
});
