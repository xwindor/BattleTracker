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

## How to talk to me

Xavier is not a software engineer. Length is fine — density is not. Write for
someone who understands the app as a user and a GM, but not the code.

- Describe things by what they do in the app, not by what they're called in the
  code. Not "the buffered parentTargetId" but "the Parent choice is held until
  you press Save."
- Never use an engineering term without explaining it in the same sentence. If
  you write "flaky test," say what a flaky test is and why it matters.
- No shorthand that compresses a concept into a phrase: "context gate,"
  "test-order dependent," "coverage class," "assert rendered DOM," "race
  condition." Spell out what's happening in ordinary words instead.
- File names, method names, and line counts belong in the files, not in what you
  say to me. If a file matters, describe what part of the app it controls.
- Anything broken or unreliable goes in the first sentence, explained plainly —
  never as a numbered item further down.

Prefer three plain sentences over one precise technical one. If you're unsure
whether a term is jargon, assume it is.

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
Every citation must name the book and the printed page, e.g. `(Core p. 159)`.
`rules/INDEX.md` lists the rulebooks and which are in use.

**Only the core rulebook is in use.** The other books under `rules/` are
extracted but not yet approved for use: do not search them, cite them, or
propose rules from them. If something can't be answered from the core rulebook,
say so and stop rather than reaching for another book. A book becomes usable
only once its page offset is verified by hand against three pages and Xavier
approves it.

## Current focus

Core tracker correctness. Matrix work is paused: the domain classes in
`src/Matrix/` and the session-sync plumbing already exist, but rules
verification and the remaining GM-workflow build-out are deferred.

## Agent skills

### Issue tracker

To-do items live as markdown files under `.scratch/` in this repo (GitHub Issues is off). See `docs/agents/issue-tracker.md`.

### Triage labels

The five standard status tags (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the root, alongside the existing SCOPE / ARCHITECTURE / RULINGS docs. See `docs/agents/domain.md`.
