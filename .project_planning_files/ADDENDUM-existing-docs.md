# Addendum — reconciling your existing .md files

Do this INSTEAD of BOOTSTRAP prompts 1 and 2. Your existing docs are an asset —
they contain things you know that aren't visible in the code. The goal is
merging, not replacing.

## Step 1 — Commit first

```bash
git add -A && git commit -m "checkpoint before doc reconciliation"
```

Nothing here should destroy anything, but you're about to let an agent
restructure your documentation. Cheap insurance.

## Step 2 — Inventory

In Claude Code:

```
Find every .md file in this repo (excluding node_modules and any vendor
directories) and give me a table: path, what it appears to be for, roughly how
current it looks, and whether anything in it contradicts another .md file.

Then categorise every claim in CLAUDE.md and the other guide files into:

A. Architecture / code facts — how my tracker is actually built
B. Shadowrun rules assertions — claims about what the game rules say
C. Workflow instructions — how you should behave, what commands to run
D. Stale or dead — refers to things that no longer exist

For category B specifically, list every rules claim separately and note whether
it carries a page citation. Don't change any files yet.
```

## Step 3 — Deal with category B first. This is the important one.

Any rules assertion in `CLAUDE.md` without a page citation is a liability. It's
loaded into every session as fact, it's invisible to the validator (which reads
the same file), and if it's wrong it poisons every feature you build.

Two options per claim:

- **Verify it.** Once `rules/` exists, have the analyst confirm the claim and
  attach a printed page number. Then it can stay.
- **Quarantine it.** Move it to `docs/UNVERIFIED-RULES.md` with a header saying
  these are unconfirmed and must not be treated as authoritative.

```
Move every uncited rules assertion out of CLAUDE.md into
docs/UNVERIFIED-RULES.md, with a header stating that nothing in this file is
verified and no agent should treat it as a rules source. Leave a line in
CLAUDE.md pointing at it with that same warning.
```

Then, once the rules index is built, work through them:

```
Use the sr5-rules-analyst subagent to check each claim in
docs/UNVERIFIED-RULES.md against rules/. For each: CONFIRMED with a printed
page, CONTRADICTED with what the book actually says, or NOT FOUND.
```

Expect a couple of contradictions. Those are likely the origin of specific
hiccups you've already noticed — and now you'll know which.

## Step 4 — Merge category A into ARCHITECTURE.md

```
Write ARCHITECTURE.md using BOOTSTRAP.md prompt 1 as the spec, but start from
the category A content in my existing .md files rather than from scratch. Where
an existing doc and the actual code disagree, describe what the code does and
flag the discrepancy explicitly — don't silently pick one.

Then tell me which existing .md files are now fully absorbed and which still
have unique content.
```

Those discrepancies are worth reading closely. A doc that drifted from the code
means either the doc is stale or the code did something you didn't intend.

## Step 5 — Revise CLAUDE.md rather than rewrite it

```
Revise CLAUDE.md in place. Keep my existing content except where superseded.
Add: a pointer to ARCHITECTURE.md for structural work, a pointer to RULINGS.md
for anything the rulebook leaves open, and the rule that Shadowrun rules facts
must come from a page-cited brief and never from the model's own memory of the
game.

Then check for instructions that now conflict with the /feature pipeline — for
example anything telling you to implement directly, or to consult rules
knowledge freely. Show me those conflicts and propose resolutions. Don't resolve
them yourself.

Target under 60 lines. Show me a diff before writing.
```

**Why the length limit:** `CLAUDE.md` is loaded on every single interaction, so
everything in it is a permanent context cost. It should be a short index that
points at detail elsewhere, not the detail itself.

**Why you resolve the conflicts, not the agent:** contradictory instructions are
worse than either instruction alone — the model picks one unpredictably, so
behaviour becomes inconsistent between sessions and you can't tell why. Someone
has to decide, and only you know which of your old instructions still reflect
what you want.

## Step 6 — Archive what's dead

```
For the .md files now fully absorbed, move them to docs/archive/ rather than
deleting, and add a one-line note at the top of each saying what superseded it.
```

Keep them. They cost nothing, and in three months you'll want to know why
something was written the way it was.

## Step 7 — Confirm and commit

```bash
wc -l CLAUDE.md
git diff --stat
git add -A && git commit -m "reconcile project docs with rules pipeline"
```

Read `CLAUDE.md` yourself top to bottom before committing. It's the one file
that shapes every session, so it's worth knowing exactly what's in it.
