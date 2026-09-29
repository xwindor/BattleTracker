# SR5E Battle Tracker

A GM's live initiative and combat tracker for Shadowrun 5th Edition, with a
player view kept in sync: Angular 19 in the browser, a Node/Express +
Socket.IO server (`server.js`) connecting GM and players in a room.

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

- Work directly on `main`. Create worktrees or branches only when I ask.
- Commit after I approve a change, not before.
- If you create a file, say where you put it.
- When you're unsure what I want, or what the app should do, ask me. My answer
  in the conversation outranks every file in this repo.

## What the app is

The product decisions that bound everything built here live in `docs/adr/`,
one file each. Read the ones touching an area before proposing work in it.
The short version: the app is a **tracker, not a referee** (it remembers and
shows; the GM decides outcomes), and it covers only what happens during the
session.

## Rules facts

Shadowrun 5e rules facts come only from the core rulebook, read in
`rules/core/pages/`, never from memory of the game. Every citation names the
book and the printed page: `(Core p. 159)`.

- **Rules question → `sr5-rules-lookup`.** Whenever a rules question comes up,
  in any skill or conversation, ask the `sr5-rules-lookup` helper. Copy its
  cited answer into the spec or to-do item the work comes from, so the review
  at the end checks the build against those pages.
- **If the helper can't be started,** read `rules/core/pages/` yourself the
  way the helper would, quote each passage with its page, and tell Xavier
  plainly that the helper wasn't used.
- **`RULINGS.md`** holds this table's calls on cases the core rulebook leaves
  open or contradicts. Check it before treating a case as undecided. New
  rulings are Xavier's to make: put the question to him, then append his answer
  with the date and the page it fills a gap next to.
- **Core rulebook only.** The other books under `rules/` are extracted but not
  approved; `rules/INDEX.md` records which books are in use. If the core
  rulebook can't answer something, say so and stop. A book becomes usable only
  once its page offset is verified by hand against three pages and Xavier
  approves it.

## Workflow

Xavier drives the work with the Pocock skills: `/grill-with-docs` to question
an idea until it's clear, `/to-spec` to write it up, `/to-tickets` to split it
into to-do items, `/implement` or `/tdd` to build, `/code-review` to check it,
`/diagnosing-bugs` for anything broken, `/wayfinder` for efforts too big for
one session.

### Issue tracker

To-do items live in GitHub Issues on Xavier's fork, `xwindor/BattleTracker`,
never on the original `MerGatto/BattleTracker`. See
`docs/agents/issue-tracker.md`.

### Triage labels

The five standard status tags (needs-triage, needs-info, ready-for-agent,
ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` (the glossary) and `docs/adr/` (product
decisions) at the root. See `docs/agents/domain.md`.
