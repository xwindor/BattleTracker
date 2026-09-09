# Mark propagation: highlight the destinations instead of naming them

Technical specification. Supersedes the inline-text approach in
`briefs/mark-propagation-preview-spec.md` (which stays on disk as the history of
how we got here — see its brief's "Revision 2 — 2026-09-05" section).

---

## PART 0 — Plain language, for Xavier

**Not a software engineer? This section is the whole story. Everything below it
is for the implementer.**

### What changes on screen

Today, when you tap **+Mark** on an icon, a sentence appears in the row telling
you which other icons will also get a mark. That sentence is being deleted.

Instead, the moment the picker opens, **the icons that are about to be marked
light up amber in the hierarchy tree itself.** No sentence, no width, nothing to
truncate.

Each affected icon gets three things at once:

- an **amber tint on its row**, so you can see which icon it is;
- a small **▲ marker** next to its name — a solid triangle if it will actually
  take the mark, a hollow `△` if it is already at three and will take nothing;
- an **amber vertical line** down the left edge of everything it contains.

That third one is the important one, and it is the answer to the problem you
were worried about. In the tree, a smartgun is drawn *inside* its weapon mount,
which is drawn *inside* the drone. So the drone's vertical line runs all the way
down past the smartgun. When you open the picker on the smartgun, you see **two
amber lines to the left of the icon you just tapped** — one per affected
ancestor — without scrolling anywhere.

**Correction, 2026-09-06:** don't just count the lines — look at whether each
is solid or dashed. A solid, thick line is an icon that will actually take the
mark. A dashed, dimmed line is an icon already full (three marks for that
decker) that will take nothing at all. Counting every amber line as "an icon
I'm about to touch" over-reads whenever one of them is already capped — the
line still lights up, amber, because you should know it's in the chain, but
nothing lands there.

The highlight follows the decker dropdown: switch decker and the "already at
three" markers change to match, because the three-mark limit is per decker.

It clears when you confirm, when you cancel, when you open a different icon's
picker, and if the icon or the panel it lives in goes away.

### What is being deleted

- The "Also marks: …" sentence in the +Mark row, and the hover text behind it.
- The two internal wording formatters that produced it, and its styling rule.
- About sixteen automated tests that check the exact wording, plus the two tests
  that measured whether the sentence fitted — those exist to catch a problem
  that stops existing.

### What is NOT being deleted

The **×** (remove mark) button's tooltip still names, in words, the icons a mark
already propagated to. That is a different feature: it is how you find the
upstream icons to correct by hand after the fact. It stays exactly as it is, and
three of its tests stay untouched as the proof.

The propagation itself does not change. Same icons, same marks, same limits.

### Residual risk you should know about

**1. You will be able to see *how many* off-screen icons are affected, but not
*which*.** If a destination's own row is scrolled out of view, its amber
vertical line is still visible beside the icon you tapped, so you know it's up
there. To read its name you scroll up. Under the old text you could read the
name without scrolling. This is the trade you are making, and you accepted it
knowingly. I have not tried to design it away with a second sentence.

**2. A collapsed branch cannot hide a destination.** I checked the code: the
tree has no per-icon collapse. The only two collapse controls are the whole
"Public Space" section and each host — and collapsing either of those also
removes the +Mark button you'd be pressing. So there is no case where you open a
picker and a destination is hidden inside something folded shut. No auto-expand
is needed, and I am not building one.

**3. One genuinely unreachable case.** There is a data shape — a public-space
device that is *also* linked to a host — where the host destination is in a
different part of the screen entirely and no vertical line connects them. You
cannot create that shape through the app; only a hand-edited or imported file
could. It would be highlighted correctly but could be far away. I am flagging
it, not fixing it.

**4. Two pickers can be open at once — superseded, 2026-09-06.** This used to
say opening +Mark on one icon left another icon's picker open too, silently
disarmed. It doesn't anymore: opening a picker now closes any other picker
that was open. Only one chain can light up at a time, and only one picker is
ever waiting for your tap. See Open Decision 3 for what changed and why.

**5. Added 2026-09-06 (round-8 review). Opening a picker can shrink a
destination icon's own name to "…" that fit fine a second ago.** The little
triangle marker takes up a sliver of the same row as the icon's name. Most of
the time that costs nothing — there's room. But measured in a real browser at
the narrowest width this panel supports, four levels deep in the tree, a name
of exactly 7 or 8 characters is the one band where the row had *just* enough
room before the marker appeared and not quite enough after — so the marker's
own arrival is what pushes that particular name into "…". Shorter names never
notice; names 9 characters or longer were already showing "…" before you ever
opened the picker, so the marker doesn't make anything worse for them. This
is a narrow, cosmetic case — a name you could read a second ago needs a
tooltip-hover to read in full for as long as the picker stays open — and I
tried to fix it once; every fix attempted moved the marker in a way that
broke the "opening a picker doesn't shift anything around" guarantee
elsewhere in the tree, which is a worse problem than this one. Left alone and
recorded rather than traded for that.

### Two things I need you to decide

Full detail in Open Decisions at the end; short version:

1. **Does a highlight count as the +Mark control "saying" what it will also do?**
   Your 2026-09-03 ruling requires the control to *say* it. That is your
   reading, not mine. If a highlight counts, the ruling needs a sentence added
   saying so, or a future reader will put the text back.
2. **Do you want a tiny "↑2" counter next to the picker** as a belt-and-braces
   cue? It is about 20 pixels, not 280. It arguably contradicts your decision to
   remove the text entirely, so I am not building it unless you say.

There is also a **gap I found**: on 2026-09-04 you approved adding a clause to
`SCOPE.md` about announcing propagation before committing (answer 6 in the old
brief, "Done in Stage 5"). It was never added — `SCOPE.md` lines 33-39 have no
such wording. That approval is still outstanding, and what it should now say
depends on decision 1 above.

---

## Request

Replace `TargetCardComponent`'s textual propagation preview with a visual
highlight of the destination icons rendered on `HierarchyEditorComponent`'s
tree, driven by the existing `MatrixStateService.previewPropagation()` walk.

**Not in scope:** any change to what propagation actually does; any change to
`MatrixStateService.previewPropagation()`, `collectPropagationStops()`,
`dedupeHostStops()`, `propagateMarkUp()` or `placeMark()`; the `×` remove-mark
tooltip and `propagationDestinationNames()` (explicitly retained — see
"What gets deleted"); the propagated-mark link badge (`hasPropagatedMark`,
`.tc-propagated-badge`, `.hier-propagated-badge`); `AccessHostPanelComponent`;
the player view; `MatrixGraphComponent`; the two pre-existing gaps in
`HierarchyEditorComponent`'s **host** +Mark control (no blocked-reason message
at `hierarchy-editor.component.html:169-183`; `hostAvailableDeckers()` at
`hierarchy-editor.component.ts:411-413` does not filter nameless participants);
the two changes Xavier has queued separately (mark counter as a click/right-click
control, moving the parent dropdown into the edit view).

**Does this move the `SCOPE.md` boundary?** No. It stays inside "Making state
visible at a glance" (`SCOPE.md:40`) and refines the already-approved
propagation bullet (`SCOPE.md:33-39`). It does, however, collide with an
outstanding documentation decision and a `RULINGS.md` wording — see
"Documentation consequences".

**Is any of this rules-dependent?** No. The two rules involved (propagation,
p. 233; the 3-mark cap, p. 236) are already decided, already implemented, and
already surfaced as `PropagationStop.willLand`
(`matrix-state.service.ts:24-32`). This change reads that flag and paints it. It
decides nothing. Correct for `/change`, not `/feature`.

---

## Current behaviour

Facts, read from the code.

### The text preview being removed

`src/app/matrix/target-card/target-card.component.ts`

- `:50-80` — `get propagationPreview(): string | null`. Returns `null` when
  `addMarkBlockedReason !== null` (`:77`); otherwise calls
  `matrixState.previewPropagation(this.target, this.selectedDeckerId)` (`:78`)
  and formats with `formatOptionB` (`:79`).
- `:82-104` — `get propagationPreviewFull(): string | null`. Same guard, same
  `previewPropagation()` call, formatted with `formatOptionA` (`:103`). Feeds
  the `[title]` hover.
- `:136-160` — `private static formatOptionA()`.
- `:162-195` — `private static formatOptionB()`.

`src/app/matrix/target-card/target-card.component.html`

- `:64-66` —
  `@if (propagationPreview; as preview) { <span class="tc-propagation-preview" [title]="propagationPreviewFull">{{ preview }}</span> }`

`src/app/matrix/target-card/target-card.component.css`

- `:245-284` — `.tc-propagation-preview`, including a 36-line comment recording
  the round-2 `max-width` history and the 2026-09-05 Option B revision.

### The parts being kept, and why the boundary matters

- `:106-129` — `propagationDestinationNames(): string | null`. Calls
  `previewPropagation(this.target, "")` and comma-joins the rendered names, no
  cap wording. **Separate, still-wanted feature.** It is the *backward-looking*
  accessor: it names where a mark already went so the GM can hand-correct
  (`RULINGS.md` 2026-09-03, "Propagation is visible, not reversible"; this app
  has no undo, `SCOPE.md:69-72`). Its sole consumer is the `×` button's
  `[title]` at `target-card.component.html:44-48`. **It must not be deleted, and
  its three tests must stay green untouched.**
- `:131-134` — `private static stopName(stop)` — `Host <name>` / `<name>`. Used
  by `propagationDestinationNames()` today; will additionally be used by the new
  accessible-name strings.
- `:46-48` / `.tc-propagated-badge` (`css:237-243`) /
  `.hier-propagated-badge` (`hierarchy-editor.component.css:787-793`) — the
  after-the-fact link badge. Untouched.
- `:197-212` `availableDeckers`, `:214-225` `addMarkBlockedReason`, `:227-229`
  `canConfirmAddMark`, `:231-233` `dots`, `:235-237` `deckerLabel`. Untouched.

### The shared walk (the thing that must be preserved)

`src/app/services/matrix-state.service.ts`

- `:15` — `export const MARK_CAP = 3`.
- `:24-32` — `export interface PropagationStop { kind: "host"|"target"; id;
  name; currentMarks; willLand }`.
- `:426-430` — `previewPropagation(target, deckerId)`. Returns `[]` for a
  non-`"device"` target; otherwise `collectPropagationStops(target, deckerId,
  new Set([target.id]))` then `dedupeHostStops()`.
- `:439-450` — `dedupeHostStops()`, preview-only.
- `:496-538` — `collectPropagationStops()`, the pure enumerator: host hop (a) at
  `:504-516`, open-grid parent hop (b) at `:521-535`, no early return between
  them, visited-set cycle guard on (b).
- `:547-558` — `propagateMarkUp()` consumes the same enumerator and writes.
- `:389-395` — `addMark()`.

**Nothing in this file changes.** `previewPropagation()` simply gains a second
caller.

### The tree the highlight has to render on

`src/app/matrix/hierarchy-editor/hierarchy-editor.component.html`

- `:16-50` — the Public Space section. Header at `:17`
  (`(click)="togglePublicSpace()"`), body gated at `:33` by
  `publicSpaceExpanded`, top-level nodes at `:40-42` via `publicTargetNodeTpl`
  with `depth: 0`.
- `:351-390` — `#publicTargetNodeTpl`, the recursive node template:
  - `:353` — `<div class="hier-public-node" [style.marginLeft.px]="depth * 18">`
  - `:354-362` — `<app-target-card [target]="t" [host]="null" …>`
  - `:371-384` — the Parent dropdown row, gated on `canHaveParent(t)`
  - `:386-388` — `@for (child of childrenOf(t.id))` recursing with `depth + 1`,
    **inside the same `.hier-public-node` div**, which closes at `:389`.
- `:111-285` — `@for (host of state.hosts; track host.id)` rendering
  `.hier-host-node`:
  - `:115-145` — `.hier-host-header`, **rendered unconditionally**, not gated on
    expansion.
  - `:148` — `@if (isHostExpanded(host.id))` gates `.hier-host-body` only.
  - `:264-274` — `<app-target-card [target]="t" [host]="host" …>` for each
    `host.targets`, with **no per-target wrapper div**.

`src/app/matrix/hierarchy-editor/hierarchy-editor.component.ts`

- `:100` — `publicSpaceExpanded = true`.
- `:101` — `expandedHosts = new Set<string>()` — hosts start **collapsed**.
- `:316-318` `togglePublicSpace()`, `:320-326` `toggleHost()`,
  `:373-375` `isHostExpanded()`.
- `:466-468` — `childrenOf(parentId)`.
- **There is no per-node collapse for a public target.** I searched the
  component and the template: the only expansion state is `publicSpaceExpanded`
  and `expandedHosts`. `publicTargetNodeTpl`'s children loop at `:386-388` is
  unconditional.

`src/app/matrix/hierarchy-editor/hierarchy-editor.component.css`

- `:3-12` — `.hier-editor { overflow-y: auto; max-height: 500px; }` — **this is
  the scroll container**, and it is the component's own root child element.
- `:747-750` — `.hier-public-node { border-left: 1px solid #1a3a1a;
  padding-left: 0.35rem; }`.
- `:238-245` — `.hier-host-node { border-left: 2px solid transparent }`,
  turning `var(--matrix-text, #00ff9f)` when `.hier-host-active`.
- `:247-256` — `.hier-host-header`.
- `:343-346` — `.hier-host-body { padding: 0 0 0.3rem 0.7rem; }`.

### The compounding indent, confirmed at source

The reviewer's diagnosis holds and is visible in the markup. A depth-`n` node
carries `margin-left: n × 18px` **and** is nested inside its parent's
`.hier-public-node`, which carries its own margin plus `padding-left: 0.35rem`
plus a 1px border. Indent is therefore cumulative, not per-level. I have not
re-measured the reviewer's 215px figure at depth 4 and do not restate it as my
own; the mechanism is confirmed, the exact total is theirs.

**This change turns that liability into the mechanism.** Because ancestors are
DOM *ancestors*, an ancestor's left rail runs the full height of its subtree —
including alongside the clicked node's card, at a fixed x determined by the
indent.

### Colours already in use in this panel

Verified by grep across `src/app/matrix/`:

| Colour | Where | Means |
|---|---|---|
| `#cc4444` | `target-card.component.css:108,159`; `hierarchy-editor.component.css:231,666,785`; `matrix-graph.component.css:145,205` | destructive (delete/remove) and IC |
| `#ff8a8a` | `target-card.component.css:290` | blocked reason |
| `#ff6b6b` | `ic-spawner.component.css:3`; `os-prompt.component.css:3,46` | error/alert — **not** in the two files this change touches; noting the request's citation resolves elsewhere |
| `#ffb340` | `target-card.component.css:239` (`.tc-propagated-badge`), `:246` (being deleted); `hierarchy-editor.component.css:789` (`.hier-propagated-badge`) | **propagation** |

After the deletion, `#ffb340` survives at `target-card.component.css:239` and
`hierarchy-editor.component.css:789`, both meaning "propagation". Amber is
already the right word.

### Component mounting and encapsulation

- `<app-target-card>` appears in exactly **two** places, both in
  `hierarchy-editor.component.html` (`:265`, `:354`). Searched the whole `src/`
  tree; no other consumer.
- `<app-hierarchy-editor>` appears in exactly **one** place:
  `matrix-run-panel.component.html:38`, inside `.matrix-left-pane`
  (`matrix-run-panel.component.css:203-209`, `overflow: hidden`, one column of
  `grid-template-columns: 1fr 1fr` collapsing to `1fr` below 900px,
  `:190-201`).
- Neither component sets `encapsulation`, so both use Angular's default
  `Emulated`. **`HierarchyEditorComponent`'s stylesheet therefore cannot reach
  inside `TargetCardComponent`'s template.** Any row-level highlight on the card
  must be applied by the card itself, from an `@Input`.
- `TargetCardComponent` implements no lifecycle interfaces today
  (`target-card.component.ts:1`, imports only `Component, Input, Output,
  EventEmitter`).

---

## Affected paths

Complete. Every file and method named explicitly.

### A. `src/app/matrix/target-card/target-card.component.ts`

| Action | Symbol / lines |
|---|---|
| DELETE | `get propagationPreview()` — `:50-80` (with doc comment) |
| DELETE | `get propagationPreviewFull()` — `:82-104` (with doc comment) |
| DELETE | `private static formatOptionA()` — `:136-160` |
| DELETE | `private static formatOptionB()` — `:162-195` |
| KEEP unchanged | `propagationDestinationNames()` — `:106-129` |
| KEEP unchanged | `private static stopName()` — `:131-134` |
| KEEP unchanged | `hasPropagatedMark()` `:46-48`; `markEntries` `:34-38`; `availableDeckers` `:197-212`; `addMarkBlockedReason` `:214-225`; `canConfirmAddMark` `:227-229`; `dots` `:231-233`; `deckerLabel` `:235-237`; `removeMark` `:253-255`; `typeIcon`/`typeLabel`/`visibilityLabel`/`visibilityClass` `:257-293` |
| ADD | `@Input() propagationDestination: PropagationHighlightState \| null = null` |
| ADD | `get propagationMarkerGlyph(): string` and `get propagationMarkerLabel(): string` |
| ADD | `@Output() readonly propagationHighlightChange = new EventEmitter<MarkHighlightRequest \| null>()` |
| ADD | `onSelectedDeckerChange(id: string): void` |
| ADD | `cancelAddMark(): void` |
| MODIFY | `openAddMark()` `:239-244` — emit after the existing seeding logic |
| MODIFY | `confirmAddMark()` `:246-251` — emit `null` **after** `matrixState.addMark(...)` and `addMarkOpen = false` |
| ADD | `implements OnChanges, OnDestroy` + `ngOnChanges()` + `ngOnDestroy()` |
| MODIFY | class imports — add `OnChanges`, `OnDestroy`, `SimpleChanges` from `@angular/core`; the `PropagationStop` import at `:9` stays (still used by `stopName`) |

### B. `src/app/matrix/target-card/target-card.component.html`

| Action | Lines |
|---|---|
| DELETE | `:64-66` — the `@if (propagationPreview; as preview)` block and its span |
| MODIFY | `:59` — `[(ngModel)]="selectedDeckerId"` → `[ngModel]="selectedDeckerId" (ngModelChange)="onSelectedDeckerChange($event)"` |
| MODIFY | `:71` — `(click)="addMarkOpen = false"` → `(click)="cancelAddMark()"` |
| ADD | inside `.tc-info-row`, immediately after the `.tc-type-icon` at `:5-6` — the marker span (see "Proposed approach §4") |
| MODIFY | `:4` — `<div class="tc-info-row">` gains `[class.tc-prop-landing]` / `[class.tc-prop-capped]` |
| KEEP unchanged | `:44-48` — the `×` tooltip and both `propagationDestinationNames()` calls |

### C. `src/app/matrix/target-card/target-card.component.css`

| Action | Lines |
|---|---|
| DELETE | `.tc-propagation-preview` — `:245-284` |
| KEEP unchanged | `.tc-propagated-badge` `:237-243`; `.tc-add-mark-blocked` `:286-293`; `.tc-add-mark-group` `:163-178` (its `min-width: 0` comment now references a deleted sibling — update the comment, keep the rule) |
| ADD | `.tc-prop-landing`, `.tc-prop-capped`, `.tc-prop-marker` |

### D. `src/app/matrix/hierarchy-editor/hierarchy-editor.component.ts`

| Action | Symbol |
|---|---|
| ADD | `markHighlight: MarkHighlightRequest \| null = null` |
| ADD | `private highlightByNodeId = new Map<string, PropagationStop>()` |
| ADD | `onPropagationHighlightChange(req: MarkHighlightRequest \| null): void` |
| ADD | `private recomputeHighlight(): void` |
| ADD | `highlightStateFor(nodeId: string): PropagationHighlightState \| null` |
| ADD | `implements OnInit, OnDestroy` — subscribe/unsubscribe `matrixState.stateChange$` |
| MODIFY | imports — add `OnInit`, `OnDestroy` from `@angular/core`; `PropagationStop` from `app/services/matrix-state.service` |
| KEEP unchanged | everything else, including `hostAvailableDeckers()` `:411-413` and `openHostAddMark()` `:419-425` (the host +Mark control's two gaps stay open — out of scope) |

### E. `src/app/matrix/hierarchy-editor/hierarchy-editor.component.html`

| Action | Lines |
|---|---|
| MODIFY | `:353` — `.hier-public-node` gains `[attr.data-target-id]="t.id"` and `[class.hier-prop-landing]` / `[class.hier-prop-capped]` from `highlightStateFor(t.id)` |
| MODIFY | `:354-362` — `<app-target-card>` gains `[propagationDestination]="highlightStateFor(t.id)"` and `(propagationHighlightChange)="onPropagationHighlightChange($event)"` |
| MODIFY | `:265-273` — the host-contained `<app-target-card>` gains the same two bindings |
| MODIFY | `:112` — `.hier-host-node` gains `[attr.data-host-id]="host.id"` and `[class.hier-prop-landing]` / `[class.hier-prop-capped]` from `highlightStateFor(host.id)` |
| MODIFY | `:115` — `.hier-host-header` gains the same two classes, and after `:119`'s `.hier-host-icon` gains the marker span |

### F. `src/app/matrix/hierarchy-editor/hierarchy-editor.component.css`

| Action |
|---|
| ADD `.hier-public-node.hier-prop-landing` / `.hier-prop-capped` |
| ADD `.hier-host-node.hier-prop-landing` / `.hier-prop-capped` |
| ADD `.hier-host-header.hier-prop-landing` / `.hier-prop-capped`, `.hier-prop-marker` |
| KEEP unchanged `.hier-propagated-badge` `:787-793` |

### G. `src/app/services/matrix-state.service.ts`

**No change.** `previewPropagation()` (`:426-430`) gains a caller. Do not touch
`collectPropagationStops()`, `dedupeHostStops()`, `propagateMarkUp()`,
`placeMark()`, `addMark()`, or `PropagationStop`. Do not make `allTargets()`
(`:137-141`) public — the design does not need an id→target lookup (see
"Proposed approach §2").

### H. `src/scenarios/matrix-port-rules-correctness.spec.ts`

Full per-test disposition in "Test changes required" below.

### I. Documentation

- `RULINGS.md:1354-1356` — quotes the retired string and cites
  `TargetCardComponent.propagationPreview`, which will no longer exist. Must be
  amended. **Xavier's wording, not the implementer's** — see "Documentation
  consequences".
- `SCOPE.md:33-39` — the clause Xavier approved on 2026-09-04 (old brief answer
  6) was never written. Still outstanding.
- `briefs/mark-propagation-preview.md` / `-spec.md` — leave on disk; add a
  one-line pointer at the top of each to this spec so a future reader does not
  build the retired design.

### Searched and found nothing else

- `grep "app-target-card"` across `src/` → only `hierarchy-editor.component.html:265,354`
  and the component's own selector.
- `grep "propagationPreview|propagationPreviewFull|formatOptionA|formatOptionB|tc-propagation-preview|Also marks"`
  across `src/` → only the four files listed above plus the spec file.
- `grep "\+Mark"` across `src/` → exactly **two** UI controls:
  `target-card.component.html:56` (the subject) and
  `hierarchy-editor.component.html:172` (the host's own, deliberately untouched).
  `AccessHostPanelComponent` has an Apply button with its own cap-aware label,
  not a +Mark control.
- **Session sync:** `SharedMatrixTarget` (`session-sync.service.ts:128-144`)
  carries neither `parentTargetId` nor `linkedHostId`, so nothing downstream can
  reconstruct a chain and nothing broadcasts a preview today. The highlight is
  transient GM-side view state. **No session-sync change, no server change, no
  player-view change.**

---

## Proposed approach

### 1. The off-screen problem — what the code actually permits

This is the crux the request asked me to solve. The answer is largely structural
and mostly good news.

**Finding 1 — collapse cannot hide a destination.** There is no per-node
collapse in the public tree (`publicTargetNodeTpl`'s children loop,
`hierarchy-editor.component.html:386-388`, is unconditional). The only two
collapse toggles are `publicSpaceExpanded` (`ts:100`, `:316-318`) and
`expandedHosts` (`ts:101`, `:320-326`). Collapsing Public Space removes the
`.hier-section-body` at `html:33` — which contains the clicked card and its
+Mark picker. Collapsing a host removes `.hier-host-body` at `html:148` — which
contains that host's target cards and their pickers. **In both cases the picker
disappears with the destination.** Therefore:

> **Do not build auto-expand.** There is no reachable state in which a picker is
> open and a destination is inside a collapsed branch.

**Finding 2 — every destination that matters is a DOM ancestor of the clicked
card.**

- Branch (b) (open-grid parent chain) resolves parents only from
  `state.publicTargets` (`matrix-state.service.ts:522`), and the tree renders
  public space strictly by the same parent links (`childrenOf`,
  `hierarchy-editor.component.ts:466-468`). So every branch-(b) destination is a
  containing `.hier-public-node`.
- Branch (a) for a `context: "host"` device: the destination host's
  `.hier-host-node` contains the card (`html:264-274` sits inside
  `.hier-host-body`, inside `.hier-host-node`), and `.hier-host-header`
  (`:115-145`) is rendered unconditionally.
- **A host target is never a destination.** Branch (b) only ever emits public
  targets; branch (a) only ever emits hosts. So the `<app-target-card>` at
  `html:265` can never be highlighted with today's data shapes — the binding is
  added there anyway, deliberately, so a future data change cannot silently
  produce an unhighlighted destination.

**The design that follows.** Highlight the *containing rail*, not only the
destination's own row. `.hier-public-node`'s existing `border-left`
(`css:747-750`) already runs the full height of that node's entire subtree. Turn
an affected ancestor's rail amber and it is visible **immediately to the left of
the clicked card**, at a fixed x set by the indent, with no scrolling at all.
Two affected ancestors = two amber rails stacked beside the icon you tapped.

The compounding indent — the thing that killed every wording option — is exactly
what makes each ancestor's rail land at its own distinct x. It stops being the
enemy.

**Residual risk that cannot be designed away, stated plainly:**

1. The GM learns *how many* destinations are above and that they are above, but
   not *which*, without scrolling. That is the direct cost of deleting the text.
   Accepted knowingly (brief "Revision 2", decided item 1).
2. The S5 data shape — `context: "public"` **with** a `linkedHostId` — puts the
   destination host in the Hosts list, a different section, with no rail
   relationship to the clicked card. **Not constructible through the UI**
   (`saveTargetForm()`, `hierarchy-editor.component.ts:257-269`, writes
   `context: host ? "host" : "public"` and `linkedHostId: f.hostId ?? undefined`
   together; the edit branch at `:248-256` writes neither; the target form
   `html:290-349` has no host picker). Reachable only via `updateTarget()` or a
   hand-built fixture. The host row is highlighted correctly; it may be
   arbitrarily far away. Flagged, not fixed.
3. The malformed-cycle shape (`a.parent = b`, `b.parent = a`) renders **nowhere**
   in the tree at all: `childrenOf(null)` (`ts:467`) matches only targets with no
   parent, and neither `a` nor `b` qualifies. So there is no card to click and no
   node to highlight. The cycle guard still matters (it protects the accessor
   from hanging) but its coverage must be asserted at component-state level, not
   in the DOM.

**Auto-scroll: recommended NO.** See Open Decision 2. The rails already carry
the "there are N up there" signal without moving anything, and auto-scrolling on
picker-open has a strictly worse failure mode at the table — it moves the ✓/✕
buttons out from under the GM's finger mid-combat. If Xavier wants it anyway, it
is a bounded conditional scroll on `.hier-editor` (the scroll container,
`css:3-12`), specified in that Open Decision.

### 2. Where the highlight state comes from

One traversal, owned by the service, computed once per change — never per node,
never per tick.

New shared types, exported from `target-card.component.ts` (the card is the
producer):

```ts
export type PropagationHighlightState = "landing" | "capped";
export interface MarkHighlightRequest { target: MatrixTarget; deckerId: string; }
```

`MarkHighlightRequest` carries the **`MatrixTarget` object**, not an id.
Deliberate: it removes any need for an id→target lookup in the editor, and so
removes any temptation to make `MatrixStateService.allTargets()` (`:137-141`)
public or to write a second search.

Flow:

1. `TargetCardComponent` emits `propagationHighlightChange` with a request, or
   `null`. It emits **only from event handlers and lifecycle hooks, never from a
   getter.**
2. `HierarchyEditorComponent.onPropagationHighlightChange(req)` stores
   `this.markHighlight = req` and calls `recomputeHighlight()`.
3. `recomputeHighlight()`:
   - clears `highlightByNodeId`;
   - if `markHighlight` is `null`, returns;
   - calls `this.matrixState.previewPropagation(markHighlight.target,
     markHighlight.deckerId)` **exactly once**;
   - for each stop, `highlightByNodeId.set(stop.id, stop)`.
4. `highlightStateFor(nodeId)` is a `Map.get` → `stop.willLand ? "landing" :
   "capped"`, or `null`. O(1). Safe to call from the template for every node on
   every change-detection tick.
5. `HierarchyEditorComponent` subscribes to `matrixState.stateChange$` in
   `ngOnInit` and calls `recomputeHighlight()`, so a mark placed or removed
   elsewhere while a picker is open updates the cap state. Unsubscribe in
   `ngOnDestroy`.

**This is the only place `previewPropagation()` is called for the highlight, and
it is called once per state change, not once per node.** The card no longer
calls it for the picker at all — it keeps calling it once, unchanged, inside
`propagationDestinationNames()` for the `×` tooltip.

**No validity lookup is needed and none should be added.** If the source target
is deleted its card is destroyed, which fires `ngOnDestroy` → emit `null`. If a
*destination* is deleted, `stateChange$` fires, `recomputeHighlight()` runs from
the still-valid source, and the deleted node is no longer rendered anyway.

**Change-detection safety.** All writes to `markHighlight` originate in DOM event
handlers or in `stateChange$` callbacks raised from DOM event handlers — i.e.
before Angular's change-detection pass. Parent bindings are evaluated before
child components are checked, and by then the values are already settled. No
`ExpressionChangedAfterItHasBeenChecked` is expected. Both components stay on
Angular's default change detection; **do not introduce `OnPush`.**

### 3. Component boundary

- **Up:** `@Output() propagationHighlightChange` on `TargetCardComponent`.
- **Down:** `@Input() propagationDestination` on `TargetCardComponent`, plus
  classes the editor puts on its **own** elements (`.hier-public-node`,
  `.hier-host-node`, `.hier-host-header`).

An `@Output`/`@Input` pair rather than a shared service, because
`TargetCardComponent` has exactly one parent (`HierarchyEditorComponent`,
`html:265` and `:354`) and there is no third consumer. A service would add
global transient state with the same clear-path obligations and no benefit
today. Revisit only if the queued `briefs/matrix-graph-readability-spec.md` work
lands and the graph wants the same highlight — see Scope Question 2.

The `@Input` is required (not merely convenient) because Angular's default
`Emulated` view encapsulation prevents the editor's stylesheet from reaching
`.tc-info-row` inside the card's template.

**No cycle.** A target is never its own propagation destination
(`previewPropagation` seeds `visited` with `target.id`,
`matrix-state.service.ts:428`), so the card that emits is never the card that
receives the resulting `@Input`.

**`HierarchyEditorComponent` is now IN scope. What that opens up, and what it
does not:** it opens up its template, its stylesheet, its lifecycle (it gains
`OnInit`/`OnDestroy` and one subscription), and its two `<app-target-card>`
bindings. It does **not** open up its host +Mark control. The two pre-existing
gaps found by the previous review — no blocked-reason message at
`html:169-183`, and `hostAvailableDeckers()` (`ts:411-413`) not filtering
nameless participants the way `availableDeckers`
(`target-card.component.ts:208-212`) does — **remain out of scope and must not
be fixed in this change.** They are still a separate request.

### 4. Rendering — exact visual specification

Three cues fire together for every destination.

**Round-6 review correction (2026-09-06):** cues 1 and 2 below are
layout-neutral (`box-shadow: inset` and `outline` cost no layout by
construction). **Cue 3, the marker glyph, is not.** It is only present in the
DOM on the rows a picker actually reaches, so opening a picker inserts a new
flex item into those rows and shifts everything after it —
`.tc-name`/`.tc-dr`/`.tc-spotted-btn` — right by the glyph's own width plus
the row's `gap`. Measured: +12.5px (a destination host name's rendered `left`
moved from 15.6px to 28.1px). This was asserted false by both this section's
original wording and the code comment it produced
(`target-card.component.css`, since corrected) — the original AC-13 below is
corrected to match. The outer `.hier-public-node`/`.tc-info-row`/
`.hier-host-node` boxes are unaffected (they are block-level flex containers
whose own size does not depend on how their children's space is
redistributed), so the ancestor-rail geometry AC-10 depends on still holds
exactly; only the affected row's *own children* shift. A fixed-width
placeholder reserving the glyph's space on every row, always, was considered
and rejected: it would add ~12.5px of permanently dead space next to every
icon in the tree, all the time, to avoid a change that only ever affects the
small number of rows a given picker actually highlights while it is open.

**Cue 1 — the rail (survives scrolling).**

```css
.hier-public-node.hier-prop-landing {
  border-left-color: #ffb340;
  box-shadow: inset 2px 0 0 0 #ffb340;   /* thicker, without changing geometry */
}
.hier-public-node.hier-prop-capped {
  border-left-color: rgba(255, 179, 64, 0.55);
  border-left-style: dashed;             /* same 1px width — no reflow */
}
```

`box-shadow: inset` is drawn inside the padding box and costs no layout. The
`border-left-width` stays `1px` in every state, so nothing shifts.
Non-colour distinction: **thick+solid = will land; thin+dashed = capped.**

For a host, the left border is already claimed by `.hier-host-active`
(`css:243-245`), so the host node uses the inset shadow for landing:

```css
.hier-host-node.hier-prop-landing { box-shadow: inset 3px 0 0 0 #ffb340; }
```

**Corrected 2026-09-06 (N-10, round-7 review; D-6, round-8 review — this
section had not been updated to match):** the capped host rail is **not**
the same box-shadow at a lower alpha. That was the original design here, and
it shipped as a same-width, same-shape, merely-dimmer rail — solid-vs-dimmer,
not solid-vs-dashed. Part 0's "Correction, 2026-09-06" tells the GM to read
solid-vs-dashed, and the device rail already renders that distinction via a
real `border-left-style: dashed` (`.hier-public-node.hier-prop-capped`,
above) — a capped host showed a hairline-vs-thick contrast with no dashed
pattern at all, inconsistent with the device cue sitting right next to it in
the same tree. `.hier-host-node`'s own `border-left` is reserved for
`.hier-host-active`, and `box-shadow` cannot render a dashed pattern, so the
capped host rail is instead a separate `::before` pseudo-element:

```css
.hier-host-node.hier-prop-capped::before {
  content: "";
  position: absolute;
  top: 0; bottom: 0; left: 0;
  border-left: 3px dashed rgba(255, 179, 64, 0.55);
  pointer-events: none;
}
```

`position: absolute` costs no layout (AC-13); `pointer-events: none` keeps it
from becoming a fourth tappable thing on this row. Both landing and capped
rails coexist with the green active border (border box vs padding box /
an absolutely-positioned overlay).

**Cue 2 — the row tint (says which icon).**

```css
.tc-info-row.tc-prop-landing { background: rgba(255, 179, 64, 0.14); }
.tc-info-row.tc-prop-capped  { background: rgba(255, 179, 64, 0.06);
                               outline: 1px dashed rgba(255,179,64,0.5);
                               outline-offset: -1px; }
.hier-host-header.hier-prop-landing { background: rgba(255, 179, 64, 0.14); }
.hier-host-header.hier-prop-capped  { background: rgba(255, 179, 64, 0.06);
                                      outline: 1px dashed rgba(255,179,64,0.5);
                                      outline-offset: -1px; }
```

`outline` does not participate in layout — chosen over `border` for that reason.

**Cue 3 — the marker glyph (the non-colour cue; see Accessibility).**

In `target-card.component.html`, immediately after `.tc-type-icon` (`:5-6`):

```html
@if (propagationDestination) {
<span class="tc-prop-marker" role="img"
      [class.tc-prop-marker-capped]="propagationDestination === 'capped'"
      [attr.aria-label]="propagationMarkerLabel"
      [title]="propagationMarkerLabel">{{ propagationMarkerGlyph }}</span>
}
```

In `hierarchy-editor.component.html`, immediately after `.hier-host-icon`
(`:119`), the same shape driven by `highlightStateFor(host.id)`.

Glyphs — `▲` for `landing`, `△` for `capped`. Filled-vs-hollow matches the
app's existing vocabulary (`dots()`, `target-card.component.ts:231-233`, uses
`●`/`○`), needs no icon-library dependency, and is legible with no colour
perception at all.

`propagationMarkerLabel` (getter on `TargetCardComponent`, and the equivalent on
the editor for hosts):

- `landing` → `"Will also receive 1 mark when this +Mark is confirmed"`
- `capped` → `"Already at the 3-mark cap for the selected decker — will receive nothing (p. 236)"`

These strings never render as visible layout: they are `aria-label` and `title`
only. They are not a reinstatement of the removed sentence — they name **one**
icon's state, not the list. Flagged under Open Decision 6 so Xavier can confirm
that reading.

**Colour values are starting points.** `#ffb340` is fixed (decided). The alpha
values above are proposals; Xavier may tune them at the table without any
structural change.

### 5. Lifecycle — every appear and clear path

**Appears** when, and only when, `TargetCardComponent` emits a non-null request.
That happens in exactly two places:

| Trigger | Method |
|---|---|
| GM taps `+Mark` | `openAddMark()` — emit **after** the existing seeding at `:241-243`, so the emitted `deckerId` is the seeded one |
| GM changes the decker dropdown | `onSelectedDeckerChange(id)` — new, bound at `html:59` |

Both emit `{ target: this.target, deckerId: this.selectedDeckerId }`, **except**
that both emit `null` instead when `this.addMarkBlockedReason !== null`. That
reproduces `propagationPreview`'s `:77` guard exactly, at the same single choke
point, keeping the "nothing will be placed → say nothing" rule in one place. It
is what AC-6 tests.

**Clears** — every path, including accidental ones:

| # | Situation | Mechanism |
|---|---|---|
| 1 | GM confirms | `confirmAddMark()` (`:246-251`) — emit `null` **after** `matrixState.addMark(...)` and `addMarkOpen = false`. Ordering matters: `addMark` fires `stateChange$`, which triggers a recompute; emitting `null` afterwards is what actually clears |
| 2 | GM cancels (✕) | new `cancelAddMark()` — `addMarkOpen = false`; emit `null`. Replaces the inline `(click)="addMarkOpen = false"` at `html:71` |
| 3 | GM opens another icon's picker | that card emits its own request; the editor replaces `markHighlight` wholesale, AND (superseded 2026-09-06, Defect 4) closes every other card's own picker via `pickerOpened`/`closePickerSilently()` — see Open Decision 3 |
| 4 | GM picks a decker who is capped on the clicked icon | `onSelectedDeckerChange()` emits `null` because `addMarkBlockedReason !== null` |
| 5 | Target deleted while its picker is open (`deleteTarget`, `ts:287-304`) | `ngOnDestroy()` — emit `null` |
| 6 | Public Space collapsed (`togglePublicSpace`, `ts:316-318`) | `@if` at `html:33` destroys the subtree → `ngOnDestroy()` |
| 7 | Host collapsed (`toggleHost`, `ts:320-326`) | `@if` at `html:148` destroys the subtree → `ngOnDestroy()` |
| 8 | Host deleted (`deleteHost`, `ts:190-194`) | subtree destroyed → `ngOnDestroy()` |
| 9 | Matrix panel collapsed (`MatrixRunPanelComponent.toggleCollapse`, `matrix-run-panel.component.html:14`) | whole subtree destroyed → `ngOnDestroy()` |
| 10 | Decker jacks out; `activeDeckers` empties or the last available decker is filtered out | `ngOnChanges()` — if `addMarkOpen && availableDeckers.length === 0`, set `addMarkOpen = false` and emit `null`. **Required:** `@if (availableDeckers.length > 0)` (`html:52`) removes the picker's DOM but leaves `addMarkOpen === true` and would otherwise strand the highlight with no event |
| 11 | `target` `@Input` replaced on a reused card instance | `ngOnChanges()` — if `changes['target']` and `addMarkOpen`, close and emit `null` |
| 12 | An ancestor's mark count changes elsewhere while the picker is open | not a clear — the editor's `stateChange$` subscription recomputes, so `landing`/`capped` stays correct |
| 13 | `matrixState.jackOut()` erases every mark (`:89-116`, `:118-134`) | `stateChange$` → recompute; the source card's own `availableDeckers` also changes → path 10 |
| 14 | Editor itself destroyed | `HierarchyEditorComponent.ngOnDestroy()` unsubscribes `stateChange$` |

**Known non-clear, accepted:** if `availableDeckers` is non-empty but the tree
scrolls so the picker leaves view, the highlight stays. Correct — the picker is
still open and still armed.

---

## Scope classification

Proposal only. Xavier approves; nothing here is settled.

### TRACK — the app must represent or compute this

1. When the +Mark picker is open, the hierarchy tree shows every icon
   `addMark()` will reach. `SCOPE.md:40` "Making state visible at a glance";
   `RULINGS.md` 2026-09-03.
2. Each destination is shown in one of two states — will receive, or already at
   the 3-mark cap and will receive nothing. `SCOPE.md:74-79`; the app already
   holds every number required (`PropagationStop.willLand`).
3. The highlight is evaluated for the decker currently selected in the picker
   and updates live when that selection changes. The cap is per decker (p. 236).
4. Nothing is highlighted when nothing will be placed.
5. The highlight and the write path share one traversal
   (`collectPropagationStops`) — preserved, not rebuilt.
6. A destination whose own row is scrolled out of view is still signalled at the
   clicked icon (the ancestor rail).
7. The state is distinguishable without colour perception.
8. The `×` remove tooltip continues to name every destination in words
   (unchanged behaviour, restated as a criterion because a careless deletion
   would break it).

### GM RESOLVES — the GM decides; the app records

- Whether to place the mark at all, having seen the highlight.
- Whether a propagated mark on a capped ancestor "should" have landed. The app
  reports; the GM hand-edits that ancestor's row if the fiction disagrees
  (`RULINGS.md` 2026-09-03).
- Whether an ancestor's existing three marks came from this chain or elsewhere.
  No per-source ledger exists, deliberately (`MatrixTarget.propagatedMarks` doc
  comment).
- Which chain highlights when two pickers are opened in a row — last-opened wins (Open Decision 3). Superseded 2026-09-06: the GM no longer has to track which OTHER picker is still open, since only one ever is.

### OUT OF SCOPE — per `SCOPE.md`

- Reversing propagation on removal. `RULINGS.md` 2026-09-03; `SCOPE.md:69-72`.
- Refusing a mark because an ancestor is capped. `SCOPE.md:44-48` — warn, don't
  refuse.
- Deriving a mark count from anything. `RULINGS.md` 2026-09-02 Decision 1.
- Rendering the highlight in the player view. GM-side control; `SharedMatrixTarget`
  carries no chain data to render it from.
- The host's own +Mark control's two gaps.
- The two queued changes (mark counter control; parent dropdown into edit view).

### SCOPE QUESTION

Flagged rather than silently excluded. Xavier decides.

**1. A fixed-width destination counter (`↑2`) beside the picker.**
*For:* ~20px, not 280px; guarantees the count is legible even if the GM's eye
misses the rails, which is the one thing a highlight cannot guarantee.
*Against:* it is text, and decided item 1 says the text goes entirely and "the
highlight carries the whole warning" — building this without asking would be
reopening a closed decision.
*My position:* do not build in v1. Keep it as the first fallback if the rails
under-perform at the table.

**2. Mirror the highlight onto `MatrixGraphComponent`.**
*For:* the graph's `GraphNode.id` is already the target/host id
(`matrix-graph.component.ts:113,127,139,176`), so the same `highlightByNodeId`
map would drive it with a class binding; the graph is on screen beside the tree
in the same panel.
*Against:* it overlaps `briefs/matrix-graph-readability-spec.md` (unbuilt),
which independently proposes drawing the propagation path as edges — building
both separately risks two answers to one question; and it would force the
`@Output`/`@Input` pair into a shared service.
*My position:* not now. Fold it into the graph-readability work when that runs.

**3. Auto-scroll the topmost destination into view.** See Open Decision 2.

**4. Write the outstanding `SCOPE.md` clause.** Approved 2026-09-04, never
written. What it should say now depends on Open Decision 1.

---

## Size check

**Roughly a day and a half to two days.** Larger than the change it replaces,
mostly in tests.

- Build: two component classes, two templates, two stylesheets. No service
  change. Call it half a day.
- Tests: about **sixteen** existing tests need rewriting, **one** needs deleting,
  and the highlight needs new `HierarchyEditorComponent`-fixture tests it has no
  existing pattern for at the target-card level (today only four describe blocks
  use that fixture: `:629`, `:736`, `:887`, `:2832`). Call it a full day.

**Do not split.** Splitting "delete the text" from "add the highlight" would
ship a build with no propagation warning at all, which fails `RULINGS.md`
2026-09-03 outright. The only separable piece is auto-scroll (Open Decision 2),
which is the natural thing to drop if this runs long.

**Do not expand.** The host +Mark gaps, the graph highlight, the mark counter
control and the parent dropdown move are each their own request.

---

## Acceptance criteria

TRACK items only. Each checkable against observable behaviour.

1. Given three public device targets chained `gun → mount → drone` (all
   `type: "device"`, `context: "public"`, no caps reached) rendered in
   `HierarchyEditorComponent`, opening +Mark on `gun` and selecting a decker
   causes `mount`'s and `drone`'s rendered rows to carry the landing highlight
   and `gun`'s row to carry none.
2. In the same fixture, the number of rows carrying any propagation highlight
   equals the number of `marks` records that change when the GM confirms (two),
   and the highlighted ids equal the changed ids.
3. With `mount.marks[decker] === 3` and `drone.marks[decker] === 0`, `mount`
   renders the **capped** state and `drone` renders the **landing** state — the
   chain is visibly not ended at `mount`.
4. With `mount.marks[decker] === 3` **and** `drone.marks[decker] === 3`, both
   render the capped state and neither renders the landing state.
5. Changing the decker in the picker to one with different mark counts changes
   the rendered highlight states on the next change-detection cycle, with no
   further GM action.
6. While `addMarkBlockedReason !== null`, **no** element in the editor carries
   any propagation highlight class, and no marker glyph is rendered anywhere.
7. For a `"device"` inside a host (`context: "host"`, `linkedHostId` set), the
   host's `.hier-host-header` carries the highlight and no target row does. With
   `host.marks[decker] === 3` it carries the **capped** state.
8. No highlight is produced for any target whose `type` is not `"device"`,
   regardless of `linkedHostId` or `parentTargetId`, when a decker with room is
   selected and `addMarkBlockedReason === null`.
9. No highlight is produced for a `"device"` with neither a resolvable
   `linkedHostId` nor a device parent — including the case of a parent that
   resolves but is a `file`.
10. In the `gun → mount → drone` fixture with the picker open on `gun`, the
    bounding rectangle of each highlighted ancestor's `.hier-public-node`
    **vertically contains** the bounding rectangle of `gun`'s `.tc-marks-row`,
    and each ancestor's rail is at a distinct x.
11. Every highlighted row renders a marker glyph whose `textContent` is `▲` for
    landing and `△` for capped, carrying a non-empty `aria-label`. The two
    states are distinguishable by `textContent` alone, with no reference to
    colour.
12. `.tc-propagation-preview` does not exist in the rendered DOM under any
    condition — including a chain four deep with a 50-character nearest name at
    the previously-measured worst-case pane width — and `.tc-confirm-btn` and
    `.tc-cancel-btn` both render with non-zero width inside the pane, on one
    line.
13. Opening the picker changes no `.hier-public-node`'s, `.tc-info-row`'s, or
    `.hier-host-node`'s own `getBoundingClientRect()` `left`, `top`, `width`
    or `height` anywhere in the tree, other than the +Mark group's own
    open/closed swap on the clicked card (which legitimately grows the
    clicked card's own row and, in consequence, its DOM ancestors' `height`)
    and the `top` of anything rendered after the clicked card in document
    order (pushed down by that same swap, not resized). **Corrected
    2026-09-06 (Defect 5):** this criterion does NOT extend to a highlighted
    row's own children (`.tc-name`, `.tc-dr`, `.tc-spotted-btn`) — cue 3, the
    marker glyph, shifts those by its own width (+~12.5px, measured) on every
    row a picker actually reaches, by design; see "Rendering" §4's round-6
    correction for why that trade was accepted over reserving the glyph's
    width everywhere, always.
14. Confirming, cancelling, opening a different icon's picker, deleting the
    target, collapsing Public Space, collapsing the host, and `activeDeckers`
    emptying each leave zero highlighted elements.
15. Reading any highlight accessor mutates no `marks` record, no
    `propagatedMarks` record, and emits nothing on `matrixState.stateChange$`.
16. The `×` remove-mark button's `title` still names every propagation
    destination (`Host Ares-7`, or `Weapon Mount, MCT Roto-Drone`), carries no
    cap wording, still contains the word "stays", and is byte-identical to
    today's for a target with no destinations (`Remove 1 mark from <decker>`).
17. Every pre-existing assertion in the `MatrixStateService.addMark()`
    propagation describe block, `matrix-port-rules-correctness.spec.ts:2309-2658`,
    passes **unchanged** — including the four `previewPropagation()` tests at
    `:2556`, `:2576`, `:2606`, `:2631`.
18. Reading `highlightStateFor()` for a node with a malformed parent cycle in
    state terminates and does not throw.

---

## Regression risk

| Risk | Covered by |
|---|---|
| The shared walk drifts while "just" changing the UI | AC-17. `matrix-state.service.ts` must have a zero-line diff. The four `previewPropagation()` tests (`:2556`, `:2576`, `:2606`, `:2631`) and the ~20 `addMark()` propagation tests (`:2309-2658`) must pass untouched. **If any go red, the change is wrong — do not adjust them.** |
| `propagationDestinationNames()` deleted along with its neighbours | AC-16, and three existing tests kept verbatim: `:1759-1778`, `:1780-1809`, `:1811-1823` |
| Decision 8 (device-only) gate stops being exercised | AC-8/AC-9. The rewritten tests must keep the fixture note at `:1673-1680`: a decker with room **must** be selected, or the assertion passes vacuously without ever reaching `previewPropagation()` |
| Highlight shifts the tree layout | AC-13. `box-shadow: inset` and `outline` are used precisely because they cost no layout; a careless switch to `border`/`padding` would reflow the whole tree |
| Truncation problem "gone" claimed but not proved | AC-12, built on the existing measurement harness — reuse `buildFourDeepChainFixture()`, `HIER_TREE_INDENT_PER_LEVEL_PX`, `CHAIN_DEPTH_FOR_LAYOUT_TEST`, `NARROW_LEFT_PANE_WIDTH_PX`, `EFFECTIVE_NARROW_WIDTH_PX` and `LONG_NEAREST_NAME_LENGTH` (`:2155-2202`) rather than deleting them |
| Stranded highlight after the picker's DOM is removed by `@if (availableDeckers.length > 0)` | Lifecycle path 10; AC-14 |
| Two open pickers, one highlight | Open Decision 3 (superseded 2026-09-06, Defect 4 — the other picker now closes); scenario S7 |
| `stateChange$` subscription leaks | `HierarchyEditorComponent.ngOnDestroy()`; the component had no subscriptions before this change |
| `ExpressionChangedAfterItHasBeenChecked` from parent reading child-derived state | All writes happen in event handlers before CD. Assert by running the suite in Angular dev mode, which is the default under `ng test` |
| Someone "optimises" either component to `OnPush` later without `markForCheck` | AC-5 catches it. Doc comment on `highlightStateFor()` must say so |
| The two accessors re-merged, or the marker's `aria-label` grown back into a full list | Doc comments; AC-11 asserts glyph-level state only |
| `RULINGS.md:1354-1356` left citing a deleted symbol | Documentation consequences, below — must land in the same commit |

---

## How the highlight is tested

The previous rounds established that layout and rendering claims are worthless
without real measurement. A highlight *is* a rendering claim. These tests assert
rendered state in a real browser (`karma.conf.js` runs `ChromeHeadless`), not
component fields.

**Fixture shape.** The highlight renders on `HierarchyEditorComponent`'s nodes,
so the new tests must use a `ComponentFixture<HierarchyEditorComponent>` with
real `app-target-card` children — the pattern at
`matrix-port-rules-correctness.spec.ts:736-759` (public tree) and `:887-916`
(host, including the `component.toggleHost(host.id)` step that hosts need
because `expandedHosts` starts empty). Tests written against a bare
`ComponentFixture<TargetCardComponent>` **cannot** verify this feature; they can
only verify the emit contract.

**What is asserted, in order of value:**

1. **Geometry (the load-bearing claim).** For the `gun → mount → drone` fixture
   with the picker open on `gun`: query `.hier-public-node[data-target-id]` for
   each ancestor, take `getBoundingClientRect()`, and assert each ancestor's
   rect vertically contains `gun`'s `.tc-marks-row` rect, and that the three
   `left` values are strictly increasing. This is the only test that proves "the
   GM can see it without scrolling". AC-10.
2. **Layout neutrality (corrected 2026-09-06, Defect 5/6).** Snapshot
   `getBoundingClientRect()` for every `.hier-public-node` and every
   `.tc-info-row` before `openAddMark()`, snapshot again after. Assert
   `left`/`width` equality everywhere; assert `height` equality everywhere
   except the clicked card and its DOM ancestors (whose height legitimately
   grows from the +Mark group's own open/closed swap); assert `top` equality
   everywhere except elements rendered after the clicked card in document
   order (pushed down by that same swap's height delta, per
   `compareDocumentPosition`, not resized). Does **not** cover a highlighted
   row's own children (`.tc-name`, `.tc-dr`, `.tc-spotted-btn`, which the
   marker glyph legitimately shifts — see "Rendering" §4). This is what makes
   "the truncation problem is provably gone" a measurement rather than an
   assertion. AC-13.
3. **Computed style, not class names.** `getComputedStyle(el).boxShadow`
   contains `255, 179, 64`; `getComputedStyle(el).borderLeftStyle` is `dashed`
   for the capped rail and `solid` for the landing one. A class-name-only
   assertion passes even if the CSS rule was never written or was overridden by
   the cascade — that is exactly the failure the round-2 review caught with
   `max-width: 100%`.
4. **Glyph and accessible name.** `marker.textContent.trim()` is `▲` or `△`;
   `marker.getAttribute('aria-label')` is non-empty and differs between the two
   states. Asserted on `textContent`, deliberately, so the test would still pass
   for a colour-blind reader. AC-11.
5. **Absence.** `querySelectorAll('.tc-propagation-preview').length === 0` and
   `querySelectorAll('.hier-prop-landing, .hier-prop-capped').length === 0` in
   every clear-path scenario. AC-12, AC-14.
6. **Purity.** Subscribe to `stateChange$`, read every highlight accessor, assert
   zero emissions and no mutated records. AC-15.
7. **Emit contract, at the card level.** A `ComponentFixture<TargetCardComponent>`
   with a subscription to `propagationHighlightChange`, asserting the exact
   sequence of emitted values across open → decker change → cancel → open →
   confirm, and `null` on `fixture.destroy()`.
8. **Cycle guard at component-state level, not DOM level.** The `a ↔ b` fixture
   renders nowhere (`childrenOf(null)` matches neither), so assert
   `highlightStateFor()` terminates via a direct call. AC-18.

**What genuinely cannot be automated, and must be checked at the table:**

- Whether amber is actually *noticed* at a glance mid-combat, against this
  panel's dark-green ground.
- Whether N stacked rails read as "N ancestors" rather than as decoration.
- Whether a colour-blind GM finds the `▲`/`△` distinction sufficient at 0.82rem
  in a monospace font — the tests prove the cue exists and is non-colour, not
  that it is perceptually adequate.
- Whether the residual "I can see how many but not which" cost is acceptable in
  play. That is Xavier's judgement and the reason the `↑N` chip is parked as
  Scope Question 1 rather than dropped.
- Real scroll behaviour inside `.hier-editor`'s 500px window with a
  table-realistic number of icons.

---

## Test changes required

File: `src/scenarios/matrix-port-rules-correctness.spec.ts`.

### Describe block `'TargetCardComponent propagation visibility (Decision 9, 2026-09-03)'` (`:1611-2305`)

| Lines | Test | Disposition |
|---|---|---|
| `:1630-1646` | `propagationPreview` names the host | **REWRITE** → host header carries the landing highlight (AC-7). Move to an editor fixture |
| `:1648-1669` | `propagationPreview` names the device parent | **REWRITE** → parent node carries the landing highlight. Keep the "one-hop fixture only" comment |
| `:1671-1690` | null for a file inside a host (Decision 8) | **REWRITE** → no highlight (AC-8). **Keep the `:1673-1680` comment verbatim** — it is why the fixture selects a decker |
| `:1692-1706` | null for a device with nothing to propagate to | **REWRITE** → no highlight (AC-9) |
| `:1714-1730` | null for a device parented to a file | **REWRITE** → no highlight (AC-9, second half) |
| `:1732-1742` | `hasPropagatedMark` | **UNCHANGED** |
| `:1744-1757` | rendered template shows the preview text | **REWRITE** → rendered template shows the highlight and contains no `.tc-propagation-preview` |
| `:1759-1778` | `×` tooltip warns upstream stays | **UNCHANGED** — boundary proof that `propagationDestinationNames()` survived |
| `:1780-1809` | `×` tooltip names BOTH destinations | **UNCHANGED** — same |
| `:1811-1823` | `×` tooltip plain for a file | **UNCHANGED** — same |
| `:1827-1872` | two-hop chain, Option B string + write | **REWRITE** the preview half (`:1848-1862`); **the `addMark` assertions at `:1864-1871` must survive verbatim** (AC-2) |
| `:1874-1901` | capped ancestor mid-chain | **REWRITE** the preview half (`:1890-1894`); **keep `:1896-1900` verbatim** (AC-3) |
| `:1903-1926` | every destination capped | **REWRITE** → both capped, neither landing (AC-4) |
| `:1928-1952` | preview changes on decker switch | **REWRITE** → highlight states change on decker switch (AC-5) |
| `:1954-1993` | null while blocked, single decker | **REWRITE** → no highlight while blocked (AC-6). **Keep the `:1981-1991` note** about why the DOM query is true for the wrong reason |
| `:1995-2048` | S4, two deckers | **REWRITE** the preview assertions (`:2024`, `:2030`, `:2045`, `:2047`); **keep `:2020-2023`, `:2028-2029`, `:2032-2039`, `:2046` verbatim** |
| `:2050-2065` | capped host | **REWRITE** → host header carries the capped state (AC-7) |
| `:2074-2096` | S5, both branches, component level | **REWRITE** → host and parent both highlighted. **Add a note** that in this shape the host is not a DOM ancestor of the clicked card and the rail cue does not apply (residual risk 2) |
| `:2098-2113` | cycle terminates | **REWRITE** → assert at component-state level, not DOM (AC-18); add a note that this fixture renders nowhere |
| `:2115-2143` | reads mutate nothing, no `stateChange$` | **REWRITE** — drop the `propagationPreview` / `propagationPreviewFull` reads at `:2133`, `:2135`; **keep the `propagationDestinationNames()` read at `:2134`**; add the new highlight accessor (AC-15) |
| `:2145-2202` | `HIER_TREE_INDENT_PER_LEVEL_PX` … `buildFourDeepChainFixture()` | **KEEP** the constants and the fixture builder; **rewrite** the Option-B comment at `:2161-2171` |
| `:2204-2268` | AC-14 truncation at narrow width | **REWRITE** into AC-12: same width, same fixture, now asserting the preview span does not exist and the ✓/✕ still render in-pane on one line |
| `:2270-2304` | AC-14 regression guard, wide pane | **DELETE** — its premise (a preview string that may or may not truncate) no longer exists. Its value transfers to AC-13 (layout neutrality) |

**Count:** 16 rewritten, 1 deleted, 4 unchanged, 1 fixture block retained.

### Describe block `'MatrixStateService.addMark() propagation (Decision 7, 2026-09-02)'` (`:2309-2658`)

**Entirely unchanged.** Explicitly including `:2556-2572`, `:2576-2602`,
`:2606-2629`, `:2631-2657`. These are the choke-point guarantee.

### New tests to add (minimum 9)

Against a `ComponentFixture<HierarchyEditorComponent>` unless noted.

1. Three-deep public chain, no caps: both ancestors landing, clicked node
   unhighlighted — AC-1, AC-2.
2. Geometry: each highlighted ancestor's node rect vertically contains the
   clicked card's marks-row rect; `left` values strictly increasing — AC-10.
3. Layout neutrality across `openAddMark()` — AC-13.
4. Computed style: landing rail solid + amber inset shadow; capped rail dashed —
   part of AC-3/AC-11.
5. Marker glyph `▲`/`△` with distinct non-empty `aria-label` — AC-11.
6. `.tc-propagation-preview` absent at depth 4 with a 50-char nearest name at
   `EFFECTIVE_NARROW_WIDTH_PX`, ✓/✕ in-pane on one line — AC-12.
7. Every clear path (confirm, cancel, other picker, delete target, collapse
   Public Space, collapse host, `activeDeckers` empties) leaves zero highlighted
   elements — AC-14.
8. Host destination, landing and capped — AC-7.
9. `ComponentFixture<TargetCardComponent>`: the emit sequence across
   open → decker change → cancel → open → confirm → `fixture.destroy()`.

---

## Scenarios to survive

Written as executable test cases.

### S1 — Ordinary: Xavier's smartgun → mount → drone chain

```
Given HierarchyEditorComponent rendered with three public device targets:
  drone = { id:'dr', name:'MCT Roto-Drone', type:'device', context:'public' }
  mount = { id:'mt', name:'Weapon Mount',  type:'device', context:'public', parentTargetId:'dr' }
  gun   = { id:'gn', name:'Smartgun',      type:'device', context:'public', parentTargetId:'mt' }
And one decker 'Tesseract' with 0 marks anywhere
And publicSpaceExpanded === true (the default)

When the GM taps +Mark on `gun` and 'Tesseract' is seeded into the picker

Then node[data-target-id='mt'] has class 'hier-prop-landing'
 And node[data-target-id='dr'] has class 'hier-prop-landing'
 And node[data-target-id='gn'] has neither highlight class
 And gun's card renders NO .tc-prop-marker
 And mount's and drone's cards each render a .tc-prop-marker with textContent '▲'
 And querySelectorAll('.tc-propagation-preview').length === 0
 And node['mt'].getBoundingClientRect() vertically contains gun's .tc-marks-row rect
 And node['dr'].getBoundingClientRect() vertically contains it too
 And left(node['dr']) < left(node['mt']) < left(node['gn'])

When the GM confirms
Then gun.marks.Tesseract === 1
 And mount.marks.Tesseract === 1
 And drone.marks.Tesseract === 1
 And mount.propagatedMarks.Tesseract === true
 And drone.propagatedMarks.Tesseract === true
 And gun.propagatedMarks.Tesseract === undefined
 And stateChange$ fired exactly once
 And querySelectorAll('.hier-prop-landing, .hier-prop-capped').length === 0
```

This is the defect the whole feature family exists for: three icons marked, and
the GM must be able to see all three coming.

### S2 — Edge: capped ancestor mid-chain, the chain continues past it

```
Given the S1 fixture
  But mount.marks = { Tesseract: 3 }

When the GM taps +Mark on `gun` with 'Tesseract' selected

Then node['mt'] has class 'hier-prop-capped'   and NOT 'hier-prop-landing'
 And node['dr'] has class 'hier-prop-landing'  and NOT 'hier-prop-capped'
 And mount's marker textContent === '△'
 And drone's marker textContent === '▲'
 And getComputedStyle(node['mt']).borderLeftStyle === 'dashed'
 And getComputedStyle(node['dr']).borderLeftStyle === 'solid'
 And node['dr'] is STILL highlighted — the capped ancestor is not the end

When the GM confirms
Then gun.marks.Tesseract === 1
 And mount.marks.Tesseract === 3      // absorbed, unchanged
 And drone.marks.Tesseract === 1      // still reached
```

Getting this backwards would make the highlight lie in the opposite direction
from the original defect. Mirrors `matrix-state.service.ts:560-579` and the
walk-side test in the untouched service block.

### S3 — Off-screen: the destination's own row is scrolled out of view

```
Given the S1 fixture
  And forty additional public devices parented to `mount`, rendered before `gun`
      (so mount's own card scrolls out of .hier-editor's 500px window
       once gun is scrolled to)
And the GM has scrolled .hier-editor so that gun's card is visible and
    mount's and drone's cards are both above the visible area

When the GM taps +Mark on `gun` with 'Tesseract' selected

Then node['mt'].getBoundingClientRect().bottom > gun's .tc-marks-row rect.top
 And node['dr'].getBoundingClientRect().bottom > gun's .tc-marks-row rect.top
     // i.e. both ancestors' rails still run past the clicked row
 And getComputedStyle(node['mt']).boxShadow contains '255, 179, 64'
 And getComputedStyle(node['dr']).boxShadow contains '255, 179, 64'
 And .hier-editor.scrollTop is UNCHANGED
     // no auto-scroll: the ✓/✕ do not move out from under the GM
 And mount's and drone's own .tc-info-row elements are outside
     .hier-editor's client rect
```

The accepted residual: the GM can see that two ancestors are affected and that
they are above, but must scroll to read their names. Asserting the scroll
position does not change is the regression guard for someone adding auto-scroll
later without Open Decision 2 being answered.

### S4 — Live at the table: the four-tap capped-decker sequence, mid-combat

```
Given two public devices:
  doorController = { id:'dc', name:'Door Controller', type:'device', context:'public' }
  maglock        = { id:'ml', name:'Maglock', type:'device', context:'public',
                     parentTargetId:'dc' }
And two deckers 'Tesseract' and 'Slamm-0'
And maglock.marks = { Tesseract: 3 }
And the card's selectedDeckerId is still 'Tesseract' from a previous placement
And players are waiting

When the GM taps +Mark on `maglock`
Then openAddMark() does NOT reseed selectedDeckerId (it is truthy)
 And availableDeckers === ['Slamm-0']
 And the <select> reports value '' (no matching option)
 And addMarkBlockedReason === 'Tesseract already holds the maximum 3 marks on
     this icon (p. 236)'
 And canConfirmAddMark === false
 And .tc-add-mark-group is rendered
 And .tc-add-mark-blocked is rendered
 And querySelectorAll('.hier-prop-landing, .hier-prop-capped').length === 0
     // no highlight promising a propagation that cannot occur
 And no .tc-prop-marker exists anywhere

When the GM selects 'Slamm-0' in the picker
Then node['dc'] has class 'hier-prop-landing'
 And canConfirmAddMark === true

When the GM confirms
Then maglock.marks['Slamm-0'] === 1
 And doorController.marks['Slamm-0'] === 1
 And zero highlighted elements remain
```

The two-decker fixture is mandatory: with one decker,
`@if (availableDeckers.length > 0)` (`html:52`) removes the whole +Mark group
and any "no highlight" assertion is true for the wrong reason (the note already
recorded at `:1981-1991`).

### S5 — Correction by hand, the only path this app has

Undo was removed (`SCOPE.md:69-72`); correcting a mis-tap means editing the
value directly. That path must stay honest, and it is the reason
`propagationDestinationNames()` is not deleted.

```
Given the S1 fixture, after the GM has confirmed S1
  (gun, mount, drone each at 1 for 'Tesseract')

When the GM realises they marked the wrong icon and hovers × on gun's mark row
Then the × tooltip reads exactly
     'Remove 1 mark from Tesseract — any mark this propagated upstream
      (Weapon Mount, MCT Roto-Drone) stays; remove it there if wrong'
 And the tooltip contains no cap wording ('at 3', 'none added', 'already')
 And the tooltip does not contain 'Also marks'

When the GM clicks ×
Then gun.marks.Tesseract === undefined
 And gun.propagatedMarks.Tesseract === undefined
 And mount.marks.Tesseract === 1    // unchanged — no reversal
 And drone.marks.Tesseract === 1    // unchanged — no reversal
 And zero highlighted elements exist (no picker is open)

When the GM then clicks × on mount's and drone's own rows
Then all three records are clear
```

If this tooltip ever loses the second name, the GM has no way to find the second
upstream icon. That is why the deletion boundary is explicit.

### S6 — Cancel and re-open on a different icon

```
Given the S1 fixture

When the GM taps +Mark on `gun`
Then node['mt'] and node['dr'] are highlighted

When the GM taps ✕ (cancel)
Then zero highlighted elements exist
 And gun.marks is unchanged
 And no mark was placed anywhere

When the GM taps +Mark on `mount` instead
Then node['dr'] is highlighted
 And node['mt'] is NOT highlighted (it is now the source, not a destination)
 And node['gn'] is NOT highlighted (propagation is one-way, upward only)
```

### S7 — Two pickers open at once (Open Decision 3, superseded 2026-09-06 — Defect 4)

```
Given the S1 fixture and a second unrelated top-level public device `camera`
      parented to nothing

When the GM taps +Mark on `gun`         → mount and drone highlight
And then taps +Mark on `camera` without cancelling gun's picker

Then gun's picker is now CLOSED (Defect 4: opening a second picker closes
      every other card's own picker; only one may be open at a time)
 And zero elements are highlighted, because `camera` has no destinations
      (last-opened-wins still governs which chain highlights — unchanged)

When the GM then taps ✕ (cancel) on camera's picker
Then zero armed pickers remain anywhere — gun's picker did not silently
      survive the cancel, because it was already closed when camera opened
```

This superseded the original brief's recommended default ("last-opened wins,
no change to picker opening") after round-6 review found the worse failure
mode: a GM who opens a second picker and then cancels it was left with the
FIRST picker still open and armed, with no highlight anywhere to warn them —
worse than the ambiguity this scenario originally illustrated, because the GM
had just actively tidied up.

### S8 — The host case, collapsed and expanded

```
Given a host Ares-7 and a device `cam` with context:'host', linkedHostId:'h1'
And expandedHosts is empty (hosts start collapsed — ts:101)

Then `cam`'s card is not rendered at all, and no +Mark control for it exists
 And zero highlighted elements exist

When the GM expands the host and taps +Mark on `cam` with 'Tesseract' selected
Then .hier-host-header for Ares-7 has class 'hier-prop-landing'
 And it renders a marker with textContent '▲'
 And .hier-host-node's computed boxShadow contains '255, 179, 64'
 And no target row is highlighted

When the GM collapses the host again while the picker is open
Then the card is destroyed, ngOnDestroy emits null,
     and zero highlighted elements exist
```

---

## Documentation consequences

### `RULINGS.md` 2026-09-03, "Propagation is visible, not reversible" (`:1341-1383`)

Bullet one (`:1354-1356`) currently reads:

> - **Before committing:** the `+Mark` control on a device states what it will
>   *also* mark — "Also marks: Host \<name\>" or "Also marks: \<parent name\>" —
>   before the GM confirms (`TargetCardComponent.propagationPreview`).

After this change, the quoted strings are retired and
`TargetCardComponent.propagationPreview` does not exist. **Whether a visual
highlight satisfies "states" is Xavier's reading of his own ruling, not mine to
decide.** Two possibilities, both requiring his word:

- **It does satisfy it.** Then the bullet must be amended to say so explicitly —
  something like "…indicates, by highlighting them in the hierarchy tree, which
  icons it will also mark" — or a future reader will reintroduce a sentence to
  satisfy the literal text, and the whole layout problem comes back.
- **It does not satisfy it.** Then this change cannot ship as specified, and
  Scope Question 1's `↑N` chip (or something else textual) becomes mandatory
  rather than optional.

The implementer must **not** invent this wording. The amendment lands in the
same commit as the code, authored from Xavier's answer.

### `SCOPE.md` — an approved change that was never made

`briefs/mark-propagation-preview.md:286` records Xavier's answer 6 on
2026-09-04: *"Yes — add the 'announce before committing' clause to `SCOPE.md`.
Done in Stage 5, with the date."* I grepped `SCOPE.md` for `announc`, `before
the GM commits` and `stating before`: **no match.** Lines 33-39 carry the
propagation bullet with no such clause.

That approval is still outstanding, and the wording it should now take depends
on the `RULINGS.md` question above. Surfaced here rather than resolved.

### The superseded briefs

`briefs/mark-propagation-preview.md` and `briefs/mark-propagation-preview-spec.md`
stay on disk as history. Add a single line at the top of each pointing to this
spec, so nobody builds the retired design from them.

---

## Overlap with Xavier's two queued changes

Neither is planned here. Both touch the same row, so the overlap is real and
worth stating.

**1. Mark counter as a control (click to add, right-click to remove).** This
would become a *third* way to place a mark, alongside the picker and the host
+Mark control. If it ships, it bypasses `openAddMark()`/`confirmAddMark()`
entirely and therefore bypasses every emit site in this spec's lifecycle table —
so it would place propagated marks with **no preview at all**, which is exactly
what `RULINGS.md` 2026-09-03 forbids. **Whoever specs it must read this spec's
lifecycle section first** and decide whether a click-to-add shows the highlight
on hover/press, or whether it is deliberately exempt. Flagging, not planning.

**2. Moving the parent dropdown into the edit view.** This deletes
`.hier-parent-row` (`hierarchy-editor.component.html:371-384`) from the tree
node. That row currently sits between an ancestor's card and its children, so
removing it changes the vertical distances this spec's geometry tests measure —
S1's and S3's assertions would still hold (they are containment assertions, not
absolute distances), but the fixture heights change. It also relieves width
pressure on the same row, which is no longer the binding constraint once the
text is gone. No conflict; note the test-fixture interaction.

---

## Open decisions

### 1. Does a highlight satisfy `RULINGS.md` 2026-09-03's requirement that the control *say* what it will also do?

**Xavier's reading. Not resolved here, and not resolvable by any agent.**

Technical grounding: the ruling's first bullet (`RULINGS.md:1354-1356`) uses the
word "states" and quotes two literal strings, both of which this change retires,
and cites a symbol this change deletes. The highlight conveys the same
information — which icons, and whether each will actually receive — through
position and colour rather than words, plus per-icon `aria-label`/`title` text
that is not visible layout.

*Recommended default if Xavier does not answer:* treat it as satisfied and amend
the ruling, because the ruling's stated purpose (`:1350-1352`) is
"discoverability… the GM must be able to see that a mark on one icon also placed
a mark somewhere else", which a highlight serves at least as well as a sentence
that truncated at depth 4. **But do not ship the amendment without his word** —
this is his ruling and the wording must be his.

### 2. Auto-scroll the topmost destination into view when the picker opens?

*Recommended: **no**.*

Technical grounding: `.hier-editor` (`hierarchy-editor.component.css:3-12`) is
the scroll container, so a bounded scroll is straightforward — set
`el.scrollTop` the way `battle-tracker.component.ts:8847-8851` already does for
the log. But the ancestor rails already reach the clicked row (AC-10), so the
"there are N up there" signal does not need it; and scrolling on picker-open
moves the ✓/✕ buttons the GM is about to tap, mid-combat, which is a worse
failure than the one it fixes. There is no reachable case where a destination is
*hidden* (Proposed approach §1, Finding 1) — only cases where its name is out of
view.

*If Xavier wants it:* make it conditional and bounded — scroll only if the
topmost highlighted node's top is above the container's visible area, scroll by
the minimum amount, and **refuse to scroll at all** if doing so would push the
clicked card's `.tc-marks-row` out of view. Add a test asserting the refusal
case. This is the natural piece to drop if the change runs long.

### 3. Two pickers open at once — last-opened wins, or close the other?

**Superseded 2026-09-06 (Defect 4, round-6 review). Built: the other picker
closes.** The original recommendation below ("last-opened wins, no change to
picker opening") shipped in round 5 and was found to break play: a GM who
opens a second picker, decides against it, and cancels it is left with the
FIRST picker still open and armed, with no highlight visible anywhere to warn
them — the highlight had already moved to the second (now-cancelled) picker
and vanished with it. Verified end to end: +Mark on `gun` (2 rails) -> +Mark
on unrelated `camera` (0 rails, correct) -> cancel `camera` -> `gun`'s picker
still open, confirming it marks three icons with no warning shown. That is
worse than the ambiguity this decision originally weighed, because the GM has
just actively tidied up and reads "no amber" as "nothing else will be
marked".

**What changed:** `TargetCardComponent.openAddMark()` now also emits a new,
separate `pickerOpened` output (carrying just `target.id`) whenever a picker
opens — including a blocked one, which `propagationHighlightChange` alone
cannot identify, since a blocked open emits `null`.
`HierarchyEditorComponent.onPickerOpened()` is the single, sole consumer: it
closes every OTHER card's own picker (`TargetCardComponent.closePickerSilently()`,
no emit) so at most one is ever open. "Last-opened wins" still governs
*which* chain highlights — that half of this decision is unchanged — but a
losing picker no longer lingers open and armed; it closes the moment it
loses.

**Why this isn't the "second piece of picker state in two places" the
original recommendation warned against:** `HierarchyEditorComponent` does not
gain a new stored field for "which picker is open" — `onPickerOpened()` reads
the live `@ViewChildren(TargetCardComponent)` list and asks each card
directly, so the only additions are one `@Output` (an announcement) and one
public method (a close). `markHighlight` remains the single source of truth
for the highlight itself.

See `matrix-port-rules-correctness.spec.ts`, describe block
`'HierarchyEditorComponent propagation highlight'`, for the regression test
(open `gun`, open `camera`, cancel `camera` -> `gun`'s picker is closed, zero
armed pickers, zero highlighted).

**Extended 2026-09-06 (N-1, round-7 review). Approved by Xavier the same day
as the fix above.** The mechanism above covers only a card's own +Mark
picker. The host's own +Mark control (`hostMarkState`, a `Map` on
`HierarchyEditorComponent` — not a `TargetCardComponent` at all) was found to
be a third picker outside it entirely: opening it never closed a card's open
picker, and opening a card's picker never closed it. Reachable end to end:
open the host's +Mark (armed, unconfirmed) -> open a card's +Mark -> cancel
the card's -> the host's picker is still open and armed, and — because
`hostMarkState` survives collapsing and re-expanding the host, unlike a
card's picker, which is destroyed with its component — it stays that way
across a collapse/re-expand of the host too. A stray tap places a mark, with
no undo. Built: `HierarchyEditorComponent.closeAllPickersExcept()` is now the
single implementation of "one +Mark picker open at a time", covering both
kinds — opening ANY picker, card or host, closes every other one, including
the other kind. Picker state still lives in exactly the two places it always
did (`targetCardsQuery`'s own cards, and `hostMarkState`); this method is
what keeps the two consistent with each other, rather than each kind only
knowing how to close its own.

### 4. Should the clicked icon itself carry a "source" marker?

*Recommended: **no**.*

Technical grounding: the clicked target is never in the stop list
(`previewPropagation` seeds `visited` with `target.id`,
`matrix-state.service.ts:428`), so leaving it unmarked is free and correct.
Marking it would make "count the amber rails" ambiguous — the GM would have to
subtract one. The picker itself is already open on that card, which is a
stronger source cue than any marker.

### 5. Exact alpha values for the capped and tint states.

*Recommended defaults are in Proposed approach §4* (`0.55` capped rail, `0.14`
landing tint, `0.06` capped tint). These are proposals, tunable at the table
without any structural change. `#ffb340` itself is fixed and decided.

### 6. Should the marker's `aria-label`/`title` exist at all?

*Recommended: **yes**.*

Technical grounding: decided item 1 removes "the text preview… no inline
sentence, no hover fallback carrying the list". A per-icon `aria-label` naming
*one* icon's state is not that list, costs zero layout width, and is the only
thing making the feature usable without colour perception at the accessible-name
level (the `▲`/`△` glyph covers the visual case). If Xavier reads decided item 1
as forbidding hover text of any kind, drop the `title` and keep the
`aria-label` — the glyph and the rail carry the sighted case regardless.

---

## Xavier's answers — 2026-09-05

Decided. The implementer builds to these.

1. **A highlight satisfies the 2026-09-03 ruling.** Open Decision 1 resolved:
   amend the ruling rather than keep text. The ruling's purpose is
   discoverability, which the highlight serves at least as well as a sentence
   that truncated at depth 4. The amendment must land in the same commit as the
   code, or a future reader reintroduces the sentence to satisfy the literal
   wording and the layout problem returns.
2. **No `↑N` counter chip.** Scope Question 1 declined for v1. The highlight
   carries the whole warning, consistent with the 2026-09-05 decision to remove
   the text entirely. It stays specced as the first fallback if the amber rails
   under-perform at the table.
3. Unchanged from the recommendations already in this spec: no auto-scroll
   (Open Decision 2), no source marker on the clicked icon (Open Decision 4),
   the proposed alpha values (Open Decision 5), and keep the per-icon
   `aria-label`/`title` on the marker glyph (Open Decision 6). **Open Decision
   3 (two open pickers) no longer reads "last-opened-wins" as this line once
   said — that was superseded 2026-09-06 (Defect 4, round-6 review): a GM who
   opened a second picker and cancelled it was left with the FIRST picker
   still open and armed, with no highlight visible anywhere to warn them.
   Xavier approved the fix on 2026-09-06: opening any card's own +Mark picker
   now closes every other card's picker, so at most one is ever open — "last-
   opened wins" still governs which chain *highlights*, but a losing picker no
   longer lingers open. Xavier approved a further extension the same day,
   2026-09-06 (N-1): the host's own +Mark control (`hostMarkState`) was found
   to be a third picker outside that mechanism entirely — reachable end to
   end (open the host's +Mark, then a card's, then cancel the card's — the
   host's picker stayed open and armed, surviving even a collapse/re-expand of
   the host) — so it is folded into the same one-picker-at-a-time rule:
   opening the host's own control closes every card's picker, and opening any
   card's picker closes the host's. See Open Decision 3's own "Superseded
   2026-09-06" and "Extended 2026-09-06 (N-1)" notes above for the full
   account, and `HierarchyEditorComponent.closeAllPickersExcept()` for the
   implementation.**

Still outstanding, and NOT the implementer's to write: the `SCOPE.md`
announce-clause Xavier approved on 2026-09-04. Now unblocked by answer 1 above;
handled in the final stage.
