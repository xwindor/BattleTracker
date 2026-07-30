# SR5 Tracker — Annotated Setup Walkthrough

Every step has a **What**, a **Why**, and a **Check**. The Why sections are the
point of this document. If you understand why each piece is there, you'll make
better calls later when something doesn't match these instructions exactly —
and something will.

---

# PART 0 — The mental model

Read this part before touching anything. Ten minutes here saves you an hour of
confusion later.

## What Claude Code actually is

It's a program that runs in your terminal, inside a folder. You `cd` into your
repo, type `claude`, and you get a prompt where you type in plain English. It
reads your files when it needs them and asks permission before changing
anything.

There is no "connect your repo" step. No upload, no linking, no config pointing
at your code. The folder you're standing in when you launch is the context. This
is worth internalising because it's the opposite of how the Claude website
works, where you upload files into a project. Here the filesystem *is* the
project.

## The one fact that explains the whole design

A **subagent** is a separate Claude instance with its own system prompt, its own
tool permissions, and — critically — **its own fresh context window.** When the
main session delegates to a subagent, that subagent starts cold. It does not
inherit your conversation. It sees only the prompt it was handed, plus whatever
files it chooses to read.

Almost every design decision below follows from that single fact:

- It's **why the pipeline works at all.** A validator that starts cold can
  genuinely disagree with an implementation, because it has no memory of the
  reasoning that produced it. If you asked one context to write code and then
  review it, you'd get a rubber stamp — it already believes its own reasoning.
  Separation is what makes criticism possible.
- It's **why we write things to files.** Anything a subagent needs must exist on
  disk or be in the prompt handed to it. Knowledge in your head, or three
  messages up in your conversation, is invisible to it.
- It's **why `ARCHITECTURE.md` matters so much for you specifically.** Your
  tracker is already built. A cold subagent that can't read how your code models
  initiative will invent its own model — producing code that's internally
  correct and wrong for your app. That's very likely the actual mechanism behind
  your "doesn't work in gameplay" problem.

## Why four agents instead of one good prompt

Because the two failure modes you described have different causes and need
different fixes.

*Doesn't match the rules* is a knowledge problem. The model has absorbed a lot
of Shadowrun from the internet, much of it 4th edition, house-ruled, or plain
wrong, and it can't tell which is which. Asking it to be careful doesn't help;
it isn't being careless, it's confidently misinformed. The fix is forcing every
rules claim to trace to a page it actually opened, and then having a *second*
agent independently confirm that page says what the first claimed. Agreement
between two cold reads of the book is a real signal. One agent's assertion isn't.

*Doesn't work in gameplay* is a specification problem. Unit tests get written
against what the developer imagined, and what a developer imagines is the happy
path. Nobody spontaneously tests "mage projects astrally mid-combat-turn while
the rigger jumps into a drone and two people tie on Initiative Score." So the
pipeline makes concrete gameplay scenarios a *required artifact, written before
the code*, and gives the validator a standing list of table situations it must
probe every single time.

Splitting these into separate agents also means each one has a narrow job and a
short prompt. One mega-prompt that says "be a rules expert and a developer and a
skeptic and a tech writer" produces an agent that's mediocre at all four, because
the instructions dilute each other.

## Why the human gate is where it is

You approve the *brief*, before any code exists. This feels backwards — you'd
rather look at working code. But a wrong brief produces a confident,
well-tested, thoroughly wrong implementation, and the validator partially
inherits the error because it's checking against the same brief. Catching it at
the brief stage costs two minutes. Catching it after implementation costs a full
round trip and sometimes a wrong feature that ships.

---

# PART 1 — Install and prepare the repo

## Step 1.1 — Install Claude Code

**What:**

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

That's the one for WSL, Linux, and macOS. On Windows PowerShell instead:

```powershell
irm https://claude.ai/install.ps1 | iex
```

**Why this installer:** it's the native build — no Node.js, no runtimes, nothing
else to install first. There's an npm package too, but if you install both you
get version conflicts, so pick one and this is the recommended one.

**Why you need a paid plan:** Claude Code requires Pro, Max, Team, Enterprise,
or a Console account with credits. Not available on free. If you're already
paying for Claude, it's the same login — nothing extra to buy.

**Check:**

```bash
claude --version
```

A version number means you're good. "Command not found" almost always means
your current shell doesn't know about it yet — close the terminal entirely, open
a fresh one, try again. The installer edits your PATH, and PATH changes only
apply to new shells.

## Step 1.2 — Get into your repo

**What:**

```bash
cd /path/to/your/tracker
ls
```

**Why the `ls`:** because everything downstream depends on being in the right
folder, and a typo in a path fails in confusing ways later rather than
immediately. You want to see your source files and your `package.json` (or
equivalent). If you see your Documents folder, you're in the wrong place.

## Step 1.3 — Commit everything first

**What:**

```bash
git status
```

If anything's uncommitted:

```bash
git add -A && git commit -m "checkpoint before pipeline setup"
```

**Why this isn't optional:** agents edit real files on disk. Not a copy, not a
sandbox — your actual code. A clean commit is your undo button, and it's the
difference between "that change was wrong, `git checkout .`" and "that change
was wrong, and I've lost an evening's work mixed in with it." You will at some
point want to throw away everything an agent did. Make that cheap now.

If `git status` says "not a git repository", stop and fix that first — `git
init`, add, commit. Running agents against an unversioned codebase is the one
genuinely risky thing in this whole setup.

**Check:** `git status` reports a clean working tree.

---

# PART 2 — Put the pipeline files in place

## Step 2.1 — Make the folders

**What:**

```bash
mkdir -p .claude/agents .claude/skills/feature tools briefs tests/scenarios
```

**Why each one:**

- `.claude/agents/` — Claude Code looks *specifically here* for subagent
  definitions. It's not a convention you could rename; it's where the program
  looks.
- `.claude/skills/feature/` — where the `/feature` command lives. (You may see
  older guides use `.claude/commands/`. That still works but it's the legacy
  format; skills are current and also let Claude invoke them on its own when
  relevant, not just when you type the slash command.)
- `tools/` — the extraction script. Ordinary folder, no magic.
- `briefs/` — where rules briefs get saved as files. **This one's quietly
  valuable:** six months from now `briefs/initiative-ties.md` is your record of
  *why* the code does what it does, with page citations. It's documentation you
  get for free as a side effect of the workflow.
- `tests/scenarios/` — the permanent regression suite. Explained in Part 6,
  where it earns its keep.

## Step 2.2 — Copy in the agent and skill files

**What:** put the four `sr5-*.md` files into `.claude/agents/`, the `SKILL.md`
into `.claude/skills/feature/`, and `build_rules_index.py` into `tools/`.

From WSL, if they're in Windows Downloads:

```bash
cp /mnt/c/Users/YOURNAME/Downloads/sr5-*.md .claude/agents/
```

**Why they're just markdown files:** a subagent is genuinely nothing more than a
markdown file with YAML frontmatter — a name, a description telling Claude when
to use it, a tool list, and a system prompt as the body. No code, no
registration. This is good news: when an agent behaves wrong, you fix it by
editing prose in a text file, and you can read exactly what it was told.

**Why the `tools:` line in each file matters:** the analyst and validator are
deliberately given read-only tools. They *cannot* edit your code even if they
decide they want to. That's not a suggestion in their prompt, it's enforced.
A validator that could quietly fix what it found would stop reporting, and
you'd lose the record of what was wrong.

**Check:**

```bash
ls .claude/agents/ && ls .claude/skills/feature/
```

Four files and one file respectively.

## Step 2.3 — Create RULINGS.md

**What:** at the repo root, a file `RULINGS.md`:

```
# Table rulings

Decisions where the rulebook is silent or ambiguous.
One per line, with date and reasoning.

(none yet)
```

**Why:** the SR5 rulebook doesn't cover everything, and your tracker has to do
*something* in the gaps. Without this file, every feature re-surfaces the same
open questions, you re-decide them from vague memory, and you drift — the Matrix
module resolves an edge case one way and astral resolves it another. That
inconsistency is invisible in code review and extremely visible at the table.

The agents are instructed to read this before flagging anything as undefined,
so a decision you make once stays made.

## Step 2.4 — Gitignore the rules folder

**What:**

```bash
echo "rules/" >> .gitignore
```

**Why:** in a moment you'll extract your rulebook into `rules/` as plain text.
That's the full text of a copyrighted book. Fine to keep on your own machine
since you own it; not fine to push to GitHub. Doing this *before* the folder
exists means you can't forget and accidentally commit it.

---

# PART 3 — Extract the rulebook

This part is what fixes the rules-accuracy problem. It's also the part with the
one step you genuinely must not skip.

## Step 3.1 — Understand the problem being solved

**Why any of this is necessary:** your rulebook is around 490 pages. That's far
more than fits in one conversation. Any system handling a document that size
retrieves small fragments of it rather than reading the whole thing — and those
fragments arrive as bare text with no indication of what page they came from.

So when an agent needs a page number, retrieval can't supply one. It falls back
on what it thinks it remembers about Shadowrun, and produces a plausible number
with total confidence. That is almost certainly what's been happening to you.

The fix is unglamorous and effective: bake the page numbers *into the text
itself*, as visible markers, so they physically travel with every fragment. An
agent grepping for a rule then finds `[PDF page 164 | printed page 162]` sitting
right there above the text it matched. It can't lose the number because the
number is part of the content.

## Step 3.2 — Run calibration

**What:** launch Claude Code:

```bash
claude
```

Then type:

```
Install pdfplumber, then run tools/build_rules_index.py against
/path/to/SR5_Core.pdf with the --calibrate flag. Tell me the offset it guessed
and don't run the full extraction yet.
```

**Why calibration exists:** PDFs of books include cover art, credits, and front
matter that the book's own page numbering doesn't count. So PDF page 100 might
be printed page 98. The gap is the *offset*. The script guesses it by reading
page footers, but it's a guess — footers get missed, and some books renumber
partway through.

## Step 3.3 — Verify the offset by hand. Do not skip this.

**What:** say the guess was 2. Open the PDF in any reader. Jump to PDF page 100
(your reader's own counter, the "100 / 492" number). Look at the number printed
on the page itself, usually a bottom corner. Subtract. Does PDF minus printed
equal 2?

Do it on **three pages spread across the book** — 100, 250, 400. All three must
give the same answer. If they disagree, the book renumbers somewhere and you
should tell Claude what you observed instead of pushing ahead.

**Why this is the highest-leverage five minutes in the entire setup:** a wrong
offset does not fail loudly. Nothing errors. Every citation just comes out
shifted by the same constant amount, forever, delivered with complete
confidence. You won't notice during setup, you won't notice during your first
few features, and then one day you'll look up a cited page and find the wrong
rule — and realise every citation you've trusted for months was wrong.

Worse: the validator can't catch it. It's reading the same mis-offset index, so
it independently "confirms" the same wrong page. This is the one error in the
system that defeats the double-check, which is exactly why it needs a human eye
once.

## Step 3.4 — Run the real extraction

**What:**

```
The offset is N — I verified it against three pages by hand. Run the full
extraction with --offset N.
```

**Why one file per page:** the agents find rules by grepping. Grep across 490
small files is fast and each hit is unambiguous about its page. One giant file
would make every match require figuring out which page it fell on, which is
exactly the failure we're eliminating.

**Check:**

```bash
ls rules/pages/ | wc -l
head -3 rules/pages/p0100.txt
```

The count should roughly match your PDF's page count. The `head` should show a
`[PDF page 100 | printed page N]` marker followed by readable prose. If the
text is garbled or empty, the PDF's fonts don't extract cleanly — say so and
we'll take a different approach.

---

# PART 4 — The architecture bootstrap

**For your situation this is the most important part of the setup.** More
important than the rules index. Here's why.

## Step 4.1 — Why this exists

Your tracker is already substantially built. It has opinions baked into it: how
initiative order is stored, what resets at an Initiative Pass boundary, whether
the Matrix module keeps its own order list or shares the core one, whether
there's undo and how.

A subagent starts cold. It knows none of that. So it reads a few files, forms a
guess, and writes code against its guess. Sometimes the guess is right.
Sometimes it invents a second parallel way to do something you already do — and
the result is code that passes its own tests, looks clean in review, and behaves
wrong at the table because it's bolted to a model of your app that doesn't
exist.

That is a much better explanation for "the agent's features don't work in
gameplay" than any rules misunderstanding. Rules errors produce *wrong
mechanics*. Architecture mismatches produce *right mechanics that don't fit*,
which is harder to spot and more annoying to live with.

Writing your architecture down once converts that guesswork into a lookup.

## Step 4.2 — Generate ARCHITECTURE.md

**What:** run prompt 1 from `BOOTSTRAP.md`.

**Why it asks for "known rough edges" and honesty about inconsistency:** if the
document describes an idealised version of your codebase, agents will write code
for the idealised version and it won't fit the real one. A document that says
"initiative resets are handled two different ways depending on module, and this
is inconsistent" is far more useful than one that says "initiative resets are
handled consistently." Accuracy beats tidiness here.

## Step 4.3 — Read it and correct it

**Why this step is yours and can't be delegated:** the document was written by
reading your code, which means it's an inference. You *know* things about your
tracker that aren't visible in the code — why something is the way it is, which
bit is a temporary hack, what you were mid-way through changing. Every error you
leave in this file propagates into every feature you build afterwards.

Ten minutes reading it is the single best-value ten minutes available to you.

## Step 4.4 — Generate CLAUDE.md

**What:** run prompt 2 from `BOOTSTRAP.md`.

**Why it's separate from ARCHITECTURE.md, and short:** `CLAUDE.md` is loaded
automatically into *every* session, so everything in it costs context on every
single interaction. It should be a short index — what this project is, the test
command, and pointers telling agents to go read `ARCHITECTURE.md` and
`RULINGS.md` when relevant. The detail lives in those files and gets loaded only
when needed.

**Check:** `CLAUDE.md` is under about 60 lines and contains no information that
duplicates `ARCHITECTURE.md`.

---

# PART 5 — Verify the wiring

## Step 5.1 — Restart, then look

**What:**

```
/exit
```

```bash
claude
```

Then at the prompt:

```
/agents
```

**Why the restart:** agent files are read once, at session start. Anything you
added while a session was running is invisible to it. This catches everyone
exactly once, and the symptom — "my agents don't exist" — looks like a much
worse problem than it is.

**Check:** four `sr5-` agents listed. Type `/` and confirm `feature` appears in
the command list too.

## Step 5.2 — Test the rules index before trusting it

**What:**

```
Test only — no feature work. Use the sr5-rules-analyst subagent to find the
rules on Delaying an Action in combat. Report the printed page it found them
under and paraphrase the rule.
```

**Why test this in isolation first:** if retrieval is broken, every stage
downstream produces confident garbage and you'll spend an hour debugging the
pipeline when the problem is one folder. Isolate the foundation before you build
on it.

**Check:** it names a printed page — then **look that page up in your physical
book.** Does the paraphrase match? If the page is wrong but consistently wrong,
your offset is off; redo Part 3.3. If it can't find anything, `rules/` is empty
or in the wrong place.

## Step 5.3 — Commit

```bash
git add -A && git commit -m "add SR5 rules pipeline"
```

**Why now:** you've reached a known-good state. Everything after this is
feature work, and you want a marker to return to.

---

# PART 6 — Your first feature, with commentary

Pick something small and genuinely rules-defined. **Initiative ties** is a good
first one: small enough to read in full, real enough to exercise every stage.

**Why start small:** you're not testing the feature, you're testing the
pipeline. A big feature makes it hard to tell whether a bad result came from the
pipeline or the complexity.

## Step 6.1 — Fire it off

```
/feature when two participants have the same Initiative Score, resolve the order correctly
```

## Step 6.2 — Stage 1 produces a brief, then stops

**Why it stops:** this is the gate, and it's deliberate. You're approving a
specification, not code.

**What to actually check, in priority order:**

1. **Look up two page numbers in the physical book.** Not "do they look
   plausible" — open the book. This is the check that catches the failure mode
   you came here to fix, and it takes ninety seconds.
2. **Does the page say what the brief claims?** Approximately-right is wrong
   here. A rule that's 90% right produces a mechanic that's subtly broken in
   exactly the way that's hardest to debug at a table.
3. **Answer the open rulings questions.** These are the things the book doesn't
   settle. They're yours to decide, and the agent is correctly refusing to
   decide them for you. Answer them in the chat.
4. **Are the scenarios real?** If they read like generic filler, say so:
   "scenarios 3 and 5 are too vague — rewrite as specific event sequences with
   named mechanics." Vague scenarios produce vague tests, which produce the
   gameplay bugs you're trying to eliminate.

Push back freely. Iteration here is nearly free.

## Step 6.3 — Approve, and let stages 2 through 4 run

Say "approved."

**What happens and why it's ordered this way:**

- The implementer reads `ARCHITECTURE.md` first, then works *only* from the
  brief. It's explicitly told not to consult `rules/` — because if it could,
  it'd start reinterpreting the spec mid-implementation, and you'd lose the
  clean separation between "what the rules say" and "what the code does."
  Instead, if the brief has a gap, it stops and reports it. A reported gap is a
  good outcome; a silently filled one is how wrong behaviour gets in.
- The validator runs as a fresh subagent, so it has no memory of the
  implementation reasoning. It re-derives every citation from `rules/`
  independently rather than trusting the brief — which is the only place an
  analyst error gets caught. Then it playtests against a standing list of table
  situations: ties, mid-turn participant changes, one character in two
  initiative tracks at once, astral and wireless boundary crossings mid-turn,
  pass and turn boundary resets, undo, and whether a GM can do it in three taps.
- **A validator that finds nothing on your first few features is suspicious,
  not reassuring.** It means either it's not really running as a separate
  subagent, or the standing probes aren't being executed. Check before you
  celebrate.
- It'll loop back to fix defects, twice at most. **Why the cap:** if two rounds
  of fixes don't get there, the problem isn't the code — it's the brief.
  Continuing to patch against a wrong spec produces increasingly tangled code
  that's still wrong. Go back to the brief.

## Step 6.4 — Read the approval brief, then actually tap through it

**Why the tap-through matters despite all the automated testing:** the tests
verify the rules logic. They can't tell you the button is in a stupid place, or
that mid-combat the state is ambiguous at a glance, or that undoing takes four
taps. You use this thing live at a table with players waiting. Ninety seconds in
the actual app catches a category of problem no test will.

## Step 6.5 — Approve, and let it close the loop

**Why this final step matters more than everything before it:** promoting the
scenarios into `tests/scenarios/` is the only part of this pipeline that
addresses *regression*, and regression is what your recurring-hiccups problem
actually is.

Everything up to here fixes one feature well. This makes the fix permanent.
Twelve features from now, a change to the Matrix module that quietly breaks
astral initiative fails a test written months ago, before you've shipped it to a
session. The four agents are, in a real sense, just machinery for generating
that test suite — the suite is the durable asset.

The rulings get appended to `RULINGS.md` at the same time, for the same reason:
so the decision stays made.

```bash
git add -A && git commit -m "initiative ties: rules-verified per brief"
```

---

# PART 7 — Steady state, and the audit

Per feature: `/feature <request>` → read the brief and answer the rulings →
approved → read the approval brief and tap through it → approved → commit.
Fifteen to twenty minutes for something small, most of it you reading two
documents.

## The audit — do this once the loop feels normal

**What:** prompt 3 in `BOOTSTRAP.md`. Point the validator at your existing
Matrix module in audit-only mode, then astral.

**Why wait rather than doing it first:** you want to be able to tell a real
defect from a pipeline problem. Once you've run three or four features and
trust the machinery, a defect report means something.

**Why it's worth doing at all:** these modules were built before any of this
existed, by exactly the process that produced your hiccups. Auditing is
read-only and costs nothing but your reading time. Then fix what it finds
through the normal `/feature` flow, one at a time — so each fix arrives with a
regression test attached and stays fixed.

---

# PART 8 — Troubleshooting, with causes

| Symptom | What's actually wrong |
|---|---|
| Citations consistently off by a fixed amount | Offset is wrong. The validator can't catch this since it reads the same index. Redo Part 3.3, re-extract. |
| Agent states rules with no page cite | It isn't reaching `rules/`. Check the folder exists, isn't empty, and you're in the right directory. |
| `/agents` or `/feature` missing | Files added while a session was running. Restart `claude`. |
| Validator always passes | Either it's being answered inline instead of delegated to a subagent, or its standing probe list isn't running. Ask it to list which probes it executed. |
| Code is technically correct but wrong for your app | `ARCHITECTURE.md` is missing, thin, or gone stale since you wrote it. |
| Same rule answered differently on different days | Retrieval surfaced different fragments. Always demand the page marker, always verify. |
| Implementer keeps guessing at conventions | It's not reading `ARCHITECTURE.md`. Make sure `CLAUDE.md` points at it explicitly. |
| Third fix round still failing | Stop. The brief is wrong. Restart from Stage 1. |

---

# PART 9 — If you're going to cut corners

Some of this you can be lazy about. Some you can't. In descending order of how
much it costs you to skip:

1. **Verifying the page offset by hand.** Skip this and every citation the
   system ever produces is silently wrong. Nothing else on this list is as bad,
   because nothing else fails this quietly.
2. **`ARCHITECTURE.md` being accurate, and staying accurate.** This is your
   biggest lever given the tracker's already built. Update it when the
   architecture shifts.
3. **Reading the brief at the gate.** The only mandatory human step. Two minutes
   that determine whether the next twenty were worth anything.
4. **Promoting scenarios to `tests/scenarios/`.** Skipping it means every
   feature is a fresh fight instead of a compounding asset.
5. Everything else is convenience.

And one thing that isn't a corner to cut but a rule to hold: `rules/` stays
local and gitignored. Agents cite page numbers and paraphrase — they should
never paste rulebook prose into your source or your docs.

---

# Order of operations, condensed

1. Install, `cd` in, commit clean (Part 1)
2. Folders, agent files, `RULINGS.md`, gitignore (Part 2)
3. Calibrate, **verify offset by hand**, extract (Part 3)
4. `ARCHITECTURE.md`, read and correct it, `CLAUDE.md` (Part 4)
5. Restart, `/agents`, test retrieval against the physical book, commit (Part 5)
6. One small feature end to end — initiative ties (Part 6)
7. Two or three more features, then audit Matrix and astral (Part 7)

Expect the first run to feel clumsy and slow. The third won't.
