# REDLINE CLIENT HUB

Redline is a modular Discord.js v14 bot for client delivery, moderation, help tooling, welcome automation, reaction polls, YouTube notifications, and a rebuilt Serenity-branded music subsystem. The architecture stays split across `commands/`, `handlers/`, `services/`, `storage/`, and `utils/`, while `index.js` remains bootstrap-only.

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
  musicConfigService.js
  musicService.js
  panelService.js
  playerService.js
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
- `LAVALINK_HOST` — Lavalink host for music playback.
- `LAVALINK_PORT` — Lavalink port.
- `LAVALINK_PASSWORD` — Lavalink password.

## Optional environment variables

- `BOT_PREFIX_NAME` — defaults to `Serenity`.
- `YOUTUBE_API_KEY` — required for `/yt-search`.
- `YOUTUBE_POLL_INTERVAL_MS` — defaults to `300000`.
- `TEMPBAN_CHECK_INTERVAL_MS` — defaults to `60000`.
- `DOWNLOAD_LOG_CHANNEL_ID`
- `MOD_LOG_CHANNEL_ID`
- `PRISON_LOG_CHANNEL_ID`
- `ANNOUNCE_LOG_CHANNEL_ID`
- `LAVALINK_SECURE` — `true` when your node uses TLS.
- `LAVALINK_NAME` — optional display name for the single node configuration.
- `LAVALINK_NODES` — optional JSON array of nodes instead of the single-node variables.
- `LAVALINK_DEFAULT_SEARCH` — defaults to `ytsearch`.
- `LAVALINK_REST_VERSION` — defaults to `v4`.
- `MUSIC_AUTO_LEAVE_ON_QUEUE_END` — defaults to `true`.

## Music subsystem

### What changed

The old broken `play-dl` + `@discordjs/voice` music path has been replaced with a modular Lavalink-backed system built around the same core flow used by the provided `Unknownzop/MusicBot` source:

- Riffy/Lavalink connection bootstrap and voice state forwarding.
- `riffy.resolve(...)` for search, URL resolution, playlist loading, and provider routing.
- queue-driven playback through a persistent guild player.
- Lavalink node lifecycle logging and queue-end cleanup.
- the upstream Riffy node-property patch workaround adapted into Serenity’s service layer.

### Serenity-native modular layout

The imported foundation was refactored into Serenity’s architecture instead of flattening the repo:

- `commands/music.js` keeps the slash + prefix command registry and help metadata.
- `services/musicConfigService.js` reads Lavalink runtime configuration from environment variables.
- `services/playerService.js` owns Riffy bootstrapping, event wiring, connection creation, resolution, and lifecycle management.
- `services/queueService.js` provides queue/loop/volume mutations in a shared wrapper layer.
- `services/musicService.js` stays as the command-facing orchestration layer.
- `utils/musicEmbeds.js` renders Serenity-branded now playing, queue, queue-ended, and control response embeds.

### Supported sources

Support depends on your Lavalink server and installed extractors/plugins, but this subsystem is designed to handle the same practical input classes as the provided source bot:

- YouTube links and searches
- YouTube searches via the default `ytsearch` platform
- SoundCloud links/searches when your Lavalink stack supports them
- Spotify links are rejected with a clear message unless you add explicit Spotify metadata/extractor support

If a provider cannot be resolved, Serenity now returns clearer errors such as:

- “invalid URL”
- “no results found”
- “Spotify direct playback is not supported”
- “failed to resolve a playable YouTube track”
- “you must join a voice channel first”
- “queue is empty”
- “Serenity needs Connect and Speak permissions”

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
- `/play` and `Serenity play` share the same backend logic.
- Queue state, loop mode, volume, and embeds all come from one active music subsystem only.
- Queue-end cleanup is handled through Lavalink player events instead of the removed legacy voice code.
- `/help` automatically includes the music commands because they are registered through shared command metadata.

### Music runtime requirements

Install the required runtime dependency:

```bash
npm install riffy
```

You must also provide a reachable Lavalink node. A minimal setup needs:

- a Lavalink v4-compatible server,
- the host/port/password env vars above,
- extractor/plugin support for the providers you want,
- standard Discord voice permissions in the target voice channels.

> Note: Spotify is not directly streamable by the bot. Spotify URLs must resolve to another playable source through your Lavalink stack.

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

Use either of the supported forms:

- `/poll embed question:<text> choices:<a | b | c>`
- `/poll normal question:<text> choices:<a | b | c>`
- `Serenity poll embed Best client? | Volt | Apex | Nova`
- `Serenity poll normal Favorite mode? | Survival | PvP | Skyblock`

## Help system

Use `/help` for the command overview or `/help command:<name>` for a detailed card. Prefix equivalents remain available anywhere prefix support is enabled.
