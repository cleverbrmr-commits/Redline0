# REDLINE CLIENT HUB

Redline is a modular Discord.js v14 bot for private client delivery, moderation workflows, embed utilities, and server administration.

## Root cause of the interaction failures

The main reliability issue was inconsistent interaction acknowledgement. Some commands and component flows performed file reads, role checks, logging, or recovery logic before acknowledging the interaction, which can exceed Discord's 3-second window and produce **"The application did not respond"** or **"This interaction failed"**. The updated flow keeps `index.js` bootstrap-only, keeps interaction routing centralized, and makes the client browser component flow acknowledge through deferred ephemeral replies before loading recovery/download results.

## Project structure

```text
index.js
commands/
  admin.js
  clientpanel.js
  clients.js
  editclient.js
  embed.js
  info.js
  moderation.js
  removeclient.js
  set.js
  upload.js
handlers/
  interactionHandler.js
services/
  clientService.js
  configService.js
  embedService.js
  logService.js
  panelService.js
storage/
  clientsStore.js
  configStore.js
  embedsStore.js
  warningsStore.js
utils/
  embeds.js
  helpers.js
  permissions.js
```

## Features

### Client delivery
- `/clients` private browser with category select, client select, cooldowns, logging, recovery actions, and ephemeral delivery.
- `/clientpanel send` and `/panel` for a public launcher that still routes selections and files privately.
- `/upload`, `/editclient`, `/removeclient`, `/announceclient`, `/exportclients`, and `/backup`.
- Role-gated client visibility and extension-aware file storage.

### Moderation
- `/warn`, `/warnings`, `/clearwarns`
- `/timeout`, `/untimeout`
- `/kick`, `/ban`
- `/purge`, `/slowmode`, `/lock`, `/unlock`
- `/prison`, `/unprison`, `/prisonlist`, `/prisonreason`
- `/announce`

### Utility / info
- `/userinfo`, `/serverinfo`, `/roleinfo`, `/avatar`, `/ping`, `/botinfo`

### Admin / embed utilities
- `/embed`
- `/say`
- `/panel`
- `/set`

## Permissions

Runtime permission checks support both native Discord permissions and optional configured role overrides from `config.json`.

### Everyone
- `/clients`
- `/userinfo`
- `/serverinfo`
- `/roleinfo`
- `/avatar`
- `/ping`
- `/botinfo`

### Trusted mods
- `/warn`
- `/warnings`
- `/timeout`
- `/untimeout`
- `/purge`
- `/slowmode`
- `/lock`
- `/unlock`

### Admins
- `/kick`
- `/ban`
- `/clearwarns`
- `/announce`
- `/embed`
- `/say`
- `/panel`
- `/clientpanel`
- `/set`

### Owners / content managers
- `/upload`
- `/removeclient`
- `/editclient`
- `/announceclient`
- `/exportclients`
- `/backup`
- `/prison`
- `/unprison`
- `/prisonlist`
- `/prisonreason`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env`.
3. Fill in the required environment variables.
4. Start the bot:
   ```bash
   npm start
   ```

## Required environment variables

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`

## Optional environment variables

- `DOWNLOAD_LOG_CHANNEL_ID`
- `MOD_LOG_CHANNEL_ID`
- `PRISON_LOG_CHANNEL_ID`
- `ANNOUNCE_LOG_CHANNEL_ID`

## Persistent files

- `modules.json` — client metadata
- `prison-state.json` — prison status and removed roles for restore
- `warnings.json` — warning history
- `config.json` — log channels, prisoner role ID, role overrides, default cooldowns
- `embeds.json` — stored custom embeds
- `uploads/` — uploaded client files
- `backups/` — exports and backup snapshots

## Configuration notes

`config.json` can store:
- `downloadLogChannelId`
- `modLogChannelId`
- `prisonLogChannelId`
- `announceLogChannelId`
- `prisonerRoleId`
- `commandRoleOverrides.trustedMods`
- `commandRoleOverrides.admins`
- `commandRoleOverrides.contentManagers`
- `defaultCooldowns.clientsDownloadMs`

## Interaction reliability notes

- Slash commands should acknowledge immediately with `reply()` or `deferReply()`.
- Client browser components now use deferred ephemeral replies for recovery/download flows.
- Public client panel interactions never expose restricted content publicly.

## Needed from user

To finish production configuration, provide or confirm:
- Discord application token, client ID, and target guild ID.
- Optional log channel IDs for moderation, downloads, prison actions, and announcements.
- Optional role IDs to place in `config.json` under `commandRoleOverrides.trustedMods`, `admins`, and `contentManagers`.
- Whether you want the bot to create/use a specific prisoner role instead of the default `Prisoner` role.
- Any preferred default client download cooldown override in milliseconds.
- Any branding copy changes for the public panel, embeds, or announcements.
