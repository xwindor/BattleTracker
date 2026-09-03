# Matrix correctness pass — approval brief for Xavier

*Written 2026-09-03. Branch `feat/matrix-v3`. Nothing committed.*

## Plain summary

This was a rules-accuracy cleanup of the parked Matrix module — the part of the
tracker that isn't turned on yet. The old Matrix code, ported forward from an
earlier attempt, had wrong rules numbers baked into it (bad Overwatch pricing, a
phantom "alert at 20" tier, health bars on things the book says can't be damaged,
Patrol IC rolling the wrong number of dice). This pass found and fixed all of
them, restored nine table rulings you made in earlier sessions that were lost
when an old branch was abandoned, and made nine new calls about how marks and IC
should behave.

**Only one change is visible in the app you actually run today:** the GM's "Jack
Out" button used to reset a decker's Overwatch Score but silently leave their
marks in place. It now clears both, matching p. 242. Everything else lives in
Matrix screens nobody can currently reach from the tracker, so nothing else
changes at your table yet.

## Rules basis

| Behaviour | Printed page | Verified |
|---|---|---|
| Marks propagate device→host and device→device only | p. 233 (`p0235.txt:54-58`) | yes |
| Removing a mark never reverses upstream propagation | your call — no page | yes |
| Overwatch rises by the defender's hits, not a per-mark price | p. 232 | yes |
| Direct connection ignores noise/grid mods; grants no mark | pp. 232-233 | yes |
| No Overwatch alert tier at 20; the only threshold is 40 | p. 232 | yes |
| Hosts and files have no Matrix Condition Monitor | p. 229 | yes |
| Marks are placed on individual icons, not "on the host only" | pp. 233, 236, 239 | yes |
| IC rolls 4D6 initiative always — no 2-dice Patrol exception | p. 247 | yes |
| Matrix damage applies no penalty below a full monitor | p. 228 | yes |
| IC has a Matrix Condition Monitor only, no Stun track | p. 247 (silent on a second track) | yes |
| Jack Out zeroes Overwatch **and** erases marks | p. 242 | yes — the one live fix |
| IC Initiative base = Host Data Processing + Host Rating | **house rule**, your 08-28 ruling | yes |
| IC Matrix Condition Monitor = 8 + ceil(Host Rating / 2) | **house rule**, your 08-29 ruling | yes |

The last two fill genuine gaps in the printed book rather than citing a page.
That is flagged here rather than hidden.

## Table rulings still open

None. Every rules question the analyst raised was answered by your decisions on
09-01, 09-02 and 09-03, and all are recorded in `RULINGS.md`.

One place the book is genuinely unresolved and stays that way deliberately: two
tied IC with no Edge act **simultaneously** rather than falling to a coin toss.
That is already what the tracker's existing tie-break code does — confirmed by
the validator against `CombatManager.getNextActors()` — and needs no ruling.

## What you decided during this pass

Nine decisions. Three of them reversed or narrowed something you'd approved
earlier, and the reversals are **recorded in the briefs rather than deleted**, so
a future pass can't quietly undo them:

- **Decision 2** withdrew the earlier "keep the panel's dice roller" and "send
  its rolls to the shared log" approvals. The Matrix module now has no roller of
  its own; the battle tracker's is the only one.
- **Decision 8** narrowed mark propagation to devices only, after the first
  implementation let marking three paydata files hand a decker three marks on the
  host itself.
- **Decision 9** kept mark removal one-way — the upstream mark stays.

## What is NOT built

Be clear-eyed about this: the module is still unwired.

- Nine of the ten Matrix components have no consumer in the running app.
- `ICSpawnerComponent`'s outputs are never subscribed to, so **Decision 5's
  one-IC-per-turn enforcement is scaffolding** — correct and tested, but nothing
  can trigger it yet.
- `SharedMatrixTarget` / `currentHostMarks` have no producer, so the player
  view's host mark count always reads 0.
- Defender-side marks (IC marking *you*) aren't modelled at all.
- Reboot Device has no code path; only jack-out does.

## Backlog — known defects shipping with this

None blocking. From the final validator pass:

1. The **+Mark preview names only the nearest ancestor** while propagation walks
   the whole chain — nest a smartgun under a mount under a drone and the preview
   under-reports by one icon.
2. **Retyping a nested device to a File strands it** — it stays indented under
   its old parent with no way to un-nest it.
3. A **hand-edited IC initiative can never return to automatic** recomputation.
4. One confirmation uses the browser's native pop-up instead of the app's
   `ConfirmationDialogService`.
5. The propagation badge is an **unlabelled glyph** — meaning is tooltip-only.
6. Two latent traps for whoever wires IC in: `Participant.hardReset()` and the
   GM-rejoin path both write `baseIni` directly and would wrongly trip the new
   hand-edit flag.

## Sanity check, five minutes

Only the one live fix is clickable:

1. Start a combat, add a decker, jack them into VR, let Overwatch climb above 0.
2. Click **Jack Out** from the GM view.
3. Expect Overwatch to read 0 **and** the decker's marks to be gone — not the
   Overwatch number resetting while marks silently remain. That was the bug.

Nothing else in the Matrix screens is reachable yet. That's expected, not a gap.

## Test and build state

- **1239 tests passing**, up from a 1054 baseline at the start of the pass.
- Build clean.
- **`npm run lint` cannot run on this repo at all** — it aborts on a pre-existing
  parser configuration error before linting a single file. Unrelated to this
  work, but it means there is no lint signal on any of this code, old or new.
  Worth fixing separately.

## What approving means

Nothing is committed. The branch is `feat/matrix-v3`, working tree dirty.

Approving means the scenarios in
`src/scenarios/matrix-port-rules-correctness.spec.ts` become part of the
permanent regression suite, and the rulings across `RULINGS.md`'s 08-28, 08-29,
09-01, 09-02 and 09-03 Matrix entries become binding rather than pass-scoped.

Separately: `CLAUDE.md` says to work directly on `main` and not create branches
unless you ask. This branch predates this session — you should decide whether to
keep it, fold its diff into `main`, or something else.
