# Serenity Premium Module System

## 1. Inspiration analysis

### Structural product ideas adapted from MEE6-inspired public patterns

Serenity borrows the **product shape**, not the branding:

- a clearly modular plugin-like mental model where each major area feels like an installable product surface,
- category-first command discovery instead of a flat command dump,
- polished onboarding and public-facing cards,
- role and channel aware access controls,
- reusable templates for announcements, onboarding, embeds, and repeatable server workflows,
- configuration that reads like it could map directly to dashboard pages.

What Serenity deliberately does **not** copy:

- names, brand language, design assets, or any product-specific copy,
- exact setup wording,
- exact premium tier packaging language.

### Operational product ideas adapted from Antidote-inspired public patterns

Serenity takes inspiration from the broader “server operations suite” posture:

- protection is treated as a first-class product area rather than a single anti-spam toggle,
- role menus and ticket panels are stored as reusable server assets,
- auto responders are elevated into a configurable automation module,
- support and access workflows feel panel-driven instead of improvised,
- staff tooling is organized around repeatable operational surfaces.

### Engineering ideas adapted from Sapphire-inspired modular systems

Serenity follows Sapphire-like engineering values without depending on Sapphire itself:

- strong separation between bootstrap, command definitions, services, storage, and helpers,
- reusable metadata as a single source of truth for help, access checks, and dashboard readiness,
- service-driven feature logic instead of command-local duplication,
- plugin-like internal organization where modules are easy to extend without flattening the codebase.

## 2. Current Serenity gaps that this pass addresses

Before this expansion, Serenity already had solid foundations in moderation, automod, onboarding, help, and client/content handling, but several premium platform gaps remained:

1. **Module depth was uneven.** Some areas were premium-ready while others were thinner or missing entirely.
2. **Template thinking was not global.** Welcome, announcements, polls, tickets, embeds, and responders were not tied together with one shared preset philosophy.
3. **Dashboard-readiness stopped short of several major modules.** Tickets, role menus, autoresponders, announcement defaults, and template defaults were not fully normalized into guild config.
4. **Operational modules were underrepresented.** Role menus, ticket panels, and autoresponder automation were not first-class Serenity modules.
5. **Help metadata needed richer operational context.** Commands needed config dependency visibility, better command-card detail, and tighter alignment with future admin UX.
6. **Module toggles needed to feel more intentional.** Guild configuration needed clearer module enable/disable controls.

## 3. Structured implementation plan by module

### Moderation

- Keep the existing punishment and infraction platform as a serious staff surface.
- Continue routing moderation through shared services and logging.
- Preserve hierarchy checks, durable histories, and structured outputs.

### Auto Moderation

- Keep the existing configurable rule system.
- Ensure it remains part of the same guild-scoped module schema used by the new modules.
- Keep anti-raid, thresholds, and escalation logic integrated with logging.

### Logging

- Expand the guild config schema so logs can route ticket and role-menu events in addition to the existing streams.
- Keep logs structured around feature domains instead of a single monolithic channel.

### Welcome / Onboarding

- Extend the onboarding config model with template style awareness.
- Preserve premium welcome cards and add a style layer that is consistent with the template system.

### Tickets / Support

- Add ticket panel definitions as stored guild assets.
- Let admins create reusable ticket panel drafts and publish them into channels.
- Let members open private ticket channels from buttons.
- Support close and claim ticket actions as part of the same panel-driven workflow.

### Role Menus

- Add reusable role menu definitions with names, descriptions, styles, single-select support, and per-option metadata.
- Publish role menu panels with buttons.
- Let members self-assign and remove roles directly from the panel.

### Auto Responders

- Add a true autoresponder module instead of ad hoc keyword replies.
- Support contains, exact, and regex trigger modes.
- Support text or embed responses.
- Support cooldowns plus optional channel and role scopes.

### Templates

- Add a shared template registry for welcome, announcements, embeds, ticket panels, polls, and auto responders.
- Let admins browse families and set guild defaults.
- Use the template system to push visual consistency across public modules.

### System / Configuration

- Expand `/set` into a broader control surface for module toggles and template defaults.
- Keep command access overrides centralized.
- Keep the architecture future-dashboard-ready.

## 4. Files changed / added

### Added

- `services/templateService.js`
- `services/automationService.js`
- `services/roleMenuService.js`
- `services/ticketService.js`
- `commands/autoresponder.js`
- `commands/rolemenu.js`
- `commands/tickets.js`
- `commands/templates.js`
- `docs/premium-module-system.md`

### Updated

- `services/configService.js`
- `services/moduleService.js`
- `services/helpService.js`
- `services/panelService.js`
- `services/accessService.js`
- `services/welcomerService.js`
- `handlers/messageHandler.js`
- `commands/set.js`
- `commands/welcomer.js`
- `commands/prison.js`
- `README.md`

## 5. Major module details

### Template system

#### What it does

The template service defines reusable families for:

- welcome cards,
- announcements,
- embeds,
- ticket panels,
- polls,
- auto responders.

Each family includes multiple styles such as premium, minimal, alert, update, support, report, or community depending on the feature.

#### Why it exists

Without a shared template model, premium polish becomes inconsistent. This system gives Serenity one visual and configuration language that can scale into a dashboard later.

#### How it is configured

- Guild defaults live in `modules.templates.defaults`.
- `/templates list` shows families and active defaults.
- `/templates browse family:<family>` previews one family.
- `/templates set family:<family> style:<style>` changes the guild default.
- `/set template family:<family> style:<style>` provides the same control from the core setup command.

#### Permissions

- `Manage Guild` is required because template defaults affect public-facing server automation.

#### Stored data

- One default style per family under `modules.templates.defaults`.

#### UX goal

Template configuration should feel like choosing a product preset, not editing a random string blob.

### Tickets / support

#### What it does

The ticket module lets admins create named ticket panel definitions, publish them into channels, and let users open private support channels from buttons.

#### Why it exists

Support flows are one of the most visible premium bot experiences. They need reusable panels, routing, and clear entry points instead of one-off channel creation.

#### How it is configured

- `/tickets create ...` stores a panel draft.
- `/tickets publish ...` posts the live open-ticket panel.
- `/tickets list` shows saved panels.
- Panel definitions can include style, category routing, support role, welcome message, and ticket channel prefix.

#### Permissions

- Admin setup requires `Manage Channels`.
- End users only need button access to create their own ticket.
- The bot still needs Discord channel-management permissions in practice.

#### Stored data

- `modules.support.panels[]` stores panel definitions.
- Each panel persists its style, publish target, support role, welcome message, and routing information.

#### Events / interactions used

- Slash commands for create/list/publish.
- Button interactions for open, claim, and close actions.

#### Styles / options

- support
- purchase
- report
- application

#### UX goal

Ticket creation should feel guided, premium, and operationally clear, with staff routing and follow-up actions built in.

### Role menus

#### What it does

The role menu module stores reusable role panel definitions and publishes self-assignment buttons for members.

#### Why it exists

Role assignment is a high-frequency community workflow. It should feel like a serious module with ownership, descriptions, and clear state rather than a leftover utility command.

#### How it is configured

- `/rolemenu create ...` stores a menu draft.
- `/rolemenu publish ...` sends the live role panel.
- `/rolemenu list` shows current menus.

#### Permissions

- Setup requires `Manage Roles`.
- The bot still respects Discord hierarchy and role-manageability reality.

#### Stored data

- `modules.roles.menus[]` stores menu definitions.
- Each option stores role ID, label, description, and optional emoji.

#### Events / interactions used

- Slash commands for setup.
- Button interactions for add/remove role actions.

#### Styles / options

- buttons
- compact
- premium
- single-select or multi-select behavior

#### UX goal

Role menus should look like a curated access surface, with per-role descriptions and predictable self-service behavior.

### Auto responders

#### What it does

The auto responder module lets admins build reusable automatic replies with scoped triggers, cooldowns, and text/embed response modes.

#### Why it exists

Auto responders are part of a mature automation layer. They reduce staff repetition, improve onboarding, and make communities feel intentionally managed.

#### How it is configured

- `/autoresponder add ...` creates or updates a responder.
- `/autoresponder list` shows responders.
- `/autoresponder remove ...` deletes one.

#### Permissions

- `Manage Guild` is required for configuration.

#### Stored data

- `modules.autoresponders.items[]` stores trigger, trigger mode, response mode, style, cooldown, and optional channel/role scopes.

#### Events / interactions used

- Message-create handling evaluates responders after automod.

#### Styles / options

- Trigger modes: contains, exact, regex
- Response modes: text, embed
- Styles: minimal, support, alert, community

#### UX goal

Auto responders should feel like a clean automation layer for FAQ, reminders, and routing, not like a fragile keyword hack.

### Configuration / access model

#### What it does

The configuration system now stores more of Serenity as explicit modules and lets admins toggle key modules on or off.

#### Why it exists

A premium bot should have one coherent configuration model that can eventually map straight into dashboard pages without schema rewrites.

#### How it is configured

- `/set module ...` toggles modules.
- `/set log ...` routes operational logs.
- `/set access ...` manages command allow/deny overrides.
- `/set show` summarizes the guild’s current setup.

#### Permissions

- `Manage Guild` for configuration.

#### Stored data

New or expanded module config now includes:

- `modules.announcements`
- `modules.support`
- `modules.roles`
- `modules.autoresponders`
- `modules.polls`
- `modules.embeds`
- `modules.alerts`
- `modules.templates`
- additional logging routes for `tickets` and `rolemenus`

#### UX goal

Admins should feel like they are managing a platform control plane, not juggling unrelated commands.

## 6. New commands / modules / templates added

### New commands

- `/autoresponder`
- `/rolemenu`
- `/tickets`
- `/templates`

### Expanded existing commands

- `/set` now supports module toggles and template defaults in addition to log routing and access overrides.
- `/welcomer templates` now supports a template `style` option.
- `/announce` now supports style, ping mode, footer, and thumbnail options.
- `/help` command cards now show config dependencies and module dashboard alignment.

### New premium module capabilities

- reusable template families,
- reusable role menu drafts and live panels,
- reusable ticket panel drafts and live panels,
- reusable autoresponder automation entries,
- expanded module config normalization.

## 7. Config / storage model updates

The guild config model now normalizes these additional modules:

- `modules.announcements`
- `modules.support`
- `modules.roles`
- `modules.autoresponders`
- `modules.polls`
- `modules.embeds`
- `modules.alerts`
- `modules.templates.defaults`

This keeps Serenity aligned with future dashboard sections such as:

- Overview
- Moderation
- Automod
- Logging
- Welcome
- Tickets
- Role Menus
- Auto Responders
- Polls
- Social Alerts
- Utility
- Commands
- Stats

## 8. README / help / docs updates

The README should describe Serenity as a premium, module-first Discord platform and explain:

- the module catalog,
- the dashboard-ready config shape,
- the template system,
- ticket panels,
- role menus,
- auto responders,
- module toggles,
- owner override and access rules.

The interactive help system now exposes more metadata so command cards feel closer to a product command center than a plain syntax reference.

## 9. Verification checklist

- All command files load successfully.
- Core services and handlers load successfully.
- The command registry builds successfully with the new modules present.
- New panel/button flows are wired into the central interaction handler through `panelService`.
- Message handling now evaluates autoresponders after automod.
- Guild config normalization remains centralized in `services/configService.js`.
