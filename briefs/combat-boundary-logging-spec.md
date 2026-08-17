# Spec: Action Log entries for combat structural boundaries

## Request

Add shared Action Log entries for the four combat structural boundaries that
currently have no entry or only a start entry: end of Initiative Pass, start and
end of Combat Turn, start of Combat, end of Combat — and reword the existing
end-of-combat entry so it reads as an event rather than a button label.

**Not in scope:** any change to turn/pass/combat state transition logic, its
timing, the initiative order, initiative scores, the -10 pass decay, undo
semantics, `SharedCombatState`/`SharedParticipantState` shape, the session
command catalogue, the player-view renderer, or the GM roll-visibility gate. No
new `SharedLogEntry` fields. No new UI control. No renaming of `btnReset_Click`
or its button. Log entries remain non-undoable (see Regression risk).

**Not rules-dependent.** Every boundary named here is a state transition the
code already performs; this change only observes it. The one page-cited fact in
the affected wording (-10 per Initiative Pass, p. 160) is already carried by
`formatPassStartLogText` and is untouched.

---

## Current behaviour

### The four boundaries in the engine (`src/Combat/CombatManager.ts`)

- **Combat starts:** `startRound()` (`:88-92`) sets `started = true`,
  `passEnded = false`, then `goToNextActors()`. This runs at the start of *every*
  Combat Turn, not only the first — there is no separate "combat begins"
  transition anywhere in the codebase.
- **Initiative Pass ends:** `endInitiativePass()` (`:136-142`) sets
  `passEnded = true`, and if `isOver()` (`:144-151`) also calls
  `endCombatTurn()` and returns. This is the **only** place `passEnded` is set
  to `true` outside the constructor (`:68`) and the shared-state restore.
- **Combat Turn ends:** `endCombatTurn()` (`:126-134`) sets `initiativePass = 1`,
  `combatTurn++`, `currentInitiative = NaN`, `softReset()` on every participant,
  `started = false`. It is called from exactly one place: `endInitiativePass()`
  `:139`. It is the only place `combatTurn` is incremented.
- **Combat ends:** `endCombat()` (`:76-86`) sets `combatTurn = 1`,
  `currentActors.clear()`, `started = false`, `initiativePass = 1`, and
  `softReset()` on every participant. It is called from exactly one place:
  `battle-tracker.component.ts:3543`, inside `btnReset_Click()`.

`softReset()` (`Participant.ts:653-664`) clears `diceIni`, the running Score
(back to the Initiative attribute), `edge`, `status`, `actionHistory`, and the
manual OOC flag for a participant who was not OOC. **It does not touch damage,
health, `baseIni` or `dices`.** So End Combat is not destructive of the roster,
damage or Condition Monitors.

### What is logged today

All four literals live in `src/app/battle-tracker/battle-tracker.component.ts`:

| Line | Code | Emitted from |
|---|---|---|
| `:5773` | `` this.appendSharedLog("GM", `Start Combat Turn ${this.combatManager.combatTurn}`) `` | `beginCombatTurn()`, **after** `startRound()` |
| `:5774-5777` | `appendSharedLog("GM", formatPassStartLogText(initiativePass, INITIATIVE_PASS_DECAY))` | `beginCombatTurn()` |
| `:3453-3458` | same formatter, guarded by `if (this.combatManager.initiativePass > 1)` | `btnNextPass_Click()`, **after** `nextIniPass()` and `goToNextActors()` |
| `:3548` | `this.appendSharedLog("GM", "End Combat")` | `btnReset_Click()`, after `endCombat()` |

`formatPassStartLogText` is `src/app/shared/log-formatter.ts:192-197`. It is the
only structural-boundary formatter that exists; the other three texts are inline
literals. There is **no** end-of-pass, end-of-turn or start-of-combat entry of
any kind, anywhere — searched `src/` for every write of `started`, `passEnded`,
`combatTurn`, `initiativePass` and confirmed.

Local `LogHandler` debug lines exist alongside these and are unrelated:
`"StartRound_Click"` (`:3435`), `"NextPass_Click"` (`:3450`), `"Reset_Click"` /
`"Reset_Cancel"` / `"Reset_Confirm"` (`:3528`, `:3537`, `:3540`). They stay.

### Log plumbing facts that constrain the design

- `appendSharedLog(actor, text, extra?)` (`:2224-2241`) **returns immediately if
  `shareRoomCode` is falsy** (`:2225-2227`). Every existing structural line is
  therefore session-only: with no share room open, the GM's log has never
  contained a turn or pass boundary.
- The server echo handler (`:1550-1558`) mirrors an entry into the local
  `LogHandler` only when `entry.actor !== "GM"` (`:1555`). Structural lines use
  actor `"GM"`, so they never appear in `LogHandler.logbook`.
- The GM's Action Log pane renders `getSharedLogEntriesForGm()` whenever
  `shareRoomCode` is set and `getVisibleLogEntries()` (i.e. `LogHandler.logbook`)
  otherwise (`battle-tracker.component.html:890-983`).
- `getLogTextClass` (`log-formatter.ts:199-210`) classifies by regex on the text.
  The existing structural lines fall through to `log-text-system`.
- The existing engine→component logging pattern is a nullable listener field on
  `CombatManager`: `onSpentNpcRowsFlagged` (`CombatManager.ts:286`), registered
  in the component constructor (`:812`) and nulled in `ngOnDestroy` (`:932-934`)
  because the manager is a singleton that outlives the component.

### Boundary triggering: are these single choke points?

**In the engine: yes.** `endInitiativePass()` and `endCombatTurn()` are each the
sole place their transition happens.

**At the call-site level: emphatically no.** `endInitiativePass()` is reachable
from ten distinct user actions. The full call graph, verified by grep over
`src/` excluding specs:

`CombatManager.advanceToNextActors():405` is the only direct caller of
`endInitiativePass()`. It is reached from `goToNextActors()` (`:376-384`), whose
callers are:

1. `CombatManager.startRound():91`
2. `CombatManager.act():413`
3. `CombatManager.flagSpentNpcRows():371`
4. `battle-tracker.component.ts:3428` — `btnDelay_Click`
5. `battle-tracker.component.ts:3452` — `btnNextPass_Click`

`CombatManager.act()` is in turn called from:

6. `CombatManager.removeParticipant():420`
7. `battle-tracker.component.ts:3379` — `performAct`
8. `battle-tracker.component.ts:3417` — `performRowMemberAct`
9. `battle-tracker.component.ts:3576` — `btnLeaveCombat_Click`

and `CombatManager.removeParticipant()` is called from eight component sites:
`:2673` (`upsertPlayerParticipant` type-mismatch rebuild), `:3490`
(`btnDelete_Click`), `:4280` (grunt merge), `:4981` (`removeRowMember`, last
member), `:5315`, `:5382`, `:5433`, `:5494` (the four promote/demote type-swap
helpers).

So a pass can end because a player acted, because the GM tapped Delay, because
the GM deleted or benched the acting combatant, because an NPC row was wiped out
by damage, because a decker jacked in mid-turn (a type swap that removes and
re-adds the acting participant), or because the GM tapped Next Pass. **Logging
this per call site would be ten copies of one rule.** It must go through the
engine choke point.

### Two ways the same boundary fires twice or spuriously

Both must be handled; both are reachable at the table.

- **Double pass-end.** `act()` (`:409-415`) calls `goToNextActors()` whenever
  `currentActors.count === 0` *after* the removal — including when the actor was
  not in `currentActors` at all and the count was already 0. A **Delaying**
  participant keeps its Act button (`battle-tracker.component.html:325`,
  `p.status === 1 || p.status === 2`), so a delayed runner acting *after* the
  pass has already ended re-enters `endInitiativePass()` with `passEnded`
  already `true`.
- **Phantom pass N+1.** When the button labelled "End Combat Turn" is pressed
  (it is the same handler as Next Initiative Pass —
  `battle-tracker.component.html:58-63`), `btnNextPass_Click` runs
  `nextIniPass()` first, which increments `initiativePass` to N+1 and applies
  -10 to everyone. `goToNextActors()` then finds nobody, `endInitiativePass()`
  fires, `isOver()` is true, and `endCombatTurn()` resets `initiativePass` to 1.
  Pass N+1 never started and is never announced (the `initiativePass > 1` guard
  at `:3453` is what suppresses its start line). It must not be announced as
  ending either.

### One pre-existing defect this change exposes

`beginCombatTurn()` (`:5769-5779`) logs `Start Combat Turn ${combatTurn}`
**after** `startRound()`. If every participant is OOC, `startRound()` →
`goToNextActors()` finds nobody → `endInitiativePass()` → `isOver()` true →
`endCombatTurn()` → `combatTurn++`. The line then prints the *next* turn's
number. Log-only defect; see AC 12 and Open Decision 5.

---

## Affected paths

### Files that must change (five)

1. `src/app/shared/log-formatter.ts` — new formatters/constants.
2. `src/Combat/CombatManager.ts` — two listener fields, fired from the two
   existing boundary methods.
3. `src/app/battle-tracker/battle-tracker.component.ts` — listener registration
   and teardown, two handler methods, three existing emission sites rerouted
   through formatters, one new emission.
4. `src/app/shared/log-formatter.spec.ts` — extend the boundary-formatter test.
5. `src/scenarios/combat-boundary-logging.spec.ts` — **new file**, the promoted
   scenarios below (`src/scenarios/` is the stated convention, ARCHITECTURE.md
   "Test coverage").

Plus documentation: `ARCHITECTURE.md` §2 gains a sentence naming the two new
listeners alongside the existing `onSpentNpcRowsFlagged` description in §6, so
the next reader of the turn/pass boundary section knows the boundaries are
observable.

### Every location exhibiting the pattern

**Structural-boundary log emission — exactly four sites exist**, all in
`src/app/battle-tracker/battle-tracker.component.ts`. I searched for every
`appendSharedLog`/`appendGmOnlyLog`/`appendParticipantEventLog` call and every
write of the four `CombatManager` lifecycle fields; there are no others.

| Site | Today | After |
|---|---|---|
| `:5773` (`beginCombatTurn`) | inline literal `` `Start Combat Turn ${n}` `` | `formatTurnStartLogText(turn)`, turn captured before `startRound()` |
| `:5774-5777` (`beginCombatTurn`) | `formatPassStartLogText(...)` | unchanged text, moved ahead of `startRound()` |
| `:3453-3458` (`btnNextPass_Click`) | `formatPassStartLogText(...)` guarded by `initiativePass > 1` | **unchanged, including position and guard** |
| `:3548` (`btnReset_Click`) | literal `"End Combat"` | `COMBAT_ENDED_LOG_TEXT` |

**Every path that can reach the two boundary methods** — enumerated in full
under "Boundary triggering" above (ten call sites for pass end; turn end is
reached only through pass end). None of them is edited: they all inherit the
behaviour from the engine hook.

**Sites that read the state being changed**

- `getLogTextClass` / `formatLogText` (`log-formatter.ts:199-210`, `:339-366`) —
  regex-driven on entry text; new strings must be checked against it (AC 10).
- Echo handler `battle-tracker.component.ts:1555` — gates the local
  `LogHandler` mirror on `actor !== "GM"`. New entries use `"GM"`, so they add
  **no** local lines and `LogHandler.logbook` contents are unchanged.
- `player-view.component.html:217-236` — renders the same entries; no structural
  change, the new lines are ordinary system-class entries.
- `mergeHiddenLogEntries` / `reseedLogOrder` (`:2218`-ish) — unaffected; no new
  hidden entries are introduced.
- `restoreFromSharedState():2895-2899` — writes `combatTurn`, `initiativePass`,
  `started`, `passEnded` directly. It must **not** emit boundary lines (a
  restore replays state, it does not re-run the fight) and with the design below
  it cannot, because it does not call the boundary methods. No edit needed;
  stated here so the implementer does not add one.

### Confirmed single-instance findings

- `endCombat()` has exactly **one** caller (`:3543`). There is no second
  end-of-combat path. `resetShareStateAfterLeaving()` (`:1517-1546`) and
  `handleSessionClosedExternally()` (`:1659-1680`) both leave combat state
  completely untouched — they only clear session/UI state — so leaving or losing
  a session is not a combat end and gets no line.
- `endCombatTurn()` has exactly **one** caller (`CombatManager.ts:139`).
- `startRound()` has exactly **one** caller (`:5772`), reached from two buttons:
  `btnStartRound_Click` (`:3434-3446`, when nothing is pending) and
  `btnBeginCombatTurn_Click` (`:5683-5689`, from the Initiative Prep card).
  Both funnel through `beginCombatTurn()`, so the combat-start line has one home.

---

## Proposed approach

### 1. Formatters (`src/app/shared/log-formatter.ts`)

Add next to `formatPassStartLogText` (`:192`), same doc-comment style:

- `formatTurnStartLogText(turn: number): string` → `` `Start Combat Turn ${turn}` ``
- `formatTurnEndLogText(turn: number): string` → `` `End Combat Turn ${turn}` ``
- `formatPassEndLogText(pass: number): string` → `` `End Initiative Pass ${pass}` ``
- `export const COMBAT_STARTED_LOG_TEXT = "Combat started";`
- `export const COMBAT_ENDED_LOG_TEXT = "Combat ended";`

Do **not** rename or change `formatPassStartLogText` — `log-formatter.spec.ts:92-96`
asserts its exact output.

The pass-end line deliberately does not restate the -10; the decay is announced
on the pass that receives it, at its start, which is where a GM needs it.

### 2. Engine hooks (`src/Combat/CombatManager.ts`)

Add two nullable listener fields modelled exactly on `onSpentNpcRowsFlagged`
(`:286`), including its "wiring reference, not combat state, deliberately not
routed through `Undoable.Set`" comment:

```
onInitiativePassEnded: ((pass: number, turn: number) => void) | null = null;
onCombatTurnEnded: ((turn: number) => void) | null = null;
```

`endInitiativePass()` becomes:

```
endInitiativePass() {
  const alreadyEnded = this.passEnded;
  const endingPass = this.initiativePass;
  this.passEnded = true;
  if (this.isOver()) {
    this.endCombatTurn();
    return;
  }
  if (!alreadyEnded && this.onInitiativePassEnded) {
    this.onInitiativePassEnded(endingPass, this.combatTurn);
  }
}
```

Two guards, each doing one job:

- `!alreadyEnded` — `passEnded` is itself the "this pass has already ended"
  state, so firing only on the `false → true` transition kills the delayed-actor
  double-fire without inventing a second piece of bookkeeping. It is undo-aware
  for free, because `passEnded` is an undoable field.
- the `isOver()` early return — the turn-ending case emits only the turn line
  (Open Decision 2), and this is also what suppresses the phantom "pass N+1"
  line described above.

`endCombatTurn()` fires its hook **first**, before any mutation, so
`this.combatTurn` is still the turn that is ending:

```
endCombatTurn() {
  if (this.onCombatTurnEnded) {
    this.onCombatTurnEnded(this.combatTurn);
  }
  this.initiativePass = 1;
  this.combatTurn++;
  ...
}
```

No dedupe guard is needed on the turn hook: `endCombatTurn()` is reachable only
via `isOver()`, and it immediately `softReset()`s every participant back to a
positive Score, so `isOver()` cannot be true again until a new turn has run.

### 3. Component wiring (`src/app/battle-tracker/battle-tracker.component.ts`)

- Constructor, immediately after `:812`:
  `this.combatManager.onInitiativePassEnded = pass => this.logInitiativePassEnded(pass);`
  `this.combatManager.onCombatTurnEnded = turn => this.logCombatTurnEnded(turn);`
- `ngOnDestroy`, alongside `:932-934`, null both — same reason given there (the
  manager is a singleton that outlives the component). Getting this wrong leaks
  log lines from a destroyed component into later Karma specs.
- Two private handlers next to `onSpentNpcRowsFlagged` (`:4715`):

```
private logInitiativePassEnded(pass: number): void {
  this.appendSharedLog("GM", formatPassEndLogText(pass));
}

private logCombatTurnEnded(turn: number): void {
  this.appendSharedLog("GM", formatTurnEndLogText(turn));
}
```

**These handlers append a log line and do nothing else.** Unlike
`onSpentNpcRowsFlagged` (`:4719`) they must **not** call `syncSharedState()` or
`sort()`: they fire mid-transition (the turn hook runs before the participant
resets), and every one of the ten triggering paths already ends with `sort()` or
`syncSharedState()`.

### 4. `beginCombatTurn()` (`:5769-5779`)

Capture the numbers and emit all three start lines **before** `startRound()`:

```
private beginCombatTurn() {
  UndoHandler.StartActions();
  this.initiativePrepActive = false;
  const turn = this.combatManager.combatTurn;
  const isNewCombat = turn === 1 && !this.combatManager.started;
  if (isNewCombat) {
    this.appendSharedLog("GM", COMBAT_STARTED_LOG_TEXT);
  }
  this.appendSharedLog("GM", formatTurnStartLogText(turn));
  this.appendSharedLog("GM", formatPassStartLogText(this.combatManager.initiativePass, INITIATIVE_PASS_DECAY));
  this.combatManager.startRound();
  this.sort();
}
```

Emitting before the call is a deliberate departure from the file's usual
"log after the state change" convention (`:3564-3569`), and the reason must go in
a comment: `startRound()` can itself cascade straight through
`endInitiativePass()` into `endCombatTurn()` when nobody can act, which would
otherwise fire "End Combat Turn 1" *ahead* of "Start Combat Turn 1" and print
the wrong turn number. These are announcements of a boundary the click is about
to cross, not reports of a participant's state.

`isNewCombat` is derived from combat state, not remembered: `endCombat()` resets
`combatTurn` to 1 and `started` to false, so a second encounter re-announces
correctly, and `endCombatTurn()` increments past 1, so turns 2..N do not. No new
component field, nothing for undo to desync.

### 5. `btnNextPass_Click()` (`:3448-3460`) — do not touch

Leave the pass-start emission exactly where it is (after `nextIniPass()` **and**
`goToNextActors()`) and keep the `initiativePass > 1` guard. Moving it earlier
would make the guard always true and re-introduce the phantom "Start Initiative
Pass N+1" line on the turn-ending click. This is called out because it looks
like an inconsistency worth tidying and is not.

### 6. `btnReset_Click()` (`:3527-3562`)

Replace the `"End Combat"` literal at `:3548` with `COMBAT_ENDED_LOG_TEXT`.
Position is already correct — after `endCombat()`, before the outbound
`combat_ended` / `clear_roll_prompt` commands — and does not move. No
`endCombatTurn()`/`endInitiativePass()` line is emitted for an interrupted turn
(Open Decision 4).

### 7. Routing summary

All five entries go through `appendSharedLog` with actor `"GM"`, matching the
three that exist today. Rationale for each convention choice:

- **Shared, not GM-only.** The player view already displays "Combat Turn N |
  Pass M" (`player-view.component.html:102`); these are events the whole table
  witnesses, unlike the GM-only NPC-row bookkeeping lines.
- **Actor `"GM"` is correct here** and does not violate the attribution rule from
  `briefs/action-log-improvements.md`. That rule forbids `"GM"` as the actor for
  a *player-caused participant event*; these are structural events with no
  participant actor at all. No participant name and no player token appears in
  any of the five texts.
- **Not `appendParticipantEventLog`.** That helper writes a local `LogHandler`
  line when no session is open, which would change `LogHandler.logbook` contents
  and diverge from the three existing structural lines. See Open Decision 1.

---

## Acceptance criteria

1. With a share room open, an Initiative Pass that ends while at least one
   non-OOC participant still has a current initiative above 0 produces exactly
   one shared entry `GM: End Initiative Pass {N}`, where `{N}` is the pass that
   just ended, emitted after the last action of that pass and before any
   subsequent pass-start entry.
2. A Combat Turn ending produces exactly one shared entry
   `GM: End Combat Turn {N}`, where `{N}` is the turn that just ended (not the
   incremented value), emitted before any subsequent `Start Combat Turn` entry.
3. When a Combat Turn ends, **no** `End Initiative Pass` entry is emitted for
   that same transition (Open Decision 2): the ending click produces
   `End Combat Turn {N}` and nothing else.
4. No `Start Initiative Pass` entry is emitted for the pass number that
   `nextIniPass()` produced on a click that ended the Combat Turn (preserves the
   existing `initiativePass > 1` guard behaviour).
5. Beginning the first Combat Turn of an encounter produces, in order:
   `GM: Combat started`, `GM: Start Combat Turn 1`,
   `GM: Start Initiative Pass 1`. Beginning any later Combat Turn produces the
   last two only — no second `Combat started`.
6. After End Combat, beginning a new encounter produces `GM: Combat started`
   again.
7. `btnReset_Click` with the confirmation accepted produces exactly one shared
   entry `GM: Combat ended`, and no entry containing the string `"End Combat"`
   as a standalone text. It still sends the `combat_ended` and
   `clear_roll_prompt` commands, in that order, after the entry.
8. `btnReset_Click` with the confirmation declined produces zero log entries and
   sends zero commands.
9. A participant in `Delaying` status who acts after the pass has already ended
   produces **no** second `End Initiative Pass {N}` entry for that pass.
10. Every new entry text, passed through `getLogTextClass`, yields
    `log-text-system` — none accidentally matches the action alternation
    (`Interrupt`, `\bAct\b`, `(free|simple|complex)`, `Free:`/`Simple:`/`Complex:`,
    `passed their action`) or `/roll/i`.
11. With `shareRoomCode` empty, all five entries produce zero output and
    `LogHandler.logbook` gains no lines (inherited from `appendSharedLog`'s early
    return; no new local-logging path is introduced).
12. Pressing Start Combat Turn when every participant is out of action logs
    `Start Combat Turn {N}` with the turn number that was current *before* the
    click, and the resulting `End Combat Turn {N}` carries the same number, in
    that order.
13. `restoreFromSharedState` produces zero boundary entries, whatever
    `round`/`pass`/`started`/`passEnded` the incoming snapshot carries.
14. `UndoHandler.Undo()` of any boundary-crossing action produces zero new log
    entries and removes none (`btnUndo_Click` behaviour is unchanged).
15. `CombatManager.onInitiativePassEnded` and `CombatManager.onCombatTurnEnded`
    are both set to `null` in `ngOnDestroy`, alongside the existing
    `onSpentNpcRowsFlagged` teardown.
16. `formatPassStartLogText` still returns `Start Initiative Pass 1` for
    `(1, 10)` and `Start Initiative Pass 2 — all Initiative Scores -10` for
    `(2, 10)` (unchanged; `log-formatter.spec.ts:92-96` still passes as written).
17. `npm test` passes; `npm run lint` passes.

---

## Regression risk

- **Undo does not un-log a boundary, and must not be made to.** `btnUndo_Click`
  (`:3758-3762`) calls `UndoHandler.Undo()` and `syncSharedState()` and touches
  no log structure; log entries are append-only and are not part of any undo
  chapter. Undoing a Next Pass therefore leaves both `End Initiative Pass N` and
  `Start Initiative Pass N+1` in the log and redoing it appends duplicates. This
  is exactly the existing behaviour of the start lines and is deliberately not
  changed here (undo is slated for removal — memory note
  `sr5e_undo_removal_planned`). Covered by S3.
- **The engine hooks fire in specs that drive `CombatManager` directly.**
  `src/Combat/CombatManager.spec.ts:308` calls `endCombatTurn()` and many specs
  call `nextIniPass()`. With the default `null` these are inert — *provided* a
  previously-created component fixture was destroyed. Karma runs everything in
  one page, so AC 15 is load-bearing, not cosmetic.
- **Existing specs that will newly see a pass-end entry.** The `passEnded` guard
  means only a spec that sets `CombatManager.passEnded = false` and then empties
  the current actors can emit one. That is an enumerable set — these are the only
  sites in the tree that set `passEnded = false` on the manager:
  `src/scenarios/action-log-readability.spec.ts:749`, `:784`;
  `src/Grunts/npc-row.spec.ts:373`, `:390`, `:407`, `:876`, `:2185`, `:2698`,
  `:2750`, `:2766`, `:2785`, `:2814`, `:2831`;
  `src/scenarios/persistent-rooms.spec.ts:1288`.
  Check each after running the suite; assertions of the form
  `expect(sent.length).toBe(1)` / `sent[0]` immediately after an act are the ones
  that shift. Spot-checked two: `action-log-readability.spec.ts:761` is safe (a
  second Waiting participant is picked up, so no pass end) and `:810` is safe
  (`currentActors` still holds the row, so `act()` does not advance). The rest
  must be verified by running the tests, not by inspection.
- **Specs that call `btnReset_Click`:** `src/scenarios/gm-npc-rolls.spec.ts:435`,
  `:447`, `:458`. None asserts on the `"End Combat"` text; `:460` clears `sent`
  before its assertions. Expected to pass unchanged — verify.
- **`src/scenarios/combat-log-readability.spec.ts:222`** hand-builds an entry
  with the pass-start literal as filler. Unaffected — it never calls the
  formatter.
- **`src/app/shared/log-formatter.spec.ts:92-96`** asserts `formatPassStartLogText`
  verbatim. Do not rename or reword it.
- **Type-swap paths log a pass end.** `promoteToMatrixParticipant` /
  `demoteToParticipant` / the astral pair (`:5315`, `:5382`, `:5433`, `:5494`)
  go through `removeParticipant()` → `act()` when the swapped participant is the
  one currently acting, which can end the pass. That is a pre-existing quirk of
  the type swap, not something this change introduces; the new line makes it
  visible in the log. Do not "fix" it here — it is a state-transition change and
  out of scope. Worth a `docs/FEATURE-BACKLOG.md` note if it reads badly at the
  table.
- **`handleSessionCommand`'s `act` and `delay` branches** reach the same choke
  point via `performAct` / the delay handler, so a *player* action can now
  produce a `GM:`-attributed structural line. That is correct — the pass ending
  is not the player's event — but it means player-triggered boundary lines exist
  and must not be re-attributed to a character name.
- **No dedicated spec exists for `handleSessionCommand`, tie-breaking, or undo
  chaptering** (ARCHITECTURE.md "Test coverage"); the new scenarios below are the
  only coverage this change gets.

---

## Scenarios to survive

Written as executable cases for `src/scenarios/combat-boundary-logging.spec.ts`,
using the harness in `src/scenarios/action-log-attribution.spec.ts:35-103`
(`resetCombat()`, `addCombatant()`, `command()`, the `sync.appendLog` spy that
pushes to `sent` and echoes into `insertSharedLogEntry`, `shareRoomCode =
'ABC123'`).

**S1 — Ordinary: a two-pass Combat Turn, start to finish.**
Three combatants with Scores 20, 14, 8 after their Initiative Tests, no pending
rolls. GM taps Start Combat Turn; each acts in initiative order; GM taps Next
Initiative Pass; the two still above 0 act; GM taps the button, now labelled End
Combat Turn.
Expected `sent` texts, in order, filtering to the structural lines:
`Combat started`, `Start Combat Turn 1`, `Start Initiative Pass 1`,
`End Initiative Pass 1`, `Start Initiative Pass 2`, `End Initiative Pass 2`,
`End Combat Turn 1`. Every one has `actor === 'GM'`. There is **no**
`Start Initiative Pass 3` and **no** `End Initiative Pass 3`, and
`CombatManager.combatTurn === 2`, `CombatManager.started === false` afterwards.

**S2 — Edge: a delayed runner acts after the pass has already ended.**
Two combatants, A on 20 and B on 14. Start the turn. A delays
(`btnDelay_Click`), B acts — the pass ends here, because A is `Delaying` and not
`Waiting` — then the GM taps Act on A (still visible, `status === Delaying`).
Expected: exactly **one** entry whose text is `End Initiative Pass 1` in the
whole of `sent`, A's declared-action entry appears after it, and no further
structural entry is produced by A's act.

**S3 — Undo: the GM mis-taps Next Initiative Pass.**
Pass 1 has ended (`End Initiative Pass 1` present). GM taps Next Initiative Pass
→ `Start Initiative Pass 2`. GM realises a player still had a held action and
taps Undo, then taps Next Initiative Pass again.
Expected: the Undo emits **zero** new entries and removes none;
`CombatManager.initiativePass` is back to 1 immediately after the Undo and 2
again after the second tap; `sent` now contains **two** entries reading
`Start Initiative Pass 2` and still exactly one reading `End Initiative Pass 1`.
This asserts the accepted behaviour, not a bug — it is the regression fence
around "log entries are append-only".

**S4 — Live at the table, mid-combat, players waiting.**
Combat Turn 2, Initiative Pass 3. A player character (Score 3) has already acted
this pass; an NPC row "Gangers" (Score 2) holds the current-actor slot with one
member still standing. The GM applies a lethal Damage Value to that last member
while the players watch.
Expected, in order: the member's `is out of action` row entry, the GM-only
`every member is out of action.` row entry, then `GM: End Initiative Pass 3` —
because the row losing the slot advances the order and finds nobody. The GM then
taps the button (labelled End Combat Turn, since 3 - 10 and 2 - 10 are both
below 1) and gets `GM: End Combat Turn 2` with no pass-4 lines at all. The GM
then taps End Combat and confirms: `GM: Combat ended` is the last entry sent, and
the `combat_ended` and `clear_roll_prompt` commands still go out after it. A
player scrolling their log sees an unbroken account of the fight ending with no
`pl-` token and no participant misattributed.

**S5 — A second fight in the same session.**
Immediately after S4's `Combat ended`, the GM adds a fresh combatant and taps
Start Combat Turn.
Expected: `Combat started`, `Start Combat Turn 1`, `Start Initiative Pass 1` —
the combat-start line fires again (`combatTurn` is back to 1 and `started` is
false), and when that turn ends, `End Combat Turn 1` is emitted again rather than
being suppressed as a repeat.

**S6 — No session open.**
`shareRoomCode = ''`. Run the whole of S1.
Expected: `sent` is empty and `LogHandler.logbook` contains no entry whose text
contains `Combat started`, `End Initiative Pass`, `End Combat Turn` or
`Combat ended` — only the existing local click markers (`StartRound_Click`,
`NextPass_Click`). This pins Open Decision 1's answer so a later change cannot
alter it silently.

**S7 — Everyone is already down.**
Every participant OOC. GM taps Start Combat Turn.
Expected, in order: `Combat started`, `Start Combat Turn 1`,
`Start Initiative Pass 1`, `End Combat Turn 1` — the turn number is 1 in both the
start and end lines, not 2, and `CombatManager.combatTurn === 2` afterwards.

---

## Open decisions

All defaults below are recommended by the scoper; see
`briefs/combat-boundary-logging.md` for Xavier's plain-language framing and
resolution.

1. **Do boundary lines exist with no share session open?**
   *Recommended default: no — keep `appendSharedLog`, matching all three
   existing structural lines.* The alternative is `appendParticipantEventLog`,
   which writes a local `LogHandler` line when `shareRoomCode` is empty. That
   would be a genuine improvement for solo play but changes `LogHandler.logbook`
   contents for every spec that reads it, and while a session *is* open the local
   pane is not rendered at all (`battle-tracker.component.html:890-891`), so the
   benefit only lands in the sessionless case. If declined, record it in
   `docs/FEATURE-BACKLOG.md` rather than letting it lapse. AC 11 and S6 pin the
   default.
2. **When a turn ends, emit both the pass-end and turn-end line, or only the
   turn-end line?**
   *Recommended default: turn-end only* (the `isOver()` early return in
   `endInitiativePass()`). The two would be adjacent and near-synonymous, and the
   pass that "ends" in that transition is the phantom pass `nextIniPass()` just
   created, which was never announced as starting. Emitting both would require
   announcing that pass's start too, which is the behaviour the existing
   `initiativePass > 1` guard was written to avoid. AC 3.
3. **Wording of the end-of-combat entry.**
   *Recommended default: plain `Combat ended`.* The alternative
   `Combat ended after {N} Combat Turns` needs `combatTurn` captured before
   `endCombat()` resets it to 1, and reads ambiguously when combat is ended
   part-way through turn N. Trivial to add later; the formatter constant is the
   single place it would change.
4. **Does ending combat mid-turn also emit `End Initiative Pass` /
   `End Combat Turn`?**
   *Recommended default: no.* `endCombat()` does not call `endCombatTurn()`, so
   with the proposed design this falls out for free — the hooks simply do not
   fire. Emitting them would assert that a pass and turn ran their course when
   the GM cut them short.
5. **Fix the wrong turn number in `beginCombatTurn`?**
   *Recommended default: yes*, by capturing `combatTurn` and emitting the three
   start lines before `startRound()`. It is a log-only fix (AC 12, S7), it costs
   one local variable, and without it the new `End Combat Turn` line would sit
   *above* the `Start Combat Turn` line for the same turn and disagree with it by
   one. Declining means S7 asserts the current wrong number instead.
6. **Should the pass-end line restate the -10?**
   *Recommended default: no.* `formatPassStartLogText` already names the decay on
   the pass that receives it (p. 160). Repeating it on the pass that ends would
   double-count it to a reader.
7. **Should the pass-start emission also move behind an engine hook, for
   symmetry?**
   *Recommended default: no.* Unlike the ends, the two starts are already a
   clean two-site choke point (`beginCombatTurn`, `btnNextPass_Click`) and the
   `initiativePass > 1` guard in the second one is load-bearing (Decision 2). A
   hook on `nextIniPass()`/`startRound()` would fire for the phantom pass and
   need a guard re-implemented inside the engine. Revisit only if a third
   pass-start path is ever added.
