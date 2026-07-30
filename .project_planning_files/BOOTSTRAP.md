# One-time bootstrap — run this before your first feature

Paste this into Claude Code at the repo root. It does the single highest-value
thing for an already-built codebase: writes down how your tracker actually
works, so the agents stop guessing.

**Why this matters more than anything else in the setup.** Subagents start with
a completely fresh context. They don't inherit your conversation. If your
architecture isn't written down in a file they can read, every implementer run
rediscovers your codebase from scratch, guesses at your conventions, and
sometimes builds a second parallel way of doing something you already do. On a
greenfield project that's mildly wasteful. On a built tracker it's the main
source of "the agent's code doesn't work in gameplay" — it's technically fine
code that doesn't fit the machine it's bolted to.

---

## Prompt 1 — map the codebase

```
Read this codebase thoroughly and write ARCHITECTURE.md at the repo root.

This is a Shadowrun 5th Edition initiative tracker with modules for Matrix
hacking and astral combat. It's already substantially built. I need a written
map so future subagents — which start with no context — can make changes that
fit rather than reinventing.

Cover, based on what the code actually does rather than what it should do:

1. How initiative order is represented in state. The exact data structure,
   where it lives, what mutates it.
2. How a Combat Turn and an Initiative Pass are modelled. What resets at each
   boundary and what persists.
3. How a participant is represented. What fields exist, which are optional,
   how NPCs differ from PCs if they do.
4. How the Matrix module and the astral module hook into core initiative. Do
   they maintain separate order lists, share one, or something else? Be
   specific and honest if it's inconsistent between them.
5. Where rules logic lives versus where UI lives, and how strictly that's
   actually separated in practice.
6. How state changes happen. Is there a reducer, direct mutation, an event
   log? Is there undo, and if so how does it work?
7. The test setup: framework, where tests live, the command to run them,
   roughly what's covered and what isn't.
8. Conventions a new contributor would get wrong: naming, file layout,
   patterns you use consistently, patterns you use inconsistently.
9. A "known rough edges" section — places where the same concept is handled
   two different ways, dead code, anything you'd flag as fragile.

Write it factually. Where the code is inconsistent, say so rather than
describing an idealized version. This document's value is accuracy, not
tidiness.
```

Read what it produces. You know this codebase — correct anything wrong. Its
accuracy directly limits every feature you build after this.

## Prompt 2 — the always-loaded context file

```
Now write CLAUDE.md at the repo root. This is loaded automatically into every
session, so it should be short — under 60 lines. Include:

- One paragraph on what this project is
- The test command, the dev command, the build command
- A pointer telling agents to read ARCHITECTURE.md before making structural
  changes, and RULINGS.md before deciding anything the rulebook leaves open
- Where rules constants live and the rule that they're never inlined as bare
  numbers in game logic
- The three or four conventions most likely to be violated
- The rule that Shadowrun rules facts must come from a page-cited brief, never
  from the model's own memory of the game

Don't duplicate ARCHITECTURE.md here. Point to it.
```

## Prompt 3 — audit what's already there

Do this once, after the pipeline works but before you trust it broadly. It's
where your current hiccups are almost certainly hiding.

```
Use the sr5-rules-validator subagent to audit the existing Matrix module
against the rules in rules/. No implementation, no fixes — audit only.

Focus on initiative and timing: how Matrix initiative is derived, how a
character acting in both physical and Matrix time is tracked, what happens at
pass and turn boundaries, and what happens when a character enters or leaves a
host mid-combat-turn. Report defects with printed page citations and
reproduction sequences.
```

Then the same for astral. Expect it to find things. Fix them through the normal
`/feature` flow, one at a time, so each fix gets a regression test.
