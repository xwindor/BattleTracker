# Spec — Matrix graph readability and mark display

## Decisions — ANSWERED BY XAVIER 2026-09-11, BINDING ON THIS BUILD

These override every "recommended default" further down. Where the text below
still describes an alternative, this section wins.

1. **Player mark visibility: own marks only.** Increment 2 only; no rules
   dependency; nothing in Increment 1 implements it.
2. **Current host gets its own node inside the host view.** Build it.
3. **Draw edges.** Host→contents inside a host, child→parent in public space.
4. **NO propagation badge on the graph.** The graph renders all marks on an icon
   and says nothing about how any of them arrived. `propagatedMarks` is not read
   by the graph at all; `markRows()` has no `propagated` field; no
   `.mgn-mark-propagated` class; no propagation key in the legend. The existing
   `fa-link` badge on `TargetCardComponent` is untouched and continues to
   satisfy `RULINGS.md` 2026-09-03 ("Propagation is visible, not reversible") —
   that ruling is honoured on the icon list, and this decision does not weaken
   it. **AC-16 is struck** and replaced by AC-16' below.
5. **Full-width row below the two panes.** Build it.
6. **Grow, capped at `max-height: 70vh` with `overflow-y: auto`.** Build it.
7. **The dead `⚡` direct-connection overlay stays as-is**, with a comment naming
   it as awaiting the direct-connection workflow.

## Request

Make the GM's Matrix graph legible at the table, and make marks visible on it,
so that it is worth putting in front of players.

**Not in scope:** any redesign of the Matrix module beyond the two named
problems; interactive mark placement from the graph; force-directed or animated
layout; wiring the currently-dead direct-connection indicator; resolving Matrix
Perception or deciding what any participant has spotted; a dice roller of any
kind (`SCOPE.md`, "A dice roller inside the Matrix module").

**Does this move the `SCOPE.md` boundary?** No. `SCOPE.md` already puts both
halves inside the line: "Tracking values that change and are tedious to hold in
your head: … marks, positions in the Matrix" and "Making state visible at a
glance, to the GM **and to players in the player view**." What the request
touches is an *unfilled* question rather than a boundary — `SCOPE.md` never says
*which* marks a player may see, and `SCOPE.md`'s "Open questions" section is
empty. Answering Open Decision 1 below should be recorded there (and in
`RULINGS.md` if Xavier picks a policy broader than "own marks only").

**Rules dependency.** Increment 1 (this spec's build) is entirely display of
state the GM typed in; it depends on no rule. Increment 2's *recommended
default* ("a player sees only their own marks") also depends on no rule.
Increment 2's *alternative* ("a player sees every mark on an icon") **is
rules-dependent** — it turns on what Matrix Perception can discover about an
icon's marks, which per `CLAUDE.md` must come from a page-cited
`sr5-rules-analyst` brief and not from any agent's memory. If Xavier picks that
alternative, that half must go through `/feature` first. Nothing in `RULINGS.md`
settles it today (searched for mark/visibility/player-facing/spot entries; the
closest, 2026-08-29 and 2026-09-02/03, cover mark *placement*, propagation and
erasure, never mark *visibility to a player*).

## Current behaviour

### The component and where it is mounted

`MatrixGraphComponent` (`src/app/matrix/matrix-graph/matrix-graph.component.ts`)
is a standalone SVG component with a GM mode and a player mode.

- Mounted in exactly **one** place:
  `src/app/matrix/matrix-run-panel/matrix-run-panel.component.html:53-56`,
  inside `.matrix-right-pane`, with `[gmMode]="true"` and
  `[activeDeckers]="activeDeckers"`. I searched for `app-matrix-graph` and
  `MatrixGraphComponent` across the whole repo; the only other hits are the
  import/`imports` array in `matrix-run-panel.component.ts:9,16` and the test
  file.
- `MatrixRunPanelComponent` is itself mounted in exactly one place:
  `src/app/battle-tracker/battle-tracker.component.html:117-121`, behind the
  `showMatrixPanel` toggle (`battle-tracker.component.ts:1225-1229`), fed by the
  `matrixActiveDeckers` getter (`battle-tracker.component.ts:1248-1251`).
- **Player mode has no consumer anywhere.**
  `src/app/player-view/player-view.component.html` contains no
  `<app-matrix-graph>` and no `<app-matrix-player-view>`.
  `MatrixPlayerViewComponent` is likewise mounted nowhere.

### Why it renders too small — the exact arithmetic

- The canvas is fixed: `const W = 800; const H = 460;`
  (`matrix-graph.component.ts:23-24`), exposed as `readonly svgW`/`svgH`
  (`:346-347`).
- The template binds `[attr.viewBox]="'0 0 ' + svgW + ' ' + svgH"` with
  `preserveAspectRatio="xMidYMid meet"` (`matrix-graph.component.html:26-28`)
  and **no** `width`/`height` attributes.
- CSS gives the element `width: 100%; flex: 1; display: block;`
  (`matrix-graph.component.css:81-85`) inside
  `.mgn-container { display:flex; flex-direction:column; min-height: 300px; }`
  (`:3-11`).
- `.matrix-right-pane` is one column of
  `.matrix-two-pane { display:grid; grid-template-columns: 1fr 1fr; }`
  (`matrix-run-panel.component.css:190-195`), inside `.matrix-panel-body` with
  `0.75rem` side padding (`:113-118`), inside the battle tracker's `col-12`
  (`battle-tracker.component.html:110`).

With `preserveAspectRatio="…meet"` the render scale is
`min(boxWidth/800, boxHeight/460)`. On a 1440 px viewport the pane is ≈685 px
wide; the SVG's flex height, after the header (`:19-27`, ≈26 px) and legend
(`:189-198`, ≈24 px) are subtracted from the 300 px container minimum, is
≈250 px. Scale = `min(0.856, 0.543)` = **0.543**. The declared font sizes
therefore render at:

| CSS rule | declared | on screen at 0.543 |
|---|---|---|
| `.mgn-node-label` (`css:151-156`) | 9 px | **4.9 px** |
| `.mgn-node-sublabel` (`css:162-167`) | 7.5 px | **4.1 px** |
| `.mgn-mark-dots` (`css:169-174`) | 8 px | **4.3 px** |
| `.mgn-node-symbol` (`css:133-138`) | 14 px | 7.6 px |
| `.mgn-vis-badge` (`css:176-180`) | 10 px | 5.4 px |
| `.mgn-canvas-host-label` (`css:88-93`) | 11 px | 6.0 px |

Even when the hierarchy pane forces the row to 600 px (making the scale
width-bound at 0.856), the node label is 7.7 px and the mark dots 6.9 px.
**There is no window size at which the current mark dots are readable.**
"Doesn't display marks" is an accurate description of the observable behaviour;
the code path exists and executes.

### What marks the graph does and does not read

`buildGMNodes()` (`:85-153`):

- **Persona nodes** (`:94-107`) are built from `activeDeckers` and hardcode
  `marks: {}` (`:104`). A decker's persona icon *does* have a mark record — it
  lives on a `MatrixTarget` with `type === "persona"` and
  `personaOwner === decker.name`, which is exactly how
  `MatrixStateService.eraseMarksForDecker()` finds it
  (`matrix-state.service.ts:128-133`). The graph never performs that lookup, so
  **marks placed on a decker's own persona are never rendered on the graph**.
- **Inside-host view** (`:109-122`) pushes one node per `host.targets` entry
  with `marks: t.marks`. The host itself is rendered only as header text
  (`html:39-43` and `html:5-8`), so **`MatrixHost.marks` (`MatrixHost.ts:70`) is
  invisible while you are inside that host** — the one mark count where reaching
  3 unlocks the most.
- **Public-space view** (`:123-148`) pushes each `state.hosts` entry with
  `marks: h.marks` (`:134`) and each `state.publicTargets` entry with
  `marks: t.marks` (`:145`). Data-wise this is correct; only the render size is
  wrong.
- **`MatrixTarget.propagatedMarks` (`MatrixTarget.ts:63-75`) and
  `MatrixHost.propagatedMarks` (`MatrixHost.ts:72-79`) are never read by the
  graph.** `TargetCardComponent.hasPropagatedMark()` renders a `fa-link` badge
  for them (`target-card.component.html:39-43`); the graph has no equivalent, so
  `RULINGS.md` 2026-09-03 ("Propagation is visible, not reversible" — "the GM
  must be able to see that a mark on one icon also placed a mark somewhere
  else") is honoured in the list and not on the graph.

`markDots(marks)` (`:290-297`) produces one flat string: per owner, up-to-two
uppercase initials from `ownerInitials()` (`:300-305`) followed by
`"●".repeat(min(3, count))`, groups joined with `" · "`, capped at
`MARK_DOT_MAX_OWNERS = 4` (`:275`) with a trailing `" +N"`. It renders **no
empty `○` slots**, so it does not agree visually with
`TargetCardComponent.dots()` or `MatrixPlayerViewComponent.dots()`, both of
which pad to three with `○`. It is called twice per node per change detection
cycle (`html:91` in the `@if`, `html:94` in the body).

### Player mode as written (not mounted)

`buildPlayerNodes()` (`:157-191`):

- Pushes the player's own persona with `marks: {}` (`:167`).
- Pushes every entry of the `targets` input with `marks: t.marks` (`:182`) —
  **the complete record, every decker's marks**. `markDots()` would then render
  every owner's initials to that player. This has never shipped because the
  component is not mounted, but it is the state the code is in.
- Does **not** filter by host context. `MatrixPlayerViewComponent.contextTargets`
  (`matrix-player-view.component.ts:90-95`) does filter
  (`hostName === currentHostName`, else `!hostName`); the graph would render a
  host's contents and public space simultaneously.
- Has no host node and no host-marks input, so a player would never see their
  marks on the host they are inside — the one thing `MatrixPlayerViewComponent`
  *does* show (`matrix-player-view.component.html:18-22` via `hostMarks()`,
  `matrix-player-view.component.ts:116-119`).

### The wire — there is nothing on it

- `SharedCombatState` declares `matrixTargets?: SharedMatrixTarget[]`,
  `currentHostName?: string` and `currentHostMarks?: Record<string, number>`
  (`session-sync.service.ts:221-234`). The `currentHostMarks` doc comment states
  plainly: "no producer exists yet, so this key is never present on the wire
  today."
- `syncSharedState()` (`battle-tracker.component.ts:3438-3475`) builds `round`,
  `pass`, `started`, `passEnded`, `currentInitiative`, `participants`,
  `oocParticipantCount`, `oocOwnership` — **and nothing else**. I grepped
  `battle-tracker.component.ts` for
  `matrixTargets|currentHostName|currentHostMarks`: zero hits. There is no
  producer.
- **`ARCHITECTURE.md:1800-1806` is wrong on this point.** It states
  `syncSharedState()` builds "…and the front-loaded Matrix fields
  `matrixTargets` / `currentHostName`". It does not. This must be corrected.
- `MatrixPlayerViewComponent`'s `myName` input is documented as "used as the key
  into `target.marks` to show how many marks *this* decker has placed on each
  icon" (`matrix-player-view.component.ts:17-21`), but the template's per-target
  rows (`matrix-player-view.component.html:32-70`) render name, type badge and
  Matrix damage only — **never any per-target mark**. `myName` is used solely by
  `hostMarks()`.

### Transport constraint that bounds Increment 2

`session:update-state` is broadcast to the entire room. The server validates
only `round` (number) and `participants` (array) (`server.js:135-139`), strips
exactly one key (`oocOwnership`, `server.js:192-198`) and passes everything else
through unchanged to every socket. There is **no per-player state channel**.
Therefore any mark data put on `SharedCombatState` reaches every player's
browser and can only be filtered client-side. Under Open Decision 1's Option 1
that is acceptable (nothing is hidden that a player couldn't ask the GM for),
but it must be stated, not assumed.

### Change-detection behaviour (relevant to any work that makes layout costlier)

`matrixActiveDeckers` (`battle-tracker.component.ts:1248-1251`) is a getter
returning a fresh `.filter()` array on every read. Angular compares `@Input`
values by reference, so `MatrixGraphComponent.ngOnChanges` (`:67-77`) sees
`changes["activeDeckers"]` on **every change-detection cycle** and calls
`buildGMNodes()` every cycle. `buildGMNodes()` today is
O(hosts + targets + deckers) with no allocation beyond the node array; adding a
persona→target lookup, edge computation and taller layout makes this materially
more expensive unless guarded.

## Affected paths

I searched for every site that renders a mark count and every site that mounts
or sizes the graph. The lists below are complete; where only one site exists I
say so.

### Must change (Increment 1)

| File | What changes |
|---|---|
| `src/app/matrix/matrix-graph/matrix-graph.component.ts` | `W`/`H` constants → responsive `svgW`/`svgH`; new sizing constants; `ngOnInit`/`ngOnDestroy` gain a `ResizeObserver`; `ngOnChanges` gains an identity guard; `buildGMNodes()` gains the persona-marks lookup and the current-host node; `GraphNode` gains (per Decision 3) an edge model — **not** a `propagated` field; per Decision 4 no propagation signalling is added anywhere, on `GraphNode` or otherwise; `computeLayout()` rewritten for the new scale; `markDots()` replaced by `markRows()`; `nodeRadius()` values raised; new `nodeLabelY`/`nodeSubLabelY`/`markRowY` helpers |
| `src/app/matrix/matrix-graph/matrix-graph.component.html` | `<svg>` gains `[attr.width]`/`[attr.height]`; **`:36`'s hardcoded `<rect width="800" height="460">` must be bound to `svgW`/`svgH`**; edge `<line>` loop added before the node loop; label/sublabel `y` offsets read from the new helpers; the single mark-dots `<text>` (`:90-96`) becomes a per-owner `@for` of `<text>` rows; legend (`:104-115`) gains a marks key |
| `src/app/matrix/matrix-graph/matrix-graph.component.css` | Every font size raised above the floor; `.mgn-svg` loses `flex: 1`; `.mgn-container` `min-height` reconsidered; `.mgn-mark-dots` → `.mgn-mark-row`; new `.mgn-edge` rule; scroll wrapper rule |
| `src/app/matrix/matrix-run-panel/matrix-run-panel.component.html` | Graph moves out of `.matrix-right-pane` (`:48-57`) into a new full-width row below `.matrix-two-pane` |
| `src/app/matrix/matrix-run-panel/matrix-run-panel.component.css` | `.matrix-two-pane` (`:190-201`) no longer needs a right pane; new `.matrix-graph-row` rule; the dead `.graph-stub*` rules (`:314-344`) referencing a stub the template no longer contains should be deleted in the same pass |
| `src/app/battle-tracker/battle-tracker.component.ts` | `matrixActiveDeckers` (`:1248-1251`) — see Regression risk R4; either memoise here or guard in the graph |
| `ARCHITECTURE.md` | Correct `:1800-1806`'s false claim that `syncSharedState()` builds `matrixTargets`/`currentHostName` |
| `src/scenarios/matrix-port-rules-correctness.spec.ts` | The six `markDots` tests at `:1386-1422` — see Regression risk R1 for the exact replacement of each |
| `src/scenarios/matrix-graph-readability.spec.ts` | **New file.** All acceptance criteria and scenarios below |

### Same pattern, not mentioned in the request — every site that renders a mark count

There are **five**, and they do not agree with one another. This is the "one of
five call sites" hazard:

1. `MatrixGraphComponent.markDots()` (`matrix-graph.component.ts:290-297`) —
   initials + filled dots only, no empty slots, hardcoded `Math.min(3, count)`
   rather than `MARK_CAP`, groups joined `" · "`, capped at 4 owners with `+N`.
2. `TargetCardComponent.dots()` (`target-card.component.ts`, symbol `dots`) —
   `"●".repeat(count) + "○".repeat(MARK_CAP - count)`. Uses the imported
   `MARK_CAP`. **Note: this file is under concurrent edit (git status shows it
   modified); cite by symbol name, not line number.**
3. `MatrixPlayerViewComponent.dots()` (`matrix-player-view.component.ts:55-57`) —
   `"●".repeat(count) + "○".repeat(Math.max(0, 3 - count))`. Same shape as (2)
   but with a **hardcoded 3** instead of `MARK_CAP`.
4. `AccessHostPanelComponent` (`access-host-panel.component.html:128`) — renders
   `{{ currentHostMarksForSelectedDecker }} / 3` as a numeric fraction, with
   another hardcoded 3, and `marksThatWillLand`
   (`access-host-panel.component.ts:112-115`) uses a hardcoded `Math.min(3, …)`.
5. `HierarchyEditorComponent.dots()` (`hierarchy-editor.component.ts`, near
   line 941) — `"●".repeat(count) + "○".repeat(MARK_CAP - count)`. Already
   imports and uses `MARK_CAP` (`:14`, `:940-941`). This site was missed in
   the original count of four; it needs no change — it was already compliant
   before this spec was written.

`MARK_CAP` is exported from `matrix-state.service.ts:15`. Sites 1, 3 and 4 each
hardcode 3 instead of importing it; site 5 already imports it and needs no
change. **This spec requires (1) to import `MARK_CAP` and (3) and (4) to be
changed to import it as well** — a one-token change each, at three named
sites, so the cap lives in one place. It does **not** require unifying the
five *renderings* into one helper: (4) is deliberately a fraction, not dots,
and (2)/(3)/(5) render one decker at a time while (1) renders many. Unifying
the visual grammar of (1) with (2)/(3)/(5) — filled plus empty slots — is
required by AC-8.

### Reads state this change touches (verify unaffected, do not change)

- `MatrixStateService.addMark` / `removeMark` / `addMarkToHost` /
  `removeMarkFromHost` / `previewPropagation` / `eraseMarksForDecker`
  (`matrix-state.service.ts:389,607,226,246,426,118`) — the graph is a pure
  reader; none of these may change.
- `MatrixStateService.stateChange$` (`:50`) — the graph's GM-mode subscription
  (`matrix-graph.component.ts:57-60`) is the only refresh trigger for
  host/target mark changes. It must keep working after the layout rewrite.
- `HierarchyEditorComponent` / `TargetCardComponent` — the GM's editing surface.
  Unchanged except for the `MARK_CAP` import noted above.

### Not changed in Increment 1 (named so the implementer does not touch them)

- `syncSharedState()` and `SharedCombatState` — Increment 2.
- `MatrixPlayerViewComponent` — Increment 2, except the `MARK_CAP` import.
- `player-view.component.{ts,html}` — Increment 2.
- `server.js` — no change is needed in either increment; extra `state` keys pass
  through.
- `buildPlayerNodes()` (`matrix-graph.component.ts:157-191`) — leave
  functionally as-is in Increment 1 apart from inheriting the new
  layout/sizing. Its mark-visibility behaviour is Increment 2's subject and must
  not be silently settled here.

## Proposed approach

### 1. Stop scaling the SVG at all

Replace "fixed viewBox, scaled to fit" with "viewBox measured from the
container, rendered 1:1". This makes **one SVG user unit exactly one CSS
pixel**, which turns legibility from a scaling problem into a plain font-size
problem and makes it testable.

- Inject `ElementRef`. On `ngOnInit`, attach a `ResizeObserver` to the host
  element; on each callback set `measuredWidth = hostEl.clientWidth`, and if it
  changed, recompute layout and `cdr.markForCheck()`. Disconnect in
  `ngOnDestroy` alongside the existing `sub?.unsubscribe()` (`:79-81`).
- `svgW = clamp(measuredWidth || GRAPH_DEFAULT_WIDTH, GRAPH_MIN_WIDTH,
  GRAPH_MAX_WIDTH)`. A `clientWidth` of 0 (panel collapsed, component not yet
  laid out) **must** fall through to `GRAPH_DEFAULT_WIDTH`; a 0 or `NaN` must
  never reach the viewBox.
- `svgH` is computed by `computeLayout()` from the node count and layout branch,
  floored at `GRAPH_MIN_HEIGHT`.
- Template:
  `<svg [attr.width]="svgW" [attr.height]="svgH" [attr.viewBox]="'0 0 ' + svgW + ' ' + svgH">`.
  `preserveAspectRatio` becomes a no-op and may be dropped.
- CSS: `.mgn-svg { display: block; }` — remove `width: 100%` and `flex: 1`.
- The background grid `<rect>` at `html:36` **must** become
  `[attr.width]="svgW" [attr.height]="svgH"`. Leaving the literals is the single
  easiest way to ship this half-broken.

Suggested constants (tune freely, so long as the ACs hold):
`GRAPH_MIN_WIDTH = 420`, `GRAPH_MAX_WIDTH = 1200`, `GRAPH_DEFAULT_WIDTH = 760`,
`GRAPH_MIN_HEIGHT = 300`.

### 2. Raise the type scale above a stated floor

Export `export const MIN_GRAPH_FONT_PX = 11;` from the component file. Because
of §1 the declared CSS size *is* the on-screen size, so the contract is
checkable directly. Suggested values: node label 13 (weight 600), sublabel 11,
mark row 12, visibility badge 13, canvas host label 15, node symbol 20 (host 24,
`persona-me` 22). Node radii: host 34, persona 30, everything else 26.

Every label offset in the template currently hardcodes an arithmetic expression
against `nodeRadius(node)` (`html:65,73,78,84,92`). Replace all five with named
component methods — `visBadgeX/Y`, `nodeLabelY`, `nodeSubLabelY`, `markRowY(i)`
— so the offsets move together with the radii instead of drifting apart.

### 3. Rewrite `computeLayout()` for the new scale

`computeLayout()` (`:195-232`) hardcodes `W`/`H` and offsets tuned to the old
800×460 canvas. Rewrite against `svgW`:

- Personas on a top row at `y = PERSONA_Y (56)`, spaced
  `min(180, (svgW - 120) / max(1, n - 1))`, starting at 70 or centred when there
  is one.
- `CONTENT_TOP = personas.length > 0 ? 150 : 40`.
- **Inside a host** (per Decision 2): the host node at
  `(svgW / 2, CONTENT_TOP + ringR)`, its contents on a ring around it.
- **Ring branch**, `others.length <= 8`:
  `ringR = min(0.34 * svgW, 90 + others.length * 16) + 14 * max(0, maxMarkRows - 1)`.
  The `maxMarkRows` term is load-bearing — four stacked mark rows add ~60 px
  below a node and will collide on a tight ring without it.
- **Grid branch**, `others.length > 8`:
  `cols = max(1, floor((svgW - 40) / 165))`, `rows = ceil(n / cols)`, cell
  165×130.
- `svgH = max(GRAPH_MIN_HEIGHT, contentBottom + BOTTOM_PAD)` where
  `contentBottom` accounts for the tallest node's full footprint including its
  mark rows.

### 4. Make marks readable and complete on the GM graph

- **Replace `markDots()` with `markRows()`** returning
  `{ owner: string; initials: string; filled: number }[]`
  (no `propagated` field — Decision 4),
  capped at `MARK_DOT_MAX_OWNERS` (keep the constant and its doc comment —
  round-4 defect D-6's reasoning is still exactly right), with a synthetic final
  overflow row when there are more owners. The template renders one
  `<text class="mgn-mark-row">` per entry at `markRowY(i)`. Per-owner glyphs
  become
  `"●".repeat(min(MARK_CAP, filled)) + "○".repeat(MARK_CAP - min(MARK_CAP, filled))`,
  matching `TargetCardComponent.dots()`.
- **Import `MARK_CAP`** from `app/services/matrix-state.service` rather than the
  current hardcoded `3`.
- **Persona marks.** In `buildGMNodes()`, for each jacked-in decker, search the
  current context's target list (`host.targets` when inside a host,
  `state.publicTargets` otherwise) for a `MatrixTarget` with
  `type === "persona"` and `personaOwner === d.name`; use its
  `marks`/`propagatedMarks`, or `{}` when there is none. This mirrors
  `eraseMarksForDecker`'s second loop (`matrix-state.service.ts:128-133`) — the
  same "a decker's persona icon is a persona target keyed by `personaOwner`"
  relationship — and must not invent any other linkage.
- **The current host as a node.** When `getCurrentHost()` returns a host, push a
  node with `kind: "host"`, `marks: host.marks`,
  `subLabel: 'Rating ' + host.rating`, before its contents. The `insideHost`
  header (`html:5-8`) and canvas host label (`html:39-43`) stay — they cost
  nothing and orient the reader. Do **not** carry `propagatedMarks` onto the
  node (Decision 4).
- **No propagation badge** (Decision 4). The graph does not read
  `MatrixTarget.propagatedMarks` or `MatrixHost.propagatedMarks` at all. A mark
  renders identically whether it was placed directly or arrived by propagation.
  Do not add a `.mgn-mark-propagated` class or any equivalent glyph.
- **Legend** (`html:104-115`) gains `●●○ = marks (per decker)`. No propagation
  key.

### 5. Edges (Decision 3)

Add `edges: GraphEdge[]` (`{ fromId, toId }`) computed alongside `displayNodes`,
rendered as `<line class="mgn-edge">` **before** the node `@for` so nodes paint
on top. Two producers only:

- inside a host: host node → each contained target;
- public space: for each `publicTarget` with a `parentTargetId` that resolves to
  another rendered node, child → parent.

No other edge type. Do not attempt `linkedHostId` edges in public space — a
public target does not carry one (`MatrixTarget.ts:78,83-117`: `linkedHostId` is
for host-contained targets, `parentTargetId` for open-grid ones).

### 6. Give the graph the width (Decision 5)

Move `<app-matrix-graph>` out of `.matrix-right-pane` into a new sibling row
below `.matrix-two-pane`, with its own `.pane-header` ("Matrix Graph").
`.matrix-two-pane` becomes a single-column container for the hierarchy editor
and access-host panel, or keeps its two columns with the access panel promoted —
either is acceptable provided the hierarchy editor keeps every control it has
today. Wrap the graph in
`.mgn-scroll { max-height: 70vh; overflow-y: auto; }` (Decision 6).

### 7. Guard the rebuild (see R4)

`ngOnChanges` must not rebuild on an identical decker list. Compare a cheap key
— `activeDeckers.map(d => d.name + ':' + d.jackedIn + ':' + d.vrMode).join('|')`
— against the previous value and return early when unchanged. Alternatively
memoise `matrixActiveDeckers` in `BattleTrackerComponent`; do **one** of the
two, not neither.

## Scope classification

Every part of the request, against `SCOPE.md`. This is a proposal; Xavier
approves it.

### TRACK — the app must represent or compute this

1. Render the graph at a size where its text is legible. (`SCOPE.md`: "Making
   state visible at a glance".)
2. Render each icon's marks per decker, with filled and empty slots to three.
   (`SCOPE.md`: "Tracking values that change and are tedious to hold in your
   head: … marks".)
3. Render the marks on a decker's own persona icon. Same clause; currently
   dropped by a hardcoded `{}`.
4. Render the current host's own marks while inside it. Same clause;
   `MatrixHost.marks` is tracked state with no display on this surface.
5. ~~Render that a mark arrived by propagation.~~ **Struck by Xavier's Decision
   4 (2026-09-11).** The graph shows that an icon has a mark, not how it got
   one. `RULINGS.md` 2026-09-03 remains satisfied by the `fa-link` badge on
   `TargetCardComponent`, which is unchanged.
6. Render the containment/parent relationships the GM has already entered as
   edges. (`SCOPE.md`: "positions in the Matrix".)
7. Keep the graph in step with `stateChange$` so a placed or removed mark
   appears immediately.

### GM RESOLVES — the GM decides; the app records

8. Which icons are hidden, running silent, or normal. The GM cycles
   `MatrixTarget.visibility` by hand; the app renders the setting and never
   derives it.
9. Whether any given decker has spotted any given icon. Not modelled, and must
   not become modelled by this feature.
10. How many marks a hack earned. `RULINGS.md` 2026-09-02 Decision 1 — marks are
    recorded, never derived.

### OUT OF SCOPE — per `SCOPE.md`, not the app's job

11. Resolving a Matrix Perception test to decide what to draw. (`SCOPE.md`:
    "Resolving opposed tests".)
12. Any dice roll originating in the Matrix module. (`SCOPE.md`: "A dice roller
    inside the Matrix module".)
13. Any undo of a mis-placed mark. (`SCOPE.md`: "Undo / redo … not coming back".
    The correction path is the existing `×` control on the target card.)
14. Modelling every Matrix action's effect on the graph. (`SCOPE.md`: "Modelling
    the full decision tree of a subsystem".)

### SCOPE QUESTION

Items I classified GM RESOLVES or OUT OF SCOPE that would nonetheless plausibly
be worth tracking. Flagged, not excluded.

- **SQ-1 — Which marks a player sees.** *For:* the whole point of a player
  Matrix view is that the decker's player stops asking "how many marks do I have
  on that?" every thirty seconds. *Against:* anything beyond "your own marks"
  turns on what Matrix Perception discovers, which is a rules question this
  pipeline may not answer. → Open Decision 1.
- **SQ-2 — Clicking a graph node to place or remove a mark.** *For:* the graph
  is where the GM's eyes are; two taps beat scrolling the hierarchy list
  mid-combat. *Against:* it duplicates `TargetCardComponent`'s picker including
  its propagation preview and cap warnings, and two controls over the same state
  can disagree. Recommend excluding from this feature and treating as its own.
- **SQ-3 — Wiring the direct-connection indicator.** The `⚡` overlay
  (`html:59-61`) reads `node.directConnection`, which GM mode always sets
  `false` (`:105,120,134,146`) and only `SharedMatrixTarget.directConnection`
  ever carries. *For:* direct connection is mechanically significant and the
  glyph already exists. *Against:* `MatrixTarget` has no such field; the only
  GM-side signal is `MatrixHost.accessMethod === 'direct-connection'`, which is
  a host fact, not a per-icon one. Recommend leaving dead and documenting it so
  it is not accidentally "fixed" into something wrong.
- **SQ-4 — Showing IC currently active in a host as graph nodes.**
  `MatrixHost.icActive` (`MatrixHost.ts:46`) holds live `ICParticipant`s that
  appear in the initiative order but not on the graph unless the GM also created
  an `ic`-type target by hand. *For:* "which IC is up in this host" is exactly
  the state a tracker should surface. *Against:* it means reconciling two
  representations of the same IC, which is a real design question. Recommend
  excluding here.

## Size check

**Increment 1 as specified: 1.5–2 days.** Component rewrite, template rewrite,
CSS pass, run-panel relayout, one new spec file, six existing tests migrated,
one doc correction.

**The full request as literally asked — including the player POV — exceeds a few
days**, because "players can see marks" is not a graph change. It requires a
broadcast producer, a sanitisation policy, a mount point in the player view, and
a visibility ruling. That is Phase 4 of `docs/MATRIX_MODULE_PLAN.md`, still
unbuilt.

### Proposed split

**Increment 1 — "Matrix graph legibility and marks (GM)."** Everything specified
above. GM-side only. No wire changes. Independently shippable and useful the day
it lands. **Do this first.**

**Increment 2 — "Broadcast Matrix icons to the player view."** A separate
feature, needing its own spec, comprising: a producer in `syncSharedState()`
populating `matrixTargets`/`currentHostName`/`currentHostMarks` with hidden
targets excluded and running-silent targets' names and types sanitised per
`SharedMatrixTarget`'s existing contract (`session-sync.service.ts:128-144`); a
mount point in `player-view.component.html` gated on
`primaryCharacter.isMatrix`; a choice between `MatrixPlayerViewComponent`
(already built, list-shaped) and `MatrixGraphComponent` in player mode (needs
the host-context filter it currently lacks); and the mark-visibility filter from
Open Decision 1. **Blocked on Open Decision 1.** Roughly 2 days once that is
answered — longer if Xavier picks the rules-dependent option, which must go
through `/feature` first.

Do not start Increment 2 as part of this work.

## Acceptance criteria

Only TRACK items are graded. All are checkable against observable behaviour.
Tests live in `src/scenarios/matrix-graph-readability.spec.ts` unless stated.

**Sizing**

1. With the component's host element measured at 700 px, the rendered `<svg>`
   carries `width="700"` and `height` equal to `svgH`, and
   `viewBox="0 0 700 <svgH>"` — i.e. rendered width equals viewBox width, so the
   render scale is exactly 1.
2. With the host element measured at 0 px (collapsed/unattached),
   `svgW === GRAPH_DEFAULT_WIDTH`; the `viewBox` attribute contains neither
   `NaN` nor `0 0 0`.
3. `svgW` is clamped: a measured width of 200 yields `GRAPH_MIN_WIDTH`; a
   measured width of 3000 yields `GRAPH_MAX_WIDTH`.
4. The background grid `<rect>` has `width` equal to `svgW` and `height` equal
   to `svgH` for at least two different measured widths — not the literals
   800/460.
5. Every `<text>` element rendered inside the SVG, in both GM and player mode,
   has a computed `font-size` of at least `MIN_GRAPH_FONT_PX` (11). Assert by
   querying all `svg text` in the fixture and reading
   `getComputedStyle(el).fontSize`. **Sanctioned exception:** the dead
   `⚡` direct-connection overlay (`matrix-graph.component.html`, `.mgn-dc-overlay`)
   keeps its inline `font-size="10"`, below this floor. It is excepted because
   it can never render today — GM mode never sets `directConnection: true`,
   and nothing on the wire sets it either — and Decision 7 is to change
   nothing about it until the direct-connection workflow is built. AC-5 does
   not need to (and does not) special-case it in the test, because no
   fixture in this spec ever produces a node with `directConnection: true`.
6. `svgH` grows with node count: a host with 12 targets produces a strictly
   greater `svgH` than the same host with 3 targets, and never less than
   `GRAPH_MIN_HEIGHT`.

**Marks**

7. A target with `marks: { Tesseract: 2 }` produces exactly one mark row for
   that node, with `initials === 'TE'` and `filled === 2`.
8. That row's rendered glyph string is `'●●○'` — filled dots followed by empty
   slots to `MARK_CAP`, matching `TargetCardComponent.dots(2)`.
9. `MARK_CAP` is imported from `app/services/matrix-state.service` in
   `matrix-graph.component.ts`; a target with `marks: { A: 5 }` renders
   `MARK_CAP` filled dots and no empty ones, and the row count for that node
   is 1.
10. Three deckers holding one mark each produce three rows; one decker holding
    three produces one row. The two are distinguishable (preserves the intent of
    the existing T4 test).
11. Five deckers at three marks each produce `MARK_DOT_MAX_OWNERS` (4) owner
    rows plus exactly one overflow row reading `+1`; the total count of `●`
    glyphs across all rows is 12, not 15.
12. A node with no marks produces zero mark rows and renders no mark `<text>`
    element at all.
13. **Persona marks.** Given a jacked-in decker named `Tesseract` and a
    `MatrixTarget` in the current context with `type: 'persona'`,
    `personaOwner: 'Tesseract'`, `marks: { 'IC-1': 1 }`, the graph's
    `persona-me` node for Tesseract carries `marks: { 'IC-1': 1 }` and renders
    one mark row. With no such target present it carries `{}` and renders none.
14. **Host marks while inside a host.** With `currentHostId` set to a host
    holding `marks: { Tesseract: 2 }`, `displayNodes` contains a node with
    `kind === 'host'` whose `marks` is that record and which renders `TE●●○`.
15. **Public-space host marks (regression).** With no current host, each host in
    `state.hosts` still produces a node carrying that host's `marks`.
16. ~~Propagation badge.~~ **STRUCK** by Decision 4.
16'. **No propagation signalling.** A target with `marks: { Tesseract: 1 }` and
    `propagatedMarks: { Tesseract: true }` renders a mark row identical in every
    respect to a target with `marks: { Tesseract: 1 }` and no `propagatedMarks`
    — same glyphs, same element count, same classes. No element with class
    `mgn-mark-propagated` (or any propagation-indicating class) exists anywhere
    in the rendered SVG, in either mode. `grep` for `propagatedMarks` in
    `matrix-graph.component.ts` returns nothing.
17. The legend contains a marks key. It contains no propagation key.

**Edges**

18. Inside a host with three targets, `edges` has exactly three entries, each
    from the host node's id to one target id.
19. In public space, a `publicTarget` `B` with `parentTargetId === A.id` where
    `A` is also rendered produces exactly one edge `B → A`. A `parentTargetId`
    pointing at a target that is not rendered produces no edge and no thrown
    error.
20. Every rendered `<line class="mgn-edge">` appears before the first node
    `<g class="mgn-node…">` in document order.

**Reactivity**

21. Calling `matrixState.addMark(target, 'Tesseract')` on a target in the
    current context causes the graph's node for that target to gain a mark row
    after one change-detection cycle, with no other input change (exercises the
    `stateChange$` subscription, `:57-60`).
22. Re-assigning `activeDeckers` to a **new array with the same decker names,
    jack-in states and VR modes** does not increase a `buildGMNodes` call
    counter (spy or instrumented counter). Re-assigning it with a different
    decker name does.

**Documentation**

23. `ARCHITECTURE.md` no longer states that `syncSharedState()` builds
    `matrixTargets`/`currentHostName`. (Reviewed, not machine-asserted.)

## Regression risk

**R1 — The six existing `markDots` tests break.**
`src/scenarios/matrix-port-rules-correctness.spec.ts:1372-1423`. Replacing
`markDots()` removes the method they call. Every property they assert must
survive. Migrate each explicitly:

| Existing test (line) | Becomes |
|---|---|
| `:1386` "three deckers with one mark each render distinguishably from one decker holding three" | AC-10 |
| `:1392` "one decker with 3 marks renders as their initials plus three unbroken dots" | AC-7 + AC-8 (`initials 'A'`, `filled 3`, glyphs `'●●●'`) |
| `:1396` "each decker's marks stay capped at 3 dots individually, even past the cap" | AC-9 |
| `:1400` "no marks renders an empty string" | AC-12 |
| `:1409` "D-6: the owner key is visible…" | AC-7 extended: `{ Tesseract: 2, 'dev grrl': 1 }` yields rows with `initials 'TE'`/`filled 2` and `'DG'`/`filled 1` |
| `:1415` "D-6: five deckers at three marks each is capped, not 19 unbroken glyphs" | AC-11 |

Do **not** delete `MARK_DOT_MAX_OWNERS` or its doc comment (`:267-289`) —
round-4 defect D-6's reasoning is unchanged and still the justification for the
cap and the owner key.

**R2 — `MatrixRunPanelComponent` mount test.**
`matrix-port-rules-correctness.spec.ts:1527-1560` mounts the run panel and
asserts its children are wired. Moving `<app-matrix-graph>` in the template
keeps the same `imports` array, so this should pass unchanged — but it is the
only compile-time check on the run panel template and must be run.

**R3 — `.mgn-svg { flex: 1 }` removal changes the container's box.**
`.mgn-container` is a column flexbox with `min-height: 300px` (`css:3-11`) whose
only flexible child is the SVG. Once the SVG has an intrinsic height,
`min-height: 300px` can leave dead space below the legend on a small graph, or
fight the new `svgH` on a large one. Set the container's `min-height` from
`GRAPH_MIN_HEIGHT` or remove it; verify the empty state (`html:20-24`,
`.mgn-empty` with its own `min-height: 200px`, `css:62-72`) still centres.

**R4 — Every-tick rebuild.** `matrixActiveDeckers`
(`battle-tracker.component.ts:1248-1251`) returns a new array each read, so
`ngOnChanges` (`:67-77`) fires each change-detection cycle and `buildGMNodes()`
runs each cycle. Today that is cheap. After this change it also does a
persona→target scan, an edge pass and a taller layout. Without the §7 guard this
becomes a per-tick cost on the GM's main combat screen. AC-22 covers it.

**R5 — `ResizeObserver` lifecycle.** `ngOnDestroy` (`:79-81`) currently
unsubscribes only the `stateChange$` subscription. A leaked observer on a
component mounted and unmounted every time the Matrix panel is toggled
(`battle-tracker.component.ts:1227-1229`) accumulates. Disconnect it in the same
method.

**R6 — Player mode inherits the layout rewrite.** `buildPlayerNodes()`
(`:157-191`) shares `computeLayout()`, `nodeRadius()` and the template. Layout
changes must not throw for player-mode nodes even though no consumer mounts it.
AC-5 and AC-16 both exercise `gmMode = false`.

**R7 — Run-panel CSS.** `.graph-stub*`
(`matrix-run-panel.component.css:314-344`) styles a stub the template no longer
contains; `.matrix-header-controls`, `.noise-*`, `.grid-select` and
`.matrix-stepper*` (`:38-176`) likewise style markup absent from
`matrix-run-panel.component.html`. `npm run lint` was recently made to run clean
(commit ff8b018); do not introduce new dead rules, and delete `.graph-stub*`
since this change is what removes its last conceptual owner.

**R8 — The `insideHost` background transition.** `.mgn-container.mgn-in-host`
changes background over 0.7s (`css:9,13-15`). Adding a host node inside the host
must not break that cue; keep both.

## Scenarios to survive

Written as executable cases for
`src/scenarios/matrix-graph-readability.spec.ts`.

### S1 — Ordinary: inside a host, marks visible on contents and on the host itself

**Setup.** `MatrixStateService` with one host `Ares-7` (rating 8,
`marks: { Tesseract: 1 }`, `propagatedMarks: { Tesseract: true }`) containing
three targets: `Maglock` (device, `marks: { Tesseract: 2 }`), `Paydata` (file,
no marks), `Patrol IC` (ic, no marks). `currentHostId` set to the host. One
jacked-in `MatrixParticipant` named `Tesseract`. Mount with `gmMode = true`,
`activeDeckers = [Tesseract]`, host element measured at 700 px.

**Expected.** `displayNodes` has 5 entries: one `persona-me`, one `host`, three
contents. The `host` node renders `TE●○○` **with no propagation indicator of any
kind** (Decision 4), despite `propagatedMarks` being set on the host.
`Maglock` renders `TE●●○`. `Paydata` and `Patrol IC` render no mark rows.
`edges` has 3 entries, all from the host node. `svg` `width` is `700`. Every
`svg text` computed font-size ≥ 11.

### S2 — Edge case: twelve icons, five deckers, all at cap

**Setup.** Same host, 12 device targets. One of them carries
`marks: { Alice: 3, Bob: 3, Carl: 3, Dana: 3, Eve: 3 }`. Five jacked-in deckers.

**Expected.** The grid branch is used (`others.length > 8`). That node renders 4
owner rows plus one `+1` row; total `●` across its rows is 12. `svgH` is
strictly greater than in S1 and ≥ `GRAPH_MIN_HEIGHT`. No two node centres in the
grid are closer than the cell dimensions. Every `svg text` computed font-size
≥ 11. Nothing throws.

### S3 — Correction, not undo: a mis-tapped mark removed by hand

There is no undo in this app (`SCOPE.md`, "Undo / redo … not coming back"); the
correction path is the existing `×` control.

**Setup.** Public space with device `Weapon Mount` (`parentTargetId` → device
`Drone`) and a host is irrelevant here. Call
`matrixState.addMark(weaponMount, 'Tesseract')`.

**Expected.** After one change-detection cycle, `Weapon Mount` shows `TE●○○` and
`Drone` shows `TE●○○` — the propagated mark renders exactly like a directly
placed one (Decision 4; propagation is device-to-device on the open grid,
`RULINGS.md` 2026-09-03). Then call
`matrixState.removeMark(weaponMount, 'Tesseract')`. `Weapon Mount`'s mark rows
drop to zero; **`Drone` still shows `TE●○○`** — `removeMark` deliberately does
not reverse propagation
(`matrix-state.service.ts:588-606`; `RULINGS.md` 2026-09-03 "Propagation is
visible, not reversible"). Asserting the opposite would encode a rules
regression.

### S4 — Live at the table: the pane narrows mid-combat with players waiting

**Setup.** GM has the Matrix panel open in combat turn 2 with a host and 4
targets rendered at a measured width of 900 px. The GM then clicks a
participant, which opens the details panel and switches the main column from
`col-12` to `col-lg-9` (`battle-tracker.component.html:130`), narrowing the
graph to ~660 px. Simulate by changing the measured width and firing the
`ResizeObserver` callback.

**Expected.** Within one change-detection cycle and with no page reload and no
user action on the graph: `svgW` becomes the new clamped width, the `<svg>`
`width` attribute and the background `<rect>` width both follow, node positions
are recomputed inside the new width (no node has `x > svgW`), and every
`svg text` computed font-size is still ≥ 11. Mark rows are unchanged in content.
No node's mark row is clipped outside the viewBox.

### S5 — Panel collapsed then expanded: zero-width measurement

**Setup.** Mount with the host element reporting `clientWidth === 0`, run change
detection, then report 700 and fire the observer.

**Expected.** At width 0: `svgW === GRAPH_DEFAULT_WIDTH`, the `viewBox`
attribute matches `/^0 0 \d+ \d+$/` with no `NaN`, no node has a `NaN`
coordinate, and nothing throws. At 700: `svgW === 700` and the layout
recomputes.

### S6 — A decker jacks out mid-run

**Setup.** S1's state, plus a `persona` target with
`personaOwner: 'Tesseract'` and `marks: { 'IC-1': 1 }` inside the host. Confirm
the `persona-me` node shows `IC●○○` (AC-13). Then call
`matrixState.jackOut(tesseract)`.

**Expected.** `jackOut` calls `eraseMarksForDecker`
(`matrix-state.service.ts:89-96,118-134`), which deletes Tesseract's entries
from the host and every target **and** clears the whole `marks` record on
Tesseract's own persona target. After the `stateChange$` tick: `Ares-7`'s host
node has zero mark rows, `Maglock` has zero, and Tesseract's persona node has
zero. `decker.jackedIn` is false, so the persona node is no longer emitted at
all (`:95`) — assert it is absent from `displayNodes`, and that nothing throws
while it disappears.

## Open decisions

Each with a recommended default. These are the same questions as in the
plain-language brief, grounded.

**1. Which marks does a player see, when Increment 2 ships?**
Options: (a) own marks only — `marks[myName]` and nothing else; (b) every mark
on every visible icon; (c) per-icon GM toggle.
*Grounding:* `MatrixPlayerViewComponent`'s `myName` doc
(`matrix-player-view.component.ts:17-21`) already states the (a) intent, but the
template never implements it. `buildPlayerNodes()` (`:182`) currently passes the
full record, which is (b) by accident. There is no per-player wire channel
(`server.js:135-198`), so any option is a client-side filter over a room-wide
broadcast; under (a) the data is still in the payload even though only the
player's own row renders.
*Recommended default:* **(a) own marks only.** It needs no rules answer, matches
the documented intent, and is the smallest thing that makes the view useful. (b)
is rules-dependent — whether a decker can learn how many marks are on an icon is
a Matrix Perception question that must come from a page-cited
`sr5-rules-analyst` brief (`CLAUDE.md`, "Rules facts"), and must go through
`/feature` before it can be built. (c) doubles the GM's mid-combat bookkeeping.
*If (a) is approved,* record it in `SCOPE.md`'s "Open questions" and add a
`RULINGS.md` entry so it is decided once.

**2. Does the current host get its own node inside the host view, or just marks
in the header badge?**
*Grounding:* today the host is header text only (`html:5-8,39-43`), so
`MatrixHost.marks` is invisible on this surface (`MatrixHost.ts:70`). A header
badge is ~4 lines; a node is ~15 plus the edges in Decision 3.
*Recommended default:* **a node.** Three marks on the host is the threshold that
unlocks the strongest actions, and a node is where the GM is already looking. It
also gives the edges in Decision 3 something to originate from.

**3. Draw edges?**
*Grounding:* `MatrixTarget.parentTargetId` (`MatrixTarget.ts:83-117`) and
`MatrixHost.targets` (`MatrixHost.ts:38`) are already-tracked relationships.
`previewPropagation` (`matrix-state.service.ts:426-430`) walks exactly these.
*Recommended default:* **yes** — host→contents inside a host, child→parent in
public space. No new tracked state; it is the propagation path made visible,
which is the same discoverability goal as `RULINGS.md` 2026-09-03.

**4. Show the propagation badge on the graph?**
*Grounding:* `TargetCardComponent.hasPropagatedMark()` and
`target-card.component.html:39-43` already do this in the list;
`propagatedMarks` exists on both `MatrixTarget` (`:63-75`) and `MatrixHost`
(`:72-79`).
*Recommended default was:* yes, GM mode only.
**ANSWERED 2026-09-11 — NO. Do not build it.** Xavier: the graph shows all marks
on an icon and does not signify how any of them were placed. The `fa-link` badge
on the icon list already satisfies `RULINGS.md` 2026-09-03 and stays. See the
binding Decisions section at the top of this file.

**5. Does the graph move to a full-width row, or stay in the right pane?**
*Grounding:* `.matrix-two-pane { grid-template-columns: 1fr 1fr }`
(`matrix-run-panel.component.css:190-195`) is half the size problem; the other
half is the vertical letterbox.
*Recommended default:* **full-width row below the two panes.** Doubles the
available width, moves no controls, and the hierarchy editor keeps every
affordance.

**6. Does the graph grow unbounded, or cap and scroll?**
*Grounding:* `svgH` becomes node-count-driven; a 12-icon host in the grid branch
is ~490 px tall. The Matrix panel sits above the participant list
(`battle-tracker.component.html:109-125`).
*Recommended default:* **grow, capped at `max-height: 70vh` with
`overflow-y: auto`.** Nothing is permanently hidden, and a large host can never
push the initiative order off screen mid-combat.

**7. Keep or drop the dead `⚡` direct-connection overlay?**
*Grounding:* `html:59-61` reads `node.directConnection`, which GM mode always
sets `false` (`:105,120,134,146`); only `SharedMatrixTarget.directConnection`
(`session-sync.service.ts:142-143`) carries it, and that has no producer.
`briefs/matrix-port-rules-correctness-spec.md:937` already recorded that nothing
sets it.
*Recommended default:* **keep the markup, add a comment naming it as awaiting
the direct-connection workflow, change nothing else.** Wiring it from
`MatrixHost.accessMethod` would be wrong — that is a host-level fact rendered as
a per-icon glyph.
