# SR5E Battle Tracker

A real-time initiative/combat tracker for Shadowrun 5th Edition, built with
Angular 19 (frontend) and a Node/Express + Socket.IO server (`server.js`) for
GM/player session sync. GMs run combat from a full-control view; players join
a room to see initiative order, roll, and declare actions.

## Commands

- Dev (two terminals): `npm run server` then `npm start`
- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`

## Where things are documented

- **`docs/APP_DOCUMENTATION.md`** — authoritative architecture reference.
  Read this before any structural change.
- **`RULINGS.md`** — table rulings for anything the SR5 rulebook leaves open.
  Check it before deciding an undefined case yourself; append decisions here,
  don't re-decide them ad hoc.
- **`docs/UNVERIFIED-RULES.md`** — rules claims found stated as fact
  somewhere in this repo without a printed page citation. **Not
  authoritative. Never cite or build against anything in this file** until
  it's been verified against `rules/` and moved out with a page number.
- **`.local-notes/`** — untracked personal notes. Lower authority than
  anything in `docs/`; may be stale or wrong.
- **`.claude/worktrees/`** — stale copies from around May 2026, pending
  deletion. Never read or search here.

## Rules facts

Shadowrun 5e rules facts must come only from a page-cited brief backed by
`rules/` (via `sr5-rules-analyst`) — never from your own memory of the game.

## Current focus

Core tracker correctness. The Matrix module is deferred; its build plan
lives in `docs/MATRIX_MODULE_PLAN.md`.
