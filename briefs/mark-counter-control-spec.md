# Mark counter dots: click to add, right-click to remove

Technical specification for the implementer.

---

## Request

Make the existing dot display of a decker's marks (`dots(entry.count)`,
rendered as `●●○`) an interactive control: left-click adds one mark,
right-click removes one mark, on both the target-card mark row and the
hierarchy editor's host mark row.

**Xavier's two settled decisions (do not re-open):**
1. Click-to-add must show the amber propagation highlight before it commits
   — the same disclosure the `+Mark` picker gives today. Chosen specifically
   to avoid amending `RULINGS.md` 2026-09-03's substance.
2. Mouse and keyboard only. Right-click-to-remove is acceptable; the native
   browser context menu must be suppressed on the elements this control
   touches (and nowhere else). No touch/tablet equivalent is required.

**Not in scope:** any change to what propagation actually does
(`MatrixStateService.previewPropagation()`, `collectPropagationStops()`,
`propagateMarkUp()`, `placeMark()`, `addMark()`, `removeMark()`,
`removeMarkFromHost()` — zero-line diff on all of these); the `×` remove
button's continued existence (it stays, unconditionally — see "Keyboard
parity" below); the player view or session sync (this is entirely GM-side,
transient view state, same as the propagation-highlight feature it builds
on); the `+Mark`/host `+Mark` pickers themselves (they remain a second,
parallel way to add marks and are unchanged); the `RULINGS.md` amendment's
exact wording (Xavier's, not the implementer's — see "Documentation
consequences").

**Does this move the `SCOPE.md` boundary?** No. Marks are already tracked
(`SCOPE.md:23-25, 30-47`); this is a faster input method for a value the app
already represents. No new capability.

**Is this rules-dependent?** No. The 3-mark cap (p. 236) and propagation
(p. 233) are already decided, implemented, and exposed as
`PropagationStop.willLand`. This change reads and triggers existing logic
through a new UI gesture; it decides nothing new about the rules.

---

## Current behaviour

Facts, read from the code as it exists after commits `a4212d8`, `714c587`,
`c840165` (the propagation-highlight feature is already built and live).

### The mark row today

`src/app/matrix/target-card/target-card.component.ts`

- `markEntries` getter (`:116-120`) — filters `Object.entries(this.target.marks)`
  to `count > 0` before returning. **A decker with zero marks produces no
  entry at all.**
- `dots(count)` (`:307-309`) — `"●".repeat(count) + "○".repeat(MARK_CAP - count)`,
  pure string formatting, no interactivity.
- `removeMark(deckerId)` (`:350-352`) — calls
  `matrixState.removeMark(this.target, deckerId)`. The sole handler for the
  existing `×` button.
- `availableDeckers` getter (`:284-288`) — deckers with room for another
  mark; feeds the `+Mark` picker's dropdown, not the dot row.
- `addMarkBlockedReason` getter (`:295-301`) — evaluates blocking **only
  against `this.selectedDeckerId`**, the picker's own selection state. There
  is no existing per-arbitrary-decker blocked-reason accessor.
- `openAddMark()` / `onSelectedDeckerChange()` / `confirmAddMark()` /
  `cancelAddMark()` (`:315-348`) — the full picker lifecycle, all wired to
  `propagationHighlightChange`/`pickerOpened`/`lifecycleClear` per the
  propagation-highlight spec's lifecycle table (still current — no code has
  since diverged from it, confirmed by reading the class in full).
- `closePickerSilently()` (`:240-242`) — closes this card's own picker with
  no emit; called only by `HierarchyEditorComponent.closeAllPickersExcept()`.

`src/app/matrix/target-card/target-card.component.html`

- `:39-85` — `.tc-marks-row`, gated on
  `markEntries.length > 0 || activeDeckers.length > 0`.
- `:43-58` — `@for (entry of markEntries...)` — one `.tc-mark-entry` per
  decker **with count > 0**. Contains `.tc-decker-name`, `.tc-dots`
  (`:46`, plain text, no click handler), the propagated-mark link badge
  (`:47-51`), and the `×` button (`:52-56`, with the ruling-mandated tooltip
  text: `"...any mark this propagated upstream (...) stays; remove it there
  if wrong"`).
- `:60-82` — the separate `+Mark` picker group, gated on
  `availableDeckers.length > 0`.

### The host mark row today

`src/app/matrix/hierarchy-editor/hierarchy-editor.component.ts`

- `hostMarkEntries(host)` (`:813-817`) — same `count > 0` filter as
  `markEntries`.
- `dots(count)` (`:835-837`) — identical formatting logic to the card's,
  duplicated, not shared.
- `removeHostMark(host, deckerId)` (`:962-964`) — calls
  `matrixState.removeMarkFromHost(host, deckerId)`.
- `hostAvailableDeckers(host)` (`:829-833`), `hostAddMarkBlockedReason(host)`
  (`:850-857`) — mirror the card's accessors, evaluated against
  `getHostMarkState(host.id).selectedDeckerId`, a per-host `Map` entry
  (`:804-811`), not a component field.
- `openHostAddMark(host)` / `confirmHostAddMark(host)` (`:877-895`) — the
  host picker's own lifecycle. `openHostAddMark()` calls
  `closeAllPickersExcept({ kind: "host", hostId })` (`:878`) and explicitly
  clears `markHighlight` if one was set (`:879-881`) — **a host mark never
  has a propagation preview of its own**, since a host is never itself a
  propagation source (`collectPropagationStops()` only ever emits a host as
  a *destination*, never walks *from* one).
- `closeAllPickersExcept()` (`:317-326`) — the single implementation of
  "one +Mark picker open at a time," covering both card pickers
  (`targetCardsQuery`, closed via `closePickerSilently()`) and host pickers
  (`hostMarkState` entries, closed by setting `.open = false`).

`src/app/matrix/hierarchy-editor/hierarchy-editor.component.html`

- `:178-195` — `.hier-host-marks`, gated on
  `activeDeckers.length > 0 || hostMarkEntries(host).length > 0`.
- `:182-195` — `@for (entry of hostMarkEntries(host)...)` — one
  `.hier-mark-entry` per decker with count > 0, containing `.hier-mark-dots`
  (`:185`, plain text), the propagated badge, and `.hier-mark-rm` (`:191-193`,
  the host's `×` equivalent).

### The propagation-highlight machinery this must reuse

`src/app/services/matrix-state.service.ts`

- `MARK_CAP = 3` (`:15`).
- `addMark(target, deckerId)` (`:389-395`) — calls `placeMark()`, then (only
  for `target.type === "device"`) `propagateMarkUp()`, then fires
  `stateChange$`. **Propagates on every successful add, not only the first**
  — confirmed by reading the method; there is no "first mark only" branch.
- `previewPropagation(target, deckerId)` (`:426-430`) — the read-only walk,
  returns `[]` for a non-device target.
- `placeMark()` (`:580-585`) — the cap enforcement; returns `false` (no
  write, no propagation) if already at `MARK_CAP`.

`src/app/matrix/target-card/target-card.component.ts`

- `MarkHighlightRequest { target, deckerId }` and
  `PropagationHighlightState = "landing" | "capped"` (`:18-30`) — the shared
  types.
- `@Output() propagationHighlightChange` (`:74`) — emits a request or `null`;
  fired only from DOM event handlers (`openAddMark`,
  `onSelectedDeckerChange`, `confirmAddMark`, `cancelAddMark`), **never from
  a getter and never from a lifecycle hook** (that distinction is load-bearing
  — see `lifecycleClear` below).
- `@Output() lifecycleClear` (`:97`) — fired **only** from `ngOnChanges()`/
  `ngOnDestroy()`, because those hooks can themselves run mid-change-detection
  and a direct `propagationHighlightChange.emit(null)` from inside them was
  found (round-6 review) to throw `NG0100`. Consumed by
  `HierarchyEditorComponent.onLifecycleClear()` (`:284-286`), which defers
  the actual `markHighlight = null` write to a microtask.
- `@Output() pickerOpened` (`:109`) — emits `target.id` whenever a card's own
  picker opens, including a blocked one. Sole purpose: let the editor close
  every *other* picker via `closeAllPickersExcept()`.
- `emitHighlight()` (`:165-171`) — private, builds the request from
  `this.target` + `this.selectedDeckerId`, or `null` if
  `addMarkBlockedReason !== null`. **This is hardwired to
  `this.selectedDeckerId`, the picker's own selection state — it cannot be
  called for an arbitrary decker id today.**

`src/app/matrix/hierarchy-editor/hierarchy-editor.component.ts`

- `markHighlight: MarkHighlightRequest | null` (`:172`) — single source of
  truth for the current highlight.
- `highlightByNodeId: Map<string, PropagationStop>` (`:184`) and
  `highlightStateFor(nodeId)` (`:364-368`) — O(1) per-node lookup, rebuilt by
  `recomputeHighlight()` (`:333-356`) exactly once per state change.
- `onPropagationHighlightChange()` (`:258-261`) — the sole consumer of the
  card's `propagationHighlightChange` output.
- `onPickerOpened()` (`:300-302`) → `closeAllPickersExcept()` (`:317-326`) —
  the one-picker-at-a-time rule, covering both card and host pickers.

---

## Affected paths

Every file that must change. There is no third place marks are displayed —
searched `src/` for `\.tc-dots\b|hier-mark-dots|dots\(` and found only the
two `dots()` implementations cited above and their two template usages.

### A. `src/app/matrix/target-card/target-card.component.ts`

| Action | Symbol |
|---|---|
| ADD | `blockedReasonFor(deckerId: string): string \| null` — the same logic as `addMarkBlockedReason` (`:295-301`) but parameterized, since a dot row's decker is fixed and is not necessarily `this.selectedDeckerId`. `addMarkBlockedReason` itself becomes `get addMarkBlockedReason() { return this.blockedReasonFor(this.selectedDeckerId); }` so the two definitions cannot drift |
| ADD | `armedDotDeckerId: string \| null = null` — which decker's dot row currently owns the transient hover/focus highlight, or `null`. Distinct from `addMarkOpen`, which tracks the `+Mark` picker's own open state |
| ADD | `@Input() dotAddBlocked = false` — true when another card's or the host's picker is currently open elsewhere in the tree (Open Decision 2 below); disables dot-click-to-add on this card while true |
| ADD | `onDotRowEnter(deckerId: string): void` — arms: sets `armedDotDeckerId`, emits `propagationHighlightChange` for `{ target: this.target, deckerId }` unless `blockedReasonFor(deckerId) !== null`, in which case emits nothing (no highlight for a capped decker — nothing will land) |
| ADD | `onDotRowFocus(deckerId: string): void` — keyboard equivalent of `onDotRowEnter`, same body |
| ADD | `onDotRowLeave(deckerId: string): void` — disarms: if `armedDotDeckerId === deckerId`, clears it and emits `propagationHighlightChange(null)` |
| ADD | `onDotRowBlur(deckerId: string): void` — keyboard equivalent of `onDotRowLeave`, same body |
| ADD | `onDotClick(deckerId: string): void` — no-op if `dotAddBlocked` or `blockedReasonFor(deckerId) !== null`; otherwise calls `matrixState.addMark(this.target, deckerId)`, then clears the armed state and emits `propagationHighlightChange(null)` (same ordering rule as `confirmAddMark()` — `addMark()` fires `stateChange$` first, the clearing emit goes after) |
| ADD | `onDotRightClick(event: MouseEvent, deckerId: string): void` — `event.preventDefault()`, then delegates to the existing `removeMark(deckerId)` unchanged |
| KEEP unchanged | `removeMark()` (`:350-352`), the `×` button, `dots()` (`:307-309`), `hasPropagatedMark()`, `markEntries`, `availableDeckers`, `openAddMark()`/`onSelectedDeckerChange()`/`confirmAddMark()`/`cancelAddMark()`, `closePickerSilently()`, `ngOnChanges()`, `ngOnDestroy()`, `pickerOpened`, `lifecycleClear` |
| MODIFY | `ngOnChanges()` (`:195-205`) — extend the existing guard: if `armedDotDeckerId` is set and `changes["target"]`, or the armed decker no longer has room (mirrors the existing `addMarkOpen`/`availableDeckers.length === 0` path), disarm and emit `null` |
| MODIFY | `ngOnDestroy()` (`:218-222`) — also clear if `armedDotDeckerId !== null`, not only `addMarkOpen` |

### B. `src/app/matrix/target-card/target-card.component.html`

| Action | Lines |
|---|---|
| MODIFY | `:43-58` — wrap `.tc-dots`' content in a single focusable, semantic control (a `<button class="tc-dots-btn">`, not a `<span>` — a `<span>` with a click handler is not keyboard-reachable without extra `tabindex`/`role`/`keydown` plumbing a native `<button>` gets for free) |
| ADD | on that button: `(mouseenter)="onDotRowEnter(entry.deckerId)"`, `(mouseleave)="onDotRowLeave(entry.deckerId)"`, `(focus)="onDotRowFocus(entry.deckerId)"`, `(blur)="onDotRowBlur(entry.deckerId)"`, `(click)="onDotClick(entry.deckerId)"`, `(contextmenu)="onDotRightClick($event, entry.deckerId)"`, `[disabled]="dotAddBlocked"`, `[class.tc-dots-capped]="blockedReasonFor(entry.deckerId) !== null"`, `[attr.aria-label]="'Add 1 mark to ' + deckerLabel(entry.deckerId) + '; right-click to remove one'"`, `[title]="blockedReasonFor(entry.deckerId) ?? 'Click to add 1 mark; right-click to remove 1'"` |
| KEEP unchanged | `:52-56` — the `×` button, verbatim, including its ruling-mandated tooltip text |

### C. `src/app/matrix/target-card/target-card.component.css`

| Action |
|---|
| ADD | `.tc-dots-btn` — reset default button chrome (background, border, padding) so it renders identically to today's plain `.tc-dots` span; `cursor: pointer` |
| ADD | `.tc-dots-btn:disabled`, `.tc-dots-capped` — `cursor: not-allowed`, dimmed, reusing the existing `rgba(255, 179, 64, ...)` capped vocabulary already established by the propagation-highlight feature (`.tc-prop-capped`) for visual consistency, applied to the dots themselves this time rather than the row |
| KEEP unchanged | `.tc-dots` text styling (`:143-147`) — still applies, now to the button's content |

### D. `src/app/matrix/hierarchy-editor/hierarchy-editor.component.ts`

| Action | Symbol |
|---|---|
| ADD | `hostAddMarkBlockedReasonFor(host: MatrixHost, deckerId: string): string \| null` — parameterized twin of `hostAddMarkBlockedReason()` (`:850-857`), same relationship as target-card's `blockedReasonFor` |
| ADD | `onHostDotClick(host: MatrixHost, deckerId: string): void` — no-op if blocked; otherwise `matrixState.addMarkToHost(host, deckerId, 1)`. No highlight involved (see "Proposed approach §3") |
| ADD | `onHostDotRightClick(event: MouseEvent, host: MatrixHost, deckerId: string): void` — `event.preventDefault()`, delegates to existing `removeHostMark()` |
| ADD | `anyOtherPickerOpen(excludeTargetId: string \| null): boolean` — used to compute each card's `dotAddBlocked` input and each host row's own disabled state (Open Decision 2); reads `markHighlight` and iterates `hostMarkState` for any `open: true` entry other than the one excluded |
| MODIFY | `:265-273`, `:354-362` — both `<app-target-card>` bindings gain `[dotAddBlocked]="anyOtherPickerOpen(t.id)"` |
| KEEP unchanged | `closeAllPickersExcept()`, `onPickerOpened()`, `onPropagationHighlightChange()`, `onLifecycleClear()`, `recomputeHighlight()`, `highlightStateFor()`, `toggleHost()`, `closeExhaustedHostPickers()`, `openHostAddMark()`/`confirmHostAddMark()` |

### E. `src/app/matrix/hierarchy-editor/hierarchy-editor.component.html`

| Action | Lines |
|---|---|
| MODIFY | `:185` — wrap `.hier-mark-dots`' content in a `<button class="hier-mark-dots-btn">` with the same six bindings as target-card's, calling `onHostDotClick`/`onHostDotRightClick`, `[disabled]="anyOtherPickerOpen(null)"`, `[class.hier-mark-dots-capped]="hostAddMarkBlockedReasonFor(host, entry.deckerId) !== null"` |
| KEEP unchanged | `:191-193` — the host's own `×` button, verbatim |

### F. `src/app/matrix/hierarchy-editor/hierarchy-editor.component.css`

| Action |
|---|
| ADD | `.hier-mark-dots-btn`, `.hier-mark-dots-btn:disabled`, `.hier-mark-dots-capped` — mirrors target-card's C, above |

### G. `src/app/services/matrix-state.service.ts`

**No change required.** `addMark()`, `addMarkToHost()`, `removeMark()`,
`removeMarkFromHost()` are all called exactly as they already are by the
existing `+Mark`/`×` controls. Do not touch `placeMark()`,
`collectPropagationStops()`, `propagateMarkUp()`, or `MARK_CAP`.

### H. `src/scenarios/matrix-port-rules-correctness.spec.ts`

New tests required (no existing tests are deleted or rewritten — the `×`
button, `+Mark` picker, and all sixteen-plus propagation tests from the
highlight feature are untouched and must stay green). See "Scenarios to
survive" below for the minimum set.

### I. Documentation

- `RULINGS.md:1354-1360` ("Before committing" bullet) — currently says "the
  `+Mark` control ... indicates ...". Once the dots can also trigger the
  same highlight, this sentence undercounts. **Xavier's wording, not the
  implementer's** — flagged, not resolved here. Recommended default: widen
  to "the `+Mark` control and the mark-dots control both indicate ..." —
  a naming fix, not a substantive change, and does **not** contradict the
  basis on which Xavier chose the highlight-based disclosure model over a
  cheaper alternative.
- No `SCOPE.md` change identified as needed. Flagged explicitly per the
  task's requirement to check — this stays inside "Tracking values that
  change... marks" (`SCOPE.md:23-25`) and the already-approved propagation
  bullet (`SCOPE.md:30-47`).

### Searched and found nothing else

- `grep "tc-dots|hier-mark-dots"` across `src/` → only the two locations
  cited in "Current behaviour."
- `grep "\.dots\("` across `src/` → only the two `dots()` method definitions
  and their two template call sites; no third renderer of marks exists
  (`AccessHostPanelComponent`, `MatrixGraphComponent`, and the player view
  were all checked in the prior propagation-highlight spec's own search and
  confirmed to not render per-decker dot counts at all).

---

## Proposed approach

### 1. Interaction model — click adds one, always

**Recommended: a click anywhere on a decker's dot control adds exactly one
mark, regardless of which dot (if any) the pointer happens to be over.**
Not "click dot N to set the count to N." Reasons:

- Matches the existing `×` button's behaviour, which always removes exactly
  one regardless of where it's clicked — one consistent mental model for the
  whole row.
- A "set to N" model means clicking a *lower* dot than the current count
  silently removes potentially more than one mark in a single click, with no
  separate confirmation and no propagation-style warning (propagation
  disclosure only makes sense for adds, not removes) — a materially riskier
  failure mode in an app with no undo.
- It is the strictly simpler implementation, and simplicity matters more
  here than in most features given how much surrounding lifecycle complexity
  this already has to inherit from the highlight feature.

**Flagged as a scope question, not decided silently** — see the brief.

### 2. Realizing "show the highlight before committing" with a single click

The fork the task explicitly calls out: a literal single click cannot both
*commit* and have *already shown* a warning about what it will do, because
those two things can't be simultaneous and still be a real disclosure (a
CSS state that appears and is immediately overwritten in the same
synchronous JS turn never actually paints).

**Resolution: use `mouseenter`/`focus` as the arm step, and the subsequent
`click` as the commit step, without requiring a second explicit
confirmation click.** For a mouse-and-keyboard-only environment this works
cleanly, because both input methods *necessarily* pass through a hover or
focus state before a click/`Enter` can land on an element — there is no way
to click something with a mouse without the pointer entering it first, and
no way to activate something with a keyboard without first tabbing onto it.
The highlight therefore genuinely renders on screen (a hover/focus event and
the subsequent click are always two separate browser event-loop turns, so
the browser paints between them) before the commit occurs, satisfying the
disclosure requirement without needing a modal confirm step.

This mirrors the `+Mark` picker's own shape closely enough to reuse its
output contracts directly: `onDotRowEnter`/`onDotRowFocus` emit
`propagationHighlightChange` exactly the way `openAddMark()` does (`:315-326`,
minus the `pickerOpened` emit — see Open Decision 2); `onDotRowLeave`/
`onDotRowBlur` emit `null` exactly the way `cancelAddMark()` does.

**Residual risk, stated plainly:** an extremely fast click-without-dwell (a
pointer that clicks the instant it enters the element, with the two events
coalescing into the same rendering frame) could theoretically commit before
a human eye registers the highlight, even though the two DOM events are
technically sequential. This is the same category of risk any hover-driven
UI has and is not specific to this feature; not designing around it further.

### 3. Host dots get the same click/right-click ergonomics, no highlight

A host is never itself a propagation *source* — `collectPropagationStops()`
only ever emits a host as a destination (§(a) of that method), and there is
no code path that walks *upward from* a host, because nothing is modelled as
containing one. So `onHostDotClick()` calls `addMarkToHost()` directly with
no `propagationHighlightChange` emission at all — there is genuinely nothing
to preview. This matches `openHostAddMark()`'s existing behavior (`:877-887`),
which places a host mark with no propagation preview either.

### 4. The 3-mark cap — refuse, matching existing precedent, not a new call

The `+Mark` picker already hard-refuses (disables its confirm button) rather
than merely warning when a decker is capped (`canConfirmAddMark`,
`addMarkBlockedReason`). This is not a new legality-enforcement decision for
this feature to make — it is following existing precedent in the same
component. `onDotClick`/`onHostDotClick` mirror that: no-op, with a visible
blocked cue (dimmed/dashed dot styling plus a tooltip carrying the same
wording `addMarkBlockedReason`/`hostAddMarkBlockedReason` already produce).
Right-click/remove is never blocked by the cap in either direction — capped
only blocks *adding*.

### 5. Mutual exclusion with an open `+Mark`/host picker (Open Decision 2)

The propagation-highlight feature already established: at most one picker
(card or host) may be open at a time (`closeAllPickersExcept()`). A dot-row
hover is a new, third kind of highlight-owning interaction, and it needs to
interact with that rule somehow. Two designs, both technically workable:

- **Option A — hover competes and wins**, exactly like opening a second
  picker does today: `onDotRowEnter`/`onDotRowFocus` call
  `closeAllPickersExcept({ kind: "dot", targetId, deckerId })` (a third
  `keep` variant), silently closing whatever picker was previously open,
  same as `S7` in the highlight spec. Consistent with existing precedent,
  but means a GM moving the mouse across the tree while an unrelated `+Mark`
  picker sits open, unconfirmed, will silently close it — a much higher
  false-trigger rate than opening a picker deliberately, since hovering
  happens far more incidentally than clicking `+Mark`.
- **Option B — hovering (and clicking) is disabled while another picker is
  open elsewhere** (`dotAddBlocked`/`anyOtherPickerOpen()`, above). Nothing
  gets silently cancelled by mouse movement; the GM must finish or cancel
  the other picker first. Costs a small amount of friction in the rare case
  a GM genuinely wants to fire off a quick dot-click while a picker sits open
  elsewhere.

**Recommended: Option B**, specced above (`dotAddBlocked` Input,
`anyOtherPickerOpen()`). Safer default for a live table with no undo — see
the brief's Scope Question 2 for the plain-language version. **This is Xavier's
call, flagged, not decided here.**

### 6. Keyboard parity

Per the task's own framing ("mouse and keyboard only"), keyboard is a
first-class input method, not an afterthought. Two consequences, both
already folded into the affected-paths map:

- The dot control must be a real, focusable `<button>`, not a `<span>` with
  a click handler — native buttons get `Tab` reachability and `Enter`/`Space`
  activation for free; a `<span>` would need `tabindex="0"`, `role="button"`,
  and manual `keydown` handling to match, for no benefit.
- **Right-click has no keyboard equivalent whatsoever** — there is no
  standard "keyboard right-click" gesture, and the request's own scoping
  note says the context-menu key should be suppressed, not repurposed. This
  makes the existing `×` button load-bearing in a way it wasn't before: it
  is now **the only way a keyboard-only GM can remove a mark**, not merely a
  redundant affordance. This is the decisive reason `×` stays, unconditionally,
  alongside the new control rather than being replaced by it.

---

## Scope classification

Proposal only. Xavier approves; nothing here is settled.

### TRACK — the app must represent or compute this

1. Clicking a decker's existing dot control adds one mark to that decker on
   that icon, subject to the 3-mark cap. `SCOPE.md:23-25`.
2. Right-clicking a decker's existing dot control removes one mark from that
   decker on that icon. Same scope basis.
3. Before a click-to-add commits, the app shows which other icons the mark
   will also reach, using the existing propagation-highlight mechanism.
   `RULINGS.md` 2026-09-03; Xavier's decision 1 for this request.
4. A decker already at the 3-mark cap cannot have a mark added via the dots;
   the app shows why. `SCOPE.md:62-67` ("Enforcing legality... the default
   is to warn rather than refuse" — though this specific case already
   refuses, matching existing `+Mark` precedent, not a new call).
5. The host's own mark dots get the same add/remove ergonomics, with no
   propagation preview (nothing to preview from a host).

### GM RESOLVES — the GM decides; the app records

- Whether to click at all, having seen the highlight (same as the `+Mark`
  picker today).
- Whether an accidental right-click removal was a mistake — corrected by
  hand, same as every other mark correction in this app (no undo,
  `SCOPE.md:88-91`).

### OUT OF SCOPE — per `SCOPE.md`

- Placing a decker's very first mark via the dots (structurally impossible —
  no dot exists until count > 0; still goes through `+Mark`).
- Any touch/tablet gesture for removal (explicitly excluded by the request).
- Reversing propagation on a dot-triggered removal — unchanged from the
  existing rule (`RULINGS.md` 2026-09-03).

### SCOPE QUESTION

Flagged rather than silently excluded. Xavier decides.

**1. Click-adds-one vs. click-sets-count-to-N.**
*For click-sets-N:* faster for a GM who wants to jump straight from 1 mark
to 3.
*Against:* a stray click on a lower dot silently removes potentially more
than one mark with zero warning (propagation disclosure only covers adds),
in an app with no undo.
*My recommendation:* click-adds-one, always. Not building click-sets-N
without Xavier's explicit word.

**2. Hover-competes-and-closes (Option A) vs. hover-disabled-while-another-
picker-is-open (Option B).**
*For A:* consistent with the existing "opening any picker closes every
other" precedent; no new `dotAddBlocked` plumbing needed.
*For B:* nothing is ever silently cancelled by incidental mouse movement,
which is a meaningfully higher-frequency event than a deliberate `+Mark`
click.
*My recommendation:* B, specced above as the default build target. Flagged
because it is a real architectural fork, not a small styling choice.

---

## Size check

**Roughly two and a half to three days.** Larger than "add a click handler
to some dots" because it inherits the full lifecycle complexity the
propagation-highlight feature already established (arm/disarm paths,
mutual-exclusion with two other kinds of picker, `ngOnChanges`/`ngOnDestroy`
cleanup, keyboard parity) and has to apply all of it twice — once for the
target-card row, once for the host row, per the codebase's own established
practice of never letting the host control lag behind the card control (see
`briefs/host-mark-control-parity-spec.md`, an existing precedent for exactly
this failure mode).

- Build: two component classes, two templates, two stylesheets, the new
  parameterized blocked-reason accessors, the `dotAddBlocked`/
  `anyOtherPickerOpen()` wiring. Call it a day and a half.
- Tests: hover-arm/disarm, click-commit, right-click-remove, cap-blocked,
  keyboard-focus-equivalent, mutual-exclusion-with-open-picker, host-row
  parity, zero-mark-decker absence (a negative test — confirming no dot
  control renders at all) — none of these have an existing pattern to copy
  wholesale the way, e.g., `×`-button tests did for the highlight feature.
  Call it a full day.

**Do not split add from remove** — a build that ships click-to-add without
right-click-to-remove (or vice versa) is a half-finished control that
doesn't match either of Xavier's two named decisions. **Do not split card
from host** — shipping one and not the other reproduces exactly the parity
gap `host-mark-control-parity-spec.md` already had to fix once for the
`+Mark` picker. The one piece that could reasonably be deferred if this runs
long is the mutual-exclusion refinement (Open Decision 2) — Option A (hover
simply competes, same as an existing picker) is a smaller, already-precedented
fallback if Option B's extra `dotAddBlocked` plumbing proves too large to
land alongside everything else.

---

## Acceptance criteria

TRACK items only.

1. Given a target with `marks = { Tesseract: 2 }` and one active decker
   `Tesseract`, the rendered dot control for `Tesseract` shows `●●○`, is a
   focusable `<button>`, and clicking it results in
   `target.marks.Tesseract === 3`.
2. Right-clicking that same control results in
   `target.marks.Tesseract === 1`, and the browser's native context menu
   does not open (assert `event.defaultPrevented === true` on the captured
   `contextmenu` event).
3. Given a device chained `gun → mount → drone` (all devices, no caps) and
   `gun.marks = { Tesseract: 1 }`, hovering `gun`'s dot control for
   `Tesseract` highlights `mount` and `drone` in the tree exactly as opening
   `gun`'s `+Mark` picker with `Tesseract` selected would, before any click
   occurs.
4. In the same fixture, `mouseleave` without a click clears the highlight
   and leaves `gun.marks.Tesseract === 1` unchanged (no commit occurred).
5. In the same fixture, clicking `gun`'s dot control results in
   `gun.marks.Tesseract === 2`, `mount.marks.Tesseract === 1`,
   `drone.marks.Tesseract === 1`, and the highlight clears immediately after.
6. Given `target.marks = { Tesseract: 3 }` (capped), the dot control for
   `Tesseract` is visually marked capped, is `disabled` for click-to-add
   (attempting to click leaves `target.marks.Tesseract === 3`), carries a
   tooltip naming the cap, and right-click still succeeds
   (`target.marks.Tesseract === 2` after).
7. For a decker with zero marks on a given icon, no dot control (and no
   `.tc-dots-btn`) renders for that decker at all — only the `+Mark` button,
   unchanged from today.
8. Given the S1-equivalent host fixture (`cam` linked to host `Ares-7`,
   `cam.marks = { Tesseract: 1 }`), clicking `Ares-7`'s **own host-level**
   dot control does **not** produce any propagation highlight anywhere in
   the tree (a host is never a propagation source), while `cam`'s own
   device-level dot control **does** show the highlight on hover per AC-3.
   These are two different controls in the same fixture and must be
   asserted separately.
9. Given a `+Mark` picker open and armed on `mount` (Open Decision 2 built
   as Option B), hovering `drone`'s dot control elsewhere in the tree does
   **not** change the currently-shown highlight and does **not** close
   `mount`'s picker; `drone`'s dot control renders as disabled for
   click-to-add while `mount`'s picker remains open.
10. The `×` button remains present, unchanged, for every decker with at
    least one mark — including a keyboard-only interaction sequence
    (`Tab` to `×`, `Enter`) that successfully removes a mark with no mouse
    event of any kind.
11. Tabbing onto a dot control (`focus`, no mouse) produces the same
    highlight as `mouseenter` would (AC-3's assertion repeated via
    `focus`/`blur` instead of `mouseenter`/`mouseleave`), and pressing
    `Enter` while focused commits the add (AC-1's assertion repeated via
    keyboard).
12. Reading any of the new blocked-reason or armed-state accessors mutates
    no `marks` record and emits nothing on `matrixState.stateChange$`.

---

## Regression risk

| Risk | Covered by |
|---|---|
| `MatrixStateService.addMark()`/`removeMark()`/`addMarkToHost()`/`removeMarkFromHost()` drift while "just" adding a UI trigger | Zero-line diff required on `matrix-state.service.ts`; existing `addMark()` propagation test block (`matrix-port-rules-correctness.spec.ts:2309-2658`) must pass unchanged |
| The existing `+Mark`/host `+Mark` pickers stop working, or their existing lifecycle tests (open/cancel/confirm, decker-switch, blocked-reason) break | All sixteen-plus existing propagation-highlight tests must pass unchanged; `openAddMark()`/`confirmAddMark()`/`cancelAddMark()`/`openHostAddMark()`/`confirmHostAddMark()` are all explicitly KEEP-unchanged in the affected-paths map |
| The `×` button's ruling-mandated tooltip text (`RULINGS.md` 2026-09-03, "stays upstream... remove it there if wrong") regresses or is deleted | AC-10; the button and its `[title]` binding are explicitly KEEP-unchanged, byte-for-byte |
| A dot-row hover silently closes an unrelated open picker (if Option A is built instead of B) | AC-9, written against Option B; if Option A ships instead, this AC must be rewritten to assert the opposite (picker closes, highlight moves) — flagged so the two are not silently conflated |
| Keyboard users lose the ability to remove a mark at all | AC-10, AC-11 — both explicitly exercise the keyboard-only path with no mouse events |
| `ngOnChanges`/`ngOnDestroy` leave a dot-armed highlight stranded the same way the picker's own lifecycle table had to guard against (spec's lifecycle paths 5-11) | AC-4 plus new fixture-destroy/target-swap tests mirroring the highlight spec's own lifecycle test pattern — every clear path that spec enumerated for `addMarkOpen` needs an equivalent for `armedDotDeckerId` |
| Host row falls out of sync with the card row again (the exact failure the `host-mark-control-parity-spec.md` precedent exists to prevent) | AC-2, AC-6, AC-8 all have host-row equivalents that must be written, not only card-row versions |

---

## Scenarios to survive

### S1 — Ordinary: increment an existing mark by two clicks

```
Given target.marks = { Tesseract: 1 }, one active decker Tesseract
When the GM clicks the dot control once
Then target.marks.Tesseract === 2
When the GM clicks it again
Then target.marks.Tesseract === 3
When the GM clicks it a third time
Then target.marks.Tesseract === 3 (capped, no-op)
 And the dot control now renders as capped/disabled-for-add
```

### S2 — Edge: propagation shown on hover, mouse leaves before clicking

```
Given gun -> mount -> drone chain, gun.marks = { Tesseract: 1 }, no caps
When the GM's pointer enters gun's dot control
Then mount and drone highlight amber (landing)
When the pointer leaves without a click
Then the highlight clears
 And gun.marks.Tesseract === 1, mount.marks.Tesseract === 0,
     drone.marks.Tesseract === 0 (nothing committed)
```

### S3 — Undo path: right-click corrects an accidental add

```
Given target.marks = { Tesseract: 1 }, decker Tesseract
When the GM clicks the dot control (add) then immediately right-clicks it
Then target.marks.Tesseract === 1 again (net zero)
 And no propagation reversal occurred on any ancestor the first click
     may have reached, per RULINGS.md 2026-09-03 (unchanged rule)
```

### S4 — Live at the table: mid-combat, one picker open, GM reaches for dots elsewhere

```
Given a +Mark picker open and armed on device `maglock`, decker Slamm-0
  selected, unconfirmed, players waiting
And an unrelated device `camera` with camera.marks = { Tesseract: 1 }

When the GM's mouse passes over camera's dot control on the way to
    somewhere else on screen (Option B built)

Then maglock's picker remains open and armed, exactly as it was
 And camera's dot control shows as disabled-for-add (no highlight, no commit)
 And no state changed anywhere

When the GM deliberately clicks confirm on maglock's picker first
Then maglock's picker closes, its mark(s) land
 And camera's dot control becomes clickable again
When the GM then clicks camera's dot control
Then camera.marks.Tesseract === 2
```

This is the scenario the whole mutual-exclusion design question (Open
Decision 2) exists to get right: an idle mouse movement mid-combat must
never silently disarm a decision the GM hadn't made yet.

---

## Open decisions

### 1. Click-adds-one vs. click-sets-count-to-N.
*Recommended: click-adds-one, always.* See "Proposed approach §1" and the
brief's Scope Question 1 for the full reasoning.

### 2. Hover-competes-and-closes (Option A) vs. hover-disabled-while-blocked (Option B).
*Recommended: Option B*, specced as the default build target above (§5).
See the brief's Scope Question 2.

### 3. Exact wording for `RULINGS.md`'s widened "Before committing" bullet.
Xavier's wording, not the implementer's — see "Documentation consequences."
Recommended default if he does not supply his own: "the `+Mark` control and
the mark-dots control both indicate what a mark will also mark, by
highlighting those icons in the hierarchy tree, before the GM commits it."
