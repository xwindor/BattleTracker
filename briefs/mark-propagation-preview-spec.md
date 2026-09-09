> **Superseded 2026-09-05** by `briefs/mark-propagation-highlight-spec.md`,
> which replaces the text preview specified here with a visual highlight on
> the hierarchy tree. Kept on disk as history only — do not build the
> text-preview design from this file.

# Mark propagation preview — technical specification

Companion plain-language brief: `briefs/mark-propagation-preview.md`.

## Request

Make `TargetCardComponent.propagationPreview` report the **complete** set of
icons `MatrixStateService.addMark()` will reach, and state per destination
whether the 3-mark cap (p. 236) will absorb the mark, matching the honesty
`AccessHostPanelComponent.applyLabel` already provides for the host panel.

**Not in scope:** any change to what propagation actually *does*; any reversal
of propagation on mark removal; any per-source mark ledger; any refusal or
blocking based on an ancestor's cap; the player view; the host row's own +Mark
control in `HierarchyEditorComponent`; `AccessHostPanelComponent.applyLabel`
itself.

**Scope boundary:** this request does **not** move the `SCOPE.md` boundary. It
is squarely inside "Making state visible at a glance" and refines the
already-approved propagation bullet (`SCOPE.md:33-39`). It does surface one
optional documentation change — see Open Decision 6.

## Current behaviour

Facts, read from the code.

### The preview getter

`src/app/matrix/target-card/target-card.component.ts:58-69`

- `:59` — returns `null` unless `target.type === "device"`.
- `:60-63` — **branch (a):** if `target.linkedHostId` is set and resolves in
  `matrixState.state.hosts`, **returns immediately** with
  `` `Also marks Host: ${host.name}` ``.
- `:64-67` — **branch (b):** if `target.context === "public"` and
  `target.parentTargetId` resolves in `matrixState.state.publicTargets` and that
  parent is `type === "device"`, returns `` `Also marks: ${parent.name}` ``.
- `:68` — otherwise `null`.

It performs **exactly one hop**, has no cycle guard, takes no decker, and reads
no mark counts.

### The walk it is supposed to describe

`src/app/services/matrix-state.service.ts:369-405`

`addMark(target, deckerId)` (`:369-375`):
1. `placeMark(target.marks, deckerId)` — returns `false` and aborts everything
   if the clicked icon is already at 3 (`:427-432`).
2. only if `target.type === "device"`, calls
   `propagateMarkUp(target, deckerId, new Set([target.id]))`.
3. fires `stateChange$` once.

`propagateMarkUp(target, deckerId, visited)` (`:377-405`), per node:
- `:383-388` **(a)** if `target.linkedHostId` resolves, `placeMark` on
  `host.marks`; on success set `host.propagatedMarks[deckerId] = true`. **No
  `return` — execution falls through to (b).** No type gate on the destination
  (a host has no `type`).
- `:395-404` **(b)** if `target.context === "public"`, `parentTargetId` is set
  and not in `visited`, and the resolved parent is `type === "device"`: add to
  `visited`, `placeMark` on `parent.marks`, flag `parent.propagatedMarks`, then
  **recurse into the parent** — which re-runs (a) *and* (b) for that parent.

So the walk is: unbounded up the open-grid parent chain, checking `linkedHostId`
at **every** level, with a visited-set cycle guard.

`placeMark` (`:427-432`) caps at 3 and returns whether it changed anything. Its
doc comment (`:407-426`) records the deliberate asymmetry the preview must be
able to express: the **clicked** icon at 3 is a hard stop (nothing propagates at
all), while an **ancestor** at 3 silently receives nothing *and the walk
continues past it*. Test: `matrix-port-rules-correctness.spec.ts:1934-1948`.

### The second consumer of the same string

`src/app/matrix/target-card/target-card.component.html:44-48` — the `×`
remove-mark button's `[title]`, a ternary that interpolates
`propagationPreview` into a past-tense sentence:

```
'Remove 1 mark from ' + deckerLabel(entry.deckerId)
  + ' — any mark this propagated upstream (' + propagationPreview
  + ') stays; remove it there if wrong'
```

This is **per-row** (`entry.deckerId`), while the picker at `:64-66` is
**per-selection** (`selectedDeckerId`). The two have different decker contexts
and different tenses.

### Related component state

- `:29-30` — `addMarkOpen`, `selectedDeckerId` (starts `""`, persists across
  opens).
- `:82-86` — `availableDeckers`: named deckers with `< 3` marks **on this
  target**.
- `:93-99` — `addMarkBlockedReason`: `"Pick a decker first"` when no selection;
  `` `${id} already holds the maximum 3 marks on this icon (p. 236)` `` at cap.
- `:113-118` — `openAddMark()`: seeds `selectedDeckerId` from
  `availableDeckers[0]` **only if `selectedDeckerId` is currently falsy**.
- `:120-125` — `confirmAddMark()`: re-checks the cap, calls
  `matrixState.addMark()`.
- The component uses Angular's **default** change detection (no
  `changeDetection` in the `@Component` decorator, `:11-17`).

### The precedent

`src/app/matrix/access-host-panel/access-host-panel.component.ts`
- `:98-103` `currentHostMarksForSelectedDecker`
- `:112-116` `marksThatWillLand` — `Math.min(3, current + n) - current`
- `:135-148` `applyLabel` — three shapes: all land / none land
  (`"Already at 3-mark cap, none will be added"`) / partial (`"Only N of M will
  land (3-mark cap)"`).

It is count-based because the host panel places N marks on **one** destination.
This feature is the transpose: **one** mark on N destinations. The consistency
being asked for is the *voice* (name the cap, don't promise what won't land),
not the identical sentence.

## Affected paths

### Must change

1. **`src/app/services/matrix-state.service.ts`** — add a read-only
   enumeration helper and route `propagateMarkUp()` through it (see Proposed
   approach). Touches `:369-375` (`addMark`), `:377-405` (`propagateMarkUp`).
2. **`src/app/matrix/target-card/target-card.component.ts:58-69`** — rewrite
   `propagationPreview`; add `propagationDestinationNames()`.
3. **`src/app/matrix/target-card/target-card.component.html:46-47`** — remove
   tooltip switches from `propagationPreview` to
   `propagationDestinationNames()`.
4. **`src/app/matrix/target-card/target-card.component.html:64-66`** — add a
   `[title]` carrying the full list to the preview span.
5. **`src/app/matrix/target-card/target-card.component.css:234-238`** — add
   `max-width` / wrapping constraints for `.tc-propagation-preview` (see
   Proposed approach, "Layout").
6. **`src/scenarios/matrix-port-rules-correctness.spec.ts`** — see Test changes.

### Same pattern, searched for and found, deliberately not changed

I searched the whole tree for every control that previews or labels a
mark-placement action. There are exactly **four**, and this is the complete
list:

- `TargetCardComponent.propagationPreview` — the subject.
- `TargetCardComponent.addMarkBlockedReason`
  (`target-card.component.ts:93-99`) — already cap-aware for the *clicked* icon.
  Correct; unchanged. It is what makes Open Decision 3's "suppress" behaviour
  safe.
- `AccessHostPanelComponent.applyLabel` / `marksThatWillLand`
  (`access-host-panel.component.ts:112-148`) — already cap-aware. Correctly says
  nothing about propagation: a host is the top of the chain and
  `addMarkToHost()` (`matrix-state.service.ts:206-212`) never propagates
  anywhere. **No change.**
- `HierarchyEditorComponent` host +Mark control
  (`hierarchy-editor.component.ts:411-433`,
  `hierarchy-editor.component.html:169-183`) — a third +Mark control with no
  preview, **no blocked-reason label at all**, and `hostAvailableDeckers()`
  (`:411-413`) does **not** filter nameless participants the way
  `TargetCardComponent.availableDeckers` (`:82-86`) does. Both are real gaps in
  the same family; neither is propagation-related (a host never propagates
  upward). **Not planned here** — see Scope Question below and brief question 5.

Searched and found nothing else: `grep` for `propagationPreview` and
`Also marks` across the repo returns only `RULINGS.md:1355-1356`, the two
component files, and the spec file. No player-view, server, or session-sync
consumer exists — `SharedMatrixTarget`
(`src/app/services/session-sync.service.ts:128-144`) carries neither
`parentTargetId` nor `linkedHostId`, so nothing downstream can reconstruct a
chain.

### Reachability finding: can branches (a) and (b) both fire for one target?

The request asks this explicitly. Answer: **not through any UI path today, but
the code must handle it and the preview must not `return` early.**

Evidence:
- Construction happens in exactly one non-test place,
  `hierarchy-editor.component.ts:258-268`, which sets `context: host ? "host" :
  "public"` (`:262`) and `linkedHostId: f.hostId ?? undefined` (`:266`)
  **together** — a `"public"` target never gets a `linkedHostId`.
- The edit branch (`:249-256`) writes neither `context` nor `linkedHostId`, and
  the target form (`hierarchy-editor.component.html:290-349`) has no host
  picker, so a target cannot be moved between host and public space.
- `parentTargetId` is only ever written by `setParent()` (`:517-524`) and
  cleared by `clearParent()` (`:526-528`) / `deleteTarget()` (`:298`). The
  control that reaches them lives only inside `publicTargetNodeTpl`
  (`hierarchy-editor.component.html:352-389`, guarded at `:371`), which is only
  instantiated for public targets, and `parentOptionsFor()` (`:501-505`) filters
  `state.publicTargets`.
- No restore path can produce it (`SharedMatrixTarget` carries neither field).

However: `MatrixStateService.updateTarget()` (`:268-275`) takes
`Partial<MatrixTarget>` and would happily write either field, and the existing
test at `matrix-port-rules-correctness.spec.ts:1950-1963` constructs exactly
this shape by hand.

**Required behaviour if it ever occurs:** the preview must list the host stop
**and then** continue into the parent chain, in that order — mirroring
`propagateMarkUp`'s fall-through at `:388`. Today's getter returns at `:62` and
would silently drop the whole parent chain. The enumerator below removes the
early return, so this is fixed structurally rather than special-cased.

### Host propagation is single-hop and terminal — confirmed

`propagateMarkUp`'s comment at `:378-382` is accurate: a `MatrixHost` is not a
`MatrixTarget`, has no `parentTargetId` and no `linkedHostId`, so a host stop is
always a leaf. The enumerator emits a host stop and never recurses from it. It
**does** re-check `linkedHostId` at every level of the parent walk, exactly as
`propagateMarkUp` does, even though reachable data never has it set on a public
parent.

## Proposed approach

### 1. One shared walk — the choke point

The defect exists because two pieces of code independently describe the same
traversal and one of them was never updated. Do not fix the preview by writing a
second walk. Extract the traversal once.

Add to `MatrixStateService`, next to `propagateMarkUp`:

```ts
export interface PropagationStop {
  kind: "host" | "target";
  id: string;
  name: string;
  /** Marks this destination currently holds for the decker (0 when unknown). */
  currentMarks: number;
  /** Whether placeMark() will actually add one here (currentMarks < 3). */
  willLand: boolean;
}
```

- **`collectPropagationStops(target, deckerId, visited)`** — private, pure, no
  writes, no `stateChange$`. Returns an ordered `PropagationStop[]`.
- **`previewPropagation(target, deckerId): PropagationStop[]`** — public,
  read-only. Returns `[]` when `target.type !== "device"`. Otherwise seeds
  `visited` with `target.id` and delegates. **Must not mutate anything and must
  not fire `stateChange$`.**
- **`propagateMarkUp()`** is rewritten to iterate `collectPropagationStops(...)`
  and, for each stop, call `placeMark` on the corresponding record and set
  `propagatedMarks[deckerId] = true` on success. Its observable behaviour must
  be byte-identical to today's.

Traversal rules for `collectPropagationStops`, in this exact order, per node
`N` starting at the clicked target:

1. If `N.linkedHostId` is set and resolves in `state.hosts` → emit
   `{ kind: "host", id: host.id, name: host.name, ... }`. Do **not** recurse
   from a host. Do **not** gate on any `type`.
2. If `N.context === "public"` **and** `N.parentTargetId` is set **and**
   `!visited.has(N.parentTargetId)` → resolve in `state.publicTargets`; if found
   **and** `parent.type === "device"`: `visited.add(parent.id)`, emit
   `{ kind: "target", ... }`, then recurse into `parent` from step 1. If the
   parent is missing or is not a device, emit nothing and stop.

`currentMarks` = `record[deckerId] ?? 0`; `willLand` = `currentMarks < 3`.
A capped stop is **still emitted and the walk still continues** — that is the
documented asymmetry (`matrix-state.service.ts:407-426`) and the whole reason
the preview needs a "capped, not stopped" state.

When `deckerId` is `""` (no selection), `currentMarks` is 0 and `willLand` is
`true` for every stop; the *component* must then render names-only rather than
claim cap knowledge it doesn't have.

**The visited set is mandatory in the preview path.** The cycle fixture at
`matrix-port-rules-correctness.spec.ts:1965-1974` (`a.parent = b`,
`b.parent = a`) is reachable state; a preview walk without the guard hangs the
browser on hover, in a getter called every change-detection tick.

### 2. Component API

Replace the single getter with two accessors on `TargetCardComponent`:

**`get propagationPreview(): string | null`** — forward-looking, decker-aware,
cap-aware. Reads `this.selectedDeckerId`. Feeds only the picker span
(`html:64-66`).

- Returns `null` if `this.addMarkBlockedReason !== null` (Open Decision 3
  default) — nothing will be placed, so nothing will propagate.
- Calls `matrixState.previewPropagation(this.target, this.selectedDeckerId)`.
- Returns `null` if the result is empty.
- Otherwise formats per the wording rules below.

**`propagationDestinationNames(): string | null`** — backward-looking,
decker-independent, **cap-free**. Feeds only the remove tooltip
(`html:46-47`).

- Calls `matrixState.previewPropagation(this.target, "")`.
- Returns `null` if empty; otherwise the comma-joined rendered names, no
  prefix, no cap suffixes.
- **Must not** carry cap wording: what an ancestor holds *now* says nothing
  about what it held when the propagation occurred, and no per-source ledger
  exists (`RULINGS.md` 2026-09-03, "Propagation is visible, not reversible").

Keep `propagationPreview` a **getter**, not a method: after the tooltip split it
has one consumer, the existing template binding and the existing test call shape
(`component.propagationPreview`) both survive, and default change detection
re-evaluates it on every tick — including the tick triggered by
`[(ngModel)]="selectedDeckerId"` on the select at `html:59`. **No subscription,
no `ngOnChanges`, no memoisation is required or wanted.** Memoising would need
invalidation on every `stateChange$` and costs more risk than the linear
`find`-per-hop it saves at table-sized data volumes.

### 3. Wording — exact format rules

Shared name rendering, used by both accessors and both options:

- `kind === "host"` → `` `Host ${name}` ``
- `kind === "target"` → `` `${name}` ``

Note this changes the host case from today's `Also marks Host: Ares-7` to
`Also marks: Host Ares-7`, so one grammar and one code path serve both. See Open
Decision 5 if you would rather keep the old string.

Cap suffix, applied per entry, **only when `selectedDeckerId` is non-empty**:

- `willLand` → `""`
- `!willLand` → `" (at 3, none added)"`

#### Option A — name every icon (Open Decision 1, branch A)

Let `stops` be the enumeration, `names` the rendered names, `entries` the
rendered names with cap suffixes.

| Condition | Output |
|---|---|
| `stops.length === 0` | `null` |
| `selectedDeckerId === ""` | `` `Also marks: ${names.join(", ")}` `` |
| every stop `willLand` | `` `Also marks: ${names.join(", ")}` `` |
| no stop `willLand` | `` `Also marks nothing — ${names.join(", ")} already at 3` `` |
| otherwise (mixed) | `` `Also marks: ${entries.join(", ")}` `` |

Worked examples:

- `Also marks: Host Ares-7`
- `Also marks nothing — Host Ares-7 already at 3`
- `Also marks: Weapon Mount, MCT Roto-Drone`
- `Also marks: Weapon Mount (at 3, none added), MCT Roto-Drone`
- `Also marks nothing — Weapon Mount, MCT Roto-Drone already at 3`
- both branches firing (unreachable today):
  `Also marks: Host Ares-7, Weapon Mount, MCT Roto-Drone`

#### Option B — nearest plus a count (Open Decision 1, branch B)

Let `first = stops[0]`, `rest = stops.slice(1)`,
`restCapped = rest.filter(s => !s.willLand).length`.

| Condition | Output |
|---|---|
| `stops.length === 0` | `null` |
| no stop `willLand` | `` `Also marks nothing — everything above is already at 3` `` |
| `rest.length === 0` | `` `Also marks: ${entry(first)}` `` |
| `rest.length > 0`, `restCapped === 0` or decker unknown | `` `Also marks: ${entry(first)}, +${rest.length} more above it` `` |
| `rest.length > 0`, `restCapped > 0` | `` `Also marks: ${entry(first)}, +${rest.length} more above it (${restCapped} already at 3)` `` |

Worked examples:

- `Also marks: Host Ares-7`
- `Also marks: Weapon Mount, +1 more above it`
- `Also marks: Weapon Mount (at 3, none added), +1 more above it`
- `Also marks: Weapon Mount, +2 more above it (1 already at 3)`
- `Also marks nothing — everything above is already at 3`

#### Both options: the hover fallback

`html:64-66` gains
`[title]` = the **Option A full-list string**, unconditionally, so the complete
truth is always one hover away. Under Option A this is redundant but harmless;
under Option B it is how the GM reaches the rest of the chain. Implement it as a
third accessor `propagationPreviewFull` sharing the Option A formatter, or as
`propagationDestinationNames()` if Open Decision 2 lands on "no cap wording
anywhere but the inline span".

#### The remove tooltip (`html:46-47`)

```
propagationDestinationNames()
  ? 'Remove 1 mark from ' + deckerLabel(entry.deckerId)
      + ' — any mark this propagated upstream ('
      + propagationDestinationNames()
      + ') stays; remove it there if wrong'
  : 'Remove 1 mark from ' + deckerLabel(entry.deckerId)
```

The `null` branch is byte-identical to today, preserving
`matrix-port-rules-correctness.spec.ts:1715-1727` unchanged. The non-null branch
now reads `… upstream (Host Ares-7) stays …` instead of
`… upstream (Also marks Host: Ares-7) stays …`, fixing the tense splice, and
still satisfies `:1711-1712` (`toContain('Ares-7')`, `toContain('stays')`).

### 4. Layout

`.tc-marks-row` (`target-card.component.css:115-123`) is `flex-wrap: wrap`, and
`.tc-propagation-preview` (`:234-238`) has no width constraint. The hierarchy
editor sits in one half of a `1fr 1fr` grid
(`matrix-run-panel.component.css:190-201`, collapsing to one column below
900 px). A four-name chain will wrap and push the ✓ / ✕ buttons onto a new line.

Add to `.tc-propagation-preview`:
`max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space:
nowrap;` — matching the truncation `.tc-name` (`:38-45`) and `.tc-decker-name`
(`:135-141`) already use. Combined with the `[title]` hover fallback, an
over-long chain degrades to "truncated with the full text on hover" rather than
"buttons pushed off screen mid-combat". This is required under Option A and
harmless under Option B.

## Scope classification

Proposal only. Xavier approves; nothing here is settled.

### TRACK — the app must represent or compute this

1. The +Mark preview names **every** icon `addMark()` will reach, not the first
   one. `SCOPE.md:40` "Making state visible at a glance"; `RULINGS.md`
   2026-09-03 "the `+Mark` control on a device states what it will *also* mark
   … before the GM confirms".
2. The preview states, per destination, whether the mark will land or be
   absorbed by that destination's 3-mark cap. `SCOPE.md:74-79` — "mark caps …
   need to be correct … because the GM isn't checking them" — and the app
   already holds every number required.
3. The preview is evaluated for the decker selected in the picker and updates
   when that selection changes. The cap is per-decker (p. 236); without a decker
   the cap statement is meaningless.
4. The preview reports nothing when nothing will be placed.
5. The remove-mark tooltip names every propagation destination.
6. Preview and write path share one traversal.

### GM RESOLVES — the GM decides; the app records

- Whether a propagated mark on a full ancestor "should" have landed. The app
  reports; the GM edits that ancestor's row by hand if the fiction disagrees
  (`RULINGS.md` 2026-09-03).
- Whether to place the mark at all having read the warning.
- Whether an ancestor's existing three marks came from this chain or elsewhere.
  No per-source ledger exists, deliberately
  (`MatrixTarget.propagatedMarks` doc comment, `MatrixTarget.ts:63-75`).

### OUT OF SCOPE — per `SCOPE.md`

- Reversing propagation on removal. Settled, `RULINGS.md` 2026-09-03; `SCOPE.md`
  Undo/redo (`:69-72`).
- Blocking or refusing a mark because an ancestor is capped. `SCOPE.md:44-48` —
  warn, don't refuse.
- Deriving a mark count from anything (rolls, hits, comparisons).
  `RULINGS.md` 2026-09-02 Decision 1; `SCOPE.md:51-53`.
- Rendering the preview in the player view. GM-side control.

### SCOPE QUESTION

**Bring `HierarchyEditorComponent`'s host +Mark control up to the same
standard.** Classified OUT OF SCOPE for this request (it is not a propagation
preview — a host never propagates upward), but genuinely useful and in the same
defect family.

*For:* it is the third of three +Mark controls, it is the only one with no
"why is this disabled" message (`hierarchy-editor.component.html:169-183`), and
`hostAvailableDeckers()` (`:411-413`) does not filter nameless participants —
the exact bug `TargetCardComponent.availableDeckers` (`:82-86`) was fixed for on
2026-09-03, so the same blank-option-and-dead-button failure is still reachable
one panel over.

*Against:* it shares no code with this change, has nothing to preview, and
folding it in makes both harder to review; it is a clean separate one-line
request.

## Size check

**Small — well under a day.** One new interface plus two service methods
(one of which is a refactor of an existing private method with unchanged
observable behaviour), two component accessors, two template bindings, one CSS
rule, roughly four test edits and eight new tests.

No split needed. Do **not** expand this into "make all three mark controls
consistent" — that is the Scope Question above and belongs in its own request.

## Acceptance criteria

TRACK items only. Each checkable against observable behaviour.

Assume Option A wording unless Open Decision 1 lands on B, in which case
substitute B's table; every criterion below is stated so that it holds under
either option except where marked **[A]** / **[B]**.

1. For a `"device"` target on the open grid whose parent chain is
   `child → mount → drone` (all `type: "device"`, all `context: "public"`,
   no caps reached), opening +Mark for a decker with 0 marks shows a preview
   that names **both** `mount` and `drone`. **[A]** the literal string is
   `Also marks: Weapon Mount, MCT Roto-Drone`. **[B]** the literal string is
   `Also marks: Weapon Mount, +1 more above it`, and the span's `title`
   attribute contains both names.
2. In the same fixture, after committing, `child`, `mount` and `drone` each hold
   exactly 1 mark for that decker — i.e. the count of icons the preview
   described equals the count of icons whose `marks` record changed.
3. With `mount.marks[decker] === 3` and `drone.marks[decker] === 0`, the preview
   states that `mount` receives nothing **and** that `drone` is still reached.
   **[A]** `Also marks: Weapon Mount (at 3, none added), MCT Roto-Drone`.
4. With `mount.marks[decker] === 3` **and** `drone.marks[decker] === 3`, the
   preview states that nothing will be added. **[A]**
   `Also marks nothing — Weapon Mount, MCT Roto-Drone already at 3`.
   **[B]** `Also marks nothing — everything above is already at 3`.
5. Changing the decker in the picker to one with different mark counts changes
   the rendered preview text on the next change-detection cycle, with no
   further GM action.
6. When `addMarkBlockedReason !== null`, `propagationPreview` is `null` and no
   `.tc-propagation-preview` element is rendered.
7. For a `"device"` target inside a host (`context: "host"`,
   `linkedHostId` set), the preview names that host and nothing else:
   `Also marks: Host Ares-7`. With `host.marks[decker] === 3`:
   `Also marks nothing — Host Ares-7 already at 3`.
8. `propagationPreview` returns `null` for any target whose `type` is not
   `"device"`, regardless of `linkedHostId` or `parentTargetId`.
9. `propagationPreview` returns `null` for a `"device"` with neither a
   resolvable `linkedHostId` nor a device parent.
10. The `×` remove-mark button's `title` names **every** propagation destination
    (`Host Ares-7`, or `Weapon Mount, MCT Roto-Drone`), carries **no** cap
    wording, and still contains the word "stays". For a target with no
    destinations the title is exactly
    `Remove 1 mark from <decker>`, unchanged.
11. Given the cycle fixture (`a.parentTargetId === b.id`,
    `b.parentTargetId === a.id`, both public devices), reading
    `propagationPreview` on `a` terminates, names `b` once, and does not throw.
12. Reading `propagationPreview` or `propagationDestinationNames()` mutates no
    `marks` record, no `propagatedMarks` record, and emits nothing on
    `matrixState.stateChange$`.
13. Every pre-existing assertion in
    `matrix-port-rules-correctness.spec.ts:1732-1975`
    (`MatrixStateService.addMark()` propagation) passes unchanged.
14. The `.tc-propagation-preview` element does not increase the height of
    `.tc-marks-row` for a chain of four destinations with 20-character names —
    it truncates and exposes the full text via `title`.

## Regression risk

| Risk | Covered by |
|---|---|
| Propagation behaviour changes while refactoring `propagateMarkUp` onto the shared enumerator | `matrix-port-rules-correctness.spec.ts:1732-1975` — ~20 tests covering 7a, 7b, Decision 8 type gates, cap-continuation (`:1934`), host-context scoping (`:1950`), cycle guard (`:1965`), `propagatedMarks` flags (`:1788-1823`), and the single-`stateChange$` guarantee (`:1775-1784`). **If any of these go red, the refactor is wrong — do not adjust them.** |
| Preview walk infinite-loops on a malformed cycle | New test mirroring `:1965-1974` but reading `propagationPreview` instead of calling `addMark`. AC-11. |
| Remove tooltip regresses | `:1700-1713` (propagating target) and `:1715-1727` (non-propagating target — must remain byte-identical). AC-10. |
| Rendered-template preview regresses | `:1685-1698`. AC-1/AC-7. |
| A preview getter that mutates state | AC-12; enforce by asserting `stateChange$` fires 0 times across a preview read. |
| Change detection not picking up a decker switch | AC-5. Default change detection makes this free — the risk is someone "optimising" to `OnPush` later without a `markForCheck`. |
| Layout push at the table | AC-14 plus the CSS truncation. |
| The two accessors being re-merged later, reintroducing the tense splice | Doc comments on both accessors must state why they are separate. |

## Test changes required

File: `src/scenarios/matrix-port-rules-correctness.spec.ts`, describe block
`'TargetCardComponent propagation visibility (Decision 9, 2026-09-03)'`
(`:1611-1728`).

**Breaks and must be edited (2):**

- `:1630-1638` — `expect(component.propagationPreview).toBe('Also marks Host:
  Ares-7')` → `'Also marks: Host Ares-7'` (Open Decision 5; no edit needed if
  Xavier chooses to keep the legacy host string).
- `:1685-1698` — `textContains(fixture, 'Also marks Host: Ares-7')` →
  `'Also marks: Host Ares-7'`. Same caveat.

**Survives unchanged, but only by accident — must be understood, not trusted (1):**

- `:1640-1651` — `expect(component.propagationPreview).toBe('Also marks: Weapon
  Mount')`. This passes under both options **because the fixture's chain is one
  hop deep** (`mount` has no parent) and `activeDeckers = []` /
  `selectedDeckerId = ""` puts it on the names-only path. Leave it, and add a
  comment saying it is the one-hop case, so a future reader does not conclude
  multi-hop is covered.

**Survives unchanged (4):** `:1653-1661`, `:1663-1671` (null cases),
`:1673-1683` (`hasPropagatedMark`), `:1715-1727` (plain remove tooltip).

**Needs updating for the split accessor (1):** `:1700-1713` — assertions
(`toContain('Ares-7')`, `toContain('stays')`) still hold, but the test should be
tightened to assert the tooltip no longer contains the substring
`'Also marks'`, locking in the tense fix.

**Gap this change must close.** There is currently **no test anywhere** that
previews a chain more than one hop deep. `:1915-1932` tests the multi-hop
*walk*; nothing tests the multi-hop *preview*. That gap is the direct cause of
the defect.

**New tests to add (8 minimum):**

1. Two-hop open-grid chain (`rifle → mount → drone`), no caps — AC-1.
2. Same fixture, `mount` capped at 3 for the selected decker — AC-3, the
   "capped ancestor is not the end of the chain" case.
3. Same fixture, `mount` and `drone` both capped — AC-4.
4. Preview changes when `selectedDeckerId` is switched between two deckers with
   different counts — AC-5.
5. Preview is `null` while `addMarkBlockedReason` is non-null (fixture: decker
   at 3 marks on the clicked device, `selectedDeckerId` still set to them) —
   AC-6. Build this by the reachable sequence, not by hand-setting fields:
   `openAddMark()` → `confirmAddMark()` ×3 → `openAddMark()` again.
6. Host case at cap — AC-7 second half.
7. Cycle fixture read through `propagationPreview` — AC-11.
8. Preview read fires no `stateChange$` and mutates no `marks` — AC-12.

Plus, in the `MatrixStateService` describe block: a test asserting
`previewPropagation()` returns stops in the same order and of the same length as
the set of records `addMark()` subsequently changes, for the two-hop fixture —
the direct guard against the preview and the walk drifting again.

## Scenarios to survive

Written as executable test cases.

### S1 — Ordinary: three-deep open-grid chain, nothing capped

```
Given three public device targets:
  drone  = { id: 'dr', name: 'MCT Roto-Drone', type: 'device', context: 'public' }
  mount  = { id: 'mt', name: 'Weapon Mount',  type: 'device', context: 'public',
             parentTargetId: 'dr' }
  gun    = { id: 'gn', name: 'Smartgun',      type: 'device', context: 'public',
             parentTargetId: 'mt' }
And one decker 'Tesseract' with 0 marks anywhere
When the GM opens +Mark on `gun` and selects 'Tesseract'
Then [A] component.propagationPreview === 'Also marks: Weapon Mount, MCT Roto-Drone'
     [B] component.propagationPreview === 'Also marks: Weapon Mount, +1 more above it'
         and the span title contains both 'Weapon Mount' and 'MCT Roto-Drone'
When the GM confirms
Then gun.marks.Tesseract === 1
 And mount.marks.Tesseract === 1
 And drone.marks.Tesseract === 1
 And mount.propagatedMarks.Tesseract === true
 And drone.propagatedMarks.Tesseract === true
 And gun.propagatedMarks.Tesseract === undefined
 And stateChange$ fired exactly once
```

This is the exact defect in the request: today the preview names only
`Weapon Mount` while three icons are marked.

### S2 — Edge: capped ancestor mid-chain, chain continues past it

```
Given the S1 fixture
  But mount.marks = { Tesseract: 3 }
When the GM opens +Mark on `gun` and selects 'Tesseract'
Then [A] preview === 'Also marks: Weapon Mount (at 3, none added), MCT Roto-Drone'
     [B] preview === 'Also marks: Weapon Mount (at 3, none added), +1 more above it'
When the GM confirms
Then gun.marks.Tesseract === 1
 And mount.marks.Tesseract === 3        // absorbed, unchanged
 And drone.marks.Tesseract === 1        // still reached — the cap is not a stop
```

The preview must not read as "the chain ends at the mount". Getting this
backwards would make the preview lie in the opposite direction from today's
defect. Mirrors `matrix-state.service.ts:407-426` and the walk-side test at
`:1934-1948`.

### S3 — Correction by hand (this app has no undo)

Undo was removed from the tracker (`SCOPE.md:69-72`); the sanctioned correction
path is editing the value directly. That path must stay honest.

```
Given the S1 fixture, after the GM has committed the mark from S1
  (gun, mount, drone each at 1 for 'Tesseract')
When the GM realises they marked the wrong icon and clicks × on gun's mark row
Then the × tooltip read, before clicking, was
     'Remove 1 mark from Tesseract — any mark this propagated upstream
      (Weapon Mount, MCT Roto-Drone) stays; remove it there if wrong'
 And after clicking:
     gun.marks.Tesseract === undefined
     gun.propagatedMarks.Tesseract === undefined
     mount.marks.Tesseract === 1   // unchanged — no reversal
     drone.marks.Tesseract === 1   // unchanged — no reversal
     mount.propagatedMarks.Tesseract === true
When the GM then clicks × on mount's and drone's own rows
Then all three records are clear
```

The point: the tooltip must have named *both* upstream icons, or the GM has no
way to find the second one to clean up. Today it names one.

### S4 — Live at the table: promising a mark that cannot be placed

The four-tap sequence, mid-combat, players waiting.

```
Given one public device `maglock` and two deckers 'Tesseract' and 'Slamm-0'
  And maglock is parented to public device `door_controller`
  And Tesseract already holds 3 marks on maglock
  And selectedDeckerId is still 'Tesseract' from the previous placement
When the GM taps +Mark on maglock
Then openAddMark() does NOT reseed selectedDeckerId (it is truthy)
 And availableDeckers === ['Slamm-0']  (Tesseract filtered out at the cap)
 And the select renders with no matching option (blank)
 And addMarkBlockedReason === 'Tesseract already holds the maximum 3 marks on
     this icon (p. 236)'
 And canConfirmAddMark === false
 And propagationPreview === null            // today: 'Also marks: Door Controller'
 And no .tc-propagation-preview element is in the DOM
When the GM selects 'Slamm-0' in the picker
Then propagationPreview === 'Also marks: Door Controller'
 And canConfirmAddMark === true
```

Today the GM sees a disabled ✓, a red "already at maximum" message, **and** a
line promising to mark the door controller — three signals, one of which is
false, at the worst possible moment.

### S5 — Both propagation branches for one target (defensive)

Not reachable through the UI (see Affected paths, Reachability finding), but
constructible via `updateTarget()` and already constructed by
`matrix-port-rules-correctness.spec.ts:1950-1963`. The preview must not return
early on the host branch.

```
Given host = { id: 'h1', name: 'Ares-7' }
  And parentDev = { id: 'p1', name: 'Rooftop Node', type: 'device',
                    context: 'public' }
  And odd = { id: 't1', name: 'Odd Device', type: 'device', context: 'public',
              linkedHostId: 'h1', parentTargetId: 'p1' }
When the GM opens +Mark on `odd` for a decker with 0 marks
Then [A] preview === 'Also marks: Host Ares-7, Rooftop Node'
And when confirmed, host.marks and parentDev.marks each gain 1
And previewPropagation() returned stops in the order [host, parentDev],
    matching propagateMarkUp()'s own order (host hop at
    matrix-state.service.ts:383 before the parent hop at :395)
```

Note the contrast with `:1950-1963`: that fixture has `context: 'host'`, so only
branch (a) fires. This one has `context: 'public'` **and** a `linkedHostId`, so
both do.

## Open decisions

### 1. Name every icon in the chain, or name the nearest and count the rest?

**Xavier's own question. Not resolved here.** Both formats are fully specified
above (Proposed approach §3, Option A and Option B tables) so the implementer
can build either without re-deriving anything.

Technical grounding: chain depth is unbounded — `parentTargetId` nesting has no
depth limit anywhere in `HierarchyEditorComponent` (`parentOptionsFor`,
`:501-505`, only excludes self and descendants), so Option A's string length is
unbounded too. `.tc-propagation-preview` currently has no width constraint
(`target-card.component.css:234-238`) inside a half-width grid column
(`matrix-run-panel.component.css:190-201`). The CSS truncation plus `title`
fallback in §4 makes Option A safe at the layout level; it does not make it
*readable* at depth 5.

*Recommended default if Xavier does not answer: Option A.* It is what the
2026-09-03 ruling's plain reading asks for ("the control must say what it will
also do"), depths beyond three are rare in play, and switching to B afterwards
is a formatter change with no structural impact.

### 2. Cap-aware wording — include it, and where?

*Recommended: yes in the inline picker preview; no in the remove tooltip.*

Technical grounding: `AccessHostPanelComponent.marksThatWillLand`
(`:112-116`) and `applyLabel` (`:135-148`) established the precedent for the
host panel after round-4 defect D-2, for exactly this reason — a label that
always promises the full number can lie. The target card has the same defect and
the same data available. The remove tooltip is excluded because it describes a
propagation that already happened; the ancestor's *current* count says nothing
about its count at propagation time, and no per-source ledger exists
(`MatrixTarget.ts:63-75`).

### 3. Suppress the preview when nothing at all will be placed?

*Recommended: yes — `propagationPreview` returns `null` whenever
`addMarkBlockedReason !== null`.*

Technical grounding: `addMark()` (`matrix-state.service.ts:369-372`) returns
before `propagateMarkUp()` if `placeMark` on the clicked icon fails, so in that
state *literally nothing* propagates. `addMarkBlockedReason`
(`target-card.component.ts:93-99`) already covers both causes (no selection, at
cap) and already renders in `.tc-add-mark-blocked` (`html:72-74`), so a second
contradicting line adds only noise. The alternative — show the preview with a
"nothing will happen" prefix — duplicates a message already on screen 20 pixels
away.

### 4. Should `propagationPreview` stay a getter or become a method taking a decker id?

*Recommended: stay a getter reading `selectedDeckerId`.*

Technical grounding: once `propagationDestinationNames()` takes over the remove
tooltip, the picker span (`html:64-66`) is the getter's only consumer, and the
picker's decker *is* `selectedDeckerId`. Keeping it a getter preserves the
existing template binding and the existing test call shape
(`component.propagationPreview`), and default change detection re-evaluates it
on the tick raised by `[(ngModel)]` on the select (`html:59`), so no explicit
reactivity plumbing is needed. A method taking an id would only pay off if a
third consumer with a third decker context appeared; none is planned.

### 5. Keep the legacy host wording `Also marks Host: <name>`, or unify to `Also marks: Host <name>`?

*Recommended: unify.*

Technical grounding: unifying gives one prefix, one list formatter and one code
path serving the host-only, chain-only and mixed cases, and is a prerequisite
for S5's `Also marks: Host Ares-7, Rooftop Node`. The cost is two test edits
(`:1637`, `:1697`) and one changed `RULINGS.md` quotation (`:1355`, which quotes
the old string illustratively — it should be updated in the same commit so the
ruling and the code do not disagree). Keeping the legacy string saves those
edits but reintroduces the two-grammar problem this change exists to remove.

### 6. Add the "announce before committing" promise to `SCOPE.md`?

*Recommended: yes, one clause.*

Technical grounding: `SCOPE.md:33-39` authorises the app to *place* propagated
marks but says nothing about announcing them; that requirement lives only in
`RULINGS.md` 2026-09-03. Since the preview is now a load-bearing part of why
automatic propagation is acceptable under Decision 1 at all, the boundary
document should say so. Suggested addition to that bullet: "…automatically, and
stating before the GM commits which icons it will reach." This is a
documentation change, not a behaviour change; it is listed here rather than done
silently.

### 7. Fold in the `HierarchyEditorComponent` host +Mark gaps?

*Recommended: no — separate request.* See Scope Classification → SCOPE QUESTION
and brief question 5. If Xavier says yes, it is roughly another half-day and
should still be a separate commit.
