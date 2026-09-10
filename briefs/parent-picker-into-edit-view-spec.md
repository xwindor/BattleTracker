# Move the Parent picker from the hierarchy tree node into the target edit view

## Request

Relocate the always-visible per-device "Parent" picker in the Public Space
hierarchy tree into the shared target Add/Edit form, hidden by default behind
Edit. **Not in scope:** any change to propagation mechanics, the 3-mark cap,
the device-only gate on which targets can have a parent at all, the
mark-highlight feature (`briefs/mark-propagation-highlight-spec.md`), or the
host `+Mark` control's known gaps.

This does not move any `SCOPE.md` boundary — the parent relationship is
already an approved TRACK item (`SCOPE.md` propagation bullet, lines 30-47;
Decision 7b, 2026-09-02). This is a UI relocation of an existing, already-in-
scope control, not a new mechanic.

## Current behaviour

- `hierarchy-editor.component.html:416-429` — `@if (canHaveParent(t))` wraps
  `.hier-parent-row`, rendered **unconditionally for every device target**,
  inside `#publicTargetNodeTpl` (`:391-435`). It sits as a **sibling block
  below** `<app-target-card>` (`:395-407`), **not** inside it, and **above**
  the `@for (child of childrenOf(t.id))` recursion (`:431-433`). Confirmed via
  `hierarchy-editor.component.css:830-835` — `.hier-parent-row { display:
  flex; ... }` is a block-level row of its own, not a flex item riding inside
  `.tc-info-row` (`target-card.component.html:4-37`), which is the actual
  cramped row the mark-highlight redesign fought. **The request's stated
  motivation (freeing the cramped row's width) is factually off** —
  `.hier-parent-row` is a separate row below the card; removing it frees
  vertical space in the tree, not width in `.tc-info-row`. The clutter/space
  argument for doing this still stands on its own; only the width claim is
  wrong.
- `hierarchy-editor.component.ts:835-849` — `parentOptionsFor(target)`
  (excludes self and all descendants via `descendantIds()`, `:805-818`, and
  filters `state.publicTargets` to `type === "device"` only) and
  `canHaveParent(target)` (`return target.type === "device"`, `:847-849`).
  **`canHaveParent()` checks only `type`, never `context`.** It is currently
  only ever invoked from inside `publicTargetNodeTpl`, which only renders
  `context: "public"` targets (`childrenOf`, `:800-802`, filters
  `state.publicTargets`), so this has never mattered. It will matter the
  moment the same gate is reused inside the shared form (see "Affected
  paths" and Open Decision 3).
- `hierarchy-editor.component.ts:851-862` — `setParent(target, parentId)`
  writes **immediately**: empty string delegates to `clearParent()`
  (`:852-855`); otherwise it re-checks `parentOptionsFor(target).some(t => t.id
  === parentId)` as a self/descendant guard (`:856`, comment "self/descendant
  guard") before calling `matrixState.updateTarget(target, { parentTargetId:
  parentId })` (`:857`) — no buffering, no Save/Cancel step.
  `clearParent()` (`:860-862`) writes `parentTargetId: undefined` the same
  way.
- `hierarchy-editor.component.html:419` — `(ngModelChange)="setParent(t,
  $event)"` confirms the live-write binding.
- **The target Add/Edit form is a single shared template**
  (`#targetFormTpl`, `hierarchy-editor.component.html:325-388`) used for both
  creating a new target and editing an existing one, for both public-space and
  host-nested targets, distinguished only by `targetForm.isEditing` and
  `targetForm.hostId`. It has no Parent field today. It **buffers**: all
  fields write to `targetForm` (a plain object,
  `hierarchy-editor.component.ts:35-46` `TargetFormState`, instantiated per-
  open at `:417-424` `openAddTarget()` / `:429-440` `openEditTarget()`) and
  commit only in `saveTargetForm()` (`:508-545`), which calls
  `matrixState.updateTarget()` (edit branch, `:521-529`) or constructs a new
  `MatrixTarget` and calls `matrixState.addTarget()` (create branch,
  `:530-543`). `closeTargetForm()` (`:442-444`) discards the buffer with no
  write at all.
- **Creation never sets a parent today.** `openAddTarget()`
  (`:417-427`) seeds `BLANK_TARGET_FORM` (`:54-58`), which has no
  `parentTargetId` field at all; `saveTargetForm()`'s create branch
  (`:530-543`) constructs the new `MatrixTarget` without passing
  `parentTargetId`, so it defaults to `undefined`
  (`MatrixTarget.ts:119-145`, constructor default at `:144`). A newly created
  device can only be parented afterwards, via the inline row this change is
  removing. Confirmed by reading both the form and the constructor — not
  assumed.
- `MatrixTarget.ts:85-89` — `parentTargetId`'s doc comment states it is
  "Scoped to `context === 'public'` targets only — a target already inside a
  host uses `linkedHostId` for its containment, not this field." Confirmed
  the field itself carries no runtime enforcement of that scoping; it is
  enforced today only by `canHaveParent()`/`parentOptionsFor()` being called
  exclusively from the public-tree template.
- `saveTargetForm()` (`:508-545`) does **not** currently write
  `parentTargetId` on either the create or edit branch — it is entirely
  untouched by the existing form, confirming the two systems (buffered form,
  live-write parent picker) have never previously interacted.

## Affected paths

Exhaustive — searched `src/` for every consumer of `setParent`,
`clearParent`, `parentOptionsFor`, `canHaveParent`, `.hier-parent-row`, and
`.hier-parent-select`. Five files match in total:
`hierarchy-editor.component.ts`, `hierarchy-editor.component.html`,
`hierarchy-editor.component.css`, `MatrixTarget.ts` (doc comment / field
definition only, no logic to change), and
`src/scenarios/matrix-port-rules-correctness.spec.ts` (tests). No other
component, service, or test references any of these four symbols or the two
CSS class names.

### `hierarchy-editor.component.html`

- **REMOVE** `:416-429` — the `@if (canHaveParent(t)) { .hier-parent-row ... }`
  block, including its `:409-415` doc comment (move the comment's substance,
  not its exact text, to wherever the new field's gate lives).
- **ADD**, inside `#targetFormTpl` (`:325-388`), a new form row for Parent.
  Placement: alongside the other type-conditional rows — the existing pattern
  is `@if (targetForm.type === 'device') { ... Device Rating ... }`
  (`:353-359`) and `@if (targetForm.type === 'persona') { ... Decker Link ...
  }` (`:361-371`). The new row should follow the same shape:
  `@if (targetForm.type === 'device' && targetForm.hostId === null) { ... }`
  — the `hostId === null` half of the gate is the fix for the `context`-blind
  gap identified above (see "Proposed approach" and Open Decision 3).
- The row's controls: a `<select>` bound to a **new buffered field**
  `targetForm.parentTargetId: string` (empty string = none), populated from a
  new options accessor (see below), plus a clear affordance equivalent to
  today's `✕` button — but since the field is buffered, "clear" here just
  means setting the select back to `""`, no separate button/method is
  strictly needed (recommend keeping the `✕` for parity with the existing UI
  vocabulary, wired to set the model to `""`, not to any service call).

### `hierarchy-editor.component.ts`

- **`TargetFormState`** (`:35-46`) — add `parentTargetId: string`.
- **`BLANK_TARGET_FORM`** (`:54-58`) — add `parentTargetId: ""`.
- **`openEditTarget(host, target)`** (`:429-440`) — add
  `parentTargetId: target.parentTargetId ?? ""` to the seeded object, so
  opening Edit shows the current parent.
- **`openAddTarget(host, type)`** (`:417-427`) — no change needed if Open
  Decision 2 (below) is answered "Edit only"; if answered "also in Add", it
  needs no seed value beyond the blank default, since a new target has no
  existing parent.
- **`saveTargetForm()`** (`:508-545`) — this is where the behaviour decision
  (live-write vs Save-buffered) actually lands in code:
  - **If Option A (buffer, commit on Save)**: both the edit branch
    (`:521-529`) and, if Open Decision 2 says yes, the create branch
    (`:530-543`) must pass `parentTargetId: f.parentTargetId || undefined` to
    `matrixState.updateTarget()` / the `new MatrixTarget({...})` constructor
    call — **but only after re-running the self/descendant guard** that
    `setParent()` currently runs inline (`:856`). Concretely: before building
    the update/construct payload, if `f.parentTargetId` is non-empty, check it
    is still present in `this.parentOptionsFor(f.target)` (edit branch only —
    a target being created has no id yet, so no self/descendant exclusion
    applies to the create branch). If it is no longer valid (state changed
    since the form opened — see Open Decision 3), silently drop the value
    (write `undefined`) rather than committing a broken pointer; do not throw
    or block the rest of the save.
  - **If Option B (keep live-write)**: `setParent(target, parentId)` and
    `clearParent(target)` (`:851-862`) are called directly from the new
    form control's `(ngModelChange)`/clear handler, exactly as they are today
    from the tree row — `targetForm.parentTargetId` would then be a
    **display-only mirror** kept in sync via `openEditTarget()`'s seed, not a
    field `saveTargetForm()` ever reads. `saveTargetForm()` itself needs no
    change under this option.
- **`canHaveParent(target)`** (`:847-849`) — **must gain a context check**
  regardless of which option is picked, because the new call site (inside
  `targetFormTpl`) is reachable for host-nested targets, unlike the old one.
  Change to `target.type === "device" && target.context === "public"`. This
  is a correctness fix forced by the relocation, not an optional extra — see
  Open Decision 3.
- **`parentOptionsFor(target)`** (`:835-839`) — unchanged in logic (already
  filters to `state.publicTargets`, which are inherently `context: "public"`),
  but its doc comment (`:820-834`) should note it is now also called from the
  edit form, not only the tree.
- A new small accessor is needed for the **create-flow** case if Open
  Decision 2 says yes: `parentOptionsFor()` takes a `MatrixTarget`, but a
  target being created doesn't have one yet. Either overload it to accept
  `null` (skip the self/descendant exclusion entirely, since a new target can
  have no descendants), or add a second method
  `parentOptionsForNewTarget(): MatrixTarget[]` that just returns
  `state.publicTargets.filter(t => t.type === "device")`. Recommend the
  second — keeps the self/descendant guard's contract on `parentOptionsFor`
  unchanged for its one existing caller pattern.

### `hierarchy-editor.component.css`

- `.hier-parent-row` / `.hier-parent-label` / `.hier-parent-select` /
  `.hier-parent-clear-btn` (`:830-863`) can stay as-is if the new field reuses
  the same class names inside the form (recommended, for visual consistency
  with the rest of `.hier-form-row`), or be renamed/merged into the
  `.hier-form-row` family used elsewhere in the form (`:331-380` in the HTML
  use `.hier-form-row`/`.hier-form-label`/`.hier-form-select`). Either is
  fine; pick one and do not leave both class families defined for the same
  control.

### `MatrixTarget.ts`

No code change. `parentTargetId`'s doc comment (`:85-89`) already states the
`context === "public"` scoping this change must now actively enforce in code
(previously enforced only by which template called `canHaveParent`).

### `src/scenarios/matrix-port-rules-correctness.spec.ts`

Searched for every test touching the four symbols and the two CSS classes.
Found:

1. **`:887` — "Decision 8: the rendered public-space tree does not show a
   Parent control for a file"** — queries
   `fixture.debugElement.queryAll(By.css('.hier-parent-row'))` directly
   against the tree and asserts `parentRows.length === 2` (one per device in
   that fixture). **This test breaks outright once `.hier-parent-row` is
   removed from the tree** — it will find zero rows regardless of file vs.
   device, so it needs rewriting to assert against the *form*: open Edit on
   the file and confirm no Parent field renders (or `canHaveParent` gates it
   out), open Edit on a device and confirm it does. This is a direct
   consequence of the move, not a possible side effect — flag it as
   guaranteed work, not a risk.
2. **`:820-825` "setParent() parents a target and childrenOf() reflects the
   nesting"**, **`:827-832` "clearParent() removes the parent link..."**,
   **`:834-838` "setParent() with an empty string clears the parent"** — call
   `component.setParent()`/`clearParent()` directly (not through the DOM).
   These survive **unchanged if Option B is picked** (methods keep existing
   behaviour/signature). **Under Option A**, these tests stop describing real
   GM-facing behaviour (the methods may no longer be reachable from any UI
   control) — decide whether to keep them as internal-API regression tests
   (recommended — `saveTargetForm()`'s buffered path should still route
   through `setParent`'s equivalent logic, ideally by having
   `saveTargetForm()` call `setParent`/`clearParent` internally when
   committing, so these tests keep exercising real code) or delete them in
   favour of new form-driven tests.
3. **`:840-844` "parentOptionsFor() excludes the target itself"**, **`:846-850`
   "...excludes a target's own descendants..."**, **`:852-856` "setParent()
   silently refuses to parent a target under its own descendant..."** —
   unchanged either way; these test `parentOptionsFor`/`setParent` directly
   and don't touch the DOM. Must keep passing under both options — if Option
   A moves the guard into `saveTargetForm()`, add an equivalent DOM/form-level
   test alongside these, don't replace them (the direct-method tests remain
   the fast, precise regression coverage; the form-level test is the
   new "did I actually wire this up" check).
4. **`:862-871` "Decision 8: parentOptionsFor() excludes non-device targets"**
   and **`:873-880` "Decision 8: canHaveParent() is true only for a device
   target"** — the second of these **must be extended, not just kept**: it
   currently only varies `type` (device/file/persona), never `context`. Add
   cases for a `context: "host"` device (expect `canHaveParent` **false**
   after the fix) to actually exercise the bug this move would otherwise
   introduce. This is new required coverage, not incidental — see "Proposed
   approach" and regression risk below.
5. **AC-10 geometry test, `:2117-2179` ("S1: opening +Mark on the smartgun
   highlights the mount and the drone...")**, specifically its `:2155-2166`
   block — measures `mtNode.getBoundingClientRect()` /
   `drNode.getBoundingClientRect()` (whole `.hier-public-node` elements) against
   `gnMarksRow` (`gnNode.querySelector('.tc-marks-row')`, a rect **inside**
   the card, above where `.hier-parent-row` used to sit). All assertions are
   relative (`toBeLessThanOrEqual`/`toBeGreaterThanOrEqual` containment, and
   `left` ordering) — none pin an absolute height or position. Removing
   `.hier-parent-row` shrinks `mtNode`'s and `drNode`'s height, but since `gn`
   remains structurally nested inside both, containment is preserved.
   **Expected to keep passing unchanged.** Must still be run after the change
   to confirm — not merely assumed.
6. **AC-13 layout-neutrality test, `:2665-2833` ("AC-13: opening the picker
   changes no .hier-public-node or .tc-info-row geometry anywhere in the
   tree...")** — queries `.hier-public-node, .tc-info-row, .hier-host-node,
   .hier-host-header` (`:2698-2699`, `:2706-2707`, `:2795-2796`,
   `:2810-2811`) — **`.hier-parent-row` is not in this selector list**, so its
   removal doesn't change which elements are measured. The test compares
   "before" and "after" snapshots of the **same** post-change DOM structure
   (both snapshots are taken after the Parent row is already gone), so the
   comparison is still internally consistent. **Expected to keep passing
   unchanged**, for the same reason the request itself gives (relative, not
   absolute) — but, as with AC-10, this must be confirmed by actually running
   it, not assumed from reading alone.
7. **Grep confirms no other test references `.hier-parent-row`,
   `.hier-parent-select`, or `.hier-parent-clear-btn`.**

## Proposed approach

1. **Resolve Open Decision 1 (live-write vs. Save-buffered) before writing
   any code** — it changes which of the above test groups need rewriting vs.
   merely re-running, and changes `saveTargetForm()`'s shape.
2. Add `parentTargetId: string` to `TargetFormState` and seed it from
   `openEditTarget()`.
3. Fix `canHaveParent()` to check `context === "public"` as well as
   `type === "device"` — required regardless of which option is picked,
   because the shared form is now reachable for host-nested targets. Add the
   new test case identified above (item 4) to actually pin this down.
4. Add the Parent field to `#targetFormTpl`, gated on
   `targetForm.type === 'device' && targetForm.hostId === null` (the
   `hostId === null` half stands in for "context === public" at the form
   level, since a target being edited/created inside a host always has
   `hostId` set to that host's id).
5. Remove `.hier-parent-row` and its guard from `publicTargetNodeTpl`.
6. If Option A: route the commit through the **same guard `setParent()`
   already runs** — either by having `saveTargetForm()` call
   `this.setParent(f.target, f.parentTargetId)` / `this.clearParent(f.target)`
   as its last step for the parent half of the write (reusing the existing
   guarded methods, recommended — keeps one choke point for the
   self/descendant check), or by inlining the same `parentOptionsFor(...)
   .some(...)` check directly in `saveTargetForm()`. **Do not duplicate the
   guard logic in two places** — one of these two shapes, not both.
7. If Open Decision 2 says the create form should also offer Parent: add
   `parentOptionsForNewTarget()` (or the null-accepting overload) and wire
   the same field into the create branch, gated the same way.
8. Rewrite test `:882-891` against the form instead of the tree. Extend test
   `:873-880`. Run the full `matrix-port-rules-correctness.spec.ts` suite and
   confirm AC-10 (`:2117-2179`) and AC-13 (`:2665-2833`) pass unchanged before
   concluding they're unaffected — do not skip this step on the strength of
   the "relative not absolute" reasoning alone.

## Scope classification

- **TRACK** — the parent/child containment relationship itself, and the
  GM's ability to view and change it. Already an approved TRACK item
  (`SCOPE.md` propagation bullet; Decision 7b). This change only relocates
  the control; it adds no new state and computes nothing new.
- **GM RESOLVES** — nothing new. The GM already decides which icon parents
  which; that doesn't change.
- **OUT OF SCOPE** — nothing new introduced by this change.

**SCOPE QUESTION** — none beyond the two Open Decisions below, which are
implementation-behaviour questions, not boundary questions. This change does
not ask `SCOPE.md` to cover anything it doesn't already cover.

## Size check

Small — well under a day of implementation once Open Decision 1 is answered.
Scope is one template, one component class, and a handful of existing tests
plus 1-2 new ones. Do not split further; splitting "move the control" from
"decide how it commits" would ship a visibly inconsistent form.

## Acceptance criteria

Written for **Option A (Save-buffered)**, the recommended default. If Xavier
picks Option B, replace AC-3/AC-4/AC-8 below with the Option-B variants noted
inline.

1. The Public Space tree renders no `.hier-parent-row` element anywhere,
   under any fixture.
2. Opening Edit on a public-space device target shows a Parent field whose
   current value matches that target's `parentTargetId` (or "— None —" if
   unset).
3. Changing the Parent field's value and clicking Cancel leaves the target's
   `parentTargetId` unchanged. *(Option B variant: Cancel still leaves
   `parentTargetId` changed, matching today's inline behaviour — if this is
   what's chosen, the brief's plain-language description of Option B's
   downside must be shown to be true, not merely asserted.)*
4. Changing the Parent field's value and clicking Save updates the target's
   `parentTargetId` to the new value, and the tree re-nests it under the new
   parent on the next render.
5. Opening Edit on a `file`, `persona`, or `ic` target shows no Parent field.
6. Opening Edit on a `device` target whose `context` is `"host"` (i.e., a
   device sitting inside a host, not on the open grid) shows no Parent
   field, even though its `type` is `"device"`.
7. `parentOptionsFor(target)` never includes `target` itself or any of its
   current descendants, called from the edit-form code path exactly as it
   does today from the tree code path.
8. **Superseded 2026-09-09 (Xavier: "a rejected re-parent must say so").**
   The version of this criterion below replaces the paragraph that used to
   sit here, which read: "Attempting to save a Parent selection that would
   create a cycle ... results in the target's `parentTargetId` being left
   unset (or unchanged) rather than a cycle being written — the save
   otherwise proceeds normally for the target's other fields." That
   silent-drop behaviour reviewed as a real defect: nothing told the GM the
   choice didn't take, the form closed exactly as it would on success, and
   this app has no undo — a GM who doesn't separately check the tree can
   walk away believing a re-parent worked when it did not.

   **Current criterion:** when the chosen parent fails the self/descendant
   guard at Save time, the form shows an inline message in plain language
   (e.g. `Can't parent this under one of its own children.`), stays open so
   the GM can pick a different parent or clear the field, and blocks the
   **entire** save — nothing commits, not even the target's other fields
   (name, type, visibility, etc.), so there is no partial write the GM can't
   see. The message clears the moment the GM changes the Parent selection or
   reopens the form. This guard is the self/descendant cycle check only — a
   parent that has simply been **deleted** from state since the form opened
   (the option list going stale, not an impossible nesting) is a different,
   more benign case and still degrades silently to unparented, exactly as
   this criterion originally described; it does not raise the message.
9. Creating a new device target (Add flow) results in `parentTargetId ===
   undefined` unless Open Decision 2 is answered "yes", in which case it
   matches whatever the GM selected in the Add form's Parent field.
10. Every existing test in "Affected paths" §`matrix-port-rules-correctness
    .spec.ts` items 2-6 passes, either unchanged or in its rewritten form as
    specified there.

## Regression risk

| Risk | Covered by |
|---|---|
| `canHaveParent()`'s missing `context` check ships a Parent field on a host-nested device | New test extending `:873-880` (item 4 above); AC-6 |
| The self/descendant cycle guard is silently dropped when moved off `setParent()`'s direct call | AC-7, AC-8; reuse `setParent()`/`clearParent()` internally rather than reimplementing the check (Proposed approach §6) |
| `:887`'s DOM-level test left checking a now-nonexistent element, passing vacuously (0 rows found regardless of type) | Must be rewritten, not merely left red-then-ignored; AC-1, AC-5 |
| AC-10/AC-13 geometry tests silently assumed safe without re-running | Explicit instruction in "Proposed approach" §8 to run, not assume |
| Buffered form silently loses the parent change on Cancel where GM expected the old instant-write behaviour (table muscle memory) | AC-3; flagged plainly to Xavier in the brief as the main trade-off of Option A |
| Create flow ends up silently unable to ever set a parent from Add if a later change adds a Parent field to Add without wiring `parentOptionsForNewTarget()` | AC-9 |

## Scenarios to survive

1. **Ordinary.** A GM has `drone` (device, no parent) and `mount` (device,
   parented to nothing). GM opens Edit on `mount`, sets Parent to `drone`,
   clicks Save. `mount.parentTargetId === drone.id`; the tree renders `mount`
   nested under `drone` on the next render.
2. **Edge case — type change invalidates the field mid-edit.** GM opens Edit
   on `mount` (currently parented to `drone`), changes Type from `device` to
   `file` in the same form session before saving. The Parent field
   disappears from the form (per AC-5's gate) but the buffered
   `parentTargetId` value is still sitting in `targetForm`. On Save, the
   target's `parentTargetId` must be cleared (not silently written despite
   the type no longer supporting it) — expected: `mount.parentTargetId ===
   undefined` after save, `mount.type === 'file'`.
3. **Undo — Cancel discards the change.** GM opens Edit on `mount` (currently
   unparented), sets Parent to `drone` in the form, then clicks Cancel
   instead of Save. Expected: `mount.parentTargetId` is still `undefined`;
   no write occurred; reopening Edit on `mount` shows "— None —" again.
4. **Sequential-edit cycle attempt.** GM has `A`
   (unparented) and `C` (parented to `A`). GM opens Edit on `A`, sets its
   Parent to `C`, clicks Save — this attempt must be rejected (silently
   dropped, per AC-8) because `C` is currently a descendant of `A`;
   `A.parentTargetId` stays `undefined`. GM then opens Edit on `C` instead,
   sets its Parent to some other unrelated device `B`, saves — succeeds,
   `C.parentTargetId === B.id`. GM now reopens Edit on `A` and sets its
   Parent to `C` again — this **now succeeds**, since `C` is no longer `A`'s
   ancestor once `C` was re-parented to `B`; the guard must be evaluated
   against live state at the second Save, not against whatever options were
   computed when the form was first opened.
5. **Live at the table, mid-combat.** Combat is running, players are waiting.
   The GM needs to move a smartgun from `mount` to a spare `mount2` because a
   drone got destroyed. GM clicks Edit on the smartgun's card, the form opens
   with Parent showing `mount`, GM picks `mount2` from the dropdown, clicks
   Save. Expected: this completes in the same number of steps as opening any
   other Edit action already takes at this table (no new failure mode,
   no confirmation dialog, no extra click beyond what Option A's cost already
   implies) — and the smartgun re-nests under `mount2` immediately after
   Save, visible to the GM before the next action is declared.

## Open decisions

1. **Live-write vs. Save-buffered commit for the Parent field.**
   Recommended default: **Save-buffered (Option A)**, consistent with every
   other field already in this form; the cost is one extra click for a
   control the request itself says is "almost never touched." Full
   reasoning and trade-off already laid out in the brief for Xavier.
2. **Should the create (Add) form also offer a Parent field, since it shares
   the same template as Edit?** Recommended default: **no, Edit only**,
   matching the literal request; smaller change, and adding it to Add is a
   clean, separately-sizeable follow-up (needs
   `parentOptionsForNewTarget()`, a new accessor, and its own test).
3. **`canHaveParent()`'s missing `context` gate.** Not really optional —
   this is a latent correctness gap the move exposes (see "Current
   behaviour"), and must be fixed as part of this change regardless of which
   answer Xavier gives to 1 or 2. Recommended default: fix it as described in
   "Proposed approach" §3, with the new test case specified in "Affected
   paths" item 4.
4. **Where exactly the self/descendant guard re-check lives under Option A**
   — inside `saveTargetForm()` directly, or by having `saveTargetForm()`
   delegate to `setParent()`/`clearParent()` for the parent half of the
   commit. Recommended default: **delegate to `setParent()`/`clearParent()`**
   — one choke point for the guard, and it keeps the existing direct-method
   tests (`:820-856`) exercising real, still-reachable code rather than
   becoming dead-code tests.
