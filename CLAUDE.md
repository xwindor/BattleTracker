# SR5E Battle Tracker

A real-time initiative/combat tracker for Shadowrun 5th Edition, built with
Angular 19 (frontend) and a Node/Express + Socket.IO server (`server.js`) for
GM/player session sync. GMs run combat from a full-control view; players join
a room to see initiative order, roll, and declare actions.

## Commands

- Dev (two terminals): `npm run server` then `npm start`
- Build: `npm run build`
- Test: `npm test` (headless, runs once, exits with a real pass/fail code)
- Lint: `npm run lint`

## Working practices

- Work directly on `main`. Do not create worktrees or branches unless I
  explicitly ask for one.
- Commit after I approve a change, not before.
- If you create a file, say where you put it.

## Where things are documented

- **`SCOPE.md`** — the product boundary: what this app is and isn't. Read
  before proposing what to build. Finding a rule does not mean implementing it.
- **`ARCHITECTURE.md`** — authoritative reference for combat and initiative:
  initiative-order storage, turn/pass boundary semantics, participant state,
  tie-breaking, and how session sync interacts with combat state. Read
  this before any change touching those areas.
- **`docs/APP_DOCUMENTATION.md`** — broader reference for UI flows, the socket
  event catalog, deployment and infrastructure, and where to edit things.
- **`docs/INITIATIVE-MUTATION-SOURCES.md`** — page-cited catalogue of
  everything in SR5 that changes Initiative Score mid-turn, with
  implementation status.
- **`RULINGS.md`** — table rulings for anything the SR5 rulebook leaves open.
  Check it before deciding an undefined case yourself; append decisions here,
  don't re-decide them ad hoc.
- **`docs/UNVERIFIED-RULES.md`** — rules claims found stated as fact somewhere
  in this repo without a printed page citation. **Not authoritative. Never
  cite or build against anything in this file** until it's been verified
  against `rules/` and moved out with a page number.
- **`docs/FEATURE-BACKLOG.md`** — running list of future work.
- **`docs/MATRIX_MODULE_PLAN.md`** — Matrix build plan (parked).
- **`.local-notes/`** — untracked personal notes. Lower authority than
  anything in `docs/`; may be stale or wrong.
- **`.claude/worktrees/`** — stale copies from around May 2026, pending
  deletion. Never read or search here.

## Rules facts

Shadowrun 5e rules facts must come only from a page-cited brief backed by
`rules/` (via `sr5-rules-analyst`) — never from your own memory of the game.

## Current focus

Core tracker correctness. Matrix work is paused: the domain classes in
`src/Matrix/` and the session-sync plumbing already exist, but rules
verification and the remaining GM-workflow build-out are deferred.