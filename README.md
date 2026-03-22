# Serenity for Redline Hub

Serenity is a modular Discord.js v14 platform designed to feel like a premium multi-purpose Discord bot rather than a loose collection of commands. The runtime remains split across `commands/`, `handlers/`, `services/`, `storage/`, and `utils/`, while `index.js` stays bootstrap-only.

For the full premium product analysis and implementation breakdown, see [`docs/premium-module-system.md`](docs/premium-module-system.md).

## Product direction

This build pushes Serenity toward a polished, module-first server management platform with:

- premium command discovery,
- stronger moderation and onboarding,
- deeper guild configuration,
- structured logging,
- automated protection and anti-raid controls,
- reusable templates,
- dashboard-ready module schemas,
- support, role menu, and automation surfaces that feel like first-class product areas.

## Premium module system

Every command now resolves into one intentional Serenity module. These modules drive help output, access policy, documentation, and future dashboard readiness.

| Module | Purpose | Dashboard-ready section |
| --- | --- | --- |
| Moderation | Staff actions, sanctions, infractions, locks, and punishment workflows | Moderation |
| Auto Moderation | Spam, links, invites, mention spam, caps, repetition, blocked phrases, anti-raid | Automod |
| Logging | Message/member/security/command/ticket/role-menu audit trails | Logging |
| Welcome & Goodbye | Welcome cards, onboarding copy, goodbye notices, starter roles | Welcome |
| Utility | Everyday commands and workflow helpers | Utility |
| Info | User/server/runtime insights | Stats |
| Polls | Community voting and reaction poll flows | Polls |
| Role Menus | Self-assignable role panels and role workflow utilities | Role Menus |
| Social Alerts | YouTube and external content notification tooling | Social Alerts |
| Music | Lavalink-backed playback and queue controls | Music |
| Client & Content | Client uploads, panels, exports, embeds, and content operations | Content |
| Tickets & Support | Panel-driven support entry and ticket operations | Tickets |
| System & Configuration | Help center, setup, template defaults, access overrides, module control | Overview |
| Owner & Admin | Higher-trust administrative actions and public server broadcasts | Commands |

## Architecture overview

### Bootstrap

- `index.js` validates environment variables, initializes stores, loads commands, attaches handlers, registers slash commands, starts background jobs, and logs into Discord.

### Commands

- `commands/` keeps slash and prefix definitions only.
- Each command is normalized into structured metadata: name, category/module, description, usage, examples, permissions, aliases, response mode, prefix support, and config dependencies.

### Services

- `services/moduleService.js` centralizes module/category metadata.
- `services/helpService.js` renders the premium help center and interactive selectors.
- `services/configService.js` normalizes guild-scoped module configuration for dashboard-ready storage.
- `services/templateService.js` defines reusable template families for welcome cards, announcements, embeds, tickets, polls, and auto responders.
- `services/automationService.js` manages autoresponder definitions and runtime matching.
- `services/roleMenuService.js` manages reusable role menu definitions and self-assignment interactions.
- `services/ticketService.js` manages reusable ticket panels and ticket button flows.
- `services/automodService.js` powers automod rules and anti-raid detection.
- `services/logService.js` formats structured audit embeds and routes them to configured channels.
- `services/welcomerService.js` manages short welcome-message delivery, onboarding settings, and admin previews.
- `services/welcomeCardService.js` renders the generated welcome-card image attachment used in public onboarding messages.

### Storage

- `storage/configStore.js` persists normalized configuration.
- `storage/moderationStore.js` persists infractions, tempbans, mute role IDs, and channel lock state.
- Other JSON stores remain dedicated to their feature areas.

## Interactive help system

`/help` acts as a command center instead of a wall of text.

### What it does

- shows premium module cards,
- exposes category-driven navigation,
- lets users open command detail cards from interactive menus,
- keeps slash and prefix guidance together,
- highlights permissions, response mode, aliases, examples, and config dependencies,
- aligns commands with dashboard-ready module sections.

### How admins and users use it

- `/help`
- `/help command:ban`
- `Serenity help`
- `Serenity help ban`

## Template system

Serenity now treats templates as a platform concept rather than one-off embed output.

### Template families

- welcome,
- announcement,
- embed,
- ticket,
- poll,
- autoresponder.

### Commands

- `/templates list`
- `/templates browse family:<family>`
- `/templates set family:<family> style:<style>`
- `/set template family:<family> style:<style>`

### Why this matters

This keeps public-facing modules visually consistent and makes future dashboard dropdowns straightforward to map to saved defaults.

## Guild configuration model

Serenity stores configuration per guild in a dashboard-friendly module schema.

### Main configuration areas

- `modules.logging`
- `modules.onboarding`
- `modules.automod`
- `modules.protection`
- `modules.announcements`
- `modules.support`
- `modules.roles`
- `modules.autoresponders`
- `modules.polls`
- `modules.embeds`
- `modules.alerts`
- `modules.templates`
- `modules.commands`

### Why this exists

This prevents feature settings from being scattered or hardcoded and makes future dashboard pages easier to map directly onto stored data.

## Onboarding and welcome system

The welcome system is now a configurable onboarding module built around a short chat message plus a generated welcome card image.

### Features

- welcome channel,
- enable/disable toggle,
- short configurable welcome text lines,
- optional highlighted channel mention,
- optional member ping,
- generated welcome card attachment with avatar, username, join text, and member count,
- optional auto role,
- optional goodbye channel and goodbye notices,
- card themes (`dark-clean`, `blue-premium`, `minimal`, `neon-dark`),
- optional background image URL and text color override,
- toggles for member count, avatar, and join text visibility,
- preview/status visibility for admins.

### Commands

- `/welcomer set channel:#welcome`
- `/welcomer goodbye channel:#farewell`
- `/welcomer templates line_one:<text> line_two:<text> line_three:<text> style:<style>`
- `/welcomer preview`
- `/welcomer role role:@Member`
- `/welcomer on`
- `/welcomer off`
- `/welcomer status`

## Announcements / broadcasting

Announcements are treated as a premium broadcast surface rather than an audit-looking message block.

### Features

- style presets: `broadcast`, `update`, `alert`, `community`,
- optional ping mode: `none`, `here`, `everyone`,
- optional footer override,
- optional thumbnail override,
- cleaner public card hierarchy.

### Command

- `/announce title:<title> message:<body> style:<style> ping:<mode>`

## Auto moderation and protection

Serenity includes a configurable protection suite.

### Rules supported

- anti-spam,
- anti-link,
- anti-invite,
- mention spam protection,
- caps filter,
- repetition detection,
- blocked phrases.

### Per-rule controls

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

## Tickets / support

Serenity now includes panel-based support workflows.

### Features

- reusable ticket panel drafts,
- publishable support entry panels,
- optional category routing,
- optional support role visibility,
- close and claim ticket actions,
- configurable welcome copy and channel prefix.

### Commands

- `/tickets create ...`
- `/tickets publish ...`
- `/tickets list`

## Role menus

Role menus are now treated as reusable community access panels.

### Features

- reusable role menu drafts,
- labels, descriptions, and optional emojis per role option,
- single-select or multi-select behavior,
- live self-assignment via buttons,
- stored publish state.

### Commands

- `/rolemenu create ...`
- `/rolemenu publish ...`
- `/rolemenu list`

## Auto responders

Auto responders now act as a real automation layer.

### Features

- trigger modes: `contains`, `exact`, `regex`,
- response modes: `text`, `embed`,
- cooldowns,
- optional channel restrictions,
- optional role restrictions,
- template-aware style labeling.

### Commands

- `/autoresponder add ...`
- `/autoresponder list`
- `/autoresponder remove trigger:<text>`

## Logging system

Logging is structured by feature rather than a few flat channels.

### Log streams

- downloads,
- moderation,
- prison,
- announcements,
- members,
- messages,
- security,
- commands,
- tickets,
- role menus.

## Command access model

Serenity supports centralized access control.

### Supported controls

- internal permission gating based on the command’s configured Discord permissions,
- role allow lists,
- role deny lists,
- channel allow lists,
- channel deny lists,
- module disable gates,
- bot owner override.

### Commands

- `/set access command:<name> ...`
- `/set module module:<module> enabled:<true|false>`
- `/set show`

## Bot owner override

Set `BOT_OWNER_ID` to a Discord user ID to define one Serenity bot owner override account.

- The configured owner bypasses Serenity’s internal permission gating.
- The configured owner also bypasses command role/channel allow and deny lists.
- Hidden client/module access role restrictions are also bypassed for that owner.
- This override does **not** bypass Discord API-enforced limitations such as missing bot permissions, hierarchy failures, or actions Discord rejects.
