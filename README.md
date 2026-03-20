# Serenity for Redline Hub

Serenity is a premium, modular Discord.js v14 platform for Redline Hub. It is designed to feel like a polished multi-purpose server product: structured by modules, configurable per guild, strong in moderation and onboarding, and ready for future dashboard surfaces.

`index.js` stays bootstrap-only while shared logic remains split across `commands/`, `handlers/`, `services/`, `storage/`, and `utils/`.

## Premium product direction

Serenity now centers around a cleaner module-first model:

- **Moderation** — live staff actions, punishments, infractions, mute role management, channel controls, and tempbans.
- **Auto Moderation** — anti-spam, anti-link, anti-invite, anti-caps, mention spam, blocked phrases, and anti-raid thresholds.
- **Logging** — structured audit feeds for message events, member lifecycle changes, moderation actions, automod, joins/leaves, and system telemetry.
- **Welcome & Onboarding** — branded welcome cards, goodbye cards, ping control, join roles, and configurable templates.
- **Utility / Info** — help, server cards, user cards, and general-use commands.
- **Polls** — polished reaction polls.
- **Social Alerts** — YouTube search and notification workflows.
- **Music** — Lavalink-backed queue and playback system.
- **Client & Content** — Redline client distribution, uploads, exports, and public panels.
- **System & Configuration** — dashboard-ready guild config, module toggles, and access controls.

## Architecture overview

### Bootstrap
- `index.js` only performs environment loading, storage startup, command discovery, event attachment, slash registration, background job startup, and login.

### Commands
- `commands/` holds slash/prefix command definitions.
- Commands expose metadata used by the premium help system and future dashboard surfaces:
  - `name`
  - `category/module`
  - `description`
  - `usage`
  - `examples`
  - `permissions`
  - `prefixEnabled`
  - `prefixUsage`
  - `response`

### Shared services
- `services/moduleService.js` defines reusable module metadata and category identity.
- `services/helpService.js` builds interactive help menus and normalized command metadata.
- `services/configService.js` normalizes dashboard-ready guild configuration and legacy fallbacks.
- `services/automodService.js` drives spam/link/invite/caps/mention/phrase/raid protection.
- `services/logService.js` routes premium audit embeds to the correct channels.
- `services/welcomerService.js` manages onboarding cards, goodbye cards, and join roles.

### Event handlers
- `handlers/messageHandler.js` processes prefix commands and live automod checks.
- `handlers/guildMemberHandler.js` processes onboarding, goodbye flow, and raid pressure tracking.
- `handlers/auditHandler.js` logs message edits/deletes and member updates.
- `handlers/interactionHandler.js` handles slash commands, premium help menus, and access validation.

## Project structure

```text
index.js
commands/
  admin.js
  automod.js
  clientpanel.js
  clients.js
  content.js
  editclient.js
  embed.js
  help.js
  info.js
  logging.js
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
  auditHandler.js
  guildMemberHandler.js
  interactionHandler.js
  messageHandler.js
services/
  automodService.js
  clientService.js
  configService.js
  embedService.js
  helpService.js
  infoService.js
  logService.js
  moderationService.js
  moduleService.js
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
3. Fill in the required variables.
4. Start the bot:

   ```bash
   npm start
   ```

## Required environment variables

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`

### Music-specific required variables

- `LAVALINK_HOST`
- `LAVALINK_PORT`
- `LAVALINK_PASSWORD`

## Optional environment variables

- `BOT_PREFIX_NAME` — defaults to `Serenity`.
- `YOUTUBE_API_KEY` — required for `/yt-search`.
- `YOUTUBE_POLL_INTERVAL_MS` — defaults to `300000`.
- `TEMPBAN_CHECK_INTERVAL_MS` — defaults to `60000`.
- `DOWNLOAD_LOG_CHANNEL_ID`
- `MOD_LOG_CHANNEL_ID`
- `PRISON_LOG_CHANNEL_ID`
- `ANNOUNCE_LOG_CHANNEL_ID`
- `LAVALINK_SECURE`
- `LAVALINK_NAME`
- `LAVALINK_NODES`
- `LAVALINK_DEFAULT_SEARCH`
- `LAVALINK_REST_VERSION`
- `MUSIC_AUTO_LEAVE_ON_QUEUE_END`

## Module and category system

Serenity now uses a reusable category registry so help menus, command cards, config panels, and future dashboard pages can all read the same module metadata.

### Current primary modules

| Module | Purpose |
| --- | --- |
| Moderation | Punishments, warnings, locks, role actions, voice moderation |
| Auto Moderation | Message scanning, spam defense, blocked phrases, anti-raid |
| Logging | Audit routing for moderation, messages, members, and security |
| Welcome & Onboarding | Welcome cards, goodbye cards, join roles, templates |
| Utility / Info | Help, server info, user info, general tools |
| Polls | Structured community polls |
| Social Alerts | YouTube notifications and similar feeds |
| Music | Queue-driven playback |
| Client & Content | Client distribution and public panels |
| System & Configuration | Settings, module visibility, access control preparation |

## Premium help system

`/help` now acts like a module navigator instead of a text wall.

### Features
- category-driven help overview
- module command counts
- interactive select menu to browse modules
- `/help command:<name>` detailed command cards
- prefix equivalents where available
- permissions and response visibility indicators

### Example usage
- `/help`
- `/help command:ban`
- `Serenity help`
- `Serenity help automod`

## Welcome & onboarding system

The welcomer is now a real onboarding module rather than a single-channel toggle.

### What it does
- sends a branded welcome card
- optionally pings the new member
- can assign a join role
- can send goodbye cards separately
- supports editable title, subtitle, body, and goodbye templates
- exposes preview and status flows

### Configuration commands
- `/welcomer channel`
- `/welcomer on`
- `/welcomer off`
- `/welcomer goodbye-channel`
- `/welcomer goodbye-on`
- `/welcomer goodbye-off`
- `/welcomer role`
- `/welcomer template`
- `/welcomer goodbye-template`
- `/welcomer preview`
- `/welcomer status`

### Template placeholders
- `{user}`
- `{user_tag}`
- `{user_name}`
- `{server_name}`
- `{member_count}`
- `{join_number}`
- `{timestamp}`

## Auto moderation and protection suite

Serenity now includes a configurable protection module with independent rules.

### Supported rules
- anti-spam
- anti-link
- anti-invite
- anti-caps
- mention spam
- blocked phrases
- anti-raid / mass join burst detection

### Supported actions
- `log`
- `warn`
- `delete`
- `timeout`
- `kick`
- `ban`
- `quarantine`

### Configurable rule options
- enable/disable
- threshold
- rolling window
- action type
- timeout duration
- ignored channels
- ignored roles
- allowed roles
- blocked phrase list
- quarantine role
- raid alert channel

### Commands
- `/automod status`
- `/automod enable`
- `/automod rule`
- `/automod phrases`
- `/automod raid`
- `/automod quarantine`

Prefix equivalents are also available.

## Logging system

Serenity logging now behaves like a product feature instead of a debug dump.

### Log streams
- moderation actions
- automod actions
- message edits
- message deletes
- member joins
- member leaves
- member updates
- command usage for elevated commands
- content / announcement routing

### Commands
- `/logging status`
- `/logging toggle`
- `/logging set`

## Punishments and infractions

The existing moderation platform continues to store persistent infraction history while pairing cleanly with the new protection stack.

### Available moderation actions
- `ban`
- `kick`
- `timeout`
- `unban`
- `mute`
- `unmute`
- `warn`
- `purge`
- `slowmode`
- `lock`
- `unlock`
- `softban`
- `tempban`
- `infractions`
- `clearwarns`
- `nickname`
- `role`
- `vckick`

### Stored infraction data
- action type
- moderator ID
- target user ID
- reason
- created timestamp
- expiry where relevant
- extra details for automod-driven actions

## Access model and future dashboard readiness

Serenity now keeps more configuration in normalized guild objects so a dashboard can map directly to module pages later.

### Stored guild areas
- module enablement state
- log routing
- welcome templates and toggles
- automod rule configuration
- command access overrides
- legacy-compatible channel settings

### Current access controls
- Discord-native permission gates remain primary
- command/module disable state is checked at runtime
- per-command role/channel allow/deny overrides are supported internally through guild config
- moderation actions still validate role hierarchy and server ownership rules

## Prefix commands

The prefix trigger remains the bot name, case-insensitive.

Examples:
- `Serenity help`
- `Serenity help ban`
- `Serenity welcomer status`
- `Serenity automod status`
- `Serenity logging set automod #security`
- `Serenity poll embed Best client? | Volt | Apex | Nova`
- `Serenity play lofi hip hop`

## Public vs ephemeral behavior

### Public
- information cards like `/userinfo`, `/serverinfo`, `/avatar`
- most moderation confirmations
- posted polls
- music playback responses
- selected social alert confirmations

### Ephemeral
- settings and configuration commands
- `/welcomer` admin flows
- `/automod` configuration flows
- `/logging` routing flows
- `/set` system configuration
- validation-heavy responses where private feedback is cleaner

## Music subsystem

The Lavalink-backed Serenity music stack remains modular and unchanged in structure:

- `services/musicConfigService.js`
- `services/playerService.js`
- `services/queueService.js`
- `services/musicService.js`
- `utils/musicEmbeds.js`

Supported commands:
- `/play`
- `/pause`
- `/resume`
- `/skip`
- `/stop`
- `/queue`
- `/nowplaying`
- `/remove`
- `/clear`
- `/shuffle`
- `/loop`
- `/volume`
- `/leave`

## Verification ideas

Before deployment, verify:

- slash registration succeeds for the new `/automod` and `/logging` modules
- `/help` select menu loads module cards
- welcome and goodbye cards render in configured channels
- a blocked phrase triggers automod logging
- message edit/delete logs route correctly
- join bursts trigger anti-raid alerts
- moderation commands still write infractions and logs
