# Serenity for Redline Hub

Serenity is a modular Discord.js v14 platform designed to feel like a premium multi-purpose bot product rather than a loose collection of commands. The runtime remains split across `commands/`, `handlers/`, `services/`, `storage/`, and `utils/`, while `index.js` stays bootstrap-only.

## Product direction

This build pushes Serenity toward a polished, module-first server management platform with:

- premium command discovery,
- stronger moderation and onboarding,
- deeper guild configuration,
- structured logging,
- automated protection and anti-raid controls,
- reusable metadata designed for a future dashboard.

## Premium module system

Every command now resolves into one intentional Serenity module. These modules drive help output, documentation, access policy, and future dashboard readiness.

| Module | Purpose |
| --- | --- |
| Moderation | Staff actions, sanctions, infractions, locks, and punishment workflows |
| Auto Moderation | Spam, links, invites, mention spam, caps, repetition, blocked phrases |
| Logging | Message/member/security/command audit trails routed to configurable channels |
| Welcome & Goodbye | Welcome cards, onboarding copy, goodbye notices, starter roles |
| Utility | Everyday commands and workflow helpers |
| Info | User/server/runtime insights |
| Polls | Community voting and reaction poll flows |
| Role Menus | Access-oriented role workflows and role utilities |
| Social Alerts | YouTube and external content notification tooling |
| Music | Lavalink-backed playback and queue controls |
| Client & Content | Client uploads, panels, exports, embeds, and content operations |
| System & Configuration | Help center, guild setup, access overrides, route configuration |
| Owner & Admin | Higher-trust administrative actions |

## Architecture overview

### Bootstrap

- `index.js` validates environment variables, initializes stores, loads commands, attaches handlers, registers slash commands, starts background jobs, and logs into Discord.

### Commands

- `commands/` keeps slash and prefix definitions only.
- Each command is normalized into structured metadata: name, category/module, description, usage, examples, permissions, aliases, response mode, and prefix support.

### Services

- `services/moduleService.js` centralizes module/category metadata.
- `services/helpService.js` renders the premium help center and interactive selectors.
- `services/configService.js` normalizes guild-scoped module configuration for dashboard-ready storage.
- `services/automodService.js` powers automod rules and anti-raid detection.
- `services/logService.js` formats structured audit embeds and routes them to configured channels.
- `services/welcomerService.js` manages premium welcome/goodbye flows and onboarding settings.
- Existing moderation, music, poll, content, and panel services remain modular.

### Storage

- `storage/configStore.js` persists normalized configuration.
- `storage/moderationStore.js` persists infractions, tempbans, mute role IDs, and channel lock state.
- Other JSON stores remain dedicated to their feature areas.

## Interactive help system

`/help` now acts as a command center rather than a wall of text.

### What it does

- shows premium module cards,
- exposes category-driven navigation,
- lets users open command detail cards from interactive menus,
- keeps slash and prefix guidance together,
- highlights permissions, response mode, aliases, and examples.

### How admins and users use it

- `/help`
- `/help command:ban`
- `Serenity help`
- `Serenity help ban`

### Output

- module selector,
- command selector for the chosen module,
- home button to jump back to the overview,
- premium command detail cards.

## Guild configuration model

Serenity now stores configuration per guild in a dashboard-friendly module schema.

### Main configuration areas

- `modules.logging`
- `modules.onboarding`
- `modules.automod`
- `modules.protection`
- `modules.commands`

### Why this exists

This prevents feature settings from being scattered or hardcoded and makes future dashboard pages easier to map directly onto stored data.

## Onboarding and welcome system

The welcome system has been expanded into a configurable onboarding module.

### Features

- welcome channel,
- enable/disable toggle,
- customizable title/subtitle/body,
- optional member ping,
- avatar-based premium welcome card,
- optional auto role,
- optional goodbye channel and goodbye notices,
- status visibility for admins.

### Commands

- `/welcomer set channel:#welcome`
- `/welcomer goodbye channel:#farewell`
- `/welcomer templates ...`
- `/welcomer role role:@Member`
- `/welcomer on`
- `/welcomer off`
- `/welcomer status`

### Stored data

The onboarding module stores:

- enabled state,
- welcome channel ID,
- goodbye channel ID,
- welcome text template,
- goodbye toggle/message,
- ping behavior,
- image behavior,
- auto role ID.

## Auto moderation and protection

Serenity now includes a configurable security center.

### Rules currently supported

- anti-spam,
- anti-link,
- anti-invite,
- mention spam protection,
- caps filter,
- repetition detection,
- blocked phrases.

### Per-rule controls

Each rule can store:

- enabled/disabled state,
- primary action,
- thresholds,
- cooldown windows,
- duration minutes,
- ignored channels,
- ignored roles,
- allowed roles,
- blocked phrases where relevant.

### Anti-raid controls

- rapid join burst detection,
- configurable threshold and time window,
- alert-only mode,
- quarantine role support,
- kick or ban emergency response,
- security alert routing.

### Commands

- `/automod status`
- `/automod toggle rule:<rule> enabled:<true|false>`
- `/automod tune ...`
- `/automod badwords ...`
- `/automod antiraid ...`

Prefix support:

- `Serenity automod status`
- `Serenity automod toggle spam on`
- `Serenity automod antiraid on 5 20 alert`

## Logging system

Serenity logging is now structured by feature rather than a few flat channels.

### Log streams

- downloads,
- moderation,
- prison,
- announcements,
- members,
- messages,
- security,
- commands.

### Logged activity currently includes

- moderation actions,
- command usage for restricted/staff commands,
- message deletes,
- message edits,
- member joins,
- member leaves,
- onboarding deliveries,
- automod actions,
- anti-raid alerts,
- content downloads,
- announcements.

### Configuration

Use `/set log` to route one stream at a time.

Examples:

- `/set log type:moderation channel:#mod-logs`
- `/set log type:security channel:#security-alerts`
- `/set log type:messages channel:#message-logs`

## Command access model

Serenity now supports dashboard-ready command access overrides.

### Supported controls

- internal command permission gating based on the command's configured Discord permissions,
- role allow lists,
- role deny lists,
- channel allow lists,
- channel deny lists.

### Command

- `/set access command:<name> allowed_role:@Role`
- `/set access command:<name> denied_channel:#channel`

These checks apply to both slash and prefix executions before the command body runs, so Serenity can enforce one shared access path and honor the bot owner override consistently.

### Bot owner override

Set `BOT_OWNER_ID` to a Discord user ID to define a single Serenity bot owner override account.

- The configured owner bypasses Serenity's internal command permission gating.
- The configured owner also bypasses command role/channel allow and deny lists.
- Hidden client/module access role restrictions are also bypassed for that owner.
- This override does **not** bypass Discord API-enforced limitations such as missing bot permissions, hierarchy failures, or actions Discord rejects.

## Moderation and infractions

The moderation platform continues to provide persistent infractions and has been aligned with the premium module system.

### Core actions already present

- warn,
- warnings,
- infractions,
- clearwarns,
- timeout,
- mute,
- unmute,
- kick,
- ban,
- unban,
- purge,
- role actions,
- lock/unlock and related staff workflows already present in `commands/moderation.js`.

### Stored data

Moderation state stores:

- infraction history,
- moderator IDs,
- reasons,
- timestamps,
- expiry timestamps,
- tempban queue,
- mute role ID,
- lock state.

## Premium UX notes

This pass improves consistency by:

- normalizing command metadata,
- aligning categories/modules,
- using cleaner embeds for status, configuration, logging, and welcome flows,
- making help interactive,
- making security settings explicit rather than hardcoded,
- keeping public-facing and admin-facing responses intentional.

## Core commands added or expanded in this pass

### Added

- `/automod`

### Expanded

- `/help`
- `/set`
- `/welcomer`

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file.
3. Provide the required environment variables.
4. Start the bot:

   ```bash
   npm start
   ```

## Required environment variables

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- `LAVALINK_HOST`
- `LAVALINK_PORT`
- `LAVALINK_PASSWORD`

## Optional environment variables

- `BOT_PREFIX_NAME`
- `BOT_OWNER_ID`
- `YOUTUBE_API_KEY`
- `YOUTUBE_POLL_INTERVAL_MS`
- `TEMPBAN_CHECK_INTERVAL_MS`
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

## Verification checklist

- `index.js` remains bootstrap-only.
- Commands stay in `commands/`.
- Shared feature logic stays in `services/` and `utils/`.
- Slash + prefix compatibility is preserved where previously supported.
- Guild configuration is centralized.
- Help/category metadata is reusable.
- Logging, onboarding, access, and automod use modular services.
