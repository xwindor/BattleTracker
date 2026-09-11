# Making the mark dots clickable — brief for Xavier

## What you asked for

Right now, each decker's marks on an icon (a device, a host, whatever) are
just dots drawn as text — ●●○ for two marks out of a possible three. To add
or remove a mark you use separate controls: a `+Mark` button that opens a
little picker, and a small `×` button that removes one.

You want the dots themselves to become the control: click a dot to add a
mark, right-click to remove one.

## What this can and can't actually do

This is the important catch, and it's not obvious from the request as
written. **The dots only exist on screen once a decker already has at least
one mark on that icon.** If a decker has zero marks, there are no dots at
all — just the `+Mark` button. So clicking a dot can only ever bump an
existing count up or down. It can never place someone's *first* mark. That
still has to go through `+Mark`, exactly as it does today.

If that's not what you pictured — if you imagined clicking dots to place a
mark on a decker who has none yet — say so, because that's a bigger, different
control (effectively: dots for every decker, always visible, not just the
ones already marked) and changes the plan below.

## The catch that makes this harder than it sounds

You already told us: clicking to add must show the amber "this will also
mark these other icons" highlight *before* it actually places the mark — the
same warning the `+Mark` picker gives today. That's the right call, and it
protects the rule you set back on 2026-09-03: a mark this app places on the
GM's behalf (by propagating it up to a host or a parented device) has to be
shown before it happens, because there's no undo.

But "click to add" and "show a warning first" pull in different directions.
A single click can't do both — if the click instantly adds the mark, there's
no moment where the warning was actually visible; if it waits for a second
click to confirm, that's not really "one click" anymore.

The way out: **use hovering the mouse over the dots (or, for keyboard users,
tabbing onto them) as the "arm" step, and the click itself as the commit.**
Since you're mouse-and-keyboard only, hovering (or focusing, for keyboard)
naturally happens a moment before the click lands — the amber highlight
appears the instant the pointer arrives, and by the time the click actually
registers, it's already been shown. No second click needed, and the warning
genuinely appeared first. This is the design recommended below.

## What's NOT being built — and why

- **A way to place a decker's first mark by clicking a dot.** There's no dot
  to click until a mark already exists (see above). Placing a first mark
  still goes through `+Mark`.
- **"Click dot #2 sets the count to 2" (a slider-style control).** Clicking
  dot 2 when the count is already 3 would, under that model, silently remove
  one mark with no separate confirmation — riskier at a table with no undo
  than a plain "click adds one" control. See "Scope questions" below —
  I'm recommending against this, but it's genuinely your call.
- **A touch/tablet gesture for removing a mark.** You said mouse and keyboard
  only, so right-click is fine as the removal gesture and no touch
  equivalent is being built.
- **Removing the existing `×` button.** It's staying. Right-click has no
  keyboard equivalent at all — a keyboard-only GM literally cannot
  right-click — so `×` (which can already be reached by Tab + Enter) is the
  only way a keyboard user removes a mark. Losing it would lock keyboard
  users out of removing marks entirely.
- **Any change to what propagation actually does**, or to the amber-highlight
  system itself — this reuses it, doesn't touch its rules.
- **Any `SCOPE.md` boundary change.** This stays inside what the app already
  tracks (marks). No new capability is being added to the product's job, just
  a faster way to operate one that already exists.

## Xavier's answers — 2026-09-10

All three questions below were put to Xavier on 2026-09-10 and answered.
Recorded here before implementation began; the spec's Open Decisions 1 and 2
are settled by these.

- **The increment-only scope is correct and intended.** Asked directly
  whether "the dots only exist for a decker who already holds at least one
  mark" was what he pictured, he confirmed: adjusting existing marks is the
  point. Placing a first mark still goes through `+Mark`. The alternative
  (a permanent ○○○ row for every active decker on every icon, making the
  dots a genuine third mark-*placement* path) was offered and declined.
- **Scope question 1 — click always adds exactly one**, regardless of which
  dot the pointer is over. The click-sets-count-to-N model is **not** built.
- **Scope question 2 — Option B.** While a `+Mark` picker is open,
  unconfirmed, anywhere else in the tree, the dot controls render as
  unavailable with a tooltip explaining why. An incidental mouse movement
  must never silently disarm a decision the GM has not made yet.
- **Scope questions 3 and 4** (host dots take the same ergonomics with no
  highlight; a capped decker's dots refuse the add and say why) were
  presented with recommendations and not contested — build as recommended.

The two questions below are kept as written, for the record of what was
asked and why.

## Scope questions for you

**1. Should clicking anywhere on the dots add exactly one mark, or should
clicking the Nth dot set the count to N?**

*For "click adds one, always":* matches how `×` already works (always
removes exactly one), is impossible to fat-finger into removing two marks by
accident, and is simpler to build and test.
*For "click sets the count":* faster if a GM regularly needs to jump from 1
mark to 3 in one motion — but a stray click on the wrong dot could silently
remove marks with no warning at all (the propagation warning only makes
sense for *adding*, not removing), which is a bigger risk in a no-undo app.

**My recommendation: click adds one mark, every time, regardless of which
dot is clicked.** Simpler, safer, and matches the existing `×` button's
behavior.

**2. What happens if you hover the dots on one icon while a `+Mark` picker
is still open, unconfirmed, on a different icon?**

Today, opening a second `+Mark` picker automatically closes the first one
(you approved that fix back on 2026-09-06, after finding the opposite
behavior left a picker open and armed with no warning showing anywhere).
If hovering a dot behaves the same way, then just moving your mouse across
the tree while you're mid-decision on an unrelated `+Mark` picker could
silently close it.

*Option A — hovering a dot competes for the highlight the same way opening a
picker does, and closes any other open picker.* Consistent with existing
behavior, but risks an accidental mouse movement quietly cancelling a
decision you hadn't made yet.
*Option B — while another `+Mark` picker is open anywhere else, dot-clicking
is temporarily disabled (cursor shows "not allowed", with a tooltip saying
why) until that picker is closed or confirmed.* Safer at the table — nothing
gets silently cancelled by a stray mouse movement — but means you sometimes
can't use the quick dot-click until you finish or cancel what you were doing
elsewhere.

**My recommendation: Option B.** A live game table with an open, armed
picker somewhere is exactly the situation where an accidental hover
shouldn't be allowed to quietly disarm it.

**3. Does clicking a host's own dots need the amber highlight too?**

A host is the top of the chain — marks on a host never propagate any
further up (there's nothing above it). So there's genuinely nothing to
preview or warn about when adding a mark directly to a host.

*Recommendation:* host dots get exactly the same click-to-add /
right-click-to-remove behavior, just with no highlight step, since there's
nothing to show.

**4. What happens if a GM clicks a dot to add a mark, but that decker is
already at the 3-mark cap?**

The rules cap marks at 3 (p. 236) and the app already enforces this hard —
the existing `+Mark` picker's confirm button is disabled outright when a
decker is capped, it doesn't just warn and let you do it anyway.

*Recommendation:* match that. Clicking a capped dot does nothing, and the
dots show the same dimmed/dashed look already used elsewhere in this screen
for "capped" icons, with a tooltip explaining why. Right-click removal keeps
working normally even when a decker is capped (removing is never blocked).

## What's affected, and what could break

- The two places marks are shown: the icon detail panel's mark row, and the
  host's own mark row. Both need the same treatment, or you end up with one
  working differently from the other — this app has already had that problem
  once (the host's `+Mark` button was built after the icon one, and quietly
  ended up missing pieces the icon one had).
- The amber highlight system (built recently, and still fairly new/fragile —
  it has a specific set of rules for when it appears and disappears). This
  reuses it rather than rebuilding it, but adds a new trigger (hovering a
  dot) that the highlight system didn't previously know about, which is the
  main source of risk.
- Nothing about session sync, the player-facing view, or anything a player
  sees changes. This is entirely a GM-side control on the GM's own screen.
- The `RULINGS.md` entry from 2026-09-03 currently describes the highlight as
  something "the `+Mark` control" does. Once a second control (the dots) can
  also trigger it, that wording should be widened to say so — a small wording
  fix, not a change to what the ruling actually says. This does **not**
  reopen or contradict your earlier decision to avoid amending that ruling's
  substance; it's naming a second control that now does the same thing.

## Size

This is bigger than "make the dots clickable" sounds. Between the
add/remove logic, the hover-based warning, keeping the icon and host rows in
sync with each other, and making sure it works properly for both mouse and
keyboard — it's realistically two to three days of work, similar in size to
the amber-highlight feature itself. It should not be split further; the
add/remove behavior and the warning-before-committing behavior can't ship
separately without breaking the no-surprises rule you set on 2026-09-03.
