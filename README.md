# secretary-app

**What it is:** JARVIS-style assistant ("SECRETARY // J.A.R.V.I.S.") for PC/web, with a USB push-to-talk desk mic. HUD dashboard plus a Claude-powered assistant that acts on Microsoft 365.
**Status:** 🟡 Working prototype, deployed on Vercel · **Owner:** Benja · **Primary machine:** BLACKBETTY · **Visibility:** Public

## Architecture
| Part | Where | What it does |
| :--- | :--- | :--- |
| Front end | `src/`, `index.html` (Vite + React) | HUD: task tree/graph, quick commands, ticker |
| API | `api/*.js` (Vercel functions) | `chat` (Claude tool loop), `suggestions`, `vision`, `data`, `bridge-proxy`, Microsoft auth (`setup`, `poll`, `auth`, `token-store`) |
| Model | Anthropic API | `claude-opus-4-5` |
| Data | Microsoft 365 via Graph | Calendar, To Do, Mail (read/send), OneDrive search |
| Local bridge | `local-bridge/` (port 7474) | Runs on each PC: status, open/url, PowerShell, file read/write, screenshot |
| Local server | `server.mjs` (Express) | Local alternative to Vercel for running the API |

`/api/chat` returns `{ response, actions, executed }`. It is also the planned backend for the `phone` mobile client.

## How to run
```bash
npm install
npm run dev     # front end (Vite)
npm start       # local Express server with API routes
```
Environment: `ANTHROPIC_API_KEY`, `MS_CLIENT_ID`, `MS_TENANT_ID`, `MS_CLIENT_SECRET`, `MS_REFRESH_TOKEN`, optional `BRIDGE_*` URLs per machine. Local bridge: `local-bridge/start.bat` (Windows) or `start.sh` / `start-mac.sh`.

## Project tracking
### Done
- [x] Full HUD UI (tree/graph views, panels, ticker, theming)
### To do / backlog
- [x] Decide: real assistant, not a design reference
- [x] Wire to real task data (Microsoft 365 via Graph)
- [ ] Add authentication to all `api/*` routes (required before the `phone` client)
- [ ] Security review of `local-bridge` and `bridge-proxy`
- [ ] Update model from `claude-opus-4-5` to a current Claude model
- [ ] It's public — confirm that's intended, or flip to private

## Changelog
- 2026-09-29 — README rewritten to match the code (backend, M365, local bridge); `phone` confirmed as separate mobile client on this API
- 2026-09-15 — README added during GitHub reorg (BLACKBETTY)
