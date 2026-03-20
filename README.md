# REDLINE CLIENT HUB

Redline is a modular Discord.js v14 bot for client delivery, moderation, help tooling, welcome automation, reaction polls, YouTube notifications, and now a modular music subsystem. The architecture stays split across `commands/`, `handlers/`, `services/`, `storage/`, and `utils/`, while `index.js` remains bootstrap-only.

## Architecture overview

The current build keeps Serenity modular by design:

- `index.js` only handles environment loading, storage startup, client creation, command loading, event attachment, slash registration, subsystem boot, and login.
- `commands/` contains user-facing slash/prefix command definitions and metadata.
- `services/` contains shared business logic such as playback orchestration, queue state, YouTube polling, moderation, and help generation.
- `storage/` holds persisted JSON-backed state for existing subsystems.
- `utils/` contains shared embed builders, formatting helpers, and other reusable UI helpers.

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
  music.js
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
  musicService.js
  panelService.js
  pollService.js
  prefixService.js
  queueService.js
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
  musicEmbeds.js
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
- `SPOTIFY_CLIENT_ID` — recommended for Spotify track/playlist link resolution.
- `SPOTIFY_CLIENT_SECRET` — recommended for Spotify track/playlist link resolution.
- `SPOTIFY_REFRESH_TOKEN` — optional; improves Spotify token refresh compatibility when available.
- `SPOTIFY_MARKET` — defaults to `US`.
- `SOUNDCLOUD_CLIENT_ID` — optional; if omitted, the bot will attempt a best-effort SoundCloud client bootstrap.
- `YOUTUBE_COOKIE` — optional; can improve YouTube playback reliability for some regions or restricted content.

## Music subsystem

### Design goals

The music system is intentionally modular and does **not** flatten Serenity into a monolithic music bot:

- `commands/music.js` defines slash + prefix-compatible command contracts and help metadata.
- `services/musicService.js` handles source resolution, voice joins, playback flow, and guardrails.
- `services/queueService.js` manages per-guild queue state, loop mode, volume, and queue mutations.
- `utils/musicEmbeds.js` builds premium-style playback, queue, and state embeds.

### Supported sources

Music playback is implemented with `play-dl` plus `@discordjs/voice`.

Practical support includes:

- YouTube links
- YouTube Music watch/playlist links normalized into standard YouTube URLs where possible
- YouTube search queries
- Spotify track links
- Spotify album / playlist links resolved best-effort into playable YouTube matches
- SoundCloud tracks and playlists where provider access succeeds

### Slash commands

- `/play query_or_url`
- `/pause`
- `/resume`
- `/skip`
- `/stop`
- `/queue [page]`
- `/nowplaying`
- `/remove position`
- `/clear`
- `/shuffle`
- `/loop mode`
- `/volume value`
- `/leave`

### Prefix commands

The centralized prefix trigger remains the bot name, so music works alongside the existing Serenity command system:

- `Serenity play <query or url>`
- `Serenity pause`
- `Serenity resume`
- `Serenity skip`
- `Serenity stop`
- `Serenity queue [page]`
- `Serenity nowplaying`
- `Serenity remove <position>`
- `Serenity clear`
- `Serenity shuffle`
- `Serenity loop <off|track|queue>`
- `Serenity volume <0-200>`
- `Serenity leave`

### Music behavior rules

- Users must be in a voice channel before starting playback or using queue controls.
- Control commands require the user to be in the same voice channel as Serenity.
- Serenity joins the invoker’s voice channel automatically when playback begins.
- Empty queues, invalid URLs, unsupported links, provider failures, and missing permissions return clean command errors instead of crashing the bot.
- Long queues are safely truncated into paginated queue views.
- `/help` automatically includes the music commands because they are registered through shared command metadata.

### Music dependencies

Install these runtime dependencies:

```bash
npm install @discordjs/voice play-dl
```

Depending on your host environment, Discord voice may also need one of the encryption/voice runtime dependencies documented by `@discordjs/voice`. Serenity logs a voice dependency report at startup to help diagnose missing host requirements.

### Provider notes / limitations

- YouTube Music links are normalized into standard YouTube watch or playlist URLs when possible.
- Spotify is used as a metadata source and is resolved into playable YouTube matches inside Serenity's queue flow.
- Spotify collection imports are best-effort: tracks that cannot be matched are skipped instead of crashing the queue.
- Some YouTube videos may still fail if YouTube requires cookies, account verification, or region-specific access; set `YOUTUBE_COOKIE` if needed.

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
- `Serenity play lofi hip hop`
- `Serenity queue`
- `Serenity skip`

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
- music control messages and queue / now playing embeds.

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

## Poll system

### Slash command structure

- `/poll embed question option1 option2 [option3...]`
- `/poll normal question option1 option2 [option3...]`

Slash polls require at least two options and support up to ten options.

### Prefix command structure

Use `|` as the delimiter:

- `Serenity poll embed Best client? | Volt | Apex | Nova`
- `Serenity poll normal Favorite mode? | Survival | PvP | Skyblock`

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
- `/avatar`
- `/ping`
- `/botinfo`
- `/poll`
- `/yt-search`
- `/play`
- `/queue`
- `/nowplaying`

## YouTube system

### Search
- `/yt-search topic`
- requires `YOUTUBE_API_KEY`
- returns the top five results ephemerally

### Notifications
- `/yt-notify add youtube_channel_link discord_channel ping_everyone`
- `/yt-notify remove youtube_channel_link`
- `/yt-notify list`
