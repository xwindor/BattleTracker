# Cyberpunk name generator — technical spec

*Planned against the code as read on 2026-09-04, branch `main`, HEAD `ff8b018`.
`rules/` was not opened and no rules facts are asserted — see "Not a rules
change" below.*

## Request

Add a cyberpunk/Shadowrun-flavoured name generator, invocable on explicit GM
tap from the app's name-entry fields, producing street handles, crew names,
Matrix host names and Matrix icon names into the field the GM tapped.

**Not in scope:** any change to initiative arithmetic, the turn/pass loop,
damage, Condition Monitors, Matrix marks or Overwatch, the combat log's timing
or wording, session-sync payload shape, `server.js`, the room-code fields, the
dice roller's "Roll as → Other…" field, per-faction corpora, generated-name
history, and any automatic (non-tap-triggered) name generation.

### This request moves the `SCOPE.md` boundary — read this first

`SCOPE.md` has **no category for content generation**. Its "In scope" list
covers representing state, tracking values, displaying state, applying a change
the GM asks for (including rolling dice), and enforcing legality. A name
generator is none of those: it invents flavour text the GM could have invented.

The nearest exclusions, neither of which is an exact fit:

- *"Automating things a GM would rather decide in the moment."* Naming an NPC is
  squarely a GM-in-the-moment decision. A generator that **auto-fires** clearly
  crosses this. One that fires only on an explicit tap and is always
  overwritable is a *suggestion*, not automation — but the line is not written
  down anywhere.
- *"Character building, gear management, or anything that belongs before the
  session starts."* A GM-editable corpus is prep-time authoring and would cross
  this. A fixed built-in corpus does not.

There is a live in-tree precedent for the exact shape being proposed:
`HierarchyEditorComponent.suggestAsdf()` /
`suggestAsdfForForm(rating)` (`src/app/matrix/hierarchy-editor/hierarchy-editor.component.ts:144-158`),
surfaced as a "Suggest A/S/D/F" button at
`src/app/matrix/hierarchy-editor/hierarchy-editor.component.html:80-83` — the
app inventing four host attribute values from a random shuffle, on explicit
click, fully editable afterwards. That shipped without anyone treating it as a
boundary crossing.

**This is Xavier's call, not mine.** Scope Question A below asks for a one-line
addition to `SCOPE.md` fixing where the line sits, so the next content-generation
request has something to be measured against.

### Not a rules change

`briefs/grunt-naming-and-statblocks-spec.md:45` (governing rule G14) records
the result of an exhaustive search of `rules/pages/` for `grunt`, `Grunt`,
`Professional Rating`, `lieutenant`: *"There is no rule anywhere in the indexed
pages governing how a GM labels an individual grunt. Naming is a tracker
affordance, not a rules mechanic."* Nothing in this feature depends on a
printed value, threshold or timing. It does not belong in `/feature`.

The one rules-adjacent consequence is second-hand and already settled: p. 379
settles alive-or-dead **per individual grunt**, which is why the existing
default-name generators go to trouble to keep names unique and namespaces
apart. Generated names inherit that obligation (AC 5–7 below).

---

## Current behaviour

### Every name-entry field in the app (exhaustive)

Found by grepping all `src/**/*.html` for `type="text"` and for `ngModel`
bindings, then reading each hit. There are **eight** text fields bound to a
name-like value, plus two room-code fields that are not names.

| # | File:line | Field | Bound to | Validation / uniqueness today |
|---|---|---|---|---|
| 1 | `src/app/battle-tracker/battle-tracker.component.html:1486-1489` | Add-dialog **Name** (`#addDraftName`, `data-testid="add-draft-name"`) | `pendingAddDraft.name` (two-way) | None. Pre-filled by `openAddDialog()` from the per-kind default generator; blank falls back to the same generator at commit. A typed name is **never** checked for uniqueness. |
| 2 | `src/app/battle-tracker/battle-tracker.component.html:207-208` | GM combat-list row **Name** (`input[name="name"]`) | `p.name` (two-way) + `(ngModelChange)="onParticipantUpdated()"` + `(keydown)="inpName_KeyDown($event)"` | None. Every keystroke calls `onParticipantUpdated()` (`battle-tracker.component.ts:6075-6078`) → `enforceParticipantRollBounds()` + `syncSharedState()`. No blur/Enter commit handler exists any more (`RULINGS.md` 2026-08-30). |
| 3 | `src/app/battle-tracker/battle-tracker.component.html:693-695` | Grunt-group NPC **name** (`.npc-row-member-name`) | `m.name` one-way + `(ngModelChange)="m.name = $event; onParticipantUpdated()"` | None on typed names. Defaults from `nextRowMemberName(row)`. |
| 4 | `src/app/matrix/hierarchy-editor/hierarchy-editor.component.html:72-75` | **Add host** Name (`#hostNameInput`, `id="hier-add-host-name"`) | `hostForm.name` (two-way), `maxlength="60"` | Save disabled while `!hostForm.name.trim()` (line 104); `saveHostForm()` re-checks and returns early (`hierarchy-editor.component.ts:162`). No uniqueness. |
| 5 | `src/app/matrix/hierarchy-editor/hierarchy-editor.component.html:192-195` | **Edit host** Name (`id="hier-edit-host-name"`) | `hostForm.name` (two-way), `maxlength="60"` | Same as #4 (line 218 disables Save). |
| 6 | `src/app/matrix/hierarchy-editor/hierarchy-editor.component.html:296-300` | **Target/icon** Name (`id="hier-target-name"`), shared by add and edit for device / file / persona / IC | `targetForm.name` (two-way), `maxlength="60"` | Save disabled while `!targetForm.name.trim()` (line 345); `saveTargetForm()` re-checks (`hierarchy-editor.component.ts:237`). No uniqueness. |
| 7 | `src/app/player-view/player-view.component.html:99` | Player **Character name** (`id="pv-character"`) | `characterName` (two-way) | None. Trimmed at send: `player-view.component.ts:322`. Also used as the roll attribution at `:135`, `:498`, `:566`. |
| 8 | `src/app/dice-roller/dice-roller.component.html:44-52` | **"Roll as → Other…"** (`data-testid="roll-as-other-input"`) | `rollAs` (two-way), only rendered when `isRollAsOther` | None. Free text by design (`battle-tracker.component.ts:645-646`). |

Not names, listed so they are visibly excluded rather than missed:
`battle-tracker.component.html:6` (GM join room code), `player-view.component.html:8`
(player room code), `battle-tracker.component.html:990-996` (glitch narration,
`maxlength` bound to `glitchNoteMaxLength`).

**IC has no name field anywhere.** `ICSpawnerComponent`
(`src/app/matrix/ic-spawner/ic-spawner.component.ts` / `.html`) collects only an
`ICType` from a `<select>` and emits a spawn event; grepping all `*.html` for
`app-ic-spawner` returns **zero mounts**, so the component is not reachable from
the UI at all today. No IC naming work is possible or needed.

### Default-name generation — four namespaces, all in `battle-tracker.component.ts`

| Prefix constant | Value | Generator | Uniqueness behaviour |
|---|---|---|---|
| `STANDALONE_GRUNT_NAME_PREFIX` (`:118`) | `"Grunt"` | `nextStandaloneGruntName()` (`:6385-6395`) | Regex-scans **all** `combatManager.participants.items` for `^Grunt (\d+)$`, returns highest + 1. |
| `MERGED_GRUNT_ROW_NAME` (`:131`) | `"Grunt Group"` | `nextMergedGruntRowName()` (`:6430-6440`) | Scans all participants against `DEFAULT_ROW_NAME_PATTERN` (`:139`). Bare `"Grunt Group"` counts as 1; first row unnumbered. Shared by `addNpcRow()` and `mergeSelectedGrunts()`. |
| `DEFAULT_ROW_MEMBER_NAME_PREFIX` (`:151`) | `"NPC"` | `nextRowMemberName(row)` (`:7052-7070`) | Prefix is the **row's own name** unless `isDefaultRowName(row.name)` (`:6443-6445`). Scans `row.members` only, takes `max(highest, members.length) + 1`, then **loops against a `taken` set** until free. This is the only generator with a real collision loop. |
| `STANDALONE_PARTICIPANT_NAME_PREFIX` (`:172`) | `"Combatant"` | `nextStandaloneParticipantName()` (`:6403-6413`) | Same shape as `nextStandaloneGruntName()`. |

Plus a **fifth, wire-only** namespace: `buildSharedParticipant()` renders a
blank-named participant as `` `Participant ${index + 1}` `` and never writes it
back to the domain object.

The doc comments at `:113-172` state the reason all four are kept apart:
two combatants answering to one name make the log's per-NPC lines
unattributable (p. 379 records alive-or-dead per NPC).

**There is no uniqueness enforcement on a *typed* name anywhere.**
`commitAddDraft()` (`battle-tracker.component.ts:5017-5075`) does
`const name = draft.name.trim();` and passes it straight through. Grepping the
component for `unique`, `duplicate name`, `collision` returns only doc-comment
prose and `nextRowMemberName`'s own loop.

### The add dialog (already built — this feature extends it, does not replace it)

`briefs/grunt-naming-and-statblocks-spec.md`'s Phase 1 shipped. Live shape:

- `AddDraftKind = "participant" | "grunt" | "row" | "rowMember" | "merge"` (`:182`)
- `interface AddDraft` (`:189-210`) — `name`, `count`, `body`, `willpower`,
  `statblockId`, `loadAugmented`, `targetRow`, `lieutenantTeamRow`
- `pendingAddDraft: AddDraft | null` (`:519`)
- `openAddDialog(kind, targetRow = null)` (`:4937-4959`) — seeds `name` from the
  per-kind default generator, opens `addDraftModalTpl`, **creates nothing**
- `commitAddDraft()` (`:5017-5075`) — the single commit point
- `cancelAddDraft()` (`:4999-5005`)
- Buttons: `btnAddParticipant_Click` (`:4887`), `btnAddGrunt_Click` (`:4898`),
  `btnAddNpcRow_Click` (`:4907`), `btnAddNpcToRow_Click` (`:4916`),
  `btnMergeSelectedGrunts_Click` (`:4925`)

`commitRowDraft()` (`:5136-5209`) builds a whole row's member names in bulk at
`:5176-5177`: `prefix = isDefaultRowName(row.name) ? "NPC" : row.name`, then
`` `${prefix} ${i + 1}` `` for `i` in `0..count-1`, with `count` clamped to
`[MIN_ROW_MEMBER_COUNT=1, MAX_ROW_MEMBER_COUNT=50]` (`:312`, `:320`).

### When the name reaches the log

`RULINGS.md` 2026-08-30 ("A combatant is announced when they enter the
initiative order, not when a name box loses focus"): every GM-side add path
calls `queueJoinAnnouncement()`; `announceJoinIfPending()` writes the line the
first time the participant has `diceIni > 0`. The resolver is a **lazy
callback** reading `participant.name` at announcement time
(`battle-tracker.component.ts:229-232`, and each queue site at `:5034-5037`,
`:5117-5120`, `:5201-5204`, `:7100-7108`).

**Consequence, load-bearing for this feature:** a name generated at any point
before the first Initiative Test is the name that reaches the log. No new
timing work is needed for that general case.

**Correction (D5, second validator round): this is false for `addNpcToRow`
into an already-rolled row.** `addNpcToRow` (Decision 7: a reinforcement
inherits the row's current shared Score directly, with no Initiative Test of
its own) calls `queueJoinAnnouncement`, which calls `announceJoinIfPending`
*synchronously, inline*. If the row has already rolled this Combat Turn
(`row.diceIni > 0`), that immediate call fires the join line **at add time**,
using whatever name is on the member **at that exact moment** - there is no
"first Initiative Test" left to wait for, because the member's Score-inheriting
"roll" and its add are the same event. For every other add path this window
is real (the Add dialog is open, or the row has not rolled yet, so a generate
press before Confirm/before the row's own roll changes the name the eventual
announcement reads); for this one path, when the GM commits the Add dialog
with **no name typed or generated** (so `addNpcToRow` falls back to
`nextRowMemberName()`, e.g. "NPC 3"), the log is written with that placeholder
immediately, and there is no remaining window - the row-member inline generate
button only becomes reachable once the member already exists in an expanded
row panel, strictly after the announcement already fired. Pressing it after
that point changes the roster's display name but cannot retroactively change
the log line already written, which is otherwise completely ordinary
already-accepted behaviour in this app (renaming anything, generated or
hand-typed, never rewrites a log line already sent) - it is only surprising
here because this specific path's *first* opportunity to rename coincides with
its *only* opportunity, and that opportunity has already closed by the time
the GM reaches the inline button.

**Not fixed in this round.** A real fix would need a new synchronisation
point to defer the announcement past add time for this one path, and Decision
7 deliberately gives this kind of reinforcement no future roll event to hang
it on - inventing one is a larger, riskier change than this feature's scope,
and was not requested. Pinned instead by
`src/scenarios/cyberpunk-name-generator.spec.ts`'s "defect 5" test: **use the
Add dialog's own generate button before pressing Confirm** for a reinforcement
into an already-rolled row, exactly as NS4 already does - that path is
unaffected and covered by AC 21/NS4.

### Session sync

A name is an ordinary string on both channels. No new fields:

- `SharedParticipantState.name` — `src/app/services/session-sync.service.ts:37`,
  written by `buildSharedParticipant()` (`battle-tracker.component.ts`, the
  `name: p.name || \`Participant ${index + 1}\`` fallback).
- `SharedGruntMemberState.name` — `session-sync.service.ts:16`, via
  `NpcRowParticipant.toRowSnapshot()` / `GruntMember.toSnapshot()`.
- `SharedMatrixTarget.name` — `session-sync.service.ts:128-144`, sanitised to
  `"Unknown Icon"` when `visibility === 'running-silent'`.
- `SharedGmParticipantState` — `session-sync.service.ts:248`ff. Carries no name;
  the name rides the player-facing channel.

`server.js`, `server/room-guards.js`, `server/gm-state-channel.js` and
`server/session-store.js` need **no** change. The 64 KB
`GM_STATE_MAX_PAYLOAD_BYTES` cap (`server/gm-state-channel.js:22`) is not
approached: nothing new is added to `gmState` at all.

### Name-keyed state that a rename disturbs

Grepped for every place a name is used as a lookup key rather than as display
text. Three, exhaustively:

1. **Matrix marks — keyed by the decker's `name`.**
   `MatrixHost.marks` and `MatrixTarget.marks` are `Record<string, number>`
   whose key the code calls `deckerId` but which is populated with `d.name`:
   `hierarchy-editor.component.ts:412` (`host.marks[d.name]`), `:423`
   (`s.selectedDeckerId = ...[0].name`), `:431`
   (`addMarkToHost(host, s.selectedDeckerId, 1)`);
   `matrix-state.service.ts:94` (`eraseMarksForDecker(decker.name)`),
   `:118-129`, `:226-254`, `:389`, `:507`, `:525`, `:580-584`;
   `target-card.component.html:60-61` (`<option [value]="d.name">`).
   **Renaming a decker orphans every mark they hold.** Pre-existing defect,
   independent of this feature; see Open Decision D6.
2. **Roll attribution — `rollAsNames` / `isPlayerCharacterName`.**
   `battle-tracker.component.ts:648-653` builds the "Roll as" picker from
   participant names, filtering out anything `isPlayerCharacterName(name)`
   (`:742-747`) claims. `isSameCombatantName(a, b)` (`:708-710`) is trim +
   lowercase. `clearGmRollAttributionIfNamed(name)` (`:692-697`) drops a sticky
   attribution when the named participant is deleted. A generated name colliding
   with a claimed/claimable participant's name would silently re-attribute a
   GM roll.
3. **`upsertPlayerParticipant`** (`:4155-4200`) matches by **owner**
   (`participantOwners.get(p) === playerName`), *not* by participant name — so
   a rename does not disturb player registration. Confirmed by reading.

Participant ids are **not** name-derived: `getParticipantId()`
(`:4090-4098`) mints `` `p-${Math.random().toString(36).slice(2, 10)}` `` into
`participantIds`. A rename cannot break identity, ordering, restore, or any
side map.

### The blank-placeholder invariant

`isUnusedPlaceholder(p)` (`battle-tracker.component.ts:2416`) compares a
participant field-for-field against a fresh `new Participant()` over
`PARTICIPANT_BASE_BACKING_FIELDS`, skipping only
`PLACEHOLDER_SORT_ORDER_FIELD = "_sortOrder"` (`:111`). `_name` **is** in that
list and `new Participant()._name === ""`. Its only consumer is
`confirmDestructiveJoin`'s risk filter at `:2181`. Side-map defaults it also
compares are seeded at `:6297`.

**Any code path that writes a name onto the constructor-seeded placeholder
fires a false destructive-join warning on every fresh tab.** This is the single
most likely invisible breakage and is why auto-generation is refused.

### Existing UI patterns for "app fills this field for you"

Two, both cited as the precedent for the button:

- **Trailing icon button inside an `input-group`** —
  `battle-tracker.component.html:328-345`: the rolled-Initiative number input
  and a `<button class="btn btn-dark p-0 gm-roll-btn">` carrying
  `<i class="fas fa-dice fa-lg">`, wrapped in
  `<div class="input-group gm-rolled-ini-group">`. The comment at `:322-326`
  records *why* they are one input-group: so they stay adjacent and the same
  height. Same shape at `:696-703` (`gm-inline-input-group` with
  `input-group-text` chips around the row member's B/W boxes).
- **A labelled "suggest" button beside the field it fills** —
  `hierarchy-editor.component.html:80-83`:
  `<button class="hier-suggest-btn" (click)="suggestAsdf()" ngbTooltip="Shuffle A/S/D/F from Rating" placement="top">Suggest A/S/D/F</button>`,
  backed by `suggestAsdfForForm()` (`hierarchy-editor.component.ts:148-158`),
  which shuffles four values with `Math.random()` and writes them into the form.

**Keyboard affordance:** there is none to hang this on. Grepping all of
`src/app` for `HostListener`, `keydown.` and `keyup.` returns exactly two hits
— `battle-tracker.component.html:996` (`keyup.enter` on the glitch note) and a
comment. The only other keyboard handler is `inpName_KeyDown` →
`handleTabNav(e, 'input[name="name"]', ...)` (`:5953-5977`, `:5979-6010`),
which owns Tab on the combat-list name box. This app has no hotkey vocabulary;
introducing one for this feature is not proportionate. Button only.

### Existing shared-module conventions

`src/app/shared/` is the home for pure data + pure functions imported by *both*
the GM and player components — confirmed by grep: `declared-actions.ts`,
`interrupt-actions.ts`, `declared-action-engine.ts`, `log-formatter.ts` and
`roll-utils.ts` are each imported by `battle-tracker.component.ts:41-51` and
`player-view.component.ts:6-11`, and `roll-utils` additionally by
`session-sync.service.ts:3` and `dice-roller.component.ts:16`.

There is already a random-content helper of exactly this shape there:
`matrixChars` + `randomMatrixChar()` (`src/app/shared/log-formatter.ts:8-12`) —
a `const` string of characters plus a `Math.random()`-based picker.

Injectable-RNG precedent for testability: `changeDiceCount(newDices, rollDie?)`
(`src/Combat/Participants/Participant.ts`, per `ARCHITECTURE.md` §3) takes the
die-roller as a parameter.

`baseUrl` is `src` (`tsconfig.json:4`), so the import path is
`"app/shared/name-generator"`.

---

## Affected paths

Every location that must change. Where a category has exactly one member I say
so rather than implying it.

### New files

1. **`src/app/shared/name-generator.ts`** — the corpus and the generator. Pure
   data + pure functions. **No Angular imports.** Placed here, not in
   `src/app/services/` and not in a domain folder, because it has zero domain
   coupling (it returns a `string`), and because `src/app/shared/` is already
   the exact home for cross-component pure data (see "Existing shared-module
   conventions"). It is *not* placed in `src/Grunts/` — the statblock data went
   there only because its instantiation factory had to sit beside
   `createStandaloneGrunt`/`mergeGruntsIntoRow`; a name generator has no such
   neighbour.
2. **`src/app/shared/name-generator.spec.ts`** — pure unit tests, matching
   `roll-utils.spec.ts` / `log-formatter.spec.ts`.
3. **`src/scenarios/cyberpunk-name-generator.spec.ts`** — the promoted scenario
   suite. Must live under `src/` — `ARCHITECTURE.md` "Test coverage" records
   that a spec outside `src/` is silently never compiled or run.

### Phase 1 — generator + Add dialog + row-member boxes

**`src/app/battle-tracker/battle-tracker.component.ts`**

4. Import block (currently `:41-51`) — add
   `import { generateName, GeneratedNameKind } from "app/shared/name-generator";`
5. **New public method `generateDraftName(): void`** — placed immediately after
   `statblockOptionsForDraft()` (`:4986-4991`), before `existingNpcRows()`
   (`:4994`). Writes `this.pendingAddDraft.name` and nothing else. Must be
   `public` (template-invoked) and must no-op when `pendingAddDraft` is null.
6. **New private method `draftNameKind(draft: AddDraft): GeneratedNameKind`** —
   maps `AddDraftKind` to a corpus kind: `"row"`/`"merge"` → `"crew"`;
   `"grunt"`/`"participant"`/`"rowMember"` → `"handle"`. Use an exhaustive
   `switch` with **no `default` branch** so a future `AddDraftKind` is a compile
   error, matching `calcMatrixHealth`'s deliberate shape
   (`hierarchy-editor.component.ts:71-82` and its doc comment).
7. **New private method `takenCombatantNames(): Set<string>`** — every
   `combatManager.participants.items[].name` plus every
   `NpcRowParticipant.members[].name` for every row, normalised. Rows are
   included because `nextRowMemberName` already treats member names as a
   namespace that must not collide.
8. **New public method `generateRowMemberName(row: NpcRowParticipant, member: GruntMember): void`**
   — placed beside `nextRowMemberName()` (`:7052`). Writes `member.name`, then
   calls `this.onParticipantUpdated()`, exactly as the template's inline
   `(ngModelChange)` handler at `battle-tracker.component.html:694` does.
9. `isSameCombatantName(a, b)` (`:708-710`) — **delegate to the shared
   normaliser** rather than keeping a second trim+lowercase implementation. See
   Open Decision D5; if D5 is answered the other way, leave this untouched and
   accept the duplication with a cross-reference comment in both places.

**`src/app/battle-tracker/battle-tracker.component.html`**

10. **Amended (Xavier's decision, 2026-09-07: the style caption and the
    style-cycling machinery it depended on are removed).** The shipped
    binding is a plain `[(ngModel)]="pendingAddDraft.name"` — the earlier
    `[ngModel]` + `(ngModelChange)="onDraftNameInput($event)"` split existed
    solely to let the component tell its own write (a generate press) apart
    from the GM's hand-typed keystroke, so a style caption could clear
    itself; with the caption gone there is nothing left needing that
    distinction, so `onDraftNameInput()` is deleted and the plain two-way
    binding is restored. Lines **1485-1489** — wrap the `#addDraftName` input
    in `<div class="input-group">` and append the generate button. Keep
    `id`, `data-testid="add-draft-name"` and the placeholder exactly as they
    are; add `data-testid="add-draft-name-generate"` on the button. No
    caption line of any kind is rendered under the box.
11. **Amended: the shipped button is a sibling control after the B/W group,
    not appended inside an input-group with the Name box - and the Name
    box's own input-group wrapper is now gone entirely.** Putting the button
    beside the name input inside a shared `.input-group` (as originally
    planned) would have made it a Tab stop between Name and Body/Willpower,
    which defect 4 of the first validator round flagged as a live cost for a
    GM filling several NPCs in a hurry; the button was moved out to sit
    after the B/W group's own `<div class="input-group input-group-sm
    gm-inline-input-group npc-row-bw-group">` instead, calling
    `generateRowMemberName(asNpcRow(p), m)`, with
    `data-testid="row-member-name-generate"`. Visual adjacency to the Name
    box - lost by moving the button out of its input-group - is restored
    purely in CSS (`order`, see item 12 below) without moving the button
    back in the DOM (defect 4, second validator round). The Name box's own
    `<div class="input-group input-group-sm gm-inline-input-group">` wrapper
    - left behind, wrapping only the name input, once the button that was
    meant to share it moved out - was removed in this same round: a
    single-child `.input-group` had no purpose left, and it was silently
    costing the box its intended width - Bootstrap's
    `.input-group > .form-control` (two classes) outranked the component's
    own single-class `.npc-row-member-name` width rule, so the input was
    stretching to fill the input-group rather than sitting at its ~10rem
    design width. The bare `<input class="form-control form-control-sm
    npc-row-member-name">` now sits directly as a flex child of
    `.npc-row-member`; its `-sm` sizing is unaffected, since
    `form-control-sm` was already a class on the input itself, not something
    it depended on an `.input-group-sm` ancestor for.

    **Amended (Xavier's decision, 2026-09-07): the one-press revert button
    that used to sit beside this one is removed.** There is no
    `data-testid="row-member-name-revert"` control anywhere. Correcting a
    mis-tap means retyping the name or pressing generate again, consistent
    with `SCOPE.md`'s standing no-undo rule. The row-member name box's
    ordinary hand-typed edit is a plain inline `(ngModelChange)="m.name =
    $event; onParticipantUpdated()"` expression, matching the B/W boxes
    beside it — `onRowMemberNameInput()` existed only to also clear the
    revert affordance and is deleted along with it.

**`src/app/battle-tracker/battle-tracker.component.css`**

12. **Amended (Xavier's decision, 2026-09-07: the revert button and the
    style caption are both gone, so their rules are deleted too).**
    `.gm-name-generate-btn` - the same square icon-button geometry as
    `.gm-trailing-icon` (`:508-517`), sized off the existing control tokens
    (`var(--ui-icon-btn-w)` / `var(--ui-control-h)`); do **not** hand-tune
    pixel values, the comment at `:504-507` and `:607-611` records why.
    `.npc-row-member .gm-name-generate-btn` - re-sizes that same button down
    to the row-member box's `-sm` tokens (defect 5, first validator round).
    `.gm-name-revert-btn` and `.gm-draft-name-caption` no longer exist -
    there is nothing left for either rule to size or reserve space for. One
    rule remains from the second validator round's visual-adjacency fix,
    simplified now that there is only one button to reorder: `order: 1` on
    `.npc-row-member .gm-name-generate-btn`, and `order: 2` on the row-member
    box's other trailing controls (`.npc-row-bw-group`, `.npc-row-cm`,
    `.npc-row-wm`, `.npc-row-damage`, `.npc-row-detach`, `.npc-row-remove`,
    `.npc-row-down-badge`) so they keep their existing relative sequence,
    just painted after the generate button. `order` is a paint-order-only
    CSS property; it does not move DOM position or affect keyboard Tab
    order, which browsers derive from DOM position.

### Phase 2 — Matrix host and icon boxes

**`src/app/matrix/hierarchy-editor/hierarchy-editor.component.ts`**

13. New method `suggestHostName(): void` — writes `this.hostForm.name`. Placed
    immediately after `suggestAsdf()` (`:144-146`) so the two suggestion
    helpers sit together.
14. New method `suggestTargetName(): void` — writes `this.targetForm.name`,
    with the corpus kind chosen from `this.targetForm.type` via a new private
    `iconKindFor(type: MatrixTargetType): GeneratedNameKind`, again an
    exhaustive `switch` with no `default`.
15. New private `takenMatrixNames(): Set<string>` — `state.hosts[].name` plus
    every host's targets plus `state.publicTargets[].name`.

**`src/app/matrix/hierarchy-editor/hierarchy-editor.component.html`**

16. **Amended (items 16/17, second validator round): the shipped
    `data-testid`s are `add-host-name-generate` and `edit-host-name-generate`,
    not one shared `host-name-generate`.** Two forms, two buttons, one on
    each - a test targeting "the host name generate button" needs to say
    which form it means. Lines **72-75** (add-host form) — append
    `<button type="button" class="hier-suggest-btn" (click)="suggestHostName()" ngbTooltip="Suggest a host name" placement="top" data-testid="add-host-name-generate">Suggest</button>`
    inside the same `.hier-form-row`, matching `:80-83` byte-for-byte in class
    and structure.
17. Lines **192-195** (edit-host form) — the same button, with
    `data-testid="edit-host-name-generate"`.
18. Lines **296-300** (target form, shared by add and edit for device / file /
    persona / IC) — the same button calling `suggestTargetName()`,
    `data-testid="target-name-generate"` (this one is genuinely shared
    between add and edit, unlike the host form above, since one target form
    already serves both).

**`src/app/matrix/hierarchy-editor/hierarchy-editor.component.css`**

19. No change — `.hier-suggest-btn` already exists and is reused verbatim.

### Deliberately NOT changed (searched, decided, listed so it is not implied)

20. `battle-tracker.component.html:207-208` — the GM combat-list row name box.
    Reasons: `.gm-name-input { max-width: 14.25rem }`
    (`battle-tracker.component.css:488-490`) with the comment at `:484-487`
    recording Xavier's instruction to preserve the leftover space for the
    GROUP / GRUNT / LIEUTENANT badges (`battle-tracker.component.html:212-240`);
    a focusable button in `.gm-col-name` becomes a Tab stop that changes
    Shift+Tab's landing spot within `handleTabNav`'s row scan
    (`battle-tracker.component.ts:5985-6004`); and the decker-marks hazard
    (Open Decision D6). See Open Decision D2.
21. `player-view.component.html:99` — the player's Character name box. See
    Open Decision D3.
22. `dice-roller.component.html:44-52` — "Roll as → Other…". It names a
    combatant who by construction already has a name
    (`battle-tracker.component.ts:645-646`).
23. `src/app/matrix/ic-spawner/*` — no name field exists and the component is
    mounted nowhere (grepped `app-ic-spawner` across all `*.html`: zero hits).
24. `src/app/services/session-sync.service.ts` — no new fields on either
    channel. A generated name is an ordinary `name` string.
25. `server.js`, `server/room-guards.js`, `server/gm-state-channel.js`,
    `server/session-store.js` — untouched.
26. `CombatManager.copyParticipant()` (`src/Combat/CombatManager.ts:253-280`) —
    the one other place the app writes a participant's name (it appends
    `" <n+1>"` and may rename the *source* to `" 1"` at `:272-275`). Named here
    because it is a name-writing site, not because it changes.
27. All four `next*Name()` generators
    (`battle-tracker.component.ts:6385`, `:6403`, `:6430`, `:7052`) — unchanged.
    Generated names are an *alternative* to the defaults, never a replacement.

**Searched and found only these.** Grepped `src/` for `type="text"`,
`[(ngModel)]`, `[ngModel]`, `\.name =`, `name:`, `HostListener`, `keydown.`,
`app-ic-spawner`, `new ICParticipant`. There are no other name-entry fields.

---

## Proposed approach

### The choke point

**One module, one function, every call site.** Every one of the five buttons
routes through `generateName()` in `src/app/shared/name-generator.ts`. No
component re-implements pattern selection, word-list picking, or dedup. This is
the same reasoning `changeParticipantDiceCount` and `authorizeRoomPacket` exist
for elsewhere in this codebase: a rule expressed in five places drifts.

### Module API

**Amended (Xavier's decision, 2026-09-07): the `legal` corpus is removed
entirely**, reversing Open Decision D1's "ship it, reached by cycling"
answer below. There is no `legal` value in `GeneratedNameKind`, no
`legalGiven`/`legalFamily` word lists, and no style-cycling machinery
anywhere in the app. Every generate button now draws from exactly one
corpus for its field. Historical text below describing `legal` and the
cycling behaviour is left as a record of what was built and then cut, not
a description of current behaviour — see D1's own note.

```ts
// src/app/shared/name-generator.ts

/** Which corpus a generated name is drawn from. */
export type GeneratedNameKind =
  | "handle"   // a street handle / runner alias for one NPC
  | "crew"     // a gang, squad or grunt-group name
  | "host"     // a Matrix host
  | "device"   // a Matrix device icon
  | "file"     // a Matrix file icon
  | "persona"  // a Matrix persona icon
  | "ic";      // a Matrix IC icon

/** A slot-filling template. Slots resolve against WORD_LISTS; anything not a
 *  known slot key is emitted as a literal. */
export interface NamePattern {
  readonly kind: GeneratedNameKind;
  readonly slots: readonly string[];
  /** Joiner between resolved slots. Default " ". */
  readonly join?: string;
  /** Relative selection weight within its kind. Default 1. */
  readonly weight?: number;
}

export const WORD_LISTS: Readonly<Record<string, readonly string[]>>;
export const NAME_PATTERNS: readonly NamePattern[];

export interface GenerateNameOptions {
  readonly kind: GeneratedNameKind;
  /** Names already in use. Compared case-insensitively after trimming. */
  readonly taken?: Iterable<string>;
  /** Injected for determinism in tests. Defaults to Math.random. */
  readonly random?: () => number;
}

export const GENERATE_NAME_MAX_ATTEMPTS = 40;

/** Normalised form used for every collision check here. Trim + lowercase. */
export function normaliseNameForComparison(name: string): string;

/** One name of `kind`, not present in `taken`. */
export function generateName(options: GenerateNameOptions): string;
```

**`generateNames(count, options)` removed (defect 12, second validator
round).** An earlier version of this API also exported a batch helper
returning `count` mutually-distinct names in one call. It had no production
consumer: every real call site (the Add dialog, the row-member box, both
Matrix suggest buttons) generates exactly one name per button press, folding
that result into its own `taken` set before the next press. Rather than
inventing a feature to justify keeping fully-implemented dead code, it was
deleted; the batch-distinctness guarantee it used to provide is unchanged in
practice - a caller who wants several distinct names just calls
`generateName()` in a loop, accumulating each result into `taken` (see
`generateDraftNameWith()`/`generateRowMemberName()` in
`battle-tracker.component.ts`, and `suggestHostName()`/`suggestTargetName()`
in `hierarchy-editor.component.ts`, all of which already do exactly this).

**Injected RNG, not a bare `Math.random()`.** `random?: () => number`
defaulting to `Math.random` follows `Participant.changeDiceCount(newDices,
rollDie?)`. Without it the scenario tests cannot assert a specific output and
would be reduced to shape assertions.

**Dedup algorithm**, mirroring `nextRowMemberName`'s `taken`-set loop
(`battle-tracker.component.ts:7064-7069`):

1. Normalise `taken` into a `Set<string>` once.
2. Up to `GENERATE_NAME_MAX_ATTEMPTS` times: pick a pattern for `kind` by
   weight, fill its slots, return the first candidate whose normalised form is
   not in the set.
3. On exhaustion, take the last candidate and append `" 2"`, `" 3"`, … until
   free. This can never loop forever: the suffix space is unbounded.

(An earlier version of this section described a `generateNames(count, ...)`
batch helper accumulating each result into its own working set. Removed -
see "Module API" above.)

### Corpus format and where the data lives

Same file, above the functions — one exported `WORD_LISTS` record and one
exported `NAME_PATTERNS` array. No JSON, no HTTP fetch, no asset: it must be
available synchronously on a button press, and `VersionService`
(`src/app/services/version.service.ts`) is the only asset-fetching service in
the app and exists for a different reason.

Minimum list sizes, asserted by a unit test so the corpus cannot quietly shrink
(AC 3):

| Slot key | Purpose | Minimum entries |
|---|---|---|
| `handleSolo` | one-word handles ("Ratchet", "Slug", "Nine-Volt") | 60 |
| `handleAdjective` | "Cracked", "Redline", "Static" | 80 |
| `handleNoun` | "Halo", "Wire", "Vulture" | 100 |
| `crewAdjective` | "Ash", "Sable", "Broken" | 50 |
| `crewPlural` | "Kings", "Boys", "Saints", "Cartel" | 60 |
| `hostOrg` | corp / institution words | 40 |
| `hostFunction` | "Payroll", "Logistics", "Archive" | 30 |
| `hostSuffix` | "Cluster", "Grid", "Node" | 12 |
| `deviceNoun` | "Maglock Controller", "Drone Rig" | 40 |
| `fileStem` | "PAYROLL", "MANIFEST", "PERSONNEL" | 40 |
| `fileExt` | ".enc", ".sin", ".dat" | 8 |
| `personaNoun` | "Sysop", "Night Auditor" | 30 |
| `icNoun` | evocative IC labels | 20 |

Combination counts to target, so repeats are rare in a session: `handle` ≥
5,000 distinct outputs across its patterns; `crew` ≥ 2,000;
`host` ≥ 10,000. Asserted loosely by a unit test that draws 500 names with a
seeded RNG and requires at least 400 distinct (AC 4).

### The UI change, per field

**Pattern being followed:** `battle-tracker.component.html:328-345` — a numeric
input and a trailing icon button in one `input-group`, with the comment at
`:322-326` explaining that they are grouped so they stay adjacent and the same
height. Icon: `<i class="fas fa-dice fa-lg"></i>`, already used by that button
at `:342`.

1. **Add dialog** (`battle-tracker.component.html:1485-1489`) —
   ```
   <div class="input-group">
     <input id="addDraftName" ... unchanged ...>
     <button type="button" class="btn btn-outline-secondary"
             data-testid="add-draft-name-generate"
             (click)="generateDraftName()"
             title="Suggest a name">
       <i class="fas fa-shuffle"></i>
     </button>
   </div>
   ```
   The `<label for="addDraftName">` at `:1486` stays outside the group.
   **Amended (free fix, Xavier's decision 2026-09-07): this button uses
   `fa-shuffle`, not `fa-dice`.** The initial build shipped it with
   `fa-dice`, the same icon Roll Initiative uses elsewhere in this app,
   which risked being misread as "roll for this box". The row-member
   generate button already used `fa-shuffle` for exactly that reason; the
   Add dialog's button is brought in line with it so the name generator
   wears one consistent icon everywhere, at zero cost.
2. **Row member** (`battle-tracker.component.html:693-695`) — same button inside
   `<div class="input-group input-group-sm gm-inline-input-group">`, matching
   the B/W group at `:696`. Uses `btn-sm`.
3. **Matrix host, add** (`hierarchy-editor.component.html:72-75`) and **edit**
   (`:192-195`) — a `hier-suggest-btn` in the same `.hier-form-row`, structurally
   identical to `:80-83`. Text `Suggest`, not an icon: the Matrix panel's
   vocabulary for this is a labelled button.
4. **Matrix target/icon** (`hierarchy-editor.component.html:296-300`) — same.

**Repeat-press behaviour:** each press replaces the field's contents outright.
No confirmation, no "are you sure". The GM can always retype.

### Corpus kind, per call site

**Amended (Xavier's decision, 2026-09-07): fixed one-corpus-per-call-site
again**, reversing Open Decision D1's "ship `legal`, reached by cycling"
answer. There is no second style and no cycling anywhere in this table —
every field always draws from the same corpus, every press.

| Call site | Kind |
|---|---|
| Add dialog, `kind === "grunt"` \| `"participant"` \| `"rowMember"` | `handle` (every press) |
| Add dialog, `kind === "row"` \| `"merge"` | `crew` (every press) |
| Row member box | `handle` (every press) |
| Matrix host form | `host` |
| Matrix target form | `device` / `file` / `persona` / `ic`, from `targetForm.type` |

### Uniqueness scope

- **GM participants and row members** share one namespace for the check
  (`takenCombatantNames()`), because `nextRowMemberName` already treats them as
  one and p. 379's per-NPC attribution is the reason.
- **Matrix hosts and targets** share a second namespace
  (`takenMatrixNames()`), separate from the combatant one — a host called
  "Vulture" and a ganger called "Vulture" are not confusable in any log line.
- The check is case-insensitive after trimming, matching
  `isSameCombatantName` (`battle-tracker.component.ts:708-710`).

### Session sync

**No change.** A generated name is written to the same field a typed name is,
by the same setter, and reaches the wire through the same
`buildSharedParticipant()` / `toRowSnapshot()` / matrix-target broadcast paths.
`syncSharedState()` fires from the same handlers it already fires from
(`onParticipantUpdated()` for the row-member box; `commitAddDraft()` for the
dialog). Verify explicitly (AC 12) that no new `syncSharedState()` /
`broadcastState` call is introduced by the *generate* action itself — pressing
the dice in the Add dialog must broadcast nothing, because the dialog has not
committed.

---

## Scope classification

Every part of the request, classified against `SCOPE.md`. **This is a proposal,
not a ruling.**

### TRACK — the app must represent or compute this

- **Uniqueness of a generated name against every live combatant name.**
  The app already computes exactly this for its own default names
  (`nextStandaloneGruntName`, `nextRowMemberName`), and for the same stated
  reason: per-NPC log attribution (p. 379). Extending it to generated names is
  the same computation on the same data.
- **Refusing a generated name that collides with a player character's name.**
  `isPlayerCharacterName` already governs roll attribution; a collision there
  silently changes whose dice a roll is. This is state correctness, not
  flavour.
- **Keeping the four existing default-name namespaces intact.** A generated
  name must not be able to look like "Grunt 4" or "Grunt Group 2" and confuse
  `nextStandaloneGruntName()` / `nextMergedGruntRowName()`'s regex scans into
  skipping a number.

### GM RESOLVES — the GM decides; the app just records the result

- **Which name an NPC actually has.** The generator proposes; the GM accepts,
  re-rolls, or types over. The app records whatever string ends up in the box
  and has no opinion about it.
- **Whether a given NPC gets a flavour name at all.** Nothing forces it. The
  numbered defaults remain first-class.
- **Whether a name fits the fiction.** The app cannot and does not judge this.

### OUT OF SCOPE — per `SCOPE.md`, not the app's job

- **Automatic naming with no GM tap.** Directly hits *"Automating things a GM
  would rather decide in the moment."* (Scope Question B revisits this.)
- **A GM-editable / persisted corpus.** Hits *"Character building, gear
  management, or anything that belongs before the session starts"*, and would
  need storage, restore and per-room scoping. (Scope Question D revisits this.)
- **Generated backstory, descriptions, pronouns, factions, or any other
  content beyond the name string.** Not requested and not defensible under any
  reading of the current boundary.
- **Per-faction / per-city corpora.** Same category; five times the corpus for
  a distinction the GM holds in their head.

### SCOPE QUESTION

Things classified GM RESOLVES or OUT OF SCOPE that would nonetheless plausibly
be wanted. Flagged, not silently excluded.

- **A. Content generation as a category at all.** *For:* fires only on tap,
  always overwritable, and `suggestAsdf()` already set this precedent in-tree
  without objection. *Against:* `SCOPE.md` has no such category and, once
  opened, the next request ("generate a corp", "generate a run hook") has no
  written line to be measured against. **Recommend: approve, and add one
  sentence to `SCOPE.md` drawing the line at "tap-triggered, always editable".**
- **B. Auto-fire on Add Grunt.** *For:* removes the only cost the feature has —
  the extra tap. *Against:* destroys the deliberate boring-vs-chosen
  distinction in the log's names, and any write to the constructor-seeded
  placeholder breaks `isUnusedPlaceholder` and fires a false destructive-join
  warning on every tab load. **Recommend: no.**
- **C. Mundane legal names for corp/civilian NPCs.** *For:* half the NPCs at a
  table aren't gang-affiliated, and one extra corpus covers them.
  *Against:* a third more corpus plus a control to select the style, in already
  tight boxes. **Recommend: include, cycled by repeated presses rather than a
  separate control; fall back to deferring if that reads badly in use.**
- **D. GM-editable corpus.** *For:* a fixed list will eventually stop fitting a
  long campaign. *Against:* storage, restore, per-room scoping — bigger than
  the generator, and it's prep-time work. **Recommend: fixed for now; editing
  the data file directly is the escape hatch.**
- **F. Player-side generator.** *For:* useful for a player without a sheet.
  *Against:* a player's handle is the one name in the app that isn't the GM's
  to suggest, and excluding it keeps the entire change on the GM's side.
  **Recommend: GM-only.**
- **G. Button on the main combat-list name box.** *For:* it is the box you look
  at most. *Against:* eats the badge space Xavier explicitly asked to preserve,
  adds a Tab stop inside `handleTabNav`'s row, and sits one tap away from the
  decker-rename-loses-marks defect. **Recommend: no, and fix the marks defect
  separately first.**

---

## Size check

**Small.** Roughly 1.5–2.5 days total, and the bulk of that is writing word
lists rather than writing code. It does **not** need splitting into separate
features, but it ships better in three parts, in this order:

- **Part 1 (≈1 day)** — `name-generator.ts` + its unit spec + the Add-dialog
  button + the row-member button + the scenario spec. Independently useful and
  independently shippable; this is the piece that answers the request.
- **Part 2 (≈0.5 day)** — the three Matrix name fields. Pure wiring on top of
  Part 1; nothing in Part 1 depends on it.
- **Part 3 (≈0.5 day, gated on the scope questions)** — `legal` corpus (D1),
  player view (D3), main-list name box (D2). Three independent slices; none
  blocks the others.

**Recommend doing Part 1 first and using it at a table before committing to
Part 3.**

---

## Acceptance criteria

Only TRACK items are graded. Numbered, testable against observable behaviour.

**The generator module**

1. `generateName({ kind, random })` returns a non-empty string with no leading
   or trailing whitespace, for every one of the eight `GeneratedNameKind`
   values.
2. With a fixed injected `random`, `generateName` is deterministic: two calls
   with the same seeded sequence return the same string.
3. Every slot key referenced by any entry in `NAME_PATTERNS` exists in
   `WORD_LISTS`, and every list in `WORD_LISTS` meets or exceeds the minimum
   size in the corpus table above.
4. Drawing 500 `handle` names with a seeded RNG and an empty `taken` set yields
   at least 400 distinct strings; likewise for `crew` and `host`. (Amended,
   Xavier's decision 2026-09-07: `legal` no longer exists as a kind, so it
   is dropped from this criterion; `handle`/`crew`/`host` and their
   thresholds are untouched.)
5. `generateName({ kind, taken })` never returns a string whose
   `normaliseNameForComparison` form is present in `taken`, for a `taken` set
   containing 200 entries.
6. When every candidate the patterns can produce is already in `taken`,
   `generateName` still terminates and returns a name not in `taken` (numeric
   suffix fallback), within 100 ms.
7. **Amended (defect 12, second validator round).** Six successive
   `generateName({ kind, taken })` calls, each result folded into `taken`
   before the next call - the pattern every real call site uses, not the
   removed `generateNames()` batch helper this criterion originally named -
   return six strings that are mutually distinct under
   `normaliseNameForComparison` and none of which is in the original `taken`.

**GM component wiring**

8. Pressing the Add dialog's generate button changes `pendingAddDraft.name` and
   changes nothing else: `combatManager.participants.items` is unchanged
   field-for-field, and `pendingAddDraft`'s other properties (`kind`, `count`,
   `body`, `willpower`, `statblockId`, `loadAugmented`, `targetRow`,
   `lieutenantTeamRow`) are unchanged.
9. Pressing it twice produces two different names (with a seeded RNG that does
   not repeat).
10. **Amended (Xavier's decision, 2026-09-07: the `legal` corpus and its
    cycling are removed).** With `pendingAddDraft.kind === "row"` or
    `"merge"`, the generated name comes from the `crew` corpus on every
    press. With `"grunt"`, `"participant"` or `"rowMember"`, the generated
    name comes from the `handle` corpus on every press. There is no second
    style and nothing to cycle into.
11. A generated name never matches `/^Grunt \d+$/`, `/^Grunt Group( \d+)?$/`,
    `/^NPC \d+$/` or `/^Combatant \d+$/`, so
    `nextStandaloneGruntName()`, `nextMergedGruntRowName()`,
    `nextRowMemberName()` and `nextStandaloneParticipantName()` continue to
    return the same values they would have returned without it.
12. Pressing the Add dialog's generate button fires **zero**
    `sessionSync.broadcastState` calls and **zero** `sessionSync.appendLog`
    calls.
13. A generated name never equals (case-insensitively, trimmed) the name of any
    participant for which `participantOwners.has(p)` or
    `isParticipantClaimable(p)` is true — i.e. `isPlayerCharacterName(generated)`
    is always `false`.
14. Pressing the row-member generate button changes only that `GruntMember`'s
    `name`; every other member's name, the row's name, `row.rowWoundModifier`,
    and every member's `physicalDamage` / `stunDamage` are unchanged.
    **Removed (Xavier's decision, 2026-09-07): acceptance criterion 14a, the
    one-press revert affordance, no longer applies.** There is no
    `rowMemberNameJustGenerated()`, no `revertRowMemberName()`, and no
    per-member revert state anywhere. A mis-tap on the row-member generate
    button is corrected exactly like any other name box: retype it, or press
    generate again.
15. `isUnusedPlaceholder(placeholder)` still returns `true` for the
    constructor-seeded participant on a tab where the GM has opened the Add
    dialog, pressed generate several times, and cancelled.
16. No name is generated by the component constructor, by `addParticipant()`,
    by `addGrunt()`, by `addNpcRow()`, by `addNpcToRow()`, by
    `mergeSelectedGrunts()`, by `commitAddDraft()`, by
    `restoreFromSharedState()`, or by any of the four promote/demote helpers.
    Generation happens only in `generateDraftName()`,
    `generateRowMemberName()`, `suggestHostName()` and `suggestTargetName()`.

**Matrix wiring (Part 2)**

17. Pressing the host-name suggest button writes `hostForm.name` and changes no
    other `hostForm` field, and does not call `matrixState.addHost` /
    `updateHost` / `setCurrentHost`.
18. Pressing the target-name suggest button writes `targetForm.name` only, and
    the corpus used matches `targetForm.type` (`device` / `file` / `persona` /
    `ic`).
19. A generated host or target name is distinct (case-insensitively) from every
    existing host name and every existing target name, across public space and
    every host.
20. Save remains disabled while the name is blank; pressing generate enables it.

**Log and sync**

21. A participant added through the dialog with a generated name, whose name is
    then regenerated twice before combat starts, produces **exactly one** join
    log entry when initiative is first rolled, and that entry's `actor` is the
    **final** name.
22. `JSON.stringify(getSharedParticipants())` and
    `JSON.stringify(buildGmState())` for an encounter of generated-name
    participants contain no new keys relative to the same encounter with typed
    names — the only difference is the string values.

---

## Regression risk

**The blank-placeholder check.** Any write of a name onto the
constructor-seeded `Participant` breaks `isUnusedPlaceholder`
(`battle-tracker.component.ts:2416`) and makes `confirmDestructiveJoin`'s risk
filter (`:2181`) fire on every fresh tab. Covered by
`src/scenarios/persistent-rooms.spec.ts` (the "Round 4 - D5" describe).
AC 15 is the new explicit test. **Mitigated by construction:** generation only
ever writes into `pendingAddDraft.name`, `GruntMember.name`, `hostForm.name` or
`targetForm.name` — never into a `Participant` at creation.

**Default-name namespace collision.** If a generated name can look like
`"Grunt 7"`, `nextStandaloneGruntName()`'s regex scan
(`battle-tracker.component.ts:6386-6394`) picks it up and skips numbers.
Covered by `src/Grunts/npc-row.spec.ts:1788-1817` (merged-row numbering) and
`:2397-2422` (row default naming, including the doubled-name check). AC 11 is
the new explicit test. Enforced by keeping every corpus word non-numeric and
by asserting the four patterns never match.

**Roll attribution.** `rollAsNames` (`battle-tracker.component.ts:648-653`),
`isPlayerCharacterName` (`:742-747`) and `clearGmRollAttributionIfNamed`
(`:692-697`) are all name-based. A generated name colliding with a claimed or
claimable participant would remove that NPC from the "Roll as" picker and
re-attribute a GM roll. Covered by `src/scenarios/gm-npc-rolls.spec.ts`.
AC 13 is the new explicit test.

**Log double-writing.** The join line is queued and written on first roll, with
the name read lazily (`battle-tracker.component.ts:229-232`, `:5034-5037`,
`:5117-5120`, `:5201-5204`, `:7100-7108`). A regeneration between add and roll
must not produce a second line. Covered by
`src/scenarios/action-log-readability.spec.ts:435` and `:452`
(`expect(sent.length).toBe(1)`). AC 21 is the new explicit test.

**Log/roster mismatch for `addNpcToRow` into an already-rolled row (D5,
second validator round).** Not a double-write - the opposite: the log can
end up *permanently correct for a name nobody sees any more*. See "When the
name reaches the log"'s correction above. Pinned, not fixed, by the "defect
5" test in `src/scenarios/cyberpunk-name-generator.spec.ts`.

**Matrix marks.** Marks are keyed by decker **name**
(`matrix-state.service.ts:118-129`, `:226-254`, `:580-584`;
`hierarchy-editor.component.ts:412`, `:423`). This feature does not rename any
decker — no generate button is placed on the combat-list name box (affected-path
item 20) — but Open Decision D2 would change that. Covered indirectly by
`src/scenarios/matrix-port-rules-correctness.spec.ts`. See Open Decision D6.

**Tab navigation.** `handleTabNav(e, 'input[name="name"]', ...)`
(`battle-tracker.component.ts:5979-6010`) does
`row.querySelector('input[name="name"]')` and `e.preventDefault()`. Wrapping
the *row member* input adds no risk (it has no `name="name"` attribute and
lives in the row panel, not the `.participant` row). Wrapping the *combat-list*
input would add a focusable button inside `.participant` and change Shift+Tab's
landing spot — another reason item 20 stays out of Phase 1.

**Layout.** `.gm-name-input { max-width: 14.25rem }`
(`battle-tracker.component.css:488-490`) is deliberately capped below the cell
width to leave badge room, per Xavier's instruction quoted at `:484-487`.
Phase 1 does not touch that cell. The row-member input group must not push the
B/W group or the Condition Monitor onto a second line at 1024px — the
`.npc-row-member` container is already `flex-wrap` (`:659`), so worst case is a
wrap, not an overflow. Verify visually at 1024, 1440 and 1920.

**Matrix form layout.** `.hier-form-row` already holds a label + input + a
`hier-suggest-btn` at `:76-84` without wrapping, so adding the same button to
the three name rows is a shape already proven in that panel.

**Test files that will need new cases, not edits:** none of the listed existing
suites should change. If any of them changes, that is a signal the feature has
altered behaviour it was told not to.

New specs: `src/app/shared/name-generator.spec.ts` (AC 1–7),
`src/scenarios/cyberpunk-name-generator.spec.ts` (AC 8–22).

---

## Scenarios to survive

Written as executable test cases.

**NS1 — Ordinary case: generate a grunt's name in the Add dialog.**
```
combat not started; sent = [] (spy on sessionSync.appendLog)
const broadcasts = spyOn(sessionSync, 'broadcastState')
component.btnAddGrunt_Click()
expect(component.pendingAddDraft.name).toBe('Grunt 1')        // existing default
expect(component.combatManager.participants.count).toBe(1)    // placeholder only

component.generateDraftName()
const first = component.pendingAddDraft.name
expect(first).not.toBe('Grunt 1')
expect(first).not.toMatch(/^Grunt \d+$/)
expect(first.trim()).toBe(first)
expect(component.combatManager.participants.count).toBe(1)    // still nothing created
expect(broadcasts).not.toHaveBeenCalled()
expect(sent.length).toBe(0)

component.generateDraftName()
expect(component.pendingAddDraft.name).not.toBe(first)        // re-roll gives a new one

component.commitAddDraft()
expect(component.combatManager.participants.count).toBe(2)
const g = component.combatManager.participants.items[1]
expect(g.name).toBe(component['lastGeneratedForTest'] ?? g.name)
expect(sent.length).toBe(0)                                    // join line waits for the roll
```

**NS2 — Edge case: the corpus is exhausted and uniqueness still holds.**
```
// Fill the encounter with every name the 'crew' corpus can produce.
const all = enumerateAllPossibleNames('crew')                  // test helper over NAME_PATTERNS
for (const n of all) component.addGrunt(n, 3, 3, false)

component.btnAddNpcRow_Click()
const t0 = performance.now()
component.generateDraftName()
expect(performance.now() - t0).toBeLessThan(100)

const name = component.pendingAddDraft.name
const taken = new Set([...component.combatManager.participants.items]
  .map(p => p.name.trim().toLowerCase()))
expect(taken.has(name.trim().toLowerCase())).toBeFalse()
expect(name).toMatch(/ \d+$/)                                  // suffix fallback fired
expect(name).not.toMatch(/^Grunt Group( \d+)?$/)               // and did not invade a namespace
expect(component['nextMergedGruntRowName']()).toBe('Grunt Group')
```

**NS3 — Correction path (there is no undo; this asserts correction stays free).**
*(Undo/redo was removed from the tracker, commit `426827b`; the only correction
path is a direct edit. `SCOPE.md` forbids reintroducing one.)*
```
component.btnAddGrunt_Click()
component.generateDraftName()
const generated = component.pendingAddDraft.name
component.commitAddDraft()
const g = component.combatManager.participants.items[1]
expect(g.name).toBe(generated)
expect(sent.length).toBe(0)

// The GM doesn't like it. Type over it — no dialog, no undo, no log noise.
g.name = 'Hand-Typed Name'
component.onParticipantUpdated()
expect(sent.length).toBe(0)

// Change their mind again, before the fight starts.
g.name = 'Final Name'
component.onParticipantUpdated()

// The join line is written on the first Initiative Test, with the FINAL name.
component.combatManager.started = true
component.btnRollInitiative_Click(g)
const join = sent.filter(e => e.text === 'added.')
expect(join.length).toBe(1)
expect(join[0].actor).toBe('Final Name')
expect(JSON.stringify(sent)).not.toContain(generated)
expect(JSON.stringify(sent)).not.toContain('Hand-Typed Name')
```

**NS4 — Live at the table: four reinforcements arrive mid-pass, players waiting.**
```
// Pass 2 of Combat Turn 1. Row 'Ancients' already rolled, at shared Score -1.
component.combatManager.started = true
component.combatManager.initiativePass = 2
const row = existingWoundedRolledRow(component, 'Ancients', -1)
const scoreBefore = row.getCurrentInitiative()
const broadcastsBefore = broadcasts.calls.count()
const sentBefore = sent.length

// Four taps: open, generate, confirm — four times.
const names: string[] = []
for (let i = 0; i < 4; i++) {
  component.btnAddNpcToRow_Click(row)
  component.generateDraftName()
  names.push(component.pendingAddDraft.name)
  component.commitAddDraft()
}

expect(new Set(names.map(n => n.toLowerCase())).size).toBe(4)   // all four distinct
expect(row.members.length).toBe(4)
expect(row.getCurrentInitiative()).toBe(scoreBefore)            // Decision 7: joiners are Score-neutral
expect(row.rowWoundModifier).toBe(1)                            // untouched
expect(component.combatManager.currentActors.count).toBe(currentActorsBefore)

// The row has already rolled, so these four announce immediately.
const joins = sent.slice(sentBefore).filter(e => e.text.includes('joined the group'))
expect(joins.length).toBe(4)
for (const n of names) {
  expect(joins.some(e => e.text.startsWith(n + ' joined the group'))).toBeTrue()
}
expect(JSON.stringify(joins)).not.toMatch(/\d+\/\d+/)           // no CM maximum, RULINGS 2026-08-13
expect(JSON.stringify(joins)).not.toMatch(/^NPC \d+/m)          // no placeholder leaked
```

**NS5 — A generated name may not impersonate a player character.**
```
const pc = component['upsertPlayerParticipant']('kestrelPlayer', 'Kestrel', 1, 3, 4, 4, 4, 10, 10)
expect(component['isPlayerCharacterName']('Kestrel')).toBeTrue()

// Force the RNG to try 'Kestrel' first, then 'kestrel', then something else.
const rng = seededSequenceProducing(['Kestrel', 'kestrel', 'Nine-Volt'])
component.btnAddGrunt_Click()
component['generateDraftNameWith'](rng)
expect(component.pendingAddDraft.name).toBe('Nine-Volt')
expect(component['isPlayerCharacterName'](component.pendingAddDraft.name)).toBeFalse()

component.commitAddDraft()
expect(component.rollAsNames).toContain('Nine-Volt')
expect(component.rollAsNames).not.toContain('Kestrel')
```

**NS6 — Matrix host and icon naming (Part 2), and marks are untouched.**
```
const editor = TestBed.createComponent(HierarchyEditorComponent).componentInstance
editor.activeDeckers = [decker('Slamm-0')]
editor.openAddHost()
editor.suggestHostName()
const hostName = editor.hostForm.name
expect(hostName.trim().length).toBeGreaterThan(0)
expect(editor.hostForm.rating).toBe(4)                          // nothing else moved
editor.saveHostForm()
const host = editor.state.hosts[0]
expect(host.name).toBe(hostName)

editor.matrixState.addMarkToHost(host, 'Slamm-0', 1)
expect(host.marks['Slamm-0']).toBe(1)

editor.openAddTarget(host, 'file')
editor.suggestTargetName()
expect(editor.targetForm.name).toMatch(/\.[a-z]{3}$/)           // 'file' corpus shape
editor.saveTargetForm()

expect(host.marks['Slamm-0']).toBe(1)                           // untouched by any naming
expect(editor.state.hosts.length).toBe(1)

// Second host cannot collide with the first.
editor.openAddHost(); editor.suggestHostName()
expect(editor.hostForm.name.toLowerCase()).not.toBe(hostName.toLowerCase())
```

**NS7 — removed (Xavier's decision, 2026-09-07).** This scenario walked
through the one-press revert affordance, which no longer exists. A mis-tap
on the row-member generate button is now corrected exactly like any other
name box: retype it, or press generate again — `SCOPE.md`'s standing
no-undo rule, with no exception carved out for this feature.

---

## Open decisions

Numbered. Each has a recommended default. D1–D4 are the scope questions from
the plain-language brief, restated with technical grounding; D5–D6 are
implementation-only.

**D1. Does the `legal` corpus ship, and how is it reached?**
Adding it means a `legal` entry in `GeneratedNameKind`, two ~150-entry word
lists, and a way for the GM to ask for it. The Add dialog has no spare
horizontal room for a second control beside the name input.
*Recommended:* ship the corpus, and reach it by **cycling on repeated presses**
— press 1 gives `handle`, press 2 gives `legal`, press 3 back to `handle` —
with a small `text-muted` caption under the box naming the current style.
*Why:* no extra control, discoverable in one press, and reversible. *Fallback
if that reads badly in use:* defer `legal` to Part 3 entirely; nothing else
depends on it.

**Reversed (Xavier's decision, 2026-09-07).** Built, used at the table, and
cut: there is no `legal` corpus, no cycling, and no style caption. Every
generate button draws from exactly one corpus for its field (see "Corpus
kind, per call site" above). The fallback this decision originally
described — "defer `legal` to Part 3 entirely" — is effectively where this
landed, except the already-built cycling machinery was removed rather than
merely left unused.

**D2. Does the combat-list row name box get a button?**
*Recommended:* **no**, in Phase 1. *Why:* three separate objections, each
independently sufficient — `.gm-name-input`'s 14.25rem cap exists specifically
to leave badge room at Xavier's instruction (`battle-tracker.component.css:484-490`);
a focusable button inside `.participant` becomes a Tab stop that changes
`handleTabNav`'s Shift+Tab landing (`battle-tracker.component.ts:5985-5996`);
and one tap beside a jacked-in decker's name is one tap from the mark-orphaning
defect in D6. Renaming by typing is unaffected and unchanged.

**D3. Does the player view's Character name box get a button?**
*Recommended:* **no**. *Why:* it is the only field in this feature that a
*player* owns, and excluding it keeps the entire change inside
`battle-tracker` + `hierarchy-editor` + one new shared module — no player-view
file is touched at all, which removes a whole category of regression from the
blast radius.

**D4. Fixed corpus, or GM-editable?**
*Recommended:* **fixed**, exported as `const` from
`src/app/shared/name-generator.ts`. *Why:* an editable corpus needs storage,
`restoreFromSharedState` handling and per-room scoping, is prep-time work
`SCOPE.md` puts outside the boundary, and is larger than the generator itself.
Editing the source file is a one-line change.

**D5. Should `isSameCombatantName` delegate to the shared normaliser?**
`battle-tracker.component.ts:708-710` is `a.trim().toLowerCase() ===
b.trim().toLowerCase()`; the generator needs the identical rule.
*Recommended:* **yes, delegate** —
`return normaliseNameForComparison(a) === normaliseNameForComparison(b);`.
*Why:* two copies of a comparison rule is exactly the drift shape
`ARCHITECTURE.md` documents repeatedly (the two interrupt tables, the two
sorts). It is a one-line change with existing coverage in
`src/scenarios/gm-npc-rolls.spec.ts`. *If declined:* keep both, and put a
cross-referencing comment in each naming the other.

**D6. What happens to the decker-rename-loses-marks defect?**
`MatrixHost.marks` / `MatrixTarget.marks` are keyed by `decker.name`
(`matrix-state.service.ts:118-129`, `:226-254`, `:580-584`), so any rename of a
jacked-in decker orphans every mark they hold. `MatrixParticipant` has a stable
`getParticipantId`-minted id available. This is a **pre-existing defect,
independent of this feature.**
*Recommended:* **do not fix it here.** Raise it as its own change request —
re-keying marks touches `MatrixStateService`, `MatrixHost`, `MatrixTarget`,
`SharedMatrixTarget.marks`, `target-card.component`, `access-host-panel.component`
and `hierarchy-editor.component`, which is a larger blast radius than this
entire feature. *Why it is recorded here anyway:* it is the reason D2 is a "no",
and a later reversal of D2 must not happen before this is fixed.

**D7. Should the corpus lean generic-cyberpunk or use in-universe Shadowrun
proper nouns (Renraku, Ares, Aztechnology, Halloweeners)?**
*Recommended:* **generic-cyberpunk vocabulary for handles and crews; a small
set of setting-flavoured org words for `host` only.* *Why:* handles and gang
names built from generic words never collide with something the players already
know is a specific canonical NPC or gang, whereas a host called "Renraku
Payroll Cluster" is exactly the flavour a Matrix host wants and carries no such
risk. Xavier may prefer heavier setting flavour throughout; the corpus is one
file and is trivially retuned either way.

*Implemented (validator round, defect 7):* ten setting-flavoured org words
added to `hostOrg` only (`WORD_LISTS.hostOrg` in `name-generator.ts`) —
generic megacorp/Sixth-World business vocabulary (e.g. "Zaibatsu",
"Keiretsu", "Directorate"), no trademarked Shadowrun proper noun among them.
`handle`/`crew` untouched, per the recommendation above.

**D-11 (second validator round) - removed (Xavier's decision, 2026-09-07).** This entry described bringing the row-member box's naming into parity with the Add dialog's `handle`/`legal` style cycling. Both the cycling and the caption it discussed no longer exist anywhere in the app - see "Corpus kind, per call site" above: every field draws from exactly one fixed corpus now, so there is no row-vs-dialog inconsistency left to resolve.
