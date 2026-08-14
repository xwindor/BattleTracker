# Spec: Action Log readability pass

## Request

Rewrite three families of Action Log text — declared actions/interrupts,
NPC-group events, and one dead VR-mode line — into natural sentences, moving
explanatory prose out of log entries and into UI tooltips and one new badge.

**Not in scope:** initiative math, Score/pass/turn mechanics, damage
application, the undo model, `SharedCombatState` / `SharedParticipantState`,
GM-roll visibility, the hidden/GM-only routing of any existing line, the
player-view log renderer's structure, `server.js`, and every log line not named
in "Affected paths" below (dice rolls, initiative rolls, initiative deltas,
damage/heal, pass start, claim/register/deck/astral lines). No participant,
`CombatManager` or `Undoable` change. One additive optional field on
`SharedLogEntry`; no other wire-shape change.

**Rules dependency: none.** This spec renames existing action *labels* into
English verb phrases. No phrase in the table below asserts a mechanic, a
number, a duration or a timing rule. Two candidate phrasings that would have
(`Multiple Attacks` -> "split their dice pool"; `Brute Force` -> "forced a
mark") were rejected for that reason and replaced with label-derived wording.
The Free/Simple/Complex tag each clause carries is read from the existing
`DECLARED_ACTIONS` data, not supplied from memory. This does not belong in
`/feature`.

**Open decisions: resolved 2026-08-14, all defaults accepted** — see
`briefs/action-log-readability.md`. In particular: the join line keeps the row
as actor ("Ganger 4 joined the group."); the shared score is dropped from the
join line; alive/dead is dropped from the no-effect line; new sentence lines
end with a full stop; player-version skew on declared actions is accepted
as-is.

---

## Current behaviour

All line numbers are as of this writing. Facts below were read, not inferred.

### Declared actions and interrupts

- `DeclaredActionEngine.buildDeclaredActionLog(selection)` —
  `src/app/shared/declared-action-engine.ts:155-163`. Emits
  `Free: X`, `Simple: A, B x2`, `Complex: Y`, joined by `" | "`; returns `null`
  for an empty selection. Uses `formatActionListWithCounts`
  (`:142-153`), which renders repeats as `"Name xN"`.
  `formatActionListWithCounts` has exactly one caller — line `:159`, in the
  same file (searched repo-wide).
- GM side: `BattleTrackerComponent.buildDeclaredActionLog(sender)`
  (`src/app/battle-tracker/battle-tracker.component.ts:3306-3308`) wraps it.
- Player side: `player-view.component.ts:834-836` wraps it with
  `?? "Act"` and the result is sent verbatim in the `act` command payload
  (`:657-665`). The GM never re-derives it from a selection.
- `performAct` (`battle-tracker.component.ts:3332-3351`) writes **two** lines:
  a local `LogHandler.log(... "${sender.name} Act_Click: ${declaredAction}")`
  and a shared one — `appendSharedLog(submitter, declaredAction)` when a
  player submitted it, else `appendSharedLog("GM", "${sender.name}: ${declaredAction}")`.
  The `declaredAction === null` branch writes `"Act"` / `"${name}: Act"`.
- `performRowMemberAct` (`:3370-3380`) builds
  `` `${member.name}: ${declaredAction}` `` (or `": Act"`) and routes it
  through `logRowEvent(rowLogActor(row), text)`.
- `btnAction_Click` (`:3556-3569`) writes a local
  `"${p.name} Action_Click: ${action.key}"` plus a shared
  `"Interrupt ${label}"` (player) or `"${p.name}: Interrupt ${label}"` (GM),
  label from `getInterruptLabel` (`src/app/shared/interrupt-actions.ts:81-83`).
- `handleSessionCommand`'s `act` branch defaults a missing payload field to the
  literal `"Act"` (`:2041`).
- Only six interrupt keys are ever offered: `CORE_INTERRUPTS` in
  `src/Combat/ActionHandler.ts:4-11` (`fullDefense, block, parry, dodge,
  intercept, hitTheDirt`), intersected with `interruptTable`
  (`src/InterruptTable.ts:3-29`, which defines exactly those six).
  `INTERRUPT_ACTION_META` (`interrupt-actions.ts:6-79`) defines 18 keys.
  (ARCHITECTURE.md §5's claim of 14 `InterruptTable` entries is stale; the file
  has 6.)

### Rendering and classification

- GM pane: `battle-tracker.component.html:790-835`, entry rendered as
  `<strong>{{ entry.actor }}</strong>: <span [innerHTML]="formatLogText(...)">`
  (`:808-810`). Retained-hidden pane repeats it at `:843-861`.
  **Consequence: actor + text are concatenated with `": "` on screen.**
- Local (no-session) pane: `:866-871`, text only. `appendGmOnlyLog` and every
  `LogHandler.log` caller build the local string as `` `${actor} ${text}` ``
  (`:2345`, `:4275`), i.e. actor + space + text.
- `getLogTextClass` (`src/app/shared/log-formatter.ts:198-209`): glitch ->
  `/Act_Click:|Action_Click:|Interrupt|Free:|Simple:|Complex:|\bAct\b/i` ->
  `/roll/i` -> system.
- `formatLogTextCore` (`:232-263`): `interruptPattern` `/^(Interrupt\s+)(.+)$/i`
  at `:242-245` and `categoryPattern` `/(Free|Simple|Complex):\s*([^|]+)/gi` at
  `:246-257` wrap action names in `<span class="log-keyword-action">`.
- Echo mirror: `attachShareListeners` (`:1533-1541`) writes a local
  `LogHandler` line for every echoed entry **whose actor is not `"GM"`**
  (`:1538`).

### NPC group lines

- `addGrunt` (`:4038-4040`): actor `grunt.name || STANDALONE_GRUNT_NAME_PREFIX`,
  text `"added as a standalone grunt (single Condition Monitor) - still to roll
  their own Initiative Test"`.
- `mergeSelectedGrunts` (`:4251-4254`): actor `row.name`, text
  `"formed from A, B, C - one shared Initiative Score from here on. Their
  Condition Monitor damage carried over; no wound penalty is applied to the
  group for damage taken before the merge (house rule)."`
- `addNpcToRow` (`:4548-4552`): actor `rowLogActor(row)`, text
  `"${member.name} joins the row on shared initiative score ${row.getCurrentInitiative()}"`
  plus, when `member.wm > 0`,
  `" (arrives wounded: -${wm} on their own tests only, row's shared score unchanged)"`.
- `applyRowMemberDamage` no-op branch (`:4598-4607`): GM text
  `"${member.name} - no effect, already out of action (${member.damage}, ${member.finalState})"`,
  player text `"${member.name} - no effect, already out of action"`.
- `onSpentNpcRowsFlagged` (`:4669-4676`): GM-only, text
  `"every member is out of action - flagged out of action; the row keeps its
  place in the initiative order until you delete it"`.
- Group-wound line: `formatGroupWoundLogText`
  (`src/app/shared/log-formatter.ts:169-184`) produces
  `"group wound (house rule): ${member}'s wound (-N) applies to all of ${row} →
  shared initiative score: ${scoreAfter}"` (or `"'s recovery (+N)"`). Called at
  `battle-tracker.component.ts:4609-4613` (damage) and `:4819-4823` (heal),
  both via `logGmOnlyRowEvent` (`:4303-4305`) -> `appendGmOnlyLog`.
- `logRowEvent` (`:4274-4277`) writes local + shared; `logGmOnlyRowEvent`
  writes GM-only (which writes its own local line, tagged).
- Badges available today: `log-badge-hidden`, `log-badge-npc`,
  `log-badge-note` (`battle-tracker.component.html:795-804`, `:847-853`;
  CSS `battle-tracker.component.css:857-883`; the base `.log-badge` block is
  deliberately duplicated in `player-view.component.css:422-431`).
- `SharedLogEntry` (`src/app/services/session-sync.service.ts:146-203`) carries
  `actor, text, timestamp, id?, glitch?, refId?, refSummary?, gmNote?, npc?,
  hiddenFromPlayers?`. The server validates only `actor`/`text`/`timestamp`
  types and a 2 KB size cap (`server.js:64-69`, `:627-648`) — **no key
  whitelist, so an added optional field needs no server change.**

### VR mode

- `onVRModeChange` (`:5446-5452`) calls `applyVRMode` then writes
  `LogHandler.log(..., \`${p.name} VR mode → ${mode}\`)` at `:5450`.
  `mode` is the raw enum value (`src/Matrix/VRMode.ts:1-6`: `"AR"`,
  `"cold-sim"`, `"hot-sim"`), so the line prints `VR mode → cold-sim`.
- `applyVRMode` (`:5459-5480`) writes **no** log line. It calls
  `changeParticipantDiceCount` (`:3875-3892`), which logs an *initiative delta*
  line via `logInitiativeDiceDelta`/`appendParticipantRollLog` (`:3906-3911`).
- **`onVRModeChange` has no production caller.** Searched all of `src/`:
  matches are its own definition (`:5446`), its doc comment (`:5441`), a
  comment in `src/Matrix/MatrixParticipant.ts:121`, and six references in
  `battle-tracker.component.spec.ts` (`:519,520,522,544,556,569`). The
  template's "Jack In" and "Switch Mode" buttons both call `gmJackIn`
  (`battle-tracker.component.html:647`, `:676-678`), which logs via
  `appendParticipantEventLog` (`:5161-5166`). The `configure_deck` jack-in
  branch logs via `appendPlayerCommandLog` (`:1847-1852`). So the line at
  `:5450` is **not** a duplicate at runtime; it is unreachable. (This
  corrects the original request's premise that it was a duplicate — the fix
  and its outcome are the same either way: the line goes away.)

---

## Affected paths

Every location below must change. Where a search for a pattern found only one
instance, that is stated explicitly.

### A. Declared-action / interrupt text (item 1)

| # | File:line | Change |
|---|---|---|
| A1 | `src/app/shared/declared-actions.ts` (add after `DECLARED_ACTION_DESCRIPTIONS`, ends `:312`) | New `DECLARED_ACTION_VERB_PHRASES: Record<string, string>` (table below) + `getDeclaredActionVerbPhrase(name): string` with the stated fallback |
| A2 | `src/app/shared/interrupt-actions.ts:1-4` | Add `verb: string` to `InterruptActionMeta` |
| A3 | `src/app/shared/interrupt-actions.ts:6-79` | Add `verb` to all 18 entries (table below) |
| A4 | `src/app/shared/interrupt-actions.ts:81-87` | Add `getInterruptVerbPhrase(key): string`, fallback `` `using ${getInterruptLabel(key)}` `` |
| A5 | `src/app/shared/declared-action-engine.ts:142-153` | Delete `formatActionListWithCounts`; replace with a private `countSimpleSelections(actions: string[]): { name: string; count: number }[]` preserving first-appearance order. Verified single caller, no external references |
| A6 | `src/app/shared/declared-action-engine.ts:155-163` | Rewrite `buildDeclaredActionLog` per "Sentence assembly" below |
| A7 | `src/app/shared/declared-action-engine.ts` (new export) | `export const NO_DECLARED_ACTION_PHRASE = "passed their action."` |
| A8 | `src/app/player-view/player-view.component.ts:834-836` | `?? "Act"` -> `?? NO_DECLARED_ACTION_PHRASE` |
| A9 | `src/app/battle-tracker/battle-tracker.component.ts:2041` | `|| "Act"` -> `|| NO_DECLARED_ACTION_PHRASE` |
| A10 | `src/app/battle-tracker/battle-tracker.component.ts:3332-3351` | Rewrite `performAct` per "Proposed approach" |
| A11 | `src/app/battle-tracker/battle-tracker.component.ts:3373` | `performRowMemberAct` text -> `` `${member.name} ${declaredAction ?? NO_DECLARED_ACTION_PHRASE}` `` |
| A12 | `src/app/battle-tracker/battle-tracker.component.ts:3556-3569` | Rewrite `btnAction_Click` logging per "Proposed approach" |
| A13 | `src/app/shared/log-formatter.ts:202` | Extend `getLogTextClass`'s action alternation |
| A14 | `src/app/shared/log-formatter.ts:242-245` | Replace `interruptPattern` |
| A15 | `src/app/shared/log-formatter.ts:246-257` | Replace `categoryPattern` |

Searched for every other producer of declared-action or interrupt log text
(`Act_Click`, `Action_Click`, `` `Interrupt ``, `"Act"`, `Free: `): the list
above is complete. `btnDelay_Click`'s `"Delay"` line (`:2063`) is a different
event and is out of scope.

### B. NPC-group text (item 2)

| # | File:line | Change |
|---|---|---|
| B1 | `battle-tracker.component.ts:4038-4040` | `addGrunt` log text -> `"added."` |
| B2 | `battle-tracker.component.ts:4251-4254` | merge log text -> `` `formed from ${names}.` `` |
| B3 | `battle-tracker.component.ts:4548-4552` | `addNpcToRow` log text -> see B-text below |
| B4 | `battle-tracker.component.ts:4603-4606` | no-op-hit line -> one text, both copies |
| B5 | `battle-tracker.component.ts:4671-4673` | wiped-out line -> `"every member is out of action."` |
| B6 | `src/app/shared/log-formatter.ts:169-184` | `formatGroupWoundLogText` rewrite; **drop the `rowName` parameter** |
| B7 | `battle-tracker.component.ts:4609-4613` | Update call (drop first arg), add `{ houseRule: true }` |
| B8 | `battle-tracker.component.ts:4819-4823` | Same, heal path |
| B9 | `battle-tracker.component.ts:4303-4305` | `logGmOnlyRowEvent` gains `extra?: Partial<SharedLogEntry>`, forwarded to `appendGmOnlyLog` |
| B10 | `src/app/services/session-sync.service.ts:146-203` | Add `houseRule?: boolean` to `SharedLogEntry`, documented as GM-only presentation |
| B11 | `battle-tracker.component.html:795-804` | Render the house-rule badge in the shared-log branch |
| B12 | `battle-tracker.component.html:847-853` | Render it in the retained-hidden branch |
| B13 | `battle-tracker.component.css` (after `:883`) | `.log-badge-house-rule` |
| B14 | `battle-tracker.component.html:754-760` | Extend merge-button `title` with the carried-damage/house-rule text removed from B2 |
| B15 | `battle-tracker.component.html:183-186` | GROUP badge `title` becomes a binding that adds the "keeps its place" text when the row is wiped out |
| B16 | `battle-tracker.component.ts` (near `isNpcRow`, `:4307-4315`) | New `getNpcRowBadgeTooltip(row: NpcRowParticipant): string` backing B15 |
| B17 | `battle-tracker.component.html:486-490` | Extend Add-NPC-button `title` with the "own tests only, shared score unchanged" text removed from B3 |

`formatGroupWoundLogText` has exactly two callers (B7, B8) — searched. The
group-wound line is the only log text containing `"(house rule)"` — searched
`src/`, one match.

### C. VR mode (item 3)

| # | File:line | Change |
|---|---|---|
| C1 | `battle-tracker.component.ts:5450` | Delete the `LogHandler.log` line |
| C2 | `battle-tracker.component.ts:5439-5445` | Update the doc comment to record that the method has no production caller and that VR-mode events are logged by `gmJackIn` / `gmJackOut` / the `configure_deck` branch |

Do **not** delete `onVRModeChange` itself: `battle-tracker.component.spec.ts:522-574`
is the regression suite for the dice-funnel defect and calls it directly.

### D. Same pattern, not in the request — found by search, NOT to be changed here

- **`logRowEvent` (`:4274-4277`) and `appendParticipantRollLog` (`:421-435`)
  both write a local `LogHandler` line *and* a shared entry with a non-`"GM"`
  actor.** With a session open the echo (`:1538`) writes a second local line,
  so every row event and every participant roll is duplicated in
  `LogHandler.logbook`. It is invisible while the session runs (the pane shows
  `sharedLogEntries`) and surfaces only after the room is closed. This is
  pre-existing, affects lines outside this request's scope, and its fix would
  churn a dozen tests that read `LogHandler.logbook`. **Leave it. Add it to
  `docs/FEATURE-BACKLOG.md`.** A10/A12 deliberately avoid *adding* a new
  instance of it (see below).

---

## Proposed approach

### Sentence assembly (`buildDeclaredActionLog`)

Return `null` for an empty selection (unchanged). Otherwise build clauses in
this fixed order and join them:

1. **Free clause**, if `selection.free`: `` `${phrase(free)} (free)` ``
2. **Simple clauses**, one per *distinct* name in first-appearance order:
   `` `${phrase(name)}${repeatSuffix(count)} (simple)` ``
3. **Complex clause**, if `selection.complex`: `` `${phrase(complex)} (complex)` ``

`repeatSuffix`: `1` -> `""`; `2` -> `" twice"`; `3` -> `" three times"`;
`n >= 4` -> `` ` ${n} times` ``.

Join: one clause -> the clause; two -> `"A and B"`; three or more ->
`"A, B, and C"` (Oxford comma, matching the requested example). Append `"."`.

`phrase(name)` = `getDeclaredActionVerbPhrase(name)`, whose fallback for a name
absent from the table is `` `used ${name}` `` — so an unrecognised or
player-supplied name still produces a readable clause and never an empty one.

Worked example: `{ free: "Drop Prone", simple: ["Take Aim", "Take Aim"], complex: null }`
-> `"dropped prone (free) and took aim twice (simple)."`

### Attribution (A10, A12)

Both sites move to the **character-name-as-actor** convention established by
`briefs/action-log-improvements.md` and route through the existing
`appendParticipantEventLog` helper (`:2312-2319`), which writes to the shared
log when a session is open (the echo then produces the single local line) and
to `LogHandler` only when there is no session. This is the choke point that
exists precisely so an event is not recorded twice — using it is what stops
A10/A12 from adding a new instance of finding D.

- `performAct`: `actor = submitter || sender.name || PLAYER_COMMAND_FALLBACK_ACTOR`;
  `text = declaredAction || NO_DECLARED_ACTION_PHRASE`; one
  `appendParticipantEventLog(actor, text)` call replacing all four current log
  calls. Keep `UndoHandler.StartActions()` first and the
  `combatManager.act(sender)` / `sort()` tail unchanged.
- `btnAction_Click`: `actor = submitter || p.name || PLAYER_COMMAND_FALLBACK_ACTOR`;
  `text = \`interrupted, ${getInterruptVerbPhrase(action.key)}.\``; one
  `appendParticipantEventLog` call, emitted in the same position as the current
  log calls (before `UndoHandler.StartActions()`), replacing both.
- `performRowMemberAct` keeps `logRowEvent` and its row-as-actor attribution
  (ARCHITECTURE.md §6). Only the text changes (A11).

### Classification and highlighting (A13-A15)

- `getLogTextClass` action alternation becomes:
  `` /Act_Click:|Action_Click:|Interrupt|\((?:free|simple|complex)\)|passed their action|Free:|Simple:|Complex:|\bAct\b/i ``
  The old alternatives become unreachable once A10/A12 land; keep them so a
  replayed historical log entry still classifies correctly.
- `interruptPattern` (`:242-245`) becomes `` /^(interrupted,\s+)(.+)$/i ``,
  same replacement shape.
- `categoryPattern` (`:246-257`) is replaced by
  `` /([^,.;]+?)\s\((free|simple|complex)\)/gi `` ->
  `` `<span class="log-keyword-action">$1</span> ($2)` ``, wrapping each verb
  phrase and leaving the bracketed tag plain. Keep it in the same position in
  `formatLogTextCore` (after `hitsPattern`, before the damage/heal rules) and
  keep the early `return`.

### NPC-group texts (B1-B8)

Because entries render as `Actor: text` and the local log renders
`actor + " " + text`, every text below is written to read correctly with the
row/grunt name already in front of it.

- **B1** `addGrunt`: `this.logRowEvent(grunt.name || STANDALONE_GRUNT_NAME_PREFIX, "added.")`
  -> `"Grunt 1: added."`
- **B2** merge: `` `formed from ${selected.map(g => g.name || "unnamed grunt").join(", ")}.` ``
  -> `"Gangers: formed from Grunt 1, Grunt 2, Grunt 3."`
- **B3** `addNpcToRow` (resolves Open Decisions 1-2, defaults accepted):
  `const carriedWounds = member.wm > 0 ? \`, arrives wounded (-${member.wm})\` : "";`
  then `` `${member.name} joined the group${carriedWounds}.` `` ->
  `"Gangers: Ganger 4 joined the group, arrives wounded (-2)."` The row stays
  the actor (no doubled row name); the shared score is not restated in the
  text.
- **B4** no-op hit (resolves Open Decision 3): single text
  `` `${member.name} already out of action — hit had no effect.` ``, passed
  once (drop the third `logRowEvent` argument, so GM and player copies are
  identical).
- **B5** wiped-out: `"every member is out of action."`
- **B6** `formatGroupWoundLogText(memberName, woundModifierDelta, scoreAfter)`:
  member fallback `"a member"` retained; magnitude `Math.abs(delta)`;
  `delta < 0` -> `` `group recovery from ${member} (+${n}) → shared score ${scoreAfter}` ``;
  otherwise `` `group wound from ${member} (-${n}) → shared score ${scoreAfter}` ``.
  The `rowName` parameter is removed because the row's name is already the
  entry's actor; keeping it would print the row name twice.

### Tooltip destinations (B14, B15, B17)

Exact strings (this is the prose removed from the log lines):

- **B14**, appended to the existing merge-button `title`
  (`battle-tracker.component.html:757`):
  `" Their Condition Monitor damage carries over; no wound penalty is applied to the group for damage taken before the merge (house rule)."`
- **B15/B16**, `getNpcRowBadgeTooltip(row)` returns the existing GROUP text, and
  when `row.isWipedOut` appends:
  `" Every NPC in this group is out of action. The row keeps its place in the initiative order until you delete it."`
  Bind with `[attr.title]="getNpcRowBadgeTooltip(asNpcRow(p))"`.
  (`NpcRowParticipant.isWipedOut` exists at `src/Grunts/NpcRowParticipant.ts:175-177`.)
- **B17**, appended to the Add-NPC-button `title`
  (`battle-tracker.component.html:488`):
  `" A wounded arrival's penalty applies to their own tests only; the group's shared score does not move."`

### House-rule badge (B9-B13)

- `SharedLogEntry.houseRule?: boolean` — documented as presentation-only, set
  only on GM-only entries, and therefore never on the wire in practice. No
  server change (`isSharedLogEntry` has no key whitelist).
- Badge markup, both branches, placed immediately after the `hidden` badge:
  `<span class="log-badge log-badge-house-rule" data-testid="log-badge-house-rule" ngbTooltip="A table ruling, not a printed rule: one NPC's wound moves the whole group's shared Initiative Score.">house rule</span>`
- CSS: add `.log-badge-house-rule` next to `.log-badge-npc`
  (`battle-tracker.component.css:880-883`) with its own colour. Add it only to
  `battle-tracker.component.css`; the entry is GM-only, so `player-view.component.css`
  does not need it. The "keep byte-identical" comment at `:855-856` refers to
  the base `.log-badge` block, which is untouched.

---

## The verb-phrase table

### Declared actions (`DECLARED_ACTION_VERB_PHRASES`, keyed by action name)

All 86 names in `DECLARED_ACTIONS` (`src/app/shared/declared-actions.ts:28-164`)
are covered. Phrases are past tense, subject-less, and take no object the
tracker cannot know.

**Free (9)**

| Action name | Verb phrase |
|---|---|
| Gesture | gestured |
| Speak / Text / Transmit Phrase | spoke a phrase |
| Run | started running |
| Call a Shot | called a shot |
| Multiple Attacks | declared multiple attacks |
| Change Linked Device Mode | changed a linked device's mode |
| Drop Prone | dropped prone |
| Drop Object | dropped what they were holding |
| Eject Smartgun Clip | ejected their smartgun clip |

**Simple (21)**

| Action name | Verb phrase |
|---|---|
| Ready Weapon | readied a weapon |
| Quick Draw | quick-drew |
| Take Aim | took aim |
| Fire Semi-Auto, Single-Shot, Burst Fire, or Full-Auto | fired their gun |
| Fire Bow | loosed an arrow |
| Throw Weapon | threw a weapon |
| Remove Clip | removed a clip |
| Insert Clip | inserted a fresh clip |
| Observe in Detail | observed in detail |
| Take Cover | took cover |
| Stand Up | stood up |
| Pick Up / Put Down Object | picked up or put down an object |
| Use Simple Device | used a simple device |
| Change Device Mode | changed a device's mode |
| Change Gun Mode | changed their gun's firing mode |
| Activate Focus | activated a focus |
| Call Spirit | called a spirit |
| Command Spirit | commanded a spirit |
| Dismiss Spirit | dismissed a spirit |
| Reckless Spellcasting | cast a spell recklessly |
| Shift Perception | shifted their perception |

**Complex (14)**

| Action name | Verb phrase |
|---|---|
| Melee Attack | attacked in melee |
| Cast Spell | cast a spell |
| Fire Long Burst or Semi-Auto Burst | fired a long burst |
| Fire Full-Auto Weapon | fired full-auto |
| Fire Mounted or Vehicle Weapon | fired a mounted weapon |
| Load and Fire Bow | nocked and loosed an arrow |
| Reload Firearm | reloaded |
| Sprint | sprinted |
| Astral Projection | projected astrally |
| Banish Spirit | banished a spirit |
| Rigger Jump In | jumped into a rigged vehicle |
| Summoning | summoned a spirit |
| Suppressive Fire | laid down suppressive fire |
| Use Skill | used a skill |

**Matrix Free (5)**

| Action name | Verb phrase |
|---|---|
| Load Program | loaded a program |
| Switch Two Matrix Attributes | switched two Matrix attributes |
| Swap Two Programs | swapped two programs |
| Unload Program | unloaded a program |
| Invite Mark | invited a mark |

**Matrix Simple (6)**

| Action name | Verb phrase |
|---|---|
| Call / Dismiss Sprite | called or dismissed a sprite |
| Change Icon | changed their icon |
| Command Sprite | commanded a sprite |
| Jack Out | jacked out |
| Crash Program | crashed a program |
| Hide | hid on the Matrix |

**Matrix Complex (13)**

| Action name | Verb phrase |
|---|---|
| Break File | broke a file |
| Erase Matrix Signature | erased a Matrix signature |
| Snoop | snooped |
| Brute Force | brute-forced their way in |
| Format Device | formatted a device |
| Spoof Command | spoofed a command |
| Check Overwatch Score | checked their Overwatch Score |
| Grid-Hop | grid-hopped |
| Trace Icon | traced an icon |
| Crack File | cracked a file |
| Hack on the Fly | hacked on the fly |
| Compile Sprite | compiled a sprite |
| Decompile Sprite | decompiled a sprite |

**Matrix Variable (18)**

| Action name | Verb phrase |
|---|---|
| Send Message | sent a message |
| Data Spike | sent a data spike |
| Jam Signals | jammed signals |
| Erase Resonance Signature | erased a Resonance signature |
| Control Device | controlled a device |
| Switch Interface Mode | switched interface mode |
| Disarm Data Bomb | disarmed a data bomb |
| Jump Into Rigged Device | jumped into a rigged device |
| Kill Complex Form | killed a complex form |
| Matrix Search | ran a Matrix search |
| Edit File | edited a file |
| Matrix Perception | scanned with Matrix Perception |
| Register Sprite | registered a sprite |
| Enter / Exit Host | entered or exited a host |
| Reboot Device | rebooted a device |
| Thread Complex Form | threaded a complex form |
| Erase Mark | erased a mark |
| Set Data Bomb | set a data bomb |

Fallback for any name absent from the table: `` `used ${name}` ``.

### Interrupts (`InterruptActionMeta.verb`, keyed by action key)

All 18 keys in `INTERRUPT_ACTION_META`. Phrases are gerund clauses, used as
`` `interrupted, ${verb}.` ``. The six keys actually offered
(`ActionHandler.CORE_INTERRUPTS`) are marked with an asterisk.

| Key | Verb phrase |
|---|---|
| fullDefense * | going full defense |
| block * | blocking |
| intercept * | intercepting |
| dodge * | dodging |
| parry * | parrying |
| hitTheDirt * | hitting the dirt |
| counterstrike | counterstriking |
| diveForCover | diving for cover |
| reversal | using Reversal |
| rightBackAtYa | using Right Back At Ya |
| runForYourLife | running for their life |
| diveOnTheGrenade | diving on the grenade |
| sacrificeThrow | using Sacrifice Throw |
| riposte | riposting |
| protectingThePrinciple | protecting the principle |
| shadowBlock | using Shadow Block |
| iAmTheFirewall | using I Am The Firewall |
| custom | using a custom interrupt |

Fallback for an unknown key: `` `using ${getInterruptLabel(key)}` ``.

(Open Decision 6, accepted: `counterstrike`/`riposte`/`protectingThePrinciple`
use label-derived phrasing since they are never offered today and nothing in
the repo states what they mechanically do; revisit against a page-cited brief
if any is later wired into `CORE_INTERRUPTS`.)

---

## Acceptance criteria

1. `DECLARED_ACTION_VERB_PHRASES` has an entry for every `item.name` in every
   category of `DECLARED_ACTIONS`, asserted by a test that iterates
   `DECLARED_ACTIONS` rather than a hard-coded list.
2. Every entry in `INTERRUPT_ACTION_META` has a non-empty `verb`, asserted by a
   test that iterates the record's keys.
3. `buildDeclaredActionLog({ free: "Drop Prone", simple: [], complex: null })`
   returns exactly `"dropped prone (free)."`
4. `buildDeclaredActionLog({ free: null, simple: ["Take Aim", "Take Aim"], complex: null })`
   returns exactly `"took aim twice (simple)."`
5. `buildDeclaredActionLog({ free: "Drop Prone", simple: ["Take Aim", "Ready Weapon"], complex: null })`
   returns exactly `"dropped prone (free), took aim (simple), and readied a weapon (simple)."`
   (Oxford comma present; clause order free -> simple -> complex.)
6. `buildDeclaredActionLog({ free: null, simple: [], complex: "Reload Firearm" })`
   returns exactly `"reloaded (complex)."`
7. `buildDeclaredActionLog` returns `null` for an empty selection.
8. `buildDeclaredActionLog({ free: "Not A Real Action", simple: [], complex: null })`
   returns `"used Not A Real Action (free)."` (fallback, no throw, no empty clause).
9. A GM Act submission for a participant named `Sarah` produces exactly one
   shared log entry with `actor === "Sarah"` (not `"GM"`), whose text is the
   sentence from AC3-AC6. No shared entry produced by this path contains
   `"Free:"`, `"Simple:"`, `"Complex:"`, `" | "` or `"Act_Click"`.
10. A player-submitted `act` command produces exactly one shared entry, actor =
    the character name, text = the payload string verbatim.
11. An `act` command with no `declaredAction` payload field produces one entry
    whose text is exactly `"passed their action."`
12. `btnAction_Click(p, fullDefense)` for a participant named `Ganger 2`
    produces exactly one shared entry with `actor === "Ganger 2"` and text
    `"interrupted, going full defense."` No entry from this path contains
    `"Interrupt Full Defense"`.
13. A row member's declared action produces exactly one entry, actor = the row
    name, text = `` `${member.name} ${sentence}` `` — e.g.
    `"G 1 dropped prone (free)."`
14. `getLogTextClass` returns `"log-text-action"` for each of:
    `"dropped prone (free) and took aim twice (simple)."`,
    `"interrupted, going full defense."`, `"passed their action."`,
    `"G 1 reloaded (complex)."`
15. `formatLogText("took aim (simple).")` contains
    `<span class="log-keyword-action">took aim</span>` and the literal
    `(simple)` outside the span.
16. `formatLogText("interrupted, going full defense.")` contains
    `<span class="log-keyword-action">going full defense.</span>`.
17. `addGrunt("Ganger A")` produces one entry, actor `"Ganger A"`, text
    exactly `"added."`; the text contains no digit and neither the word
    `"boxes"` nor the phrase `"Condition Monitor"`.
18. `addNpcToRow(row, "Veteran")` with an unwounded member produces one entry,
    actor = the row name, text exactly `"Veteran joined the group."`; the text
    contains no initiative score.
19. The same with a member whose `wm` is 2 produces text exactly
    `"Veteran joined the group, arrives wounded (-2)."`
20. `mergeSelectedGrunts` on grunts `A`, `B` produces one entry, actor = the new
    row name, text exactly `"formed from A, B."`; the text does not contain
    `"house rule"` or `"Condition Monitor"`.
21. Hitting an already-out member produces one entry whose GM text and player
    text are identical and equal to
    `` `${member.name} already out of action — hit had no effect.` ``; it
    contains no `"/"`, no damage total and no `"dead"`/`"alive"`.
22. A row wiped out by damage produces one GM-only entry, text exactly
    `"every member is out of action."`, still `hiddenFromPlayers === true` and
    still absent from the wire.
23. A member wound that moves the shared score produces one GM-only entry with
    text matching `` `group wound from ${member} (-N) → shared score S` ``,
    `hiddenFromPlayers === true` and `houseRule === true`; it does not contain
    the substring `"house rule"` and does not contain the row's name.
24. The heal direction produces `` `group recovery from ${member} (+N) → shared score S` ``
    with the same two flags.
25. The GM log pane renders one element with `data-testid="log-badge-house-rule"`
    for an entry with `houseRule: true`, and none for an entry without it.
26. The merge button's `title` contains the carried-damage/house-rule sentence;
    the Add-NPC button's `title` contains the "own tests only" sentence; the
    GROUP badge's title contains "keeps its place in the initiative order"
    when and only when the row is wiped out.
27. `onVRModeChange` writes no `LogHandler` entry. Calling it produces zero log
    entries containing `"VR mode"`. The three existing dice/Score assertions in
    `battle-tracker.component.spec.ts:538-573` still pass unchanged.
28. `gmJackIn`, `gmJackOut` and the `configure_deck` jack-in/jack-out branches
    still produce exactly one entry each, with unchanged text.
29. No shared or local log entry produced by any path in this spec contains a
    `pl-`-shaped token or the literal actor `"GM"` for a participant-attributed
    event.
30. `npm test` passes; `npm run lint` passes.

---

## Regression risk

Existing tests that assert the old wording and **must** be updated:

| File:line | Assertion | Required change |
|---|---|---|
| `src/Grunts/npc-row.spec.ts:1111` | `/no effect, already out of action/` expected absent | -> `/hit had no effect/`, else the test passes vacuously |
| `npc-row.spec.ts:1259` | `/house rule/ && /Ganger 1/ && /-2/` | -> `/group wound/ && ...` |
| `npc-row.spec.ts:1268` | `/house rule/ && /Ganger 1/ && /\+2/` | -> `/group recovery/ && ...` |
| `npc-row.spec.ts:1282` | `/Veteran joins the row/` | -> `/Veteran joined the group/` |
| `npc-row.spec.ts:1284` | `expect(joinLine).toContain('5')` | **delete** — the score is no longer in the line; `:1285` already asserts the behaviour |
| `npc-row.spec.ts:1917` | `/added as a standalone grunt/` | -> `/^Ganger A added\.$/` |
| `npc-row.spec.ts:1919` | `toContain('single Condition Monitor')` | **delete**; `:1920-1921` keep working |
| `npc-row.spec.ts:2396,2398` | `/house rule/` | -> `/group wound/`; add `expect(entry.houseRule).toBeTrue()` |
| `npc-row.spec.ts:2410,2411` | `/house rule/` | -> `/group wound\|group recovery/` |
| `npc-row.spec.ts:2796` | selection `{ free: 'Pick Up/Put Down Object' }` | **This name does not exist in `DECLARED_ACTIONS`** (the real one is `"Pick Up / Put Down Object"`, with spaces), so it would silently exercise the fallback. Change to `{ free: 'Drop Prone', simple: [], complex: null }` |
| `npc-row.spec.ts:2804` | `/G 1:.*Pick Up\/Put Down Object/` | -> `/G 1 dropped prone \(free\)/` |
| `npc-row.spec.ts:2864` | `/no effect, already out of action/` | -> `/hit had no effect/`; `:2866` `not.toContain('/')` still passes |
| `src/scenarios/npc-group-initiative.spec.ts:262` | `/house rule/i` | -> `/group wound/i`; `:264-265` (`'Ganger 3'`, `'13'`) still pass |
| `src/app/shared/log-formatter.spec.ts:100-108` | `formatGroupWoundLogText('Gangers','Ganger 3',2,13)`, expects `'house rule'` and `'Gangers'` | signature drops the first arg; delete both expectations; keep `'Ganger 3'`, `'-2'`, `'13'` |
| `log-formatter.spec.ts:110-120` | same signature, expects `'recovery'` | drop first arg; `'recovery'` still passes with "group recovery" |
| `log-formatter.spec.ts:122-126` | expects `'NPC row'` and `'a member'` | drop first arg; **delete the `'NPC row'` expectation** (no row name in the text any more); keep `'a member'` |
| `src/scenarios/action-log-attribution.spec.ts:866-903` | AC13 classification lists | add the four AC14 strings to a new action-class list; the existing system/roll lists are unaffected |

Other risk, checked:

- `npc-row.spec.ts:1953-1957` (`/formed from/`) and `:2421-2422`
  (`/every member is out of action/`) still match the new texts. No change.
- `battle-tracker.component.spec.ts:391` (`btnAction_Click`) asserts only
  `actionHistory` and Score. Unaffected.
- `combat-log-readability.spec.ts:214` injects a literal
  `'Interrupt Full Defense'` entry as *unrelated background noise*; it never
  asserts on that text. Unaffected.
- `persistent-rooms.spec.ts:981,992,1011` use `type: 'act'` only for
  authorization tests with no participant present, so `handleSessionCommand`
  returns before logging. Unaffected.
- **Local-log shape change.** `performAct` and `btnAction_Click` stop writing an
  unconditional `LogHandler` line. With no session open one local line is still
  written (via `appendParticipantEventLog`); with a session open the local line
  now arrives via the echo instead. No spec asserts on either method's log
  output today (searched `Act_Click`, `Action_Click`, `Free:`), so this is
  behaviour-visible but test-neutral.
- **Player version skew.** The player client formats the sentence and sends it
  (`player-view.component.ts:662`). A player tab loaded before this ships keeps
  sending the old `"Free: X | Simple: Y"` text, which the GM logs verbatim, and
  `getLogTextClass` still classifies it correctly because the old alternatives
  are retained (A13). Resolves on reload. Accepted per Open Decision 5.
- **`server.js` needs no change**: `isSharedLogEntry` (`:64-69`) type-checks
  three fields and has no key whitelist; the 2 KB cap (`:635`) is not
  approached — the longest new text is well under 200 characters.
- **`RULINGS.md` needs no change.** The 2026-08-13 "Condition Monitor maximums
  never appear in any log" ruling is satisfied (no `(x/y)` in any new text).
  The 2026-08-02 entry quotes the old "no effect, already out of action"
  wording, but that entry was already superseded on 2026-08-07 and is a
  historical record; leave it.
- **`ARCHITECTURE.md`**: §6's sentence describing the routing of the
  group-wound and wiped-out lines is unchanged. Optional one-line addition
  noting the `houseRule` badge is fine but not required. §5's stale "14
  entries" claim about `InterruptTable` is out of scope but worth a separate
  correction some other time.

---

## Scenarios to survive

**S1 — Ordinary: GM declares a mixed action set mid-combat.**
Session open. Sarah is the current actor. GM opens the Act modal, selects Drop
Prone (free), Take Aim twice (simple), submits.
Expected: exactly one shared entry, `actor: "Sarah"`, text
`"dropped prone (free) and took aim twice (simple)."`; classified
`log-text-action`; `"dropped prone"` and `"took aim twice"` each wrapped in
`log-keyword-action`; no `"GM:"`, no `"Free:"`, no pipe. `combatManager.act`
still called once and the order advances exactly as before.

**S2 — Edge: repeated action, unknown action, and a row member at once.**
A Grunt Group "Gangers" is up. GM taps Act on Ganger 1 and submits
`{ free: null, simple: ["Take Aim", "Take Aim"], complex: null }`. Then a stale
player client sends `act` with `declaredAction: "Free: Gesture"`.
Expected: entry 1 — actor `"Gangers"`, text `"Ganger 1 took aim twice (simple)."`
(row attribution preserved, member named in the text); entry 2 — actor = that
player's character name, text `"Free: Gesture"` verbatim, still classified
`log-text-action` via the retained `Free:` alternative. Neither entry is
attributed to `"GM"`; neither leaks a `pl-` token. Ganger 1's `hasActed` is set;
the row's Action Phase does not finish until every standing member has gone.

**S3 — Undo: mis-keyed killing blow on a group.**
Gangers has two NPCs. GM enters DV 10 on Ganger 2 and hits Physical, dropping
them; the shared score moves by the group-wound house rule and the group is not
yet wiped. Log shows, in order: `"Gangers: Ganger 2 took 10 Physical (10)"`,
GM-only `"Gangers: group wound from Ganger 2 (-2) → shared score 6"` carrying
both `hiddenFromPlayers` and `houseRule`, and
`"Gangers: Ganger 2 is out of action (dead)"`. GM realises the DV was wrong and
presses Ctrl+Z.
Expected: the damage, the shared score and the out-of-action state all revert
(unchanged behaviour); **no log line is emitted by the undo** (existing
behaviour — `btnUndo_Click` does not log), so the log still shows the three
entries above. This spec does not change that. The GM's correction path is the
heal control, which emits `"Gangers: Ganger 2 healed 10"`,
`"Gangers: Ganger 2 is back in action - Condition Monitor no longer full"` and
GM-only `"Gangers: group recovery from Ganger 2 (+2) → shared score 8"` with the
house-rule badge.

**S4 — Live at the table, mid-combat, players waiting.**
Pass 2, players watching their tablets. A reinforcement ganger walks in already
hurt: GM taps Add NPC on the row -> `"Gangers: Ganger 4 joined the group,
arrives wounded (-2)."` on both screens, and the row's shared score does not
move. A player immediately asks "why didn't they slow the group down?" — the GM
hovers Add NPC and reads the answer off the tooltip without leaving the screen.
A second later the GM taps Interrupt -> Full Defense on Ganger 2:
`"Ganger 2: interrupted, going full defense."` appears for everyone, the
initiative cost is applied once, and the order re-sorts. A third player taps Act
on their own character with nothing selected (stale client, empty payload):
`"Wombat: passed their action."` No line in the whole sequence reads `"GM:"`,
none carries a `pl-` token, and the GM never has to explain a category label out
loud.

**S5 — Wipe-out during a hidden-roll session.**
GM has GM rolls hidden for the session. The last standing NPC in Gangers drops.
Expected: the shared log gets `"Gangers: Ganger 3 is out of action (dead)"`
(unchanged, still shared); the GM-only log gets
`"Gangers: every member is out of action."` tagged `hidden`, never sent; the row
keeps its slot and gains the out-of-action styling; hovering the GROUP badge
explains why the row is still in the list. The GM-roll one-shot is not consumed
by any of this.

---

## Open decisions

All resolved 2026-08-14 (see `briefs/action-log-readability.md`), recorded here
for the implementer's reference:

1. **Attribution of the join line** — row stays the actor: `"Ganger 4 joined
   the group."` (AC18/19).
2. **Shared score on the join line** — dropped.
3. **Alive/dead on the no-effect line** — dropped.
4. **Terminal full stops** — new sentence lines end with `"."`; existing
   fragment-style lines are untouched.
5. **Player version skew** — accepted; retained `getLogTextClass` alternatives
   keep a stale client's text styled correctly until reload.
6. **`counterstrike`/`riposte`/`protectingThePrinciple` phrasing** — label-
   derived phrasing used, per the verb-phrase table above.
7. **Finding D (pre-existing double local line)** — left alone; add to
   `docs/FEATURE-BACKLOG.md` during Stage 5, not fixed in this change.
