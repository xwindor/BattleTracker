# The Matrix graph: making it readable, and making marks visible

## What's wrong today

Two separate problems are hiding behind one complaint.

**1. The graph is genuinely too small to read.** It is drawn on a fixed 800x460
canvas that then gets squashed to fit whatever space the right-hand half of the
Matrix panel happens to have. In practice that squash is about 55% — so the icon
names, which are already set at a tiny size, land on screen at roughly five
pixels tall. The mark indicators are smaller still, around four pixels. They are
technically being drawn. They are not, in any practical sense, visible.
Squinting at the screen mid-combat, "the graph doesn't display marks" and "the
graph draws marks at four pixels" are the same experience.

**2. Players do not have a Matrix graph.** This is the part worth knowing before
deciding anything. The graph only exists on your screen. Nothing about hosts,
icons or marks is currently sent to the players' browsers at all — the plumbing
for it was designed and typed up months ago but never connected. There is a
separate, simpler player-side Matrix panel that was built and also never
connected to anything. So "it's not very useful for the player POV" is accurate,
but the reason is not that the graph is bad; it's that there is no player Matrix
view of any kind yet.

There are also three smaller mark problems on your own screen that are worth
fixing while we're in there:

- A decker's own icon on the graph never shows marks, even when enemy IC has
  marked them. The information is recorded; the graph just doesn't look it up.
- When you're inside a host, the host itself appears only as a line of text at
  the top, so **the host's own marks are invisible on the graph** — and marks on
  the host are the ones that matter most, since three of them unlock the big
  actions.
- When a mark arrived by propagation (you marked a slaved device and the host
  got one automatically), the icon list shows a little link badge saying so. The
  graph shows nothing.

## What we'd build

I'm proposing this as **two separate pieces of work**, done in order.

**Piece one — make the GM's graph readable.** Stop squashing it. The graph would
be drawn at its true size rather than scaled down to fit, so text appears at the
size it was set at, and the text sizes get raised to something you can actually
read from a normal seating distance. The graph moves to its own full-width strip
underneath the hierarchy list instead of fighting it for half the panel. Nodes
get bigger, with room underneath for a readable line per decker showing that
decker's marks as filled and empty dots — the same dot shape the icon list
already uses, so the two agree at a glance. The host you're inside becomes a
real node on the graph with its own marks shown, with lines drawn from it to
everything inside it. Icons parented to one another out on the open grid get
lines too, so you can see the chain a mark will travel up.

That piece is self-contained, changes nothing about game state, and is useful
the day it ships.

**Piece two — give players a Matrix view.** This is the larger job: actually
sending the Matrix picture to players' browsers, deciding what gets sent and
what stays yours, and putting a view on their screen. It needs an answer from
you first (see the scope questions), and I'd rather it be its own feature than
get bolted onto a readability fix.

## What it looks like at the table

You're running a host infiltration. You open the Matrix panel. Underneath the
hierarchy list, a full-width panel shows the host you're in as a large node in
the middle, with lines out to the four icons inside it — a maglock, a camera, a
paydata file, and the patrol IC. Under the maglock, in text you can read without
leaning in: `TESS ●●○`. Under the host itself: `TESS ●○○ 🔗` — one mark, and the
link badge telling you it got there by propagation from the maglock, not from a
direct hack on the host. Tesseract's own persona sits at the top with `IC-1 ●○○`
under it, because the patrol IC marked her two actions ago.

You place a third mark on the maglock. The maglock's row becomes `TESS ●●●` and
the host's becomes `TESS ●●○`, both immediately, and you can see both without
moving your eyes off the graph.

## Not building — and why

- **A redesign of the Matrix module.** "Needs a lot of work" is true but
  unbounded. This fixes the two things you named. Everything else stays as it
  is.
- **Clicking nodes on the graph to place marks.** The hierarchy list already
  does that, with the propagation preview and the cap warnings. Duplicating it
  on the graph means two controls that can disagree. If you want the graph to
  become the primary control surface, that's a bigger, deliberate feature.
- **Anything that decides what a player has spotted.** You already set each icon
  to hidden, running silent, or normal. The app must not start working out for
  itself who can see what — that's your call at the table, and it's the kind of
  thing the app deliberately stays out of.
- **The lightning-bolt "direct connection" marker on the graph.** It's drawn for
  a field that nothing in the GM side ever sets, so it has never once appeared.
  I'm leaving it alone rather than half-wiring it; it belongs with the
  direct-connection workflow whenever that gets finished.
- **Automatic layout that untangles overlapping icons.** With a dozen icons the
  graph falls back to a grid, which is legible if unglamorous. A force-directed
  layout is a week of work and a lot of jitter mid-combat.

## Xavier's answers (2026-09-11)

- **A — own marks only.** A player sees only the marks they themselves hold.
  This needs no rules answer, so Increment 2 is unblocked when we get to it.
  To be recorded in `SCOPE.md` and `RULINGS.md` when Increment 2 ships.
- **B — no.** The graph shows all marks on an icon but says nothing about how
  any of them got there. The propagation link badge stays on the icon list only.
  (The 3 September ruling that propagation must be visible to the GM is already
  satisfied by that list badge, so this does not weaken it.)
- **C — yes.** Draw the lines; they are key to legibility.
- **D — grow and scroll.**
- **E — alongside.** Full-width strip under the hierarchy list. Separately,
  Xavier wants a conversation about player view vs GM view — that belongs with
  Increment 2 and does not block the GM-side work.

## Scope questions for you

Answering any of these may mean adding a line to `SCOPE.md` (the document that
defines what this app is and isn't) or to `RULINGS.md`. I'm flagging them rather
than deciding them. **All five are answered above.**

### A. When players do get a Matrix view, whose marks do they see?

This is the one that has to be answered before piece two can be built, and it is
not a UI question.

**Option 1 — a player sees only their own marks.** *For:* their own marks are
unambiguously theirs to know; showing them back is pure bookkeeping and creates
no information question at all. It's also what the existing player-side code was
written intending to do (the comment says so; the display was just never
finished). *Against:* a team with two deckers can't see each other's positions
without asking you.

**Option 2 — a player sees every mark on every icon they can see.** *For:*
fastest at the table; nobody has to ask you "how many marks do I have on that?"
*Against:* whether a decker can actually discover how many marks are on an icon
is a rules question about Matrix Perception, and I am not allowed to answer
rules questions from memory. If you want this, that part has to go through the
rules pipeline first with a page citation. It also hands players information
about NPC deckers and IC that you may prefer to control.

**Option 3 — you decide per icon, with a toggle.** *For:* maximum control.
*Against:* one more thing to remember to set mid-combat, on every icon.

**My recommendation: Option 1.** It ships without needing a rules answer,
matches what the code already intended, and Option 2 remains available later as
a deliberate expansion once the rule is checked. If you want Option 2, say so
and I'll route that half through the rules pipeline instead.

### B. Should the graph show that a mark arrived by propagation?

Your ruling of 3 September says propagation must be visible even though it can't
be reversed, and the icon list honours that with a link badge. The graph
doesn't.

**For:** the graph is where you're looking; a mark on a host that you didn't
place is exactly the thing you'd want flagged where you're already looking.
**Against:** it's another glyph on an already-busy node, and the information is
one glance away in the list.

**My recommendation: yes, on your screen only.** It is a direct extension of a
ruling you already made. It should not go to players under any of the options
above — a propagated mark on the host is a fact about your network topology, not
about the decker.

### C. Should the graph draw lines between icons?

Right now it's a ring of circles with no connections — arguably not a graph at
all.

**For:** the lines are the whole point; a mark travelling from a device up to
its host is a line you can trace, and you already record the parent/child and
host/contents relationships. **Against:** more drawing code, and inside a host
it's a plain star shape that tells you nothing you didn't already know from the
header.

**My recommendation: yes.** Draw host-to-contents lines inside a host and
parent-to-child lines out on the open grid. Both use relationships you've
already entered; nothing new gets tracked.

### D. Should the graph get taller as icons are added, or stay fixed and scroll?

With a big host — say a dozen icons — a readable graph needs real vertical
space.

**For growing:** nothing is ever hidden; you see the whole host at once.
**Against growing:** the Matrix panel can push the initiative order off the
bottom of your screen mid-combat, which is the thing you least want to lose.

**My recommendation: grow, but cap it.** Let it expand to about two-thirds of
your screen height and scroll beyond that, so a monster host never pushes
initiative out of view.

### E. Should the graph replace the hierarchy list, or sit alongside it?

Currently they share the panel half-and-half, which is why neither has enough
room.

**For alongside (full-width strip under the list):** the list is where you edit
and place marks; the graph is where you read. Both stay. **Against:** a taller
panel overall.

**My recommendation: alongside, full width, underneath.** The list keeps every
editing control it has; the graph stops being cramped. No controls move, so
nothing you've learned changes.
