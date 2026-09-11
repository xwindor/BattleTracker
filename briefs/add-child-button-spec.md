# Add a "+ add child" control to the Matrix hierarchy tree

## Request

Add a small control next to a device icon in the Public Space hierarchy tree
that opens the Add-target form pre-seeded to be a child of that device, so a
nested chain (drone → mount → weapon) can be built parent-first instead of
child-first. **Not in scope:** attaching an *existing* device as a child
(create-only), any change to propagation mechanics or the 3-mark cap, any
change to the Parent dropdown's existing Save-buffered behaviour
(`briefs/parent-picker-into-edit-view-spec.md`), and any change to Edit's
existing form-placement behaviour (see "Current behaviour" — Edit's fixed
top-of-Public-Space placement is a pre-existing gap this request does not ask
to fix).

This does not move any `SCOPE.md` boundary. The parent/child relationship
itself is already an approved TRACK item (`SCOPE.md` propagation bullet;
Decision 7b, 2026-09-02). This is a new UI entry point onto an already-in-scope
mechanic, not a new mechanic.

## Current behaviour

- `hierarchy-editor.component.ts:485-495` — `openAddTarget(host: MatrixHost |
  null, type: MatrixTargetType)` builds a fresh `TargetFormState` from
  `BLANK_TARGET_FORM` (`:73-78`). It takes no parent parameter. `hostId` is
  set from the `host` argument (`null` for Public Space); `parentTargetId`
  stays `""` (from `BLANK_TARGET_FORM`).
- `TargetFormState` (`:35-65`) already carries `parentTargetId: string` and
  `parentError: string | null`, added by the immediately preceding change
  (`briefs/parent-picker-into-edit-view-spec.md`). The Add/Edit form's Parent
  `<select>` (`hierarchy-editor.component.html:379-404`) is already wired to
  `targetForm.parentTargetId` via `onParentSelectionChange()` — it is
  save-buffered, editable, and shown for both Add and Edit
  (`html:379`, `targetForm.type === 'device' && targetForm.hostId === null`).
- **Existing entry points into `openAddTarget()`:**
  1. `html:22-26` — Public Space header's "+ Loose Device" button:
     `openAddTarget(null, 'device')`. Hardcoded type, no parent.
  2. `html:283-294` — four per-type buttons inside a host's `.hier-targets-
     subsection` header: `openAddTarget(host, 'device'|'file'|'persona'|'ic')`.
     Always has a non-null `host`.
  No other call site exists — grepped `openAddTarget` across `src/`; the only
  matches are the two template call sites above, the method definition, and
  four test call sites in `matrix-port-rules-correctness.spec.ts` (`:735,
  1187, 1196, 1221, 1310`).
- **`canHaveParent(target)` (`ts:1108-1110`)** — `return target.type ===
  "device" && target.context === "public"`. This is exactly the condition for
  "this target could be a parent," fixed in the immediately preceding change
  to also exclude host-nested devices. It is the correct, already-existing
  gate for "should this icon show a +" — reusing it needs no new logic.
- **The Add/Edit form renders in exactly two fixed template slots, never
  inline at an arbitrary tree position:**
  1. `html:44-47` — `@if (isTargetFormForHost(null)) { ...targetFormTpl... }`,
     placed once, immediately after the `@for (t of childrenOf(null))` loop at
     the very top of Public Space (`publicTargetNodeTpl` itself, `:436-463`,
     has **no** such conditional block at all — confirmed by reading the whole
     template).
  2. `html:317-320` — `@if (isTargetFormForHost(host.id)) { ... }`, inside a
     host's `.hier-targets-subsection`.
  `isTargetFormForHost(hostId)` (`ts:790-792`) is `targetForm.active &&
  targetForm.hostId === hostId`. **This means every existing Add or Edit
  session in Public Space — regardless of how deep the target is nested —
  renders the form at the fixed top-of-Public-Space slot, never next to the
  clicked node.** This is true for Edit today already, confirmed by reading
  the template; it is not something this change introduces, but it is directly
  relevant to where a `+`-opened Add form would render if no new slot is
  added — it would pop up detached from the device the GM just clicked,
  exactly the "surprising location" risk flagged in the task.
- **`.tc-info-row` (`target-card.component.html:4-37`, CSS
  `target-card.component.css:23-45`)** is confirmed, by reading the CSS
  comments left by the mark-propagation-highlight change, to already be at its
  layout limit: adding the marker glyph there (`.tc-prop-marker`, ~12.5px
  measured) was found to newly truncate device names in the 7-8 character
  range at the narrowest tested pane width (354px,
  `matrix-port-rules-correctness.spec.ts`'s `EFFECTIVE_NARROW_WIDTH_PX`). That
  cost was accepted by Xavier as unavoidable for a cue that has to exist
  (`target-card.component.css:283-332`, N-9). Any new **permanent, in-flow**
  addition to that row (an icon button is wider than the marker glyph — a
  `.tc-icon-btn`, `target-card.component.css:91-99`, is `padding: 0.05rem
  0.3rem` plus a `0.2rem` gap in `.tc-actions`, `:84-89` — roughly double the
  marker's measured footprint) will worsen the same truncation, on a strictly
  larger population of rows (every device, not only propagation destinations).
- **`.hier-editor` (`hierarchy-editor.component.css:3-12`)** is `overflow-y:
  auto; max-height: 500px` — the tree scrolls. The mark-propagation-highlight
  spec's Open Decision 2 (`briefs/mark-propagation-highlight-spec.md:1434-
  1452`) deliberately rejected auto-scroll-on-picker-open: it moves the ✓/✕
  buttons out from under the GM's hand mid-combat, a worse failure than the
  scrolling-out-of-view problem it fixes. That reasoning is specific to a
  highlight appearing on an ancestor the GM did **not** click directly. It
  does not transfer unchanged to this feature if the new Add form is rendered
  inline at the clicked node (see "Proposed approach") — in that case the form
  appears exactly where the GM's pointer already is, and no scrolling of any
  kind is proposed or needed.
- **One-picker-at-a-time (`closeAllPickersExcept()`, `ts:317-326`)** governs
  only the +Mark picker (card and host). Grepped every call site of
  `openEditTarget`/`openAddTarget`: neither calls `closeAllPickersExcept()` or
  `onPropagationHighlightChange(null)`. Confirmed: opening Edit today does
  **not** close an open +Mark picker anywhere in the tree, including one open
  on the very card being edited. `TargetCardComponent.ngOnChanges()`'s
  `changes["target"]` guard (`target-card.component.ts:201-204`) only fires
  when the `[target]` input's object reference changes, which opening Edit
  does not do.

## Affected paths

Exhaustive. Searched `src/` for every call site of `openAddTarget`,
`TargetFormState`, `BLANK_TARGET_FORM`, `canHaveParent`, `isTargetFormForHost`,
`publicTargetNodeTpl`, `.tc-actions`, and `TargetCardComponent`'s `@Output`s.

### `hierarchy-editor.component.ts`

- **`TargetFormState`** (`:35-65`) — add `addChildOfId: string | null`. Purely
  a render-anchor flag, distinct from `parentTargetId` (the buffered,
  GM-editable commit value): it records *where the form should render*, fixed
  at open time, and must not move if the GM subsequently changes the Parent
  dropdown mid-session.
- **`BLANK_TARGET_FORM`** (`:73-78`) — add `addChildOfId: null`.
- **`openAddTarget()`** (`:485-495`) — unchanged in behaviour; the spread from
  `BLANK_TARGET_FORM` already yields `addChildOfId: null` for both existing
  call sites (Loose Device, host per-type buttons), preserving their current
  render slot exactly.
- **`openEditTarget()`** (`:497-510`) — unchanged; `addChildOfId` stays `null`
  via the object literal not setting it, so Edit's existing top-of-Public-
  Space placement is untouched (confirmed this is the deliberate boundary —
  see "Request", not in scope).
- **New method `openAddChildTarget(parentTarget: MatrixTarget): void`** —
  called only from `publicTargetNodeTpl`. Builds the form the same way
  `openAddTarget(null, 'device')` does, plus seeds both `parentTargetId:
  parentTarget.id` (pre-fills the existing Parent dropdown, editable, matching
  the request's decision that the dropdown stays the correction tool) and
  `addChildOfId: parentTarget.id` (the render anchor). Concretely:
  ```ts
  openAddChildTarget(parentTarget: MatrixTarget): void {
    this.targetForm = {
      ...BLANK_TARGET_FORM,
      active: true,
      hostId: null,
      type: "device",
      visibility: "hidden",
      parentTargetId: parentTarget.id,
      addChildOfId: parentTarget.id
    };
    this.hostForm = { ...BLANK_HOST_FORM };
  }
  ```
  Reuses `BLANK_TARGET_FORM` rather than duplicating `openAddTarget()`'s body,
  so both share one source of truth for "what a fresh Add session defaults
  to."
- **`closeTargetForm()`** (`:512-514`) and **`saveTargetForm()`**'s final reset
  (`:637`) both already do `this.targetForm = { ...BLANK_TARGET_FORM }` —
  `addChildOfId` resets to `null` for free, no additional code needed.
- **No change to `canHaveParent()`, `parentOptionsFor()`,
  `parentOptionsForNewTarget()`, `setParent()`, `clearParent()`,
  `commitParentField()`, or `saveTargetForm()`'s validation logic.** The +
  control only changes how the form is *opened* (which fields are pre-seeded)
  and *rendered* (which template slot it appears in); it commits through the
  exact same `saveTargetForm()` path as every other Add, including the
  self/descendant cycle guard (`:596-601`) and the `canHaveParent()`-gated
  parent commit (`:1127-1133`).

### `hierarchy-editor.component.html`

- **`publicTargetNodeTpl`** (`:436-463`):
  - **ADD**, as a sibling to `<app-target-card>` and before the `@for (child
    of childrenOf(t.id))` recursion: a `+` control, gated `@if
    (canHaveParent(t))`, calling `openAddChildTarget(t)`. Per Open Decision 1
    below, the recommended placement is **inside** `TargetCardComponent`'s own
    `.tc-actions` group (Option A) — in which case this template instead
    passes a new `[canAddChild]="canHaveParent(t)"` input into
    `<app-target-card>` and listens `(addChild)="openAddChildTarget(t)"`,
    rather than adding a separate element here. See "Proposed approach" for
    the full wiring under each option.
  - **ADD**, immediately after wherever the `+` sits: a new render slot for
    the child-add form, gated `@if (isTargetFormForHost(null) &&
    targetForm.addChildOfId === t.id)`, using the same `targetFormTpl`
    (`*ngTemplateOutlet="targetFormTpl; context: { $implicit: null }"`) the
    other two slots already use.
- **Top-level Public Space slot** (`:45-47`) — **no code change required**:
  its existing gate `isTargetFormForHost(null)` already only matches when
  `targetForm.active && targetForm.hostId === null`, and since neither
  `openAddTarget()` nor `openEditTarget()` ever sets `addChildOfId`, this slot
  keeps rendering for Loose Device adds and all Edits exactly as it does
  today. (Considered adding an explicit `&& !targetForm.addChildOfId` guard
  here for belt-and-suspenders clarity; recommended as a defensive addition,
  since a session opened via `openAddChildTarget()` should render **only**
  once, at the node-specific slot, never simultaneously at the top slot too —
  without this guard, both slots' `@if` conditions could theoretically both be
  satisfied if a future change ever touches `hostId`/`addChildOfId` together
  incorrectly. Add `@if (isTargetFormForHost(null) &&
  !targetForm.addChildOfId)` here.)
- **Host subsection slot** (`:317-320`) — no change; `addChildOfId` is
  irrelevant there since `isTargetFormForHost(host.id)` never matches a
  session opened via `openAddChildTarget()` (which always has `hostId ===
  null`).

### `hierarchy-editor.component.css`

- If Option A (control lives inside the card, see below): no change needed
  here.
- If Option B (new always-visible row, mirroring the removed
  `.hier-parent-row`): add `.hier-add-child-row` / `.hier-add-child-btn`,
  following the same visual family as the form's own `.hier-form-row` /
  `.hier-btn-save` or the removed `.hier-parent-row` (recommend reusing that
  exact shape, since it is a proven, already-styled pattern for "a small
  action row under a device card").

### `target-card.component.ts` (only if Option A is chosen)

- **New `@Input() canAddChild = false`** — mirrors `propagationDestination`'s
  shape (parent-computed, defaulted safely for the host-rendering call site
  which never sets it).
- **New `@Output() readonly addChild = new EventEmitter<void>()`.**
- No other change — the card does not need to know *why* it can add a child,
  only whether to show the control; the parent (`HierarchyEditorComponent`)
  owns `canHaveParent()` and the actual routing.

### `target-card.component.html` (only if Option A is chosen)

- Inside `.tc-actions` (`:29-36`), alongside the existing Edit/Delete
  buttons: add `@if (canAddChild) { <button type="button" class="tc-icon-btn"
  (click)="addChild.emit()" title="Add child device"><i class="fas
  fa-plus"></i></button> }`. Reuses the existing `.tc-icon-btn` class exactly
  — no new CSS needed under Option A.

### `hierarchy-editor.component.html` — host subsection card instantiation
(`:301-315`)

- **No change.** `canAddChild` defaults to `false`; this call site never sets
  it, so a host-nested device (which reaches this instantiation, never
  `publicTargetNodeTpl`'s) never renders the `+`, confirming Determination 3
  structurally rather than by a second explicit check.

### `src/scenarios/matrix-port-rules-correctness.spec.ts`

Searched for every existing test touching `openAddTarget`, `addChildOfId`,
`.tc-actions`, `canHaveParent`, and `TargetFormState`. None of the existing
tests reference the new symbols (they don't exist yet); the four existing
`openAddTarget` call sites (`:735, 1187, 1196, 1221, 1310`) are unaffected —
`openAddTarget()`'s signature and behaviour are unchanged. New tests required
(see "Scenarios to survive").

### `MatrixTarget.ts`

No change. `parentTargetId`'s scoping doc comment (`:85-89`) already covers
this case; the + control writes through the same `saveTargetForm()` →
`commitParentField()` → `setParent()` path as every other Save, so no new
write path is introduced there.

## Proposed approach

1. **Resolve Open Decision 1 (where the + control physically lives) before
   writing any code** — it determines whether `TargetCardComponent` gains a
   new `@Input`/`@Output` pair (Option A) or stays untouched while
   `hierarchy-editor.component.html`/`.css` gain a new row (Option B).
2. Add `addChildOfId` to `TargetFormState`/`BLANK_TARGET_FORM`.
3. Add `openAddChildTarget(parentTarget: MatrixTarget)` to
   `HierarchyEditorComponent`, exactly as specified in "Affected paths."
4. Wire the `+` control per whichever option Open Decision 1 settles, gated on
   `canHaveParent(t)` — the existing, already-correct gate; do not write a
   second copy of that condition.
5. Add the node-specific form-render slot inside `publicTargetNodeTpl`, gated
   on `targetForm.addChildOfId === t.id`. Add the defensive `!
   targetForm.addChildOfId` guard to the top-level slot as specified.
6. Do not touch `canHaveParent()`, `parentOptionsFor()`,
   `parentOptionsForNewTarget()`, `setParent()`, `clearParent()`,
   `commitParentField()`, the cycle guard in `saveTargetForm()`, or
   `closeAllPickersExcept()` — all are reused unchanged, by design (single
   choke points already established by the preceding change stay single choke
   points).
7. If Option A: measure the actual pixel cost of the new icon button in
   `.tc-actions` at the same narrow-pane width the marker glyph was measured
   at (`EFFECTIVE_NARROW_WIDTH_PX`, 354px), the same way N-9 measured the
   marker (`target-card.component.css:304-332`). Record the result in a
   regression test alongside N-9's, following its exact pattern (name-length
   sweep, not a single point measurement) — do not assume the cost is
   acceptable without measuring it.

## Scope classification

- **TRACK** — the parent/child containment relationship the + button builds
  is already an approved TRACK item (`SCOPE.md` propagation bullet, Decision
  7b). This change adds a faster UI path onto it; no new state, no new
  computation.
- **GM RESOLVES** — nothing new. The GM still decides which device parents
  which; the + button only changes the order of clicks.
- **OUT OF SCOPE** — nothing new introduced by this change.

**SCOPE QUESTION** — none. This change does not ask `SCOPE.md` to cover
anything it doesn't already cover; the open decisions below are UI-behaviour
questions, not boundary questions.

## Size check

**Small — comfortably under a day**, once Open Decision 1 is answered. One new
component method, one new `TargetFormState` field, one new template slot, and
(if Option A) one new `@Input`/`@Output` pair on an already-existing shared
component. The bulk of the work is the new tests (roughly 6-8), not the
production code. Do not split further.

## Acceptance criteria

Written assuming **Open Decision 1 = Option A** (in `.tc-actions`) and **Open
Decision 2 = inline rendering at the clicked node** (both recommended
defaults below). If Option B is chosen instead, replace AC-1/AC-2 with the
Option-B variants noted inline.

1. A public-space device target (`type: "device"`, `context: "public"`) with
   no host renders a visible `+`-labelled control inside its card's action
   area (`.tc-actions .tc-icon-btn[title="Add child device"]` under Option A;
   `.hier-add-child-btn` under Option B), asserted through rendered DOM
   (`expectVisibleText`/direct `querySelector`, not a component field).
2. A `file`, `persona`, or `ic` target — of any context — renders **no** such
   control (`expectAbsent`).
3. A `device` target whose `context` is `"host"` (sitting inside a host, not
   on the open grid) renders **no** such control, even though its `type` is
   `"device"` (`expectAbsent`), confirming `canHaveParent()`'s existing
   `context` gate is reused rather than re-derived.
4. Clicking the `+` on a device `D` opens the Add form with `type` defaulted
   to `"device"`, `hostId` `null`, and the Parent `<select>`'s rendered value
   equal to `D`'s name (pre-filled from `parentTargetId`), asserted via DOM
   (`expectVisibleText` on the selected `<option>`, not `targetForm` directly).
5. The Add form opened via `+` on device `D` renders **inside** `D`'s own tree
   node (as a descendant of the same `.hier-public-node` element `D`'s card is
   in), not at the top of the Public Space list — asserted by DOM containment
   (`D`'s `.hier-public-node` element `.contains()`s the rendered
   `.hier-form-target` element).
6. Saving that form with a name creates a new device whose `parentTargetId ===
   D.id`, and the tree, on the next render, shows it nested directly under `D`
   at `depth + 1` relative to `D`.
7. Clicking Cancel on a form opened via `+` discards it with no target
   created, exactly like Cancel on any other Add session (`saveTargetForm()`
   is never called; `matrixState.addTarget()` is never called).
8. Changing the pre-filled Parent dropdown to a different device `E` before
   Save results in the new device's `parentTargetId === E.id`, not `D.id` —
   confirming the dropdown stays genuinely editable after being pre-seeded,
   and the form's render *position* (still under `D`, per AC-5) does not
   follow the edited dropdown value.
9. Opening a `+`-seeded Add form on device `D`, then separately clicking Edit
   on an unrelated, already-existing device `X` elsewhere in the tree, closes
   the `+`-opened form with no target created (matches existing behaviour:
   only one target form can be `active` at a time — confirmed by reading
   `targetForm`'s single-instance shape, not new behaviour this change adds,
   but worth pinning down given the new entry point).
10. The existing top-of-Public-Space Add ("+ Loose Device") and every existing
    Edit session continue to render at the fixed top-of-Public-Space slot,
    unchanged — regression coverage for the defensive `!targetForm
    .addChildOfId` guard added to that slot.

## Regression risk

| Risk | Covered by |
|---|---|
| The `+` control leaks onto a host-nested device or a non-device type | AC-2, AC-3 |
| The Add-form render-anchor mechanism (`addChildOfId`) accidentally changes where Edit or Loose-Device-Add render | AC-10 |
| The new icon button in `.tc-actions` (Option A) worsens the already-measured N-9 name-truncation regression beyond an acceptable width | New N-9-style measurement test (Proposed approach §7) — must be run, not assumed |
| The self/descendant cycle guard is bypassed for a child created via `+` | No new guard logic is introduced — `saveTargetForm()`'s existing guard (`:596-601`) runs unchanged for this path; add one test confirming a `+`-created child still goes through it (functionally redundant with existing parent-picker coverage, but confirms the new entry point doesn't bypass the choke point) |
| A `+`-opened form left open while an unrelated +Mark picker stays armed elsewhere, and a stray tap places an unintended mark | Not mitigated by this change (matches existing Edit behaviour) — flagged to Xavier in the brief as a residual, pre-existing risk this change does not worsen but also does not fix |

## Scenarios to survive

1. **Ordinary — building a chain top-down.** GM has `drone` (device, no
   parent) already in Public Space. GM clicks `+` on `drone`, types "Mount",
   clicks Save. Expected: a new device `mount` exists with `parentTargetId ===
   drone.id`, rendered nested under `drone`. GM then clicks `+` on `mount`,
   types "Smartgun", clicks Save. Expected: `smartgun.parentTargetId ===
   mount.id`, rendered nested two levels under `drone`. No step at any point
   required opening a separately-nested Edit screen.
2. **Edge case — changing the pre-filled parent before saving.** GM clicks
   `+` on `drone`, then, before saving, changes the Parent dropdown from
   `drone` to an unrelated existing device `spare-mount`, then clicks Save.
   Expected: the new device's `parentTargetId === spare-mount.id`, not
   `drone.id` — the pre-fill is a starting suggestion, not a lock.
3. **Undo — Cancel discards everything.** GM clicks `+` on `drone`, types a
   name, then clicks Cancel instead of Save. Expected: no new target exists
   anywhere in state; reopening `+` on `drone` shows a fresh blank form, not
   the discarded name.
4. **Cycle safety carried through the new entry point.** GM has `A`
   (unparented) and `B` (parented to `A`). GM clicks `+` on `B` and saves a
   new child `C` under it. GM then opens Edit on `A` and tries to set `A`'s
   parent to `C` — this must still be rejected by the existing cycle guard
   exactly as it would be for a child created any other way, confirming the
   `+` entry point introduces no bypass.
5. **Live at the table, mid-combat.** Combat is running, players waiting. The
   GM needs to add a spare mount under an already-tracked drone because a
   player just described plugging one in. GM taps `+` on the drone (visible
   without scrolling, since the drone's card was already on screen), the form
   opens directly beneath it, GM types "Spare Mount," taps Save. Expected: the
   new device appears immediately under the drone, in the GM's current
   viewport, with no scroll and no extra navigation — faster than today's
   create-then-Edit-then-set-Parent sequence by exactly the steps this change
   removes.

## Open decisions

1. **Where does the `+` control physically live?**
   Recommended default: **Option A — inside `TargetCardComponent`'s
   `.tc-actions` group, in-flow, always visible for a device in public
   context.** Reuses an established pattern (`.tc-icon-btn`), works
   identically on touch and desktop, and costs a bounded, measurable amount of
   row width comparable to a cost already accepted once for the propagation
   marker (N-9). Alternatives: **Option B**, a new always-visible row below
   the card (zero width risk, but reproduces the exact vertical-clutter cost
   the immediately preceding change removed, on the identical subset of
   devices); **Option C**, a hover/focus-revealed, zero-footprint control
   (best on desktop, but "hover" has no touchscreen equivalent and no existing
   control in this app depends on hover-to-reveal — highest implementation
   risk, not recommended without a specific need for zero permanent cost).
2. **Where does the new Add form render — inline at the clicked node, or at
   the existing fixed top-of-Public-Space slot (matching Edit's current
   placement)?**
   Recommended default: **inline at the clicked node**, per "Proposed
   approach." This is the reason the `addChildOfId` render-anchor field exists
   at all; without it, the `+` control's main value (build the chain in place,
   without hunting for the form) is lost, and the mark-propagation spec's
   auto-scroll objection would become directly relevant again (the form could
   land off-screen in a long tree). Deliberately **not** extending this same
   anchor mechanism to Edit — that is a separate, pre-existing UX gap, out of
   scope for this request.
3. **Should the width-cost measurement (Proposed approach §7) block shipping
   Option A, or just be recorded?**
   Recommended default: **measure first, then decide** — if the measured
   truncation turns out to affect names shorter than the 7-8 character range
   already accepted for the marker, escalate back to Xavier with the number
   before shipping Option A; do not ship on the assumption alone.
