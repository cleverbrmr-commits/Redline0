# REDLINE CLIENT HUB

Redline is a modular Discord.js v14 bot for client delivery, moderation, help tooling, welcome automation, reaction polls, and YouTube notifications. The architecture stays split across `commands/`, `handlers/`, `services/`, `storage/`, and `utils/`, while `index.js` remains bootstrap-only.

## Root cause / design analysis

The current build keeps the bot modular while fixing three gaps that mattered for server operations:

- welcome automation did not exist as a reusable service with stored guild configuration,
- `/avatar` was private even though it should behave like a normal public utility command,
- polls were missing entirely, including reusable validation, formatting, and reaction handling for both slash and prefix flows.

The implementation now fixes that by:

- keeping `index.js` limited to env loading, validation, client creation, command loading, handler attachment, slash registration, background job startup, and login,
- adding a dedicated guild-member join handler that delegates all welcome delivery to `services/welcomerService.js`,
- storing welcomer state in the existing config system instead of scattering one-off files,
- adding a modular poll service that builds embed and plain polls from shared business logic,
- making `/avatar` public and reusing shared avatar embed logic for slash and prefix execution,
- tightening help metadata usage so new commands document themselves cleanly.

## Project structure

```text
index.js
commands/
  admin.js
  clientpanel.js
  clients.js
  content.js
  editclient.js
  embed.js
  help.js
  info.js
  moderation.js
  poll.js
  prison.js
  removeclient.js
  set.js
  upload.js
  welcomer.js
  youtube.js
handlers/
  guildMemberHandler.js
  interactionHandler.js
  messageHandler.js
services/
  clientService.js
  configService.js
  embedService.js
  helpService.js
  infoService.js
  logService.js
  moderationService.js
  panelService.js
  pollService.js
  prefixService.js
  welcomerService.js
  youtubeService.js
storage/
  clientsStore.js
  configStore.js
  embedsStore.js
  moderationStore.js
  warningsStore.js
  youtubeStore.js
utils/
  duration.js
  embeds.js
  helpers.js
  permissions.js
```

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file.
3. Fill in the required environment variables.
4. Start the bot:

   ```bash
   npm start
   ```

## Required environment variables

- `DISCORD_TOKEN` — your bot token.
- `CLIENT_ID` — your Discord application client ID.
- `GUILD_ID` — the guild used for guild-scoped slash registration.

## Optional environment variables

- `BOT_PREFIX_NAME` — defaults to `Serenity`.
- `YOUTUBE_API_KEY` — required for `/yt-search`.
- `YOUTUBE_POLL_INTERVAL_MS` — defaults to `300000`.
- `TEMPBAN_CHECK_INTERVAL_MS` — defaults to `60000`.
- `DOWNLOAD_LOG_CHANNEL_ID`
- `MOD_LOG_CHANNEL_ID`
- `PRISON_LOG_CHANNEL_ID`
- `ANNOUNCE_LOG_CHANNEL_ID`

## Prefix commands

The centralized message-command trigger is the bot name:

- `Serenity help`
- `Serenity help ban`
- `Serenity ban @user spamming`
- `Serenity purge 15`
- `Serenity role add @user @Member`
- `Serenity slowmode off`
- `Serenity welcomer set #welcome`
- `Serenity welcomer status`
- `Serenity avatar @user`
- `Serenity poll embed Best client? | Volt | Apex | Nova`
- `Serenity poll normal Favorite mode? | Survival | PvP | Skyblock`
- `Serenity yt-notify add <youtube-url> #uploads true`

The leading bot name is parsed case-insensitively.

## Public vs ephemeral behavior

### Public
- `/help`
- `/help command`
- `/userinfo`
- `/serverinfo`
- `/avatar`
- prefix `Serenity avatar`
- the poll message created by `/poll` or `Serenity poll`
- moderation action confirmations, unless the command is returning a private validation / permission error.
- `/yt-notify` confirmations and lists.

### Ephemeral
- `/welcomer` configuration responses
- `/poll` confirmation replies after the public poll is posted
- `/yt-search`
- validation errors where private feedback is cleaner.
- existing content-management utilities that already work better as staff-only ephemeral tools.

## Welcomer system

### What it does

The welcomer stores one config record per guild and, when enabled, sends a branded welcome embed whenever a new member joins.

Each welcome message includes:

- a mention of the joining user,
- the title `Welcome to Redline Hub`,
- a high-quality version of the member avatar,
- server/member context such as server name, member count, and join timestamp,
- Redline-styled branding without overloading the embed.

### Slash commands

- `/welcomer set channel:#welcome`
- `/welcomer on`
- `/welcomer off`
- `/welcomer status`

### Prefix commands

- `Serenity welcomer set #welcome`
- `Serenity welcomer on`
- `Serenity welcomer off`
- `Serenity welcomer status`

### Permissions needed

- Slash: `Manage Guild`
- Prefix: the invoking member must have `Manage Guild`
- Target channels must be valid server text or announcement channels.

### Setup flow

1. Run `/welcomer set channel:#welcome`.
2. Run `/welcomer on`.
3. Use `/welcomer status` any time to confirm the stored state.
4. Run `/welcomer off` to disable the system without losing the saved channel.

If the stored welcome channel is missing or no longer sendable, the bot skips the message safely and logs the issue instead of crashing.

## Poll system

### Slash command structure

- `/poll embed question option1 option2 [option3...]`
- `/poll normal question option1 option2 [option3...]`

Slash polls require at least two options and support up to ten options.

### Prefix command structure

Use `|` as the delimiter:

- `Serenity poll embed Best client? | Volt | Apex | Nova`
- `Serenity poll normal Favorite mode? | Survival | PvP | Skyblock`

### Embed mode

Embed polls post a styled Redline embed that includes:

- the poll question as the title,
- an emoji-numbered option list,
- the poll creator,
- a timestamp.

### Normal mode

Normal polls post a plain text poll message with the same numbered options and automatic reactions, but without an embed.

### Permissions needed

- Slash: `Manage Messages`
- Prefix: the invoking member must have `Manage Messages`

## Help system

`/help` and `Serenity help` are generated from shared command metadata.

Detailed help includes:

- command name,
- category,
- required permissions,
- slash usage,
- prefix usage when supported,
- examples,
- response visibility.

## Utility commands

- `/help`
- `/userinfo`
- `/serverinfo`
- `/roleinfo`
- `/avatar` *(public)*
- `/ping`
- `/botinfo`
- `/poll`
- `/yt-search`

## YouTube system

### Search
- `/yt-search topic`
- requires `YOUTUBE_API_KEY`
- returns the top five results ephemerally

### Notifications
- `/yt-notify add youtube_channel_link discord_channel ping_everyone`
- `/yt-notify remove youtube_channel_link`
- `/yt-notify list`

### Notification behavior

Each subscription stores:

- guild ID,
- YouTube channel ID,
- YouTube channel URL,
- resolved channel title,
- target Discord channel ID,
- `pingEveryone` flag,
- `lastVideoId`.

New uploads are posted **only** to the configured Discord channel for that subscription. There is no global broadcast fallback.

### API behavior

- `/yt-search` uses the YouTube Data API and requires `YOUTUBE_API_KEY`.
- upload notifications use YouTube channel resolution + feed polling and fail gracefully if the URL cannot be resolved.

## Client / content management commands

Preserved and documented commands:

- `/clients`
- `/upload`
- `/removeclient`
- `/editclient`
- `/announceclient`
- `/exportclients`
- `/backup`
- `/clientpanel send`
- `/panel`

## Persistent storage

### Files
- `modules.json` — client metadata.
- `moderation.json` — infractions, tempbans, mute role config, locked-channel state.
- `youtube-subscriptions.json` — YouTube subscriptions and last seen uploads.
- `prison-state.json` — prison records and removed roles.
- `config.json` — runtime bot channel config plus per-guild welcomer settings.
- `embeds.json` — saved custom embeds.

### On startup
- slash commands are registered,
- tempban expiration checks resume automatically,
- YouTube polling resumes automatically,
- persistent moderation and YouTube data are reloaded before use.

## Storage / config notes

- tempbans are persisted and automatically unbanned once expired.
- warnings and other moderation actions are stored in the infractions history.
- the mute system stores the created mute role ID per guild.
- channel lock state stores the prior `@everyone` send-message setting so unlock can restore it cleanly.
- welcomer settings are stored under `config.json` as `welcomers[guildId] = { enabled, channelId }`.

## Needed from user

To finish production setup, provide or confirm:

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- optional `BOT_PREFIX_NAME` if you want something other than `Serenity`
- `YOUTUBE_API_KEY` if you want `/yt-search`
- optional log channel IDs (`DOWNLOAD_LOG_CHANNEL_ID`, `MOD_LOG_CHANNEL_ID`, `PRISON_LOG_CHANNEL_ID`, `ANNOUNCE_LOG_CHANNEL_ID`)
- optional polling overrides (`YOUTUBE_POLL_INTERVAL_MS`, `TEMPBAN_CHECK_INTERVAL_MS`)
