> **Superseded 2026-09-05** by `briefs/mark-propagation-highlight-spec.md`,
> which replaces the text preview described here with a visual highlight on
> the hierarchy tree. Kept on disk as history only — do not build the
> text-preview design from this file.

# The "+Mark" warning doesn't tell you everything it's about to do

Plain-language brief for Xavier. Companion technical spec:
`briefs/mark-propagation-preview-spec.md`.

## The short version

When you place a mark on a device, the tracker also places marks further up the
chain that device hangs off — that's the rule you already approved (a mark on a
slaved device also marks its master, p. 233), and on 2026-09-03 you ruled that
the +Mark button has to *say* what it's about to also do before you commit.

It says it. It just doesn't say all of it. Two ways it under-reports, and one
way it over-promises.

## What's wrong today, at the table

**1. It names one icon out of however many there are.**

Set up a smartgun parented to a weapon mount, parented to a drone, all three
sitting out on the open grid. Click **+Mark** on the smartgun. The warning says:

> Also marks: Weapon Mount

You commit. Three icons get marked — smartgun, weapon mount, *and* the drone.
Nobody told you about the drone. If you were counting marks on that drone to
decide whether the decker could reboot it, you were counting from a number the
app quietly changed behind you.

**2. It promises marks that won't land.**

Every icon holds a maximum of three marks per decker. If the weapon mount is
already sitting at three for that decker, the warning still says "Also marks:
Weapon Mount" — but nothing is added there. The mark you were told about does
not exist. (The drone above it still gets one, though; a full ancestor doesn't
stop the chain, it just doesn't take anything itself. That distinction matters,
and is why the fix has to be able to say "this one's full, that one isn't"
rather than just cutting the list short.)

**3. It can promise a mark when literally nothing will happen.**

Reachable in about four taps: mark a decker up to three on a device, then open
+Mark again on that same device while a second decker exists. The picker won't
re-offer the first decker, the dropdown goes blank, the confirm button is
correctly disabled and says why — but the "Also marks: …" line still sits there
promising a propagation that cannot occur, because nothing is being placed at
all.

There's a matching sloppiness on the **×** (remove) button. Its tooltip reuses
the very same sentence to warn you that removing this mark won't remove the one
upstream — so it inherits every one of the problems above, and it reads
awkwardly too, splicing a forward-looking "Also marks: Weapon Mount" into a
past-tense sentence about a mark that already happened.

The host panel already got this right. When you type a mark count into the
Brute Force / Hack on the Fly flow, its Apply button says things like *"Only 1
of 2 will land (3-mark cap)"*. The +Mark control on an icon should be honest in
the same way.

## What I propose to change

Nothing about what actually happens when you commit. The same marks land in the
same places. This is entirely about what the app tells you beforehand.

- The +Mark warning walks the **whole** chain, the same way the code that
  actually places the marks does, and reports every icon it will reach.
- It says, per icon, whether that icon will actually take the mark or is
  already full at three — because "full" and "chain stops here" are different
  things and the warning must not blur them.
- It reads the cap for **the decker currently picked in the dropdown**, and
  updates when you change the dropdown. (The cap is per-decker, so it can't
  answer the question without knowing who.)
- It disappears entirely when nothing at all will be placed.
- The **×** tooltip gets its own sentence, listing the icons this mark
  propagated to by name, without cap wording — what those icons hold *now* says
  nothing about what happened *then*, so quoting a cap there would mislead.
- Underneath, the warning and the code that actually places the marks are
  driven by one shared walk, so they can't drift apart again. That drift is
  exactly how we got here: the walk learned to chain and the warning didn't.

## Not building — and why

- **Nothing changes about propagation itself.** Same icons, same marks, same
  caps, same one-way direction. Purely a wording change.
- **Removing a mark still doesn't remove the one upstream.** You settled that
  on 2026-09-03 and I'm not reopening it.
- **The app still won't refuse a mark because an ancestor is full.** A full
  ancestor is reported, never blocked. The warning is a warning.
- **No record of which specific mark came from where.** The existing link badge
  ("at least one of these arrived by propagation") stays exactly as it is.
- **Players see nothing new.** The preview is a GM-side control; the player
  view doesn't carry it and won't.
- **The host's own +Mark button (on the host row in the hierarchy panel) is not
  being touched.** A host is the top of the chain — it never propagates
  anywhere — so it has nothing to preview. It does have two unrelated small
  gaps (no "why is this disabled" message, and it will offer an unnamed
  participant as a decker, which the icon-level control learned to filter out).
  Both are real, neither belongs in this change. See scope question 5.
- **No dice, no rolls, no deciding anything.** As ever.

## Scope questions for you

Answering some of these may mean adding a sentence to `SCOPE.md` — specifically
to the bullet that authorises mark propagation, which currently says the app may
*place* the propagated marks but says nothing about it having to *announce* them
first. If you want that promise to be permanent rather than living only in the
2026-09-03 ruling, say so and I'll have `SCOPE.md` updated as part of the work.

---

### 1. Should the warning name every icon in the chain, or name the nearest one and count the rest?

This is your question from the request, and I'm deliberately not answering it.
Both are defensible. Using your own smartgun / weapon mount / drone example,
here is the literal text you'd see on screen:

**Option A — name every icon.**

> Also marks: Weapon Mount, MCT Roto-Drone

And when the mount is already full:

> Also marks: Weapon Mount (at 3, none added), MCT Roto-Drone

*For:* it is the complete truth, with no hovering, no guessing, and no second
step. You can read off exactly which icons' numbers are about to move, which is
the whole point of the ruling. It also makes the "full ancestor" case
legible — you can see that the mount takes nothing and the drone still does.

*Against:* it grows without limit. The hierarchy panel sits in a half-width
column in small monospace text; four or five nested devices with real Shadowrun
names ("Ares Alpha", "Smartgun System", "MCT-Nissan Roto-Drone") will wrap onto
two or three lines and shove the confirm and cancel buttons down the screen,
mid-combat, while everyone waits.

**Option B — name the nearest, count the rest.**

> Also marks: Weapon Mount, +1 more above it

And when the mount is already full:

> Also marks: Weapon Mount (at 3, none added), +1 more above it

The full list is still available by hovering the line.

*For:* fixed, short, predictable width no matter how deep the nesting goes. It
never breaks the layout and it never makes you read a sentence to find one name.
It also answers the actual question the ruling was worried about — "is this
doing something I didn't ask for?" — with "yes, one more thing", in five
characters.

*Against:* you still have to hover, or commit and go look, to find out *which*
icon. If the answer to "which" is the drone your players are currently trying to
hijack, a "+1 more" that you skim past is barely better than today. And the cap
wording gets vague fast: "+2 more above it (1 already at 3)" is the sort of
sentence people stop reading.

**My read, offered but not chosen for you:** Option A is more faithful to the
ruling's intent and chains deeper than three are rare in play; Option B is safer
for the layout. If you pick A and the wrapping annoys you at the table,
switching to B later is a small change. If you'd rather I pick, I'd pick A.

*(A third possibility — leave it naming only the nearest with no count at all,
i.e. today's text — I've deliberately not offered, because that is the exact
behaviour the request identifies as under-reporting and would leave the
2026-09-03 ruling unmet. Say the word if you want it anyway.)*

---

### 2. Should the warning mention the 3-mark cap at all?

*Recommended: yes.*

*For:* the app already knows the answer, it costs one parenthetical, and it
stops the control promising something that provably won't happen. The host panel
already does exactly this and it reads well there. Without it, the warning is
accurate about *which* icons and wrong about *what happens* to them — arguably a
worse lie than naming only one of them, because it looks precise.

*Against:* it makes the line longer and busier at the exact moment you're in a
hurry, and it's information you could get by glancing at the mark dots on the
icon itself. There's also a purist argument that "is this icon full" is the GM's
business to know, not the app's to volunteer.

---

### 3. Should the × (remove) tooltip name the whole chain too, or stay vague?

*Recommended: name the whole chain, without cap wording.*

*For:* it's the same honesty problem. "Any mark this propagated upstream stays"
is only useful if you know where upstream *is*. Naming the icons tells you
exactly where to go and fix it by hand, which is the correction path you already
ruled is the only one.

*Against:* by the time you're removing a mark, the chain may have changed —
icons re-parented, deleted, marked from other sources. The names it lists are
where a mark *would* propagate today, not a record of where this particular mark
actually went. That's an honest limitation, not a bug (the app keeps no
per-source ledger, by your 2026-09-03 ruling), but it does mean the tooltip is a
good guess rather than history.

Deliberately excluded either way: cap wording in this tooltip. What an icon
holds now says nothing about what it held when the mark propagated.

---

### 4. Should the warning vanish when nothing at all is going to be placed?

*Recommended: yes — hide it.*

*For:* it's currently a straightforward lie (problem 3 above). The confirm
button is already disabled and already tells you why in red text right next to
it; a second, contradicting line beside it just adds noise.

*Against:* a line that appears and disappears is one more thing moving on
screen, and someone might read its absence as "no propagation configured" when
the real reason is "this decker is full here."

---

### 5. Do you also want the host's own +Mark button brought in line?

*Recommended: no — separate ticket, and low priority.*

The host row's +Mark control (in the hierarchy panel, next to "Host Marks") is a
third control with the same shape as the two this change touches, and it's the
weakest of the three: no explanation when it's disabled, and it will offer a
participant with a blank name as a decker — a bug the icon-level control was
specifically fixed for on 2026-09-03.

*For including it:* it's the same defect family, it's small, and leaving one of
three controls behaving differently is how this kind of inconsistency breeds.

*Against including it:* it has nothing to do with propagation previews — a host
never propagates upward, so there is genuinely nothing to preview there — and
folding an unrelated fix into this change makes both harder to review. It
deserves its own one-line request.

## What might break

Low risk. The change is confined to one card component plus one read-only helper
on the Matrix state service.

- **Automated tests check the current wording word-for-word.** Seven tests touch
  the preview string; two of them will definitely need rewriting, and more
  depending on which option you pick in question 1. That's expected and planned
  for — it does mean nobody can quietly ship a wording change without the tests
  noticing, which is the point of them.
- **A gap in those tests is worth knowing about:** there is currently *no* test
  anywhere that previews a chain more than one hop deep. That is why this
  shipped. New tests for exactly your smartgun/mount/drone case are part of the
  work.
- **The remove tooltip** is the second place the same sentence is used, with
  different grammar needs. It's being split off deliberately; the risk is
  someone reunifying them later and reintroducing the awkward phrasing.
- **The actual propagation behaviour** is not being changed, and around twenty
  existing tests cover it. If any of those go red, something went wrong that
  shouldn't have.
- **Layout**, per scope question 1 — the only real table-facing risk.

## How big is this

Small. Under a day. It does not need splitting.

---

## Xavier's answers — 2026-09-04

These are decided. The implementer builds to them.

1. **Name every icon in the chain (Option A).** The preview lists every icon
   the mark will reach, with a per-icon note when one is already full.
   - `Also marks: Weapon Mount, MCT Roto-Drone`
   - `Also marks: Weapon Mount (at 3, none added), MCT Roto-Drone`
   - `Also marks nothing — Weapon Mount, MCT Roto-Drone already at 3`
   - `Also marks: Host Ares-7`
2. **Yes — show the 3-mark cap in the preview.** Inline picker line only; not
   in the × tooltip.
3. **Yes — the × tooltip names the whole chain**, without cap wording.
4. **Yes — hide the preview entirely when nothing will be placed.**
5. **No — the host's own +Mark control is not touched.** Its two gaps (no
   blocked-reason message, offers unnamed participants) stay open as a separate
   request. Declined by omission, not forgotten.
6. **Yes — add the "announce before committing" clause to `SCOPE.md`.** Done in
   Stage 5, with the date, the way table rulings go to `RULINGS.md`.
7. **Host wording unifies** to `Also marks: Host <name>` (spec Open Decision 5).
   Settled implicitly: the wording Xavier approved in answer 1 is the unified
   form. The legacy `Also marks Host: <name>` is retired, and the illustrative
   quotation of it in `RULINGS.md` is updated in the same commit so the ruling
   and the code do not disagree.

---

## Revision — 2026-09-05, after Xavier ran it at the table

Xavier tested the delivered change and reported the preview was too much text
for the space, and that the same row is too cramped generally. Scope question 1
is **reversed**: the change now ships **Option B**.

1. **Option B — nearest icon plus a count.** Replaces Option A. Fixed, short,
   predictable width regardless of nesting depth.
   - `Also marks: Weapon Mount, +1 more above it`
   - `Also marks: Weapon Mount (at 3, none added), +1 more above it`
   - `Also marks: Weapon Mount, +2 more above it (1 already at 3)`
   - `Also marks nothing — everything above is already at 3`
   - `Also marks: Host Ares-7` (single destination — unchanged)
2. **The hover fallback becomes load-bearing.** Under Option A the `[title]`
   duplicated the inline text and `propagationPreviewFull` was a harmless
   pass-through. Under Option B it is the *only* way to see the icons hidden
   behind "+N more", so it must render the full Option A-style list. The
   round-2 review flagged the pass-through as a latent trap for exactly this
   switch; the switch springs it.
3. **Everything else stands.** Cap wording, the chain-naming × tooltip,
   suppression when nothing will be placed, the shared walk, and the unified
   `Also marks: Host <name>` grammar are all unchanged and already approved.

Xavier also raised two new requests, deliberately NOT folded into this change
and to be run through `/change` separately once this lands:

- **Mark counter as a control** — click the counter to add a mark, right-click
  to remove one, instead of going through the picker. Open question flagged at
  the time: mark removal has no undo, so a stray right-click silently costs a
  mark; whether that needs a confirm or a visible "undo last" is undecided.
- **Move the parent dropdown into the edit view** — it is set once at creation,
  rarely changed afterwards, and is consuming width in the row that is too
  tight. May relieve the space pressure on its own.

Possible stale build, unresolved: the string Xavier saw
(`Also marks: Weapon Mount`, no ellipsis) is character-for-character the
retired pre-change format, and his local `dist/` holds a pre-change compiled
copy. It is possible Option A was never actually on screen. The Option B
decision was taken on the space constraint itself, which he confirmed
independently from step 8 of the tap-through, so it stands either way.

---

## Revision 2 — 2026-09-05, visual highlight replaces the text

Measurement killed the wording approach. The reviewer measured Option B in a
real browser: for Xavier's own two-icon case it is **wider** than Option A
(282px vs 269px), and it only saves width from three destinations upward. The
real cause of the cramped row was never the sentence — the hierarchy tree's
indent **compounds** (each level indents relative to an already-indented
parent), eating 215px by depth 4, at which point every possible wording
truncates including the shortest, `Also marks: Host Ares-7`. No wording choice
fixes that.

Xavier's redesign: **highlight the destination icons in the hierarchy tree**
instead of describing them in text.

### Decided

1. **The text line is removed entirely.** The highlight carries the whole
   warning. Zero width cost, so truncation, the hover fallback and the
   compounding indent all stop mattering.
2. **Highlight colour is amber, not red.** Red is already load-bearing in this
   panel — `#cc4444` remove/delete, `#ff8a8a` blocked, `#ff6b6b` error/IC — and
   placing a mark is neither destructive nor an error. Amber `#ffb340` is
   already the propagation colour in both the target card and the hierarchy
   editor, so it already means "this is about propagation" to the eye.
3. **A capped destination renders outlined/dimmed amber**, not solid and not
   plain. Same colour family so it still reads as part of the chain, visibly
   not receiving anything. Leaving it unhighlighted would read as "the chain
   stops here", which is the opposite of true and is the exact distinction the
   cap work exists to make.

### Open, to be solved by design rather than by text

- **Off-screen and collapsed ancestors.** With no text, a highlighted icon that
  is scrolled out of view or inside a collapsed branch communicates nothing,
  and the GM commits believing fewer icons are affected than really are. Deep
  chains are both the likeliest case and the worst case. Candidate mitigation:
  auto-expand collapsed ancestors and/or scroll the highest affected icon into
  view while the picker is open. To be scoped.

### Consequence for the ruling

`RULINGS.md` 2026-09-03 says the `+Mark` control must *say* what it will also do
before the GM commits. Whether a highlight satisfies "say" is Xavier's reading,
flagged and not decided here. If it does, the ruling should be updated to say so
explicitly, or a future reader will reintroduce a sentence to satisfy it.
