# Host +Mark control parity — spec

## Request

Bring `HierarchyEditorComponent`'s host +Mark control's decker-filtering and
disabled/blocked-reason messaging up to parity with
`TargetCardComponent`'s, fixing exactly the two gaps both already
documented and explicitly deferred in `briefs/mark-propagation-preview-spec.md`
(SCOPE QUESTION, ~line 453-469) and `briefs/mark-propagation-highlight-spec.md`
(`:383`, `:606-611`).

**Not in scope:** no propagation preview/highlight behaviour on the host
control (a host has no upstream destination — nothing to preview); no
changes to the mark-*counter* control or the parent-dropdown row (both
unrelated, separately queued changes per `mark-propagation-highlight-spec.md:150-151,825,875`);
no changes to `TargetCardComponent` itself, `MatrixStateService`, or
`AccessHostPanelComponent` (a third place that writes host marks via
`addMarkToHost()`, but through its own `confirmAccess()`/`applyLabel` flow,
which already states its own blocked-reason equivalent and is not part of
this request).

This request does not touch anything `SCOPE.md` currently excludes — it is
pure UI-defect parity work inside an already-in-scope feature (marks,
`SCOPE.md:30-47`).

## Current behaviour

### The two controls being compared

**Reference (already correct), `TargetCardComponent`:**

- `availableDeckers` getter (`target-card.component.ts:284-288`): filters
  `activeDeckers` to those with a non-blank, trimmed `name`, then to those
  whose mark count on `this.target` is below `MARK_CAP` (imported from
  `app/services/matrix-state.service.ts:15`, value `3`).
- `addMarkBlockedReason` getter (`target-card.component.ts:295-301`):
  returns `"Pick a decker first"` if `!this.selectedDeckerId`; returns
  `` `${selectedDeckerId} already holds the maximum ${MARK_CAP} marks on
  this icon (p. 236)` `` if the selected decker is at/over cap; else `null`.
- `canConfirmAddMark` getter (`:303-305`): `addMarkBlockedReason === null`.
- `dots()` (`:307-309`) uses `MARK_CAP`, not a literal.
- Template (`target-card.component.html:60-82`): the whole `+Mark` group
  (button, or open picker) is gated on `availableDeckers.length > 0`
  (`:60`). Once open, the confirm button carries
  `[disabled]="!canConfirmAddMark"` and `[title]="addMarkBlockedReason ??
  'Place 1 mark'"` (`:72-75`), and a visible `<span
  class="tc-add-mark-blocked">{{ addMarkBlockedReason }}</span>` renders
  whenever `addMarkBlockedReason` is non-null (`:77-79`).

**Target of this change, `HierarchyEditorComponent`:**

- `hostAvailableDeckers(host)` (`hierarchy-editor.component.ts:727-728`):
  ```ts
  hostAvailableDeckers(host: MatrixHost): MatrixParticipant[] {
    return this.activeDeckers.filter(d => (host.marks[d.name] ?? 0) < 3);
  }
  ```
  No name-blank filter. Hardcodes `3` instead of importing `MARK_CAP`.
- `dots()` (`:731-733`) also hardcodes `3 - count`.
- `confirmHostAddMark(host)` (`:761-767`) also hardcodes `>= 3` on line
  764.
- `openHostAddMark(host)` (`:749-759`): auto-selects
  `hostAvailableDeckers(host)[0].name` if nothing is selected and the list
  is non-empty (`:756-757`) — the one call site besides the template that
  reads `hostAvailableDeckers()`.
- No `hostAddMarkBlockedReason`/`canConfirmHostAddMark` equivalent exists
  anywhere in the class.
- Template (`hierarchy-editor.component.html:196-210`): the whole host
  `+Mark` group is gated on `hostAvailableDeckers(host).length > 0`
  (`:196`), exactly mirroring the card's gate. The confirm button
  (`:206`) carries no `[disabled]` and no `[title]`, and there is no
  blocked-reason text element at all in this block.

### Where `activeDeckers` comes from, end to end

Both components receive `activeDeckers` as a required `@Input`
(`hierarchy-editor.component.ts:98`, `target-card.component.ts` — not
re-read here, already the reference for the fix being copied). Tracing the
one production wiring path:

- `battle-tracker.component.ts:1249-1252`, `matrixActiveDeckers` getter —
  filters `CombatManager.participants.items` to Matrix participants with a
  non-blank, trimmed `name`. This is the same filter being added to
  `hostAvailableDeckers()` here, already proven correct and already the
  reason `TargetCardComponent.availableDeckers` needed its own copy
  in the first place (per that getter's own doc comment,
  `target-card.component.ts:273-283`).
- `battle-tracker.component.html:117-118` passes `matrixActiveDeckers` into
  `<app-matrix-run-panel [activeDeckers]="matrixActiveDeckers">`.
- `matrix-run-panel.component.html:38` forwards its own `activeDeckers`
  input straight into `<app-hierarchy-editor [activeDeckers]="activeDeckers">`.

**Confirmed: `app-hierarchy-editor` is mounted in exactly one place in the
whole app** (`matrix-run-panel.component.html:38`) — grepped for
`app-hierarchy-editor` across `src/`, one hit. So in production,
`HierarchyEditorComponent.activeDeckers` is always already name-filtered
before `hostAvailableDeckers()` ever sees it, exactly the same situation
`TargetCardComponent.availableDeckers` was in before its own 2026-09-03
fix (that getter's doc comment explicitly frames the fix as defense
against "whoever mounts it" in the future, not a fix for a currently
reachable production path). This is not a currently-live bug through any
screen a GM uses today; it is the same defense-in-depth precedent, applied
to the second of the app's two `+Mark` pickers.

**Test-only mounting is different and matters for regression risk:**
`HierarchyEditorComponent` is also instantiated directly (not through
`matrix-run-panel`) in three spec files —
`src/scenarios/cyberpunk-name-generator.spec.ts:775-791`,
`src/scenarios/matrix-port-rules-correctness.spec.ts:684-694,792-804,943-955,2075-2098,3891-3894`
— each setting `component.activeDeckers` directly by hand. None of the
existing fixtures currently assign a blank-named decker, so no existing
test is expected to change behaviour from the filter add; new tests will
need to construct that case explicitly (see "Scenarios to survive" below).

### `MARK_CAP`'s export location

Already shared, not target-card-private: `export const MARK_CAP = 3;`
lives in `src/app/services/matrix-state.service.ts:15`.
`hierarchy-editor.component.ts:14` already imports
`MatrixStateService, PropagationStop` from that same module — adding
`MARK_CAP` to that existing import is a one-line addition, not a new
import statement.

### Existing test coverage of the host +Mark control

`src/scenarios/matrix-port-rules-correctness.spec.ts`, describe block
`'HierarchyEditorComponent propagation highlight (mark-propagation-highlight-spec.md, 2026-09-05)'`
(`:2075` onward) is the fixture pattern to reuse: `TestBed.configureTestingModule({ imports: [HierarchyEditorComponent], providers: appConfig.providers })`,
then `component.activeDeckers = [decker]` assigned directly (not via
`@Input()` binding through a host template), a `MatrixHost` added via
`matrixState.addHost(host)`, `fixture.detectChanges()`.

Tests that already call `openHostAddMark()` directly on this fixture and
must keep passing unchanged:

- `:3016` and `:3112` (S7, `'opening a second icon's picker closes the
  first'`) — asserts the host confirm button (`.hier-mark-confirm`)
  renders after `openHostAddMark()`, and disappears once a card picker is
  opened instead.
- `:3135` (N-1, `'opening the host's own +Mark control closes a card's
  already-open picker'`) — asserts `openHostAddMark()` still seeds
  `getHostMarkState(host.id).selectedDeckerId` to `'Tesseract'` and clears
  the live highlight.
- `:3240` — another N-1-family test in the same describe block, not yet
  read in detail; must be checked by the implementer before editing
  `openHostAddMark()`'s auto-select logic, since it is the one call site
  besides the template that reads the now-tightened
  `hostAvailableDeckers()`.

None of these tests currently exercise a blank-named decker or a decker
sitting at cap, so tightening the filter changes none of their outcomes —
`'Tesseract'` is always a valid, uncapped decker in every fixture that
calls `openHostAddMark()` today. No test currently asserts on
`hostAvailableDeckers()`'s return value directly, and no test currently
asserts on any blocked-reason text for the host control (because none
exists). This is a net-new surface for tests, not a modified one.

### The third mark-writing surface (context only, not affected)

`AccessHostPanelComponent.confirmAccess()`
(`access-host-panel.component.ts:174-207`) also calls
`matrixState.addMarkToHost()` (`:195`), as part of recording a resolved
Hack-on-the-Fly/Brute-Force attempt. It already has its own
blocked/state-explaining mechanism — `applyLabel`
(`access-host-panel.component.ts:135-148`), which states plainly when the
3-mark cap will absorb some or all of the typed count, and `canApply`
(`:118-121`), which gates the button. It has no dropdown of "available
deckers" in the sense being fixed here (it works off `activeDeckers`
directly with no per-decker cap filter, since it is describing an already-
resolved attempt, not offering a picker of who still has room). It is not
one of the two controls being brought to parity and is not touched by this
change.

## Affected paths

1. `src/app/matrix/hierarchy-editor/hierarchy-editor.component.ts`
   - Import line `:14` — add `MARK_CAP` to the existing
     `import { MatrixStateService, PropagationStop } from "app/services/matrix-state.service";`.
   - `hostAvailableDeckers(host)` (`:727-728`) — add the same
     `.filter(d => (d.name ?? "").trim() !== "")` step
     `TargetCardComponent.availableDeckers` uses, and replace the literal
     `3` with `MARK_CAP`.
   - `dots()` (`:731-733`) — replace literal `3` with `MARK_CAP` (same
     control, same hardcode pattern; leaving it inconsistent while fixing
     the getter next to it would reintroduce the exact drift this parity
     request exists to close).
   - `confirmHostAddMark(host)` (`:761-767`) — replace the literal `3` on
     line 764 with `MARK_CAP`.
   - `openHostAddMark(host)` (`:749-759`) — no logic change required; verify
     its auto-select at `:756-757` still behaves correctly once
     `hostAvailableDeckers()` is tightened (it will simply never
     auto-select a blank-named or capped decker, which is the intended
     effect, not a regression).
   - Add a new getter, `hostAddMarkBlockedReason(host: MatrixHost): string | null`,
     placed next to `hostAvailableDeckers()`/`confirmHostAddMark()`, mirroring
     `TargetCardComponent.addMarkBlockedReason` exactly:
     ```ts
     hostAddMarkBlockedReason(host: MatrixHost): string | null {
       const s = this.getHostMarkState(host.id);
       if (!s.selectedDeckerId) return "Pick a decker first";
       if ((host.marks[s.selectedDeckerId] ?? 0) >= MARK_CAP) {
         return `${s.selectedDeckerId} already holds the maximum ${MARK_CAP} marks on this host (p. 236)`;
       }
       return null;
     }
     ```
     (Wording deliberately says "on this host" rather than "on this icon" —
     the target card's string says "icon"; a host is never called an
     "icon" elsewhere in this component's own template, e.g.
     `hier-host-name`/`hier-host-node` vocabulary vs. `hier-public-node`
     for icons. Flagged as Open Decision 1 below rather than assumed.)
   - Add `canConfirmHostAddMark(host: MatrixHost): boolean { return this.hostAddMarkBlockedReason(host) === null; }`.

2. `src/app/matrix/hierarchy-editor/hierarchy-editor.component.html`
   - `:206` — the confirm button gains
     `[disabled]="!canConfirmHostAddMark(host)"` and
     `[title]="hostAddMarkBlockedReason(host) ?? 'Place 1 mark'"`, mirroring
     `target-card.component.html:72-75`.
   - After `:206` (before the cancel button at `:207`, or after it — see
     Open Decision 2), add a blocked-reason element mirroring
     `target-card.component.html:77-79`:
     ```html
     @if (hostAddMarkBlockedReason(host)) {
     <span class="hier-add-mark-blocked">{{ hostAddMarkBlockedReason(host) }}</span>
     }
     ```

3. `src/app/matrix/hierarchy-editor/hierarchy-editor.component.css`
   - Add `.hier-add-mark-blocked`, styled to match
     `.tc-add-mark-blocked` (`target-card.component.css:347`) — same
     component family, same visual language. The implementer should read
     that existing rule and mirror it rather than inventing new styling.

4. `src/scenarios/matrix-port-rules-correctness.spec.ts`
   - New tests only (see "Scenarios to survive"); no existing test in this
     file is expected to require a behavioural edit, only to be re-run and
     confirmed still green, per the "existing test coverage" section
     above.

**Search performed and result:** grepped `src/` for `hostAvailableDeckers`,
`app-hierarchy-editor`, `addMarkToHost`, and `\+Mark|add-mark|mark-select|mark-confirm`
across `src/app/matrix/`. No other component reimplements this filter or
mounts `HierarchyEditorComponent` with a different `activeDeckers` source.
`TargetCardComponent`'s own `availableDeckers`/`addMarkBlockedReason` are
the reference being copied *from*, not a call site being changed.
`AccessHostPanelComponent` is a distinct, unaffected third surface (see
above). This is a complete affected-paths list — there is no fifth file.

## Proposed approach

Copy the two accessor patterns from `TargetCardComponent` onto
`HierarchyEditorComponent`'s host-mark methods essentially verbatim, adjusted
only for: (a) reading state out of the `hostMarkState` map instead of a
component-instance field (the host control manages potentially many hosts
from one component instance, unlike the card, which is one component per
target), and (b) the "on this host" vs. "on this icon" wording question
(Open Decision 1). No shared choke point is proposed beyond the existing
shared `MARK_CAP` constant — the two controls' state shapes are different
enough (per-instance field vs. per-host map entry) that extracting a common
helper function would need to take the state getter as a parameter for no
real gain at this size; simpler to keep both readable in place, consistent
with how `TargetCardComponent`'s own getters are written. The `dots()` and
`confirmHostAddMark()` hardcodes are folded into the same change because
they are the same literal-`3`-instead-of-`MARK_CAP` defect the request
names once, appearing three times in the same control.

## Scope classification

- **TRACK** — everything in "Affected paths" above: filtering the host
  decker dropdown to exclude nameless/capped deckers, importing `MARK_CAP`
  consistently within the host control, and adding a blocked-reason
  message plus a disabled confirm button to the host +Mark control. All of
  this is the app correctly displaying/computing state (who can receive a
  mark, why a button won't do anything) — squarely "helping the GM see
  state," not deciding anything on the GM's behalf.
- **GM RESOLVES** — nothing new. The GM still picks the decker and taps
  confirm; the app is only now honest about when that tap will do nothing.
- **OUT OF SCOPE** — propagation highlight/preview on the host control (no
  upstream destination exists for a host, so there is nothing to compute
  or display); the mark-counter control and parent-dropdown-row changes
  (separately queued, unrelated UI, per `mark-propagation-highlight-spec.md:150-151,825,875`);
  `AccessHostPanelComponent` (already has its own equivalent messaging via
  `applyLabel`, not part of this request).

**SCOPE QUESTION** — none newly raised by this request; the two items it
resolves were already flagged as scope questions by the two prior briefs
and are being answered here by implementing them, per the trail in
`mark-propagation-preview-spec.md` (~line 455, "Scope Question") and
`mark-propagation-highlight-spec.md` (~lines 606-611, "remain out of scope
... a separate request" — this is that separate request).

## Size check

Small — well under a day. Three edits to one component's TypeScript (one
import line, one filter tightened, two literals swapped, two new
getters ~12 lines total), two small template edits, one new CSS rule
copied from an existing one, and roughly 6-8 new test cases following an
existing fixture pattern already in the same spec file. No split needed.

## Acceptance criteria

1. `hostAvailableDeckers(host)` excludes any decker whose `name` is blank
   or all-whitespace, in addition to the existing mark-cap filter.
2. `hostAvailableDeckers(host)`, `dots()`, and `confirmHostAddMark(host)`
   all read the mark cap from the imported `MARK_CAP` constant; no bare
   literal `3` remains in any of the three.
3. `hostAddMarkBlockedReason(host)` returns `"Pick a decker first"` when
   `getHostMarkState(host.id).selectedDeckerId` is empty.
4. `hostAddMarkBlockedReason(host)` returns a message naming the decker and
   `MARK_CAP` when the selected decker's mark count on `host` is at or
   above `MARK_CAP`.
5. `hostAddMarkBlockedReason(host)` returns `null` when a decker is
   selected and under cap.
6. `canConfirmHostAddMark(host)` is `true` exactly when
   `hostAddMarkBlockedReason(host)` is `null`.
7. **Reworded, round-8 review (see "Round-8 defect fixes" below).** While
   the host's `+Mark` group is rendered at all
   (`hostAvailableDeckers(host).length > 0`, the template's own outer gate,
   `html:196`), the confirm button (`.hier-mark-confirm`) is `disabled` in
   the DOM exactly when `canConfirmHostAddMark(host)` is `false`. This is
   the two-or-more-available-deckers case (one selected decker sits at cap
   while at least one other decker remains available — Scenario 3/5). It is
   **not** true once availability drops to zero altogether (every decker at
   cap, including the single-decker case): there the whole group, confirm
   button included, is removed from the DOM outright rather than left
   present-and-disabled. See AC-7b/AC-8b in the test suite.
8. **Reworded, round-8 review.** While the host's `+Mark` group is rendered
   at all (same scope as AC-7), a `.hier-add-mark-blocked` element renders
   in the DOM, containing the current `hostAddMarkBlockedReason(host)`
   text, exactly when that value is non-null; it is absent when null. Also
   not true once availability drops to zero — see AC-7's note.
9. `openHostAddMark(host)` never auto-selects a blank-named or
   already-capped decker as the initial `selectedDeckerId`.
10. Every existing test in `matrix-port-rules-correctness.spec.ts` that
    exercises `openHostAddMark`, `confirmHostAddMark`, or `.hier-mark-confirm`
    continues to pass unmodified.

## Regression risk

- **`openHostAddMark()`'s auto-select** (`:756-757`) reads the now-tightened
  `hostAvailableDeckers()`. Any existing test relying on it auto-selecting
  a specific decker must be re-checked; per the trace above, all current
  fixtures use a single, valid, uncapped decker (`'Tesseract'`), so no
  behavioural change is expected, but this is the one place outside the
  template where the tightened filter has a second-order effect and the
  implementer must actually re-run these tests, not just assume.
- **The one-picker-at-a-time mechanism** (`closeAllPickersExcept()`,
  `recomputeHighlight()`'s `openCard.availableDeckers.length === 0` guard
  at `hierarchy-editor.component.ts:283`) is unrelated code this change
  must not touch — it already reads `TargetCardComponent.availableDeckers`
  directly (not `hostAvailableDeckers`), so tightening the host filter has
  no effect on it, but the implementer should not "helpfully" unify the two
  while in the area; that recompute path is explicitly out of scope for
  this request.
- **`[disabled]` on `.hier-mark-confirm`** is new. If any existing test
  clicks that button via a raw DOM `.click()` while a decker is selected
  but at cap (unlikely per the trace above, but not yet verified against
  every one of the four describe blocks listed under "existing test
  coverage"), a disabled button may now silently no-op the click at the
  DOM level in a way it didn't before (previously the JS-level guard in
  `confirmHostAddMark()` was what no-op'd it). The implementer should check
  this specifically for the D-8/D-2/D-3-referencing tests in the
  `matrix-port-rules-correctness.spec.ts` since those exercise
  `.hier-mark-confirm` directly.

## Scenarios to survive

1. **Ordinary case.** Host has zero marks recorded. Two active deckers,
   both named, neither capped. GM expands the host, taps +Mark: both
   deckers appear in the dropdown, one is auto-selected, confirm button is
   enabled, no blocked-reason text shown. GM taps confirm: mark is added,
   picker closes.
2. **Edge case — nameless decker present.** `activeDeckers` includes one
   `MatrixParticipant` with `name: ""` alongside `'Tesseract'`. GM opens the
   host's +Mark control: the dropdown lists only `'Tesseract'`; the blank
   name never appears as an option, is never auto-selected, and could
   never produce a dead confirm tap.
3. **Edge case — selected decker capped externally.** GM opens the host's
   +Mark control with `'Tesseract'` selected and available. Before
   tapping confirm, an external event (simulate directly:
   `host.marks['Tesseract'] = MARK_CAP` followed by `fixture.detectChanges()`,
   mirroring the existing "Defect 7" external-write pattern documented at
   `hierarchy-editor.component.ts:273-281`) pushes `'Tesseract'` to cap
   while a second decker, `'Slamm-0'`, remains available and is still
   listed. `hostAddMarkBlockedReason(host)` now returns the
   already-holds-maximum message, the confirm button is disabled, and the
   blocked-reason text is visible — the GM sees why, instead of a dead tap.
4. **Undo-adjacent case.** GM opens the host's +Mark control, selects a
   decker, then taps the existing cancel button (`:207`,
   `getHostMarkState(host.id).open = false`). The picker closes with no
   mark written and no blocked-reason text persisting into the next open —
   reopening starts clean (this is existing, unchanged behaviour; the test
   confirms the new getters don't leak stale state across opens).
5. **Live-at-the-table case.** Mid-combat, a GM has the host's +Mark
   control open with one decker selected, about to confirm a mark while
   players wait. In the same moment, a player's client submits a
   `configure_deck`/mark-related session update that happens to cap that
   exact decker on that exact host (the same external-write path as
   scenario 3, but arriving via `stateChange$` from session sync rather
   than a direct test write). Before this change, the GM's tap on confirm
   would silently do nothing, and at the table this reads as the app
   freezing or the tap missing — the GM would likely tap again, unsure
   what happened. After this change, the confirm button visibly greys out
   and the blocked-reason text appears the moment the cap lands, so the GM
   immediately sees why and can pick the other available decker instead of
   repeating a dead tap while the table waits.

## Open decisions

1. **Wording: "on this host" vs. "on this icon" in the blocked-reason
   string.** *Recommended default:* "on this host" — the component's own
   template vocabulary already distinguishes hosts from icons
   (`hier-host-*` vs. `hier-public-node`/icon classes), and a GM reading
   "this icon" while looking at a host row could read as a copy-paste
   miss. Low-stakes either way; flagging so it isn't decided silently.
2. **Should `.hier-add-mark-blocked` render before or after the cancel
   (`✕`) button?** *Recommended default:* after, matching
   `target-card.component.html:76-79`'s exact order (select, confirm,
   cancel, then blocked text) — this is pure visual consistency between
   the two controls, no functional difference either way.
3. **Should the fix to `dots()` and `confirmHostAddMark()`'s hardcoded `3`
   be bundled into this same change, or filed as its own trivial cleanup?**
   *Recommended default:* bundle — they are the same "hardcodes 3 instead
   of `MARK_CAP`" defect the request names once, inside the exact control
   this request is already editing; splitting it out would mean touching
   the same three-line block of code twice in two separate changes for no
   review benefit.
4. **Does the disabled-button change risk breaking a DOM-level `.click()`
   in an existing test that the code-level trace above didn't fully rule
   out?** *Recommended default:* the implementer runs the full existing
   suite before and after, rather than trusting the trace alone — this
   spec's regression-risk section already flags exactly which describe
   blocks to check first.

## Round-8 defect fixes (2026-09-10 adversarial review)

An adversarial review of the initial implementation of this spec found a
ghost-reopen defect (armed picker state surviving the whole `+Mark` group's
DOM removal and silently re-admitting itself on an unrelated later action)
and a resulting falseness in AC-7/AC-8 as originally worded, both reworded
above. Two designs were on the table:

- **(a) Cleanup-only** — mirror `TargetCardComponent.ngOnChanges()`'s Path
  10 guard exactly: the moment `hostAvailableDeckers(host)` drops to zero
  while that host's picker is open, force it closed (`open = false`,
  `selectedDeckerId = ""`). The whole group still leaves the DOM in that
  state (unchanged, pre-existing behaviour via the outer `@if` gate); the
  fix is only that the underlying state can no longer survive to rearm
  itself later.
- **(b) Keep the control visible when open** — loosen the outer `@if` gate
  so an already-open picker stays rendered even at zero availability,
  letting the disabled confirm button and blocked-reason text actually
  render in the single-decker case, genuinely satisfying AC-7/AC-8 as
  originally worded.

**Implemented: (a).** (b) was evaluated and rejected: preventing the same
silent rearm under (b) requires *also* clearing `selectedDeckerId` the
moment availability hits zero (otherwise the confirm button silently
re-enables the instant availability returns, with no fresh GM tap — the
exact defect being fixed), and once `selectedDeckerId` is cleared, the
control shows nothing more informative than "Pick a decker first" — no
richer message than the closed state delivers, at the cost of diverging
from what `TargetCardComponent`'s own reference picker actually does in
this situation (it closes; it never sits open-and-disabled at zero
availability). (a) is therefore true parity with the control it mirrors,
not just a same-looking approximation of it. The cost, accepted here: in
the single-decker (or all-capped) case, the GM still sees the whole
`+Mark` group vanish rather than a disabled button with an explanation —
AC-7/AC-8 are reworded above to state that scope honestly, and
`briefs/host-mark-control-parity.md` is updated to match.

## Round-9 fix (2026-09-10) — the input-driven route

Round-8's fix (`closeExhaustedHostPickers()`) had exactly one caller: the
`matrixState.stateChange$` subscription in `ngOnInit()`. That covers every
route that changes decker availability by writing through
`MatrixStateService` (a mark placed/removed, a host edited or deleted). It
does **not** cover a second, separate route: `HierarchyEditorComponent`
takes `activeDeckers` as a plain `@Input`, and several ordinary GM actions
change that array without ever touching `MatrixStateService` at all —
`enableDeck()` / `removeDeck()` (`battle-tracker.component.ts`, wired to
real participant-row buttons) and `CombatManager.removeParticipant()`. The
component declared `implements OnInit, OnDestroy` only, with no
`ngOnChanges` at all, so an `@Input` change from any of those routes was
never reconciled — the picker could go stranded-and-armed exactly the way
round-8 fixed for the `stateChange$` route, just via a different door.

**Fix:** `HierarchyEditorComponent` now also `implements OnChanges`, and
`ngOnChanges()` calls the same `closeExhaustedHostPickers()`. Every route
that can change decker availability now terminates in that one method —
mirroring how `TargetCardComponent` already covers both its own routes
(`ngOnChanges()` for the input route, `recomputeHighlight()`'s Defect 7
guard for the service route).

**Deliberately not done: funnelling `recomputeHighlight()` through
`ngOnChanges()` as well.** This was considered and rejected. `activeDeckers`
as consumed by the GM component (`battle-tracker.component.ts`'s
`matrixActiveDeckers` getter, `:1249-1252`) is a getter that returns a fresh
`.filter()` array on every read — its reference changes on every
change-detection cycle, so `ngOnChanges` fires far more often than the
underlying data actually changes. `closeExhaustedHostPickers()` tolerates
that rate fine: it `continue`s immediately on any picker entry that is not
open, so in the overwhelmingly common case (no host picker open) it is a
no-op walk over a tiny `Map`. `recomputeHighlight()` does not tolerate that
rate: it calls `matrixState.previewPropagation()`, a real computation, and
running it on every change-detection tick would both waste work and
duplicate what `TargetCardComponent.ngOnChanges()` already does for the
card-picker highlight. `recomputeHighlight()` therefore stays reachable only
from the `stateChange$` subscription, exactly as before, and stays free of
any `hostMarkState` reference — this separation has now been confirmed by
two reviewers (round-8 and round-9) and must hold.

**Folded into the same method, same loop:** `closeExhaustedHostPickers()`'s
`if (host && ...)` guard silently short-circuited for a host that no longer
exists (deleted), leaving that host's `hostMarkState` entry in the `Map`
forever. The method now collects the ids of any entry whose host is gone
and deletes them after the loop (not during, to keep `Map` iteration safe).
Not user-visible — host ids are random strings and never reused, so a
leaked entry can never be mistaken for a live host's state — but it is the
same stale-`hostMarkState` family as the rest of this fix and cost two
lines in the same place.

**Tests.** Added to the `HierarchyEditorComponent host +Mark control parity`
describe block in `src/scenarios/matrix-port-rules-correctness.spec.ts`,
following this suite's own established convention for testing a bare
`ComponentFixture`'s `ngOnChanges()` with no parent template binding
(mutate the `@Input` field directly, then call `component.ngOnChanges({
activeDeckers: {} } as never)` — the same pattern already used for
`TargetCardComponent`'s and `AccessHostPanelComponent`'s own `ngOnChanges()`
tests elsewhere in this file): picker open-and-armed closing when
availability hits zero via an `@Input` change; availability returning
afterward without the picker resurrecting armed; a legitimate multi-decker
state surviving the new hook untouched; and the stale-`Map`-entry cleanup
for a deleted host.
