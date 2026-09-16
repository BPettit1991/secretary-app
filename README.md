# secretary-app

**What it is:** A single-file, JARVIS-style HUD dashboard prototype — a "secretary" command centre with a cyberpunk interface (task tree/graph views, quick commands, live ticker). Named SECRETARY // J.A.R.V.I.S.
**Status:** ⚪ Prototype (front-end only, no backend) · **Owner:** Benja · **Primary machine:** BLACKBETTY · **Visibility:** Public

## What it does
A self-contained React app (React + Babel loaded from CDN, everything else inline in `index.html`) rendering a HUD-style dashboard: TREE VIEW / GRAPH VIEW of tasks, ACTIVE / IN PROGRESS states, QUICK CMDS, and a scrolling status ticker. It's a UI concept — no live data, no API calls (only Google Fonts + unpkg for React).

## How to use / run
Open `index.html` in a browser — that's it. No build step, no server, no dependencies to install.

## Project tracking
### Done
- [x] Full HUD UI (tree/graph views, panels, ticker, theming)
### To do / backlog
- [ ] Decide: is this the front-end for a real assistant, or a design reference? (overlaps with the `phone` idea)
- [ ] If real: wire to actual task data
- [ ] It's public — confirm that's intended, or flip to private

## Changelog
- 2026-09-15 — README added during GitHub reorg (BLACKBETTY)
