# REDLINE CLIENT HUB

Refined Discord bot build for serving client files and handling moderation.

## Added systems
- `/clients` with two-step category -> client selection
- `/upload` with metadata, category, visibility, and role-lock support
- `/removeclient`
- `/editclient`
- `/announceclient`
- `/exportclients`
- `/backup`
- download cooldowns
- download logging
- richer client cards
- `/kick`, `/ban`, `/prison`, `/unprison`, `/prisonlist`, `/prisonreason`, `/announce`
- prison role removal/restoration tracking

## Setup
1. Run `npm install`
2. Copy `.env.example` to `.env`
3. Fill in your bot values
4. Run `npm start`

## Optional env values
- `DOWNLOAD_LOG_CHANNEL_ID`
- `PRISON_LOG_CHANNEL_ID`

## Notes
- The bot role must stay above the `Prisoner` role.
- The bot needs the right Discord permissions for moderation and role edits.
- On Railway or similar hosts, local file storage is not durable. `uploads/`, `modules.json`, and `prison-state.json` can disappear after redeploys or restarts.
- If old uploads were saved with bad extensions like `.bin`, re-upload them.

## Files
- `modules.json` stores client metadata
- `prison-state.json` stores prison role restoration data
- `uploads/` stores client files
- `backups/` stores generated exports and backup snapshots
