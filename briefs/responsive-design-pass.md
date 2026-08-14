# Spec — Responsive / Visual Design Pass

Status: draft, awaiting answers to Open Decisions.

## Request

Make the tracker look and behave deliberately at every viewport width — with **desktop as the priority** — and replace the current ad-hoc control sizing with one consistent button/control sizing system, **without changing any behaviour**.

**Not in scope:**

- Any change to TypeScript: component logic, handlers, services, socket event handling, `CombatManager`, `Participant`, `UndoHandler`, session sync. No file under `src/Combat/`, `src/Common/`, `src/Grunts/`, `src/Matrix/`, `src/Magic/`, `src/app/services/`, `server.js` or `server/` is touched.
- Any change to what a control *does*, when it is shown, or what it is bound to. `@if`/`@for` conditions, `[disabled]` expressions, `(click)` handlers, `[ngModel]`/`(ngModelChange)` bindings and `data-testid` attributes are frozen exactly as they are.
- Adding, removing or reordering controls. If a button is in the wrong place today, this pass may change its *size and alignment*, not its existence.
- Any new dependency, CSS framework, preprocessor or design-token library. No Bootstrap version upgrade.
- The skin *palettes* themselves. Three skins exist (default / vintage / cyberdeck, `src/app/app.component.ts:8-26`); this pass makes sizing consistent **across** them, it does not redesign their colours or add a fourth.
- Accessibility as a project (contrast audit, ARIA sweep, keyboard nav).

**Template edits are allowed only** where a layout needs a wrapper element, a class name, or a Bootstrap grid/utility class change. A template edit that alters which control renders, or when, is out of scope by definition.

## Current behaviour

### The style surface, in full

| File | Role |
|---|---|
| `src/styles.scss` (1913 lines) | Global. Layout shell (1-52) + three skins: `skin-alternate` (54-327, unreachable from the UI), `skin-vintage` (328-604, 1653-1746), `skin-cyberdeck` (606-1913). |
| `src/app/battle-tracker/battle-tracker.component.css` (800 lines) | GM view. |
| `src/app/player-view/player-view.component.css` (400 lines) | Player view. |
| `src/app/dice-roller/dice-roller.component.scss` (334 lines) | Dice roller, both views. |
| `src/app/condition-monitor/condition-monitor.component.css` (58 lines) | CM grid, GM view only. |
| `src/app/matrix/matrix-participant-badge/matrix-participant-badge.component.css` (139 lines) | Matrix badge + OS editor. |
| `src/app/magic/astral-badge/astral-badge.component.css` (34 lines) | Astral badge. |
| `src/app/confirmation-dialog/confirmation-dialog.component.css` | **Empty file.** |
| `src/bootstrap-xlgrid.min.css` | **Not referenced.** Not in `angular.json`'s `styles` array (26-30) and not `@import`ed anywhere in `src/`. Dead. |

Global stylesheets are `src/styles.scss`, `bootstrap.min.css`, `all.css` (FontAwesome), in that order (`angular.json:26-30`).

### Views

Two top-level views, chosen by `?mode=` at `app.component.ts:34`, plus the shell:

- `src/app/app.component.html` — navbar (2-30), skin switcher (10-20), footer (41-45). Hidden entirely in player mode.
- `src/app/battle-tracker/battle-tracker.component.html` — 1110 lines, GM.
- `src/app/player-view/player-view.component.html` — 555 lines, player.
- Shared children: `app-dice-roller` (both views), `app-condition-monitor`, `app-matrix-participant-badge`, `app-astral-badge`, `app-confirmation-dialog`.

### Facts about button sizing today

There is no sizing system. Buttons get their size from **six** different mechanisms:

1. **Bootstrap default `.btn`.** GM toolbar (`battle-tracker.component.html:54, 60, 64`), row action buttons (211-368), add-participant row (610-627).
2. **Bootstrap `.btn-sm`,** used in the same view for controls of equal importance — Initiative Prep is `btn-group-sm` (90) while the Start Combat Turn group directly above it (51) is default size; the NPC row's Add NPC (402) is `btn-sm` but the hit/stun/heal buttons in the same panel (442-448) are default size.
3. **Component CSS pixel/rem overrides.** `.gm-roll-btn { min-width: 2.2rem; height: 31px }` (`battle-tracker.component.css:401-404`); `.interrupt-twirl { min-width: 2rem; padding: 0 0.4rem }` (216-220); `.action-item-twirl { min-width: 2rem }` (308-311).
4. **Skin CSS overriding (3).** `body.skin-cyberdeck .gm-roll-btn { min-width: 1.9rem; height: 1.9rem }` (`styles.scss:1823-1826`) silently replaces the 31px above; `body.skin-cyberdeck .btn { padding: .24rem .56rem }` (1437-1442) and `.btn-sm { padding: .15rem .4rem }` (1444-1447) replace Bootstrap's padding for that skin only. A button's height differs between skins for reasons nobody chose.
5. **Elements styled to look like buttons but that are not `.btn`:**
   - `.ic-alert-dismiss` — 1.35rem circle, own border/colour (`battle-tracker.component.css:644-665`).
   - `.os-adj-btn` — pill, `min-width: 1.7rem`, own palette, skin-blind (`matrix-participant-badge.component.css:82-121`).
   - `.interrupt-list summary` — a `<summary>` painted as a grey button (`player-view.component.css:57-66`).
   - `.dice-section-toggle` — `all: unset` then rebuilt (`dice-roller.component.scss:96-114`).
   - `.merge-select-box` — 1.1rem checkbox (`battle-tracker.component.css:570-576`).
6. **Bare element selectors with no class.** `battle-tracker.component.css:1` `tr { background: white; }` and 33-36 `div { padding-top: 2px; padding-bottom: 2px; }` — the latter applies vertical padding to **every `div` in the GM component**, and is the single largest source of the inconsistent vertical rhythm in that view.

Additionally, `battle-tracker.component.css` contains rules for selectors that **appear nowhere in any template** (verified by grep across `src/app/**/*.html`): `#btnLogToggle` (38), `#btnUndo`/`#btnRedo` (48-68 — the Undo/Redo buttons at `battle-tracker.component.html:71,75` carry no `id` and use FontAwesome icons instead), `.btn-diceroll` (70-76), `.icon-shield` (84-90), `.smcol` (133), `.btn-toolbar-right` (190), `.no-border-radius` (192), `.innertable` (123-131). `.left` is applied at `battle-tracker.component.html:51` and has **no rule anywhere**; its sibling `.right` does (`battle-tracker.component.css:92-95`, `position: absolute`).

### Facts about responsiveness today

- **`html, body { height: 100vh }` plus `app-root { min-height: 100vh }`** (`styles.scss:1-14`) — fixed-viewport shell with a `flex: 1 0 auto` body.
- **The GM details panel is a fixed overlay, not a column.** `.detailsBar { position: fixed; right: 0; top: 10vh; height: 80vh }` (`battle-tracker.component.css:40-46`), applied to a `col-3` (`battle-tracker.component.html:790`), rendered only when `selectedActor` is set (788). Consequences: the main `col-9` (115) is 9/12 wide **even when no actor is selected**, permanently wasting 25% of a wide desktop; and when one *is* selected, the fixed panel overlays whatever is under it at any width where `col-3` is narrower than the panel's content.
- **The GM initiative list uses two rows' worth of columns below `xl`.** Per participant: `col-4 col-xl-2` (145), `col-2 col-xl` (170), `col-6 col-xl-3` (173), `col-7 col-xl-3` (211), `col-5 col-xl-3` (298). Below 1200px that is 4+2+6 then 7+5 — two deliberate 12-column lines. The **header** row above it (122-139) is only 3 cells (`col-4`, `col-2`, `col-6`) plus a bare `col-xl-6` (138) which, below 1200px, has no `col-*` class in force and renders as a full-width empty block. So below 1200px the header labels only cover the first line of each participant and an empty strip is drawn under them.
- **Two different breakpoints govern the same element.** `battle-tracker.component.css:406` uses `@media (max-width: 1400px)` for `.gm-stats-roll-group` / `.gm-roll-btn`; `styles.scss:1828` uses `@media (max-width: 1500px)` for the same two selectors under `skin-cyberdeck`. These are the only two media queries in the entire codebase. There is no `sm`/`md` handling anywhere.
- **Player view uses a different breakpoint family** from the GM view: `col-lg-*` (`player-view.component.html:149-151, 155-177`) and `col-md-*` (5, 9, 52-85, 322-327) vs. the GM view's `col-xl-*`. Player view is also in a fixed-width `.container` (1), the GM view in `.container-fluid` (`battle-tracker.component.html:1`, and again at `app.component.html:31`).
- **Viewport units used for control sizing:** `.smcol { max-width: 10vw }` (dead), `.dropdown-menu { min-width: 10vw }` (`battle-tracker.component.css:194-197`, live — the interrupt menu width tracks the window width), `#btnLogToggle { margin-top: 5vh }` (dead).
- **Fixed pixel sizes that do not scale:** `.cmCell { width: 32px; height: 32px }` (`condition-monitor.component.css:9-16`), `.switch { width: 54px; height: 26px }` (`battle-tracker.component.css:137-142`), navbar logo `style="height: 50px"` (`app.component.html:5`), `.footer { height: 50px }` (`styles.scss:26-35`).
- **The dice roller ignores all three skins.** It hard-codes `#00ff41` on `#000` throughout (`dice-roller.component.scss:16-22, 49-64, 91-128, 204-247, 259-312`). Under vintage (a cream/brown parchment skin) it renders as a black terminal box.
- **Inline styles in templates:** `app.component.html:5`; `player-view.component.html:310-311`; `battle-tracker.component.html:50, 414, 417, 436, 486, 838`.

### Duplication between the two view stylesheets

`battle-tracker.component.css` and `player-view.component.css` contain near-identical copies of the same blocks — `.action-item-*`, `.economy-*`, `.action-validation*`, `.action-category-*`, `.action-matrix-group`, `.matrix-group-badge`, `.twirly`, `.action-check`, `.log-text-*`, the five `::ng-deep .log-keyword-*` rules, `.log-badge*`, `.log-entry-*`, `.glitch-note-toggle`. Compare `battle-tracker.component.css:239-370, 442-496, 588-612, 686-768` with `player-view.component.css:118-231, 233-287, 289-313, 315-399`. They are not currently identical in every value and will drift further if edited one at a time. Because Angular uses emulated view encapsulation, these cannot be deduplicated by deleting one copy — see Open Decision 4.

## Affected paths

Paths marked **(pattern site)** exhibit a defect the user reported at only one location.

### Must change

1. `src/styles.scss` — home of the sizing tokens. Also holds the shell layout (1-35) and every skin's `.btn` override (149-215 alternate, 437-510 vintage, 782-925 + 1437-1460 cyberdeck). **(pattern site: three skins each independently redefine button padding/size.)**
2. `src/app/battle-tracker/battle-tracker.component.css` — bare `tr` and `div` selectors (1, 33-36); dead-selector block (38, 48-76, 84-90, 123-133, 190-192); `.detailsBar` (40-46); `.gm-roll-btn` (401-404) and its media query (406-414); twirl/interrupt sizing (216-220, 308-311); `.dropdown-menu` `10vw` (194-197); the non-`.btn` `.ic-alert-dismiss` (644-665).
3. `src/app/battle-tracker/battle-tracker.component.html` — header/row column mismatch (122-139 vs 145/170/173/211/298); `col-9` main column (48, 115); `col-3 detailsBar` (790); inconsistent `.btn` vs `.btn-sm` at 54/60/64 vs 90-107, 402 vs 442-456, 610-627 vs 635-643; inline styles at 50, 414, 417, 436, 486, 838; the unstyled `.left` class at 51.
4. `src/app/player-view/player-view.component.css` — the duplicated block (118-231, 233-399) **(pattern site)**; the fake-button `<summary>` (57-66); `.roll-input { max-width: 12rem }` (114-116).
5. `src/app/player-view/player-view.component.html` — `.container` vs the GM's `.container-fluid` (1); `col-lg-*` vs the GM's `col-xl-*` (149-177) **(pattern site: two views, two breakpoint families)**; the `col-md-1`/`col-md-2` create grid (52-85) which collapses to full-width stacked fields below 768px; inline styles at 310-311; `btn-sm` vs default `.btn` at 44/89 vs 125-138.
6. `src/app/dice-roller/dice-roller.component.scss` — the hard-coded green terminal palette; `.dice-count-input { width: 4.5rem }` (24-26), `.roll-as-select { width: 11rem }` (33-35), `.roll-as-other-input { width: 9rem }` (37-39) — fixed widths that overflow the GM's narrow right-hand card; the non-`.btn` `.dice-section-toggle` (96-114).
7. `src/app/app.component.html` — inline logo height (5); skin-switcher `btn-group-sm` (10-20); navbar has no `navbar-toggler` despite `navbar-expand-lg` (2), so on small screens the brand and the skin buttons share one line.

### Must be reviewed, likely changes

8. `src/app/condition-monitor/condition-monitor.component.css` — 32px fixed cells (9-18); a 16-box grunt monitor inside the 25%-wide `.detailsBar` cannot fit. `styles.scss:1094-1163` already re-skins `.cmCell` for cyberdeck **(pattern site: cell appearance defined in two files)**.
9. `src/app/matrix/matrix-participant-badge/matrix-participant-badge.component.css` — `.os-adj-btn` is a fifth independent button style (82-121); `.os-editor` is an absolutely-positioned popover (66-80) needing re-check against any row-height change.
10. `src/app/magic/astral-badge/astral-badge.component.css` — same badge idiom as (9), independently defined (1-33) **(pattern site: two badge components, two copies of the same chip styling)**.
11. `src/app/confirmation-dialog/confirmation-dialog.component.css` — empty; the dialog (`confirmation-dialog.component.html:14-17`) uses default `.btn`s and inherits whatever the sizing system decides.
12. `src/index.html` — viewport meta is already correct (7); confirm no change needed and say so.

### Must be deleted or explicitly kept

13. `src/bootstrap-xlgrid.min.css` — unreferenced.

### Explicitly NOT changed

`battle-tracker.component.ts`, `player-view.component.ts`, `dice-roller.component.ts`, `condition-monitor.component.ts`, `app.component.ts` (the skin mechanism at 40-77 stays as-is), and everything outside `src/app/`.

## Proposed approach

**One choke point for sizing.** The five-plus independent sizing mechanisms are the defect. Route them all through a small set of CSS custom properties declared once on `body` in `src/styles.scss`, outside any `.skin-*` selector, so all three skins inherit them: `--ui-control-h`, `--ui-control-h-sm`, `--ui-control-pad-x`, `--ui-control-font`, `--ui-icon-btn-w`, `--ui-gap`.

Then:

- `.btn`, `.form-control`, `.form-select`, `.input-group-text` consume the tokens in a *global* rule, so a button and the input beside it in an `input-group` are the same height by construction rather than by coincidence.
- A skin may override the token **values** (cyberdeck is legitimately denser than vintage). A skin may **not** re-specify `.btn` padding/height directly. `styles.scss:1437-1447` and `1823-1826` become token overrides.
- Component CSS that hard-codes a height (`.gm-roll-btn`, `.interrupt-twirl`, `.action-item-twirl`, `.ic-alert-dismiss`, `.os-adj-btn`, `.merge-select-box`, `.dice-section-toggle`, `.interrupt-list summary`) consumes the tokens instead. The non-`.btn` fake buttons keep their distinct *colour* but adopt the shared *geometry*.
- **`.btn-sm` vs `.btn` becomes a rule, not a habit** (Open Decision 1), applied uniformly across both views.

**Delete before restyling.** The dead block in `battle-tracker.component.css` (~80 lines), `src/bootstrap-xlgrid.min.css`, and the unstyled `.left` class. Each deletion is independently verifiable (grep shows zero template references), and doing it first shrinks the surface the rest of the pass reasons about.

**Kill the two bare element selectors first.** `div { padding-top: 2px; padding-bottom: 2px }` and `tr { background: white }` must be replaced with explicit classed rules before any spacing work, or every subsequent spacing decision fights them. Expect this single change to visibly move the whole GM view; that is the point, and it should be reviewed as its own step.

**Breakpoints: pick one family.** Reconcile the GM view's `col-xl-*` (1200px) with the player view's `col-lg-*` (992px), and fold the two rogue media queries (1400px component, 1500px skin) into standard Bootstrap breakpoints. Since desktop is the priority, the GM view's real problem is not small screens but the 992-1400px band — which is a laptop, which is what a GM actually runs this on.

**Desktop-first ordering:** (1) delete dead CSS, kill bare element selectors; (2) sizing tokens applied across all `.btn`/`.form-control` and the six non-`.btn` controls; (3) GM desktop layout — `col-9`/`detailsBar`, header/row alignment, the 992-1400px band; (4) player view breakpoint/container consistency; (5) dice roller skin integration; (6) mobile stacking below `md` for both views.

**Do not deduplicate the two view stylesheets** by moving rules to `styles.scss` without deciding Open Decision 4 first — the move changes encapsulation and specificity and can leak into the other view.

## Acceptance criteria

1. `src/bootstrap-xlgrid.min.css` is deleted, or a comment states why it is kept.
2. Every selector in `battle-tracker.component.css` matches at least one element in some rendered state. Specifically `#btnLogToggle`, `#btnUndo`, `#btnRedo`, `.btn-diceroll`, `.icon-shield`, `.smcol`, `.btn-toolbar-right`, `.no-border-radius`, `.innertable` are gone or re-attached to real elements.
3. No bare element selector (`div`, `tr`, `td`, `span`, `button`, `input`) exists in any component `.css`/`.scss` under `src/app/`.
4. In each of the three skins, at 1920/1440/1280/1024px width: every `.btn` in the GM initiative row (Seize Initiative, Act, Delay, Interrupts, Group/Deck, Awakened, Claimable, duplicate, leave-combat, delete) renders at the same computed height as every other, and as the `.form-control` inputs on the same line.
5. In each of the three skins, the GM roll-die button (`.gm-roll-btn`, `battle-tracker.component.html:204`) is square within 2px and matches the height of its `input-group`, at all four widths in (4).
6. `.btn-sm` appears in a template only where the documented size rule (Open Decision 1) says it should. No two buttons in the same visual group differ in size.
7. `.ic-alert-dismiss`, `.os-adj-btn`, `.interrupt-list summary`, `.dice-section-toggle` and `.merge-select-box` each draw their computed height from the shared tokens, not a literal value in their own rule.
8. No skin rule sets `padding`, `height`, `min-height` or `font-size` directly on `.btn` or `.btn-sm`; skins set token values only.
9. Exactly one set of media-query breakpoints is used across `styles.scss` and all component stylesheets. The 1400px query (`battle-tracker.component.css:406`) and the 1500px query (`styles.scss:1828`) no longer both exist.
10. At every width from 1024px to 2560px, the GM initiative-list header cells line up with the participant-row cells beneath them, and no empty full-width strip is rendered under the header.
11. At every width from 1024px to 2560px, with an actor selected, the details panel does not overlap or clip the initiative list, and every control inside it (including a 16-box grunt Condition Monitor) is fully visible and reachable without horizontal scrolling.
12. With no actor selected, the GM view's main column uses the full available width.
13. At 1024px width, no element in either view causes a horizontal scrollbar on `body`.
14. At 390px width, both views render every control without horizontal scrolling; controls that cannot fit side by side stack rather than overflow or shrink below the token minimum.
15. The dice roller renders legibly in all three skins — specifically, not black-on-cream or green-on-cream in the vintage skin.
16. `npm run lint` passes.
17. `npm test` passes with **zero test files modified**.
18. `git diff --stat` shows no changes to any `.ts` file, to `server.js`, or to anything under `server/`, `src/Combat/`, `src/Common/`, `src/Grunts/`, `src/Matrix/`, `src/Magic/`, `src/app/services/`.
19. Every `data-testid` attribute present before the change is present after it, on the same element.
20. Every `id` referenced by a spec (`#participant{{i}}`, `#interruptDropdownButton`, `#npcRow{{i}}`, `#npcRow{{i}}member{{mi}}`, `#navbar-title`) is unchanged.

## Regression risk

Behavioural risk is near-zero by construction; **test** risk is not. Several specs assert against DOM structure and class names.

| Spec | Selector it depends on |
|---|---|
| `battle-tracker.component.spec.ts:189-190` | `#participant0` → `button.gm-roll-btn` |
| `battle-tracker.component.spec.ts:253-254` | `#participant{i}` → `input.inpDiceIni` |
| `battle-tracker.component.spec.ts:381` | `#interruptDropdownButton` |
| `battle-tracker.component.spec.ts:419-420` | `#participant{i}` → `input.gm-dice-count-input` |
| `battle-tracker.component.spec.ts:428` | `.detailsBar nav button` — **most at risk**, the details panel is being restructured (AC 11) |
| `battle-tracker.component.spec.ts:434-435` | `input.gm-stats-dice-count-input` |
| `src/Grunts/npc-row.spec.ts:892, 901` | `a[ngbNavLink], button[ngbNavLink]` |
| `src/Grunts/npc-row.spec.ts:1451-1452, 1909-1910` | `badge-npc-row`, `badge-grunt`, `player-badge-*` |
| `src/scenarios/combat-log-readability.spec.ts:239` | `.gm-log-list .list-group-item` |
| `combat-log-readability.spec.ts:246,272,531,551,635,640` | `log-entry-ref`, `glitch-note-visibility`, `retained-hidden-banner`, `retained-hidden-entry` |
| `src/scenarios/gm-npc-rolls.spec.ts:30,954,959,1040` | `roll-as-select`, `roll-as-other-input`, `roll-as-hint` |
| `gm-npc-rolls.spec.ts:905` | `.log-list` (player view) |
| `gm-npc-rolls.spec.ts:1218` | `.dice-roller-attribution` |
| `gm-npc-rolls.spec.ts:1247-1249` | class `dice-section-label--stale` asserted by name |
| `src/scenarios/persistent-rooms.spec.ts:1087,1206,1323-1328,1478-1479,2108` | `share-connection-lost`, `restore-warning`, `release-claim-btn`, `close-room-btn`, `end-room-btn`, `gm-not-connected` |
| `src/app/app.component.spec.ts:29` | `#navbar-title` |

`.gm-log-list .list-group-item` and `.detailsBar nav button` are descendant selectors: wrapping either in a new container is safe, but *moving* the `nav` out of `.detailsBar`, or renaming `.gm-log-list`, breaks them. `.dice-section-label--stale` and `.dice-roller-attribution` are class names that tests read as identifiers, so the dice-roller reskin must keep them.

**Non-test risk:**

- **Skin cross-contamination.** `styles.scss` reaches into component internals from global scope (`body.skin-cyberdeck .gm-roll-btn`, `.cli-create-cell`, `.cmCell`, `.acting .btn`). A component-CSS change that raises specificity above those will silently un-skin an element in one skin only. Hence AC 4-8 are specified *per skin*.
- **`!important` chains.** Status colouring (`.acting`, `.delaying`, `.finished`, `.negativeIni`, `.ooc` at `battle-tracker.component.css:97-121`, re-declared with `!important` at `styles.scss:1493-1574`) applies backgrounds to a row *and all its direct children*. Restructuring a participant row's children changes which elements get coloured — the acting-row highlight is the most operationally important visual in the app and must be verified in all three skins after any row restructure.
- **`skin-alternate` is unreachable from the UI** (in the type union at `app.component.ts:8`, settable via `?skin=alternate` at 33-35, absent from `skinOptions` at 22-26). 274 lines at `styles.scss:54-327` — see Open Decision 5.
- **`cdkDrag` participant reordering** (`battle-tracker.component.html:141, 144`) depends on the row being the drag item. Wrapping the row in a new container, or changing its display mode, can break drag previews. This is the one place a "wrapper div" edit could have a behavioural effect.
- **`ngbDropdown` / `ngbNav` / `ngbModal` positioning.** The interrupt dropdown (244-249), the details-panel nav (796), and the act modal (`size: "lg", centered: true`, `battle-tracker.component.ts:2735` and `player-view.component.ts:627`) are library-positioned. Overflow/`position` changes on ancestors can clip them — the comment at `matrix-participant-badge.component.css:8-9` records this exact hazard, and `.gm-stats-col { overflow: hidden }` (`battle-tracker.component.css:372-374`) is a live instance.

## Scenarios to survive

**S1 — Ordinary case, desktop.** GM at 1920px, cyberdeck skin, eight participants, three player-owned, combat started, pass 2. Every row's buttons are the same height as each other and as the stat inputs beside them; header labels sit over the columns they describe; the Action Log and Dice Roller cards below are the same width as the list. Nothing has moved position relative to today except by the amount the sizing system dictates. No console warnings.

**S2 — Edge case, the laptop band.** Same encounter at 1280px — the 992-1400px band where the current layout is worst. The initiative row still reads as one line per participant or as a clean two-line block, not a ragged wrap; the roll-die button is still square and adjacent to its input; selecting an actor opens the details panel without covering the name column. Switching **between default and vintage** at this width changes colours and nothing else about the geometry — cyberdeck is the deliberate exception (Open Decision 1's token-value override): it is denser by design, so switching to or from cyberdeck changes control height, font size and row wrapping along with colour. That is accepted, not a bug.

**S3 — Undo.** GM taps Delay on the acting participant, then Undo. The row returns to `.acting` and re-acquires the green highlight — including the `!important` child-element colouring at `styles.scss:1493-1526` — in all three skins. The Undo/Redo buttons themselves (`battle-tracker.component.html:71-78`, whose old `#btnUndo`/`#btnRedo` background-image styling is deleted per AC 2) render their FontAwesome icons at the shared icon-button size and are visibly disabled when `isUndoDisabled()` is true.

**S4 — Live at the table, mid-combat.** Four players waiting. GM on a laptop at 1366px, share session open, pass 3. A grunt group row with five members is the current actor. The GM expands the group panel, types a DV into a member's damage box, taps the physical-hit button, the member goes out of action, the row is cleaned up, the order advances. Throughout: the damage input and its hit button are the same height and adjacent, the panel does not push the Act button off-screen, and the list does not reflow so far that the GM loses their place. Meanwhile a player on a 390px phone sees their Act / Delay / Interrupts buttons stacked and each large enough to tap accurately first time.

**S5 — Player mid-round on mobile.** A player joins on a 390px phone during pass 2, gets a roll prompt, submits. The roll banner (`player-view.component.html:117-128`) fits: the number input (`.roll-input { max-width: 12rem }`) and the two buttons stack rather than squeezing the buttons to unreadable width. After submitting, the row shows the `You` and Acting badges without overflowing horizontally.

**S6 — Skin switch mid-combat.** GM taps Vintage with combat running and a details panel open. Only colours and typography change; no control changes size, nothing reflows, the selected actor stays selected, the panel stays put. This holds exactly for default↔vintage. It does **not** hold for cyberdeck, by design (see S2): switching to or from cyberdeck changes `--ui-control-h`, `--ui-control-h-sm`, `--ui-control-h-xs`, `--ui-control-font`, and `--ui-participant-border` together, which can change how many lines a participant row wraps to. The selected actor and open panel must still survive any of the three switches unchanged — only geometry is exempted for cyberdeck.

**S7 — Details panel with a grunt Condition Monitor.** GM selects a detached grunt with Body 6 (an 11-box single track, `battle-tracker.component.html:808-853`). The 32px cells fit inside the details panel at 1280px without horizontal scroll, and the Body/Willpower `input-group` below (838-852) sits on one line or wraps cleanly.

## Open decisions — RESOLVED (2026-08-06, Xavier: "go with recommended defaults")

All nine decisions below are resolved to their recommended default. Implementer should treat these as settled spec, not as open questions.

1. **Standard button size / `btn-sm` rule — RESOLVED: one standard size for all primary controls; `btn-sm` permitted only inside an already-compact context** (log entries, expanded sub-panels, badges). This sets the visual density of the whole app — apply it uniformly.

2. **Fixed-position details panel — RESOLVED: convert to a real grid column.** `col-9` main column applies only when the details panel is open; main column goes full width when no actor is selected. Drop `position: fixed` on `.detailsBar`. Accepted consequence: the panel now scrolls with the page instead of staying pinned — this is an intentional behavior/workflow change to the panel's *feel*, not a functional code change (it's driven by grid classes + CSS position, not TS logic), and is explicitly authorized by this resolution.

3. **Dice roller skinning — RESOLVED: keep the green terminal as an intentional motif under cyberdeck; add skin-aware variants for default and vintage** so it isn't a black box on parchment (satisfies AC 15).

4. **Duplicated CSS between view stylesheets — RESOLVED: leave both copies in place, make them byte-for-byte identical, and document the duplication as intentional** (comment at the top of each duplicated block). Do NOT rename `.css`→`.scss` or touch `styleUrls` — no TS edits at all, full stop.

5. **`skin-alternate` — RESOLVED: delete it.** Remove `styles.scss:54-327`, remove `'alternate'` from the type union in `app.component.ts` only if doing so requires no other TS logic change (if removing it touches meaningful TS logic beyond a type/string literal, leave the TS side alone and just strip the dead CSS + note it in the summary).

6. **Minimum supported width — RESOLVED: 360px for the player view, 1024px for the GM view.**

7. **Condition Monitor cells — RESOLVED: keep 32px on desktop, allow shrink to a ~24px floor below `md`.** Update `condition-monitor.component.css:9-18` and the cyberdeck override at `styles.scss:1094-1163` together.

8. **Container width convergence — RESOLVED: keep GM (`container-fluid`) and player (`container`) different.** GM keeps every pixel; player view stays a bounded reading surface.

9. **Visual-regression baseline — RESOLVED: no VR harness.** AC 4, 5, 10-15 are verified by manual inspection at the named widths/skins; implementer records which combinations were actually checked in the Stage-4 summary.
