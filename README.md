# REDLINE CLIENT HUB

Redline is a modular Discord.js v14 bot for client delivery, moderation, help tooling, and YouTube notifications. The architecture stays split across `commands/`, `handlers/`, `services/`, `storage/`, and `utils/`, while `index.js` remains bootstrap-only.

## Root cause / design analysis

The main issues in the previous build were structural drift and missing shared systems:

- moderation logic was fragmented and incomplete for the requested command surface,
- there was no centralized prefix parser using the bot name,
- help content was not generated from shared command metadata,
- `/userinfo` and `/serverinfo` replied ephemerally instead of publicly,
- persistent moderation records were too narrow for tempbans, infractions, and mute config,
- YouTube notifications were not modularized around reusable storage and polling services.

The current build fixes that by:

- keeping `index.js` limited to env loading, validation, client creation, command loading, handler attachment, slash registration, background job startup, and login,
- moving prefix parsing into `handlers/messageHandler.js` + `services/prefixService.js`,
- moving moderation persistence and scheduling into `services/moderationService.js` + `storage/moderationStore.js`,
- moving help generation into `services/helpService.js`,
- moving YouTube search / subscription / polling logic into `services/youtubeService.js` + `storage/youtubeStore.js`,
- storing shared command metadata directly on command definitions so help text and README stay aligned.

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
  prison.js
  removeclient.js
  set.js
  upload.js
  youtube.js
handlers/
  interactionHandler.js
  messageHandler.js
services/
  clientService.js
  configService.js
  embedService.js
  helpService.js
  logService.js
  moderationService.js
  panelService.js
  prefixService.js
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
- `Serenity yt-notify add <youtube-url> #uploads true`

The leading bot name is parsed case-insensitively.

## Public vs ephemeral behavior

### Public
- `/help`
- `/help command`
- `/userinfo`
- `/serverinfo`
- moderation action confirmations, unless the command is returning a private validation / permission error.
- `/yt-notify` confirmations and lists.

### Ephemeral
- `/yt-search`
- validation errors where private feedback is cleaner.
- existing content-management utilities that already work better as staff-only ephemeral tools.

## Moderation commands

### Moderation
- `/ban user reason`
- `/kick user reason`
- `/timeout user duration reason`
- `/unban user_id reason`
- `/mute user reason`
- `/unmute user reason`
- `/warn user reason`
- `/purge amount`
- `/slowmode value`
- `/lock [channel] reason`
- `/unlock [channel] reason`
- `/softban user reason`
- `/tempban user duration reason`
- `/infractions user`
- `/clearwarns user`
- `/nickname user nickname`
- `/role add user role`
- `/role remove user role`
- `/vckick user reason`

### Existing moderation / server tools preserved
- `/prison`
- `/unprison`
- `/prisonlist`
- `/prisonreason`
- `/announce`

### Permission model

- `BanMembers`: `ban`, `unban`, `softban`, `tempban`
- `KickMembers`: `kick`
- `ModerateMembers`: `timeout`, `infractions`, `clearwarns`
- `ManageRoles`: `mute`, `unmute`, `role add`, `role remove`
- `ManageNicknames`: `nickname`
- `ManageMessages`: `warn`, `purge`
- `ManageChannels`: `slowmode`, `lock`, `unlock`
- `MoveMembers`: `vckick`
- `ManageGuild`: `yt-notify`, content/admin utilities

### Hierarchy protections

The moderation system blocks actions against:

- yourself,
- the guild owner,
- the bot,
- members with equal or higher role position,
- targets the bot cannot manage because of role order.

## Help system

`/help` and `Serenity help` are generated from shared command metadata.

Detailed help includes:

- command name,
- category,
- required permissions,
- slash usage,
- prefix usage when supported,
- examples,
- restrictions / hierarchy notes,
- response visibility.

## Utility commands

- `/help`
- `/userinfo`
- `/serverinfo`
- `/roleinfo`
- `/avatar`
- `/ping`
- `/botinfo`
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
- `config.json` — runtime bot channel config.
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

## Needed from user

To finish production setup, provide or confirm:

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- optional `BOT_PREFIX_NAME` if you want something other than `Serenity`
- `YOUTUBE_API_KEY` if you want `/yt-search`
- optional log channel IDs (`DOWNLOAD_LOG_CHANNEL_ID`, `MOD_LOG_CHANNEL_ID`, `PRISON_LOG_CHANNEL_ID`, `ANNOUNCE_LOG_CHANNEL_ID`)
- optional polling overrides (`YOUTUBE_POLL_INTERVAL_MS`, `TEMPBAN_CHECK_INTERVAL_MS`)
