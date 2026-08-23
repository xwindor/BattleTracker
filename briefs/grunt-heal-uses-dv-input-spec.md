# Spec: the grunt heal control applies the DV input, not a hard-coded 1

## Request

Make the heal ("-1") button on both grunt Condition Monitor controls apply the
number in the adjacent DV input, exactly as the P and S buttons already do,
instead of always applying 1.

**Not in scope:** any change to `GruntMember.healDamage`,
`DetachedGruntParticipant.healDamage`, `NpcRowParticipant.healMember` or the
row's shared wound accumulator maths; any change to the damage (P/S) path; the
p. 379 final-attack record; revive-on-heal semantics; row spent/wiped-out
flagging; Action Log *wording* or routing; `SharedParticipantState` /
`SharedGmParticipantState` / `SharedCombatState` shape; the player view; the
Condition Monitor box-clicking widget; any equivalent control for non-grunt
participants (there is none — see "Affected paths"); undo semantics; the
DV input's clamping rules.

**Not rules-dependent.** No printed rule governs how many boxes a GM removes
when correcting a mis-keyed hit or recording healing; this is bookkeeping entry.
The two adjacent rulings — a grunt takes no overflow (p. 379) and out-of-action
re-derives live from the box count (`RULINGS.md` 2026-08-07) — are already
implemented in the domain layer and are untouched by this change.

---

## Current behaviour

### The two controls, in the template

Both live in `src/app/battle-tracker/battle-tracker.component.html`.

**Row-member controls** (`:657-672`), rendered per `GruntMember` inside an
expanded `NpcRowParticipant` panel:

| Element | Lines | Binding |
|---|---|---|
| `DV` chip | `:658-659` | title: "Damage Value of this attack. The DV of the attack that takes a grunt out decides alive or dead against his Body (p. 379)." |
| `.npc-row-dv` input | `:660-662` | `[min]="1"`, `[ngModel]="getRowMemberDamageValue(m)"`, `(ngModelChange)="setRowMemberDamageValue(m, $event)"` |
| `.npc-row-hit-physical` | `:663-665` | `(click)="hitRowMemberPhysical(asNpcRow(p), m)"` — **no boxes argument** |
| `.npc-row-hit-stun` | `:666-668` | `(click)="hitRowMemberStun(asNpcRow(p), m)"` — **no boxes argument** |
| `.npc-row-heal` | `:669-671` | `(click)="healRowMember(asNpcRow(p), m, 1)"`, label `-1`, title "Heal one box / take back a mis-keyed hit. …" |

**Standalone/detached grunt controls** (`:1066-1081`), rendered on the selected
participant's Condition Monitor tab when `hasGruntConditionMonitor(selectedActor)`:

| Element | Lines | Binding |
|---|---|---|
| `DV` chip | `:1067-1068` | same title text as the row chip |
| `.grunt-dv` input | `:1069-1071` | `[min]="1"`, `[ngModel]="getGruntDamageValue(selectedActor)"`, `(ngModelChange)="setGruntDamageValue(selectedActor, $event)"` |
| `.grunt-hit-physical` | `:1072-1074` | `(click)="hitGruntPhysical(asGrunt(selectedActor))"` — **no boxes argument** |
| `.grunt-hit-stun` | `:1075-1077` | `(click)="hitGruntStun(asGrunt(selectedActor))"` — **no boxes argument** |
| `.grunt-heal` | `:1078-1080` | `(click)="healGrunt(asGrunt(selectedActor), 1)"`, label `-1`, title "Heal one box / take back a mis-keyed hit. …" |

So in both panels the damage buttons take the DV **through a parameter default
on the component method** and the template passes no value; the heal button
passes a literal `1`.

### The component methods

All in `src/app/battle-tracker/battle-tracker.component.ts`.

- `:183` `const DEFAULT_ROW_MEMBER_DAMAGE_VALUE = 1;`
- `:192` `const MAX_ROW_MEMBER_DAMAGE_VALUE = 99;`
- `:843` `private readonly rowMemberDamageValues = new Map<GruntMember, number>();`
- `:853` `private readonly gruntDamageValues = new Map<IParticipant, number>();`

Row side:

- `:6363-6365` `getRowMemberDamageValue(member)` → map lookup, `?? 1`.
- `:6373-6379` `setRowMemberDamageValue(member, value)` → `Math.floor(Number(value))`,
  clamped to `[1, 99]`, `NaN` → 1. Not undoable, not a participant field.
- `:6390-6392` `hitRowMemberPhysical(row, member, boxes = this.getRowMemberDamageValue(member))`
  → `applyRowMemberDamage(row, member, boxes, "physical")`.
- `:6394-6396` `hitRowMemberStun(...)` — same shape, `"stun"`.
- `:6180-6224` `applyRowMemberDamage(row, member, boxes, type)` — `UndoHandler.StartActions()`,
  `row.applyDamageToMember`, log lines, `flagSpentNpcRows()`, `syncSharedState()`, `sort()`.
- `:6419-6457` `healRowMember(row, member, boxes)` — **`boxes` is required, no
  default.** `UndoHandler.StartActions()` at `:6420`; reads `wasOutOfAction` at
  `:6424`; `row.healMember(member, boxes)` at `:6425`; logs
  `` `${member.name} healed ${result.healed} (${member.damage})` `` (GM) /
  `` `${member.name} healed ${result.healed}` `` (players) at `:6427-6429`, only
  `if (result.healed > 0)`; "is back in action" line at `:6431-6436`; GM-only
  house-rule line at `:6437-6450`; `flagSpentNpcRows()`, `syncSharedState()`,
  `sort()` at `:6453-6455`.

Grunt side:

- `:5996-5998` `getGruntDamageValue(p)` → map lookup, `?? 1`.
- `:6001-6007` `setGruntDamageValue(p, value)` → identical clamping to the row version.
- `:6009-6011` `hitGruntPhysical(p, boxes = this.getGruntDamageValue(p))` → `applyGruntDamage(p, boxes, "physical")`.
- `:6013-6015` `hitGruntStun(...)` — same shape, `"stun"`.
- `:6032-6037` `applyGruntDamage(p, boxes, type)` — `UndoHandler.StartActions()`,
  `p.applyDamage(boxes, type)`, `onParticipantDamageChanged()`.
- `:6040-6045` `healGrunt(p, boxes)` — **`boxes` is required, no default.**
  `UndoHandler.StartActions()`, `p.healDamage(boxes)`, `onParticipantDamageChanged()`.

Logging plumbing:

- `:5550-5552` `onParticipantDamageChanged()` calls `syncSharedState()` only.
- `:3148-3152` `syncSharedState()` **returns early if `!this.shareRoomCode`**, then
  calls `recordDamageChanges()`.
- `:3785-3793` `recordDamageChanges()` — debounced timer.
- `:3795-3829` `flushDamageLog()` — diffs each participant's
  `physicalDamage`/`stunDamage` against `lastKnownDamage` and emits
  `` `${name} took Physical n, Stun m` `` / `` `${name} healed Physical n, Stun m` ``
  via `appendSharedLog`.
- `:3423-3440` `appendSharedLog` — no-ops when there is no room code.
- `:5859-5862` `logRowEvent(actor, text, playerText = text)` — always writes the
  local `LogHandler` line, then `appendSharedLog`.

**Consequence to know:** a *row member* heal is logged locally with or without a
session (via `logRowEvent`); a *standalone grunt* heal only reaches any log when
a share room is open, because its only log path is `flushDamageLog` behind
`syncSharedState`'s early return. That asymmetry is pre-existing and out of
scope; do not "fix" it here.

### The domain methods (already amount-aware — no change needed)

- `src/Grunts/GruntMember.ts:300-307` `healDamage(boxes)` — floors and clamps the
  request to `Math.min(requested, this._damage)`, so it can never drive damage
  below 0; returns the amount actually healed. No `outOfAction` gate
  (`RULINGS.md` 2026-08-07). Does **not** touch `lastDamageType`/`lastDamageValue`.
- `src/Grunts/NpcRowParticipant.ts:372-392` `healMember(member, boxes)` — captures
  the member's `wm` before and after, pays the row's shared accumulator back the
  difference (floored at 0 by the `rowWoundModifier` setter), calls
  `syncInitiativeAttribute()`, returns `{ healed, woundModifierBefore/After,
  scoreBefore/After/Delta, rowWoundModifierBefore/After/Delta }`.
- `src/Grunts/DetachedGruntParticipant.ts:271-284` `healDamage(boxes)` — clamps to
  `combinedDamage`, cuts `physicalDamage` first, then any remainder off
  `stunDamage`; returns the amount healed.

All three already do the right thing for any amount. **Nothing in the domain
layer changes.**

---

## Affected paths

### Must change (4 locations, 2 files)

1. `src/app/battle-tracker/battle-tracker.component.html:669-671` — the
   `.npc-row-heal` button: drop the literal `1` argument; update label and title.
2. `src/app/battle-tracker/battle-tracker.component.html:1078-1080` — the
   `.grunt-heal` button: drop the literal `1` argument; update label and title.
3. `src/app/battle-tracker/battle-tracker.component.ts:6419` — `healRowMember`
   signature: `boxes: number` → `boxes = this.getRowMemberDamageValue(member)`.
4. `src/app/battle-tracker/battle-tracker.component.ts:6040` — `healGrunt`
   signature: `boxes: number` → `boxes = this.getGruntDamageValue(p)`.

### Doc comments that will be wrong after the change (must be updated)

5. `src/app/battle-tracker/battle-tracker.component.ts:6039` —
   `/** Heal one box / take back a mis-keyed hit (the row panel's "-1" button). */`
   on `healGrunt`. Both halves become wrong (it is no longer one box, and the row
   panel button is no longer called "-1").
6. `src/app/battle-tracker/battle-tracker.component.ts:6398-6418` — `healRowMember`'s
   doc comment. Its body is still accurate; add the sentence that the amount now
   defaults to the member's queued DV, mirroring `hitRowMemberPhysical`/`Stun` at
   `:6381-6396`.
7. `ARCHITECTURE.md:728-732` — the sentence "so this gives the standalone/detached
   panel the same `DV` + `P`/`S`/`-1` GM controls the row panel already had".
   Update the `-1` to `H`, and add that the heal control reads the same DV input
   the P/S controls read.
8. `src/app/battle-tracker/battle-tracker.component.html:652-656` — the comment
   above the row DV group ("Left at 1 the two buttons behave exactly like the old
   +1 taps"). It now describes three buttons, not two.
9. `src/app/battle-tracker/battle-tracker.component.html:1058-1065` — the comment
   above the grunt DV group ("Same controls as the row panel's per-member DV"),
   still true, but should name the heal control explicitly.

### Searched and found no other instance of this pattern

- `healRowMember` and `healGrunt` have **exactly two production call sites
  between them**, both listed above. Every other occurrence in the repo is a
  test calling them directly with an explicit amount (enumerated under
  "Regression risk"). Verified by repo-wide search for `healRowMember|healGrunt`.
- There is **no third heal control anywhere in the app.** Repo-wide search for
  `heal` in `*.html` returns only `battle-tracker.component.html:669-671` and
  `:1078-1080`. `src/app/player-view/player-view.component.html` has no heal
  affordance at all.
- **Non-grunt participants have no DV/P/S/heal controls.** The selected-participant
  Condition Monitor tab for a non-grunt (`battle-tracker.component.html:1107-1175`)
  renders two `app-condition-monitor` bars and Physical/Stun/Overflow health
  inputs only. There is nothing there exhibiting this pattern to fix. See
  Open decision 7.
- `gruntDamageValues` (`:853`) is **not** cleaned up by `forgetParticipant`,
  unlike `rowMemberDamageValues`, which is cleaned at `:5020` (`btnDelete_Click`)
  and `:6556` (`removeRowMember`). That is a pre-existing, harmless
  `Map<IParticipant, …>` retention. **Do not change it in this work** — it is a
  separate concern and touching it drags undoable side-map cleanup into scope.

### Not affected, confirmed by reading

- `src/Grunts/GruntMember.ts`, `src/Grunts/NpcRowParticipant.ts`,
  `src/Grunts/DetachedGruntParticipant.ts` — no signature or behaviour change.
- `src/app/services/session-sync.service.ts` — no wire-shape change. Member damage
  already rides `SharedParticipantState.rowMembers` (`:95`) and participant damage
  already rides the GM-only channel; only the values change, never the fields.
- `server.js`, `server/session-store.js`, `server/gm-state-channel.js`,
  `server/room-guards.js` — untouched.
- `src/app/battle-tracker/battle-tracker.component.css:759-764` (`.npc-row-dv`
  width) — unchanged; the `H` label is the same width class as the existing `P`
  and `S` labels, so the member row cannot get wider.

---

## Proposed approach

Mirror the P/S buttons **exactly**, using the same mechanism they use, rather
than reading the map in the template:

1. Give `healRowMember` and `healGrunt` a **parameter default** on `boxes`, the
   same shape `hitRowMemberPhysical` (`:6390`) and `hitGruntPhysical` (`:6009`)
   already use:
   - `healRowMember(row: NpcRowParticipant, member: GruntMember, boxes = this.getRowMemberDamageValue(member))`
   - `healGrunt(p: DetachedGruntParticipant, boxes = this.getGruntDamageValue(p))`
2. Drop the literal `1` from both template call sites so the default applies.
3. Relabel both buttons from `-1` to `H` (see Decided decision 2).

**Why a default rather than reading `getRowMemberDamageValue(m)` in the
template:** it is the pattern already established two lines above each button,
it keeps the DV lookup in one place per panel, and — decisively — it leaves every
existing test that calls these methods with an explicit amount compiling and
passing unchanged.

**Why not a shared choke point across the two panels:** the two panels key their
DV off different things (`GruntMember` vs. `IParticipant`) and already have
parallel, deliberately-duplicated accessor pairs (`getRowMemberDamageValue` /
`getGruntDamageValue`, documented as mirrors at `:5986-5993`). Introducing a
single funnel here would be a larger refactor than the change itself and is not
warranted; the duplication is two symmetric lines, already commented as such.

**No domain-layer change.** The clamping the request asks about
("what if the heal exceeds the damage", "is it clamped at 0") is already
implemented at `GruntMember.ts:300-307` and
`DetachedGruntParticipant.ts:271-284`. Any implementation that adds a second
clamp in the component is wrong.

---

## Acceptance criteria

1. With a row member's DV input set to `n` (1 ≤ n ≤ 99), tapping the row heal
   button removes `min(n, member.damage)` boxes from that member's combined
   Condition Monitor and no boxes from any other member.
2. With a standalone/detached grunt's DV input set to `n`, tapping the grunt heal
   button removes `min(n, grunt.combinedDamage)` boxes from its combined track.
3. With the DV input left at its default of 1, both buttons behave byte-for-byte
   as they do today: exactly one box removed, one log line, one undo step.
4. Neither button can drive `damage` / `physicalDamage` / `stunDamage` below 0
   for any DV value including 99.
5. Healing more than the recorded damage heals all of it and no more; the value
   returned by `healRowMember(...).healed` / `healGrunt(...)` equals the boxes
   actually removed, not the requested amount.
6. The Action Log line for a row-member heal quotes the amount **actually**
   healed: GM copy `"<name> healed <healed> (<damage after>)"`, player copy
   `"<name> healed <healed>"`. Wording unchanged from today.
7. A heal that removes 0 boxes (member/grunt already undamaged) writes no heal
   log line, no "back in action" line, and no house-rule line — unchanged from
   today.
8. The p. 379 final-attack record (`lastDamageType`, `lastDamageValue`) is
   unchanged by a heal of any size, on both a `GruntMember` and a
   `DetachedGruntParticipant`.
9. A heal large enough to take a downed member below a full Condition Monitor
   still revives them: `outOfAction`/`ooc` false, member back in
   `row.activeMembers`, "is back in action" line written, and `spentFlagged`/`ooc`
   cleared on a row that had been wiped out.
10. The row's shared wound accumulator is paid back by the row's own applied
    delta (floored at 0), and the GM-only house-rule line quotes
    `result.rowWoundModifierDelta`, not the member's raw wound-modifier change —
    unchanged from today, verified to still hold for multi-step heals.
11. One tap on either heal button is exactly one undo step at any DV value:
    `UndoHandler.Undo()` immediately afterwards restores the pre-heal damage,
    the row's `rowWoundModifier`, and the row's/participant's Initiative Score.
12. On a `DetachedGruntParticipant` carrying both damage types, a heal larger
    than `physicalDamage` clears Physical first and takes the remainder off
    Stun, leaving neither field negative.
13. Both buttons keep their CSS classes `.npc-row-heal` and `.grunt-heal`, keep
    their `btn-outline-success` styling, and both remain inside their existing
    `input-group` alongside the DV input and the P/S buttons. Their visible label
    is `H`.
14. Neither `SharedParticipantState`, `SharedGmParticipantState` nor
    `SharedCombatState` gains, loses or renames a field. The existing shape-guard
    test (`src/scenarios/gm-reconnect-state-loss.spec.ts:967`) still passes
    unmodified.
15. `npm run lint` and `npm test` pass with no changes to any existing test's
    expectations.

---

## Regression risk

**Existing tests that call the two methods directly with an explicit amount.**
All of these must keep compiling and passing untouched — which is precisely why
`boxes` becomes an *optional* parameter with a default rather than being removed:

- `src/Grunts/npc-row.spec.ts:1098` (`healRowMember(row, g1, 4)`), `:1122` (`5`),
  `:1138` (`4`), `:1264` (`6`), `:2145` (`9`), `:2378` (`2`), `:2407` (`6`),
  `:2872` (`2`), `:2641` (`healGrunt(grunt, 1)`).
- `src/scenarios/gm-reconnect-state-loss.spec.ts:198`
  (`healRowMember(restoredRow, restoredRow.members[1], 4)`).
- `src/scenarios/action-log-readability.spec.ts:578` (`6`), `:864` (`10`).

**Behaviour these tests protect, which this change must not disturb:**

- Revive-on-heal and the row un-flagging — `npc-row.spec.ts:1089-1113`
  ("heals a grunt who is out of action…") and `:1131-1144` ("un-flags a row healed
  back into the fight").
- The untouched final-attack record — `npc-row.spec.ts:1115-1129` and `:2119-2137`.
- The shared-accumulator payback across a multi-step heal —
  `npc-row.spec.ts:2139-2152` (already heals 9 boxes in one call, so the "big
  heal" maths is covered today).
- The standalone grunt un-latch — `npc-row.spec.ts:2635-2645`
  (`healGrunt(grunt, 1)`), and `:2154-2162` via the box widget.
- The DOM presence of all four controls — `npc-row.spec.ts:2667-2678` asserts
  `.grunt-dv`, `.grunt-hit-physical`, `.grunt-hit-stun`, `.grunt-heal` exist.
  It matches on **class**, not label text, so the label change from `-1` to `H`
  is safe; its `withContext('-1 button')` string at `:2675` should be updated for
  accuracy but is not an assertion.
- DV-map lifecycle — `npc-row.spec.ts:1049-1070` (deleted row forgets its members'
  DVs, undoably) and `:1072-1085` (a spent row keeps them, "the GM can still heal
  the NPC back up"). This change makes that second test's stated rationale
  *load-bearing*: the surviving DV is now the amount the heal button will use.

**Behavioural risks introduced:**

- **A large DV left in the box makes an accidental heal tap large.** Mitigated by
  a single undo step (AC 11) and by the log line naming the amount. This is the
  accepted cost of Decided decision 1; the P and S buttons already carry the
  identical risk in the damaging direction.
- **`DetachedGruntParticipant.healDamage`'s cross-track branch becomes reachable
  from the UI for the first time.** Today the button only ever passes 1, so the
  `if (remaining > 0) { stunDamage … }` branch at `DetachedGruntParticipant.ts:280-282`
  is only reached when `physicalDamage` is already 0. After this change a single
  tap can cut both. The branch is written and correct, but has no UI-level test —
  scenario S5 below adds one.
- **Two sequential participant-field writes in one heal.** That same cross-track
  heal writes `physicalDamage` and then `stunDamage`, each of which pushes an
  initiative-attribute delta through `syncInitiativeAttribute()`
  (`ARCHITECTURE.md` §1). Both land inside the chapter `healGrunt` opened at
  `:6041`, so undo is still one step; `wm` is derived from combined damage on
  every read, so the two deltas compose correctly. Assert it (S5).
- **Log volume drops, which changes what a reader sees.** Ten "healed 1" lines
  become one "healed 10". No test asserts the ten-line form.

---

## Scenarios to survive

Add these to `src/Grunts/npc-row.spec.ts`, inside the existing
`describe('D20 - a grunt DV can exceed his remaining boxes …')` block at `:2612`,
which already owns exactly these controls and already has the `gmRow`,
`component.addGrunt`, `alwaysConfirm` and `participantRow` helpers.
**Do not create a new `src/scenarios/*.spec.ts` file for a change this size.**

### S1 — the ordinary case: a typed heal removes that many boxes

```ts
it('S1: the row heal button removes the DV in the box, not one box', () => {
  const row = gmRow('Gangers', 7, 8, ['G 1', 'G 2']);
  const [g1, g2] = [row.members[0], row.members[1]];
  component.applyRowMemberDamage(row, g1, 8, 'physical');
  component.setRowMemberDamageValue(g1, 6);
  const before = LogHandler.logbook.length;

  const result = component.healRowMember(row, g1);   // no explicit amount

  expect(result.healed).toBe(6);
  expect(g1.damage).toBe(2);
  expect(g2.damage).withContext('other members untouched').toBe(0);
  const lines = LogHandler.logbook.slice(before).map(e => e.text);
  expect(lines.find(t => /G 1 healed 6/.test(t))).toBeTruthy();
  expect(lines.filter(t => /healed 1\b/.test(t)).length).toBe(0);
});
```

### S2 — edge case: heal larger than the damage recorded, and the default-1 case

```ts
it('S2: over-heals down to zero and no further, and still defaults to one box', () => {
  const row = gmRow('Gangers', 7, 8, ['G 1', 'G 2']);
  const [g1, g2] = [row.members[0], row.members[1]];
  component.applyRowMemberDamage(row, g1, 4, 'physical');
  component.setRowMemberDamageValue(g1, 99);

  const result = component.healRowMember(row, g1);

  expect(result.healed).withContext('only what was there').toBe(4);
  expect(g1.damage).toBe(0);

  // A member whose DV was never typed still heals exactly one box.
  component.applyRowMemberDamage(row, g2, 5, 'stun');
  expect(component.getRowMemberDamageValue(g2)).toBe(1);
  component.healRowMember(row, g2);
  expect(g2.damage).toBe(4);

  // And a heal that can do nothing writes no line.
  const before = LogHandler.logbook.length;
  component.healRowMember(row, g1);
  expect(LogHandler.logbook.slice(before).map(e => e.text)
    .filter(t => /healed/.test(t)).length).toBe(0);
});
```

### S3 — undo: one tap is one step at any size

```ts
it('S3: a six-box heal is a single undo step that restores damage and score', () => {
  const row = gmRow('Gangers', 7, 8, ['G 1']);
  const g1 = row.members[0];
  component.applyRowMemberDamage(row, g1, 9, 'physical');
  const damageAfterHit = g1.damage;
  const scoreAfterHit = row.getCurrentInitiative();
  const accumulatorAfterHit = row.rowWoundModifier;
  component.setRowMemberDamageValue(g1, 6);

  component.healRowMember(row, g1);
  expect(g1.damage).toBe(damageAfterHit - 6);

  UndoHandler.Undo();

  expect(g1.damage).withContext('one step, not six').toBe(damageAfterHit);
  expect(row.rowWoundModifier).toBe(accumulatorAfterHit);
  expect(row.getCurrentInitiative()).toBe(scoreAfterHit);
});
```

### S4 — live at the table: GM mis-keys a killing blow mid-combat and takes it back in one tap

```ts
it('S4: mid-combat, one tap takes back a mis-keyed killing blow and puts the group back in the fight', () => {
  const row = gmRow('Gangers', 9, 8, ['G 1']);          // 17
  const pete = makeRolledParticipant('Pete', 8, 1, 2);  // 10
  CombatManager.started = true;
  CombatManager.passEnded = false;
  CombatManager.goToNextActors();
  expect(CombatManager.currentActors.items).toEqual([row]);

  // The mis-key: a DV 10 burst meant for someone else.
  component.setRowMemberDamageValue(row.members[0], 10);
  component.hitRowMemberPhysical(row, row.members[0]);
  expect(row.members[0].outOfAction).toBeTrue();
  expect(row.spentFlagged).toBeTrue();
  expect(row.ooc).toBeTrue();

  // One tap back, with the same 10 still in the box. No retyping, no ten taps.
  const before = LogHandler.logbook.length;
  component.healRowMember(row, row.members[0]);

  expect(row.members[0].damage).toBe(0);
  expect(row.members[0].outOfAction).toBeFalse();
  expect(row.activeMembers.length).toBe(1);
  expect(row.spentFlagged).toBeFalse();
  expect(row.ooc).toBeFalse();
  expect(row.getCurrentInitiative()).toBeGreaterThan(pete.getCurrentInitiative());
  const lines = LogHandler.logbook.slice(before).map(e => e.text);
  expect(lines.find(t => /healed 10/.test(t))).toBeTruthy();
  expect(lines.find(t => /is back in action/.test(t))).toBeTruthy();
  // The p. 379 record of the blow is history and stays put.
  expect(row.members[0].lastDamageValue).toBe(10);
});
```

### S5 — a standalone grunt's heal crosses from Physical into Stun in one tap

```ts
it('S5: a grunt heal larger than its Physical damage cuts Physical first, then Stun', () => {
  const grunt = component.addGrunt('Lone Ganger', 3, 3); // 10 boxes
  component.setGruntDamageValue(grunt, 2);
  component.hitGruntPhysical(grunt);
  component.setGruntDamageValue(grunt, 6);
  component.hitGruntStun(grunt);
  expect(grunt.physicalDamage).toBe(2);
  expect(grunt.stunDamage).toBe(6);

  component.setGruntDamageValue(grunt, 5);
  const healed = component.healGrunt(grunt);

  expect(healed).toBe(5);
  expect(grunt.physicalDamage).toBe(0);
  expect(grunt.stunDamage).toBe(3);
  expect(grunt.combinedDamage).toBe(3);

  UndoHandler.Undo();                       // still one step across two writes
  expect(grunt.physicalDamage).toBe(2);
  expect(grunt.stunDamage).toBe(6);
});
```

### S6 — DOM: the buttons call through with no explicit amount

```ts
it('S6: both heal controls render and heal by the DV in their own input', () => {
  const grunt = component.addGrunt('Lone Ganger', 3, 3);
  component.setGruntDamageValue(grunt, 7);
  component.hitGruntPhysical(grunt);        // 7 boxes on
  component.selectActor(grunt);
  fixture.detectChanges();

  const healBtn = fixture.nativeElement.querySelector('.grunt-heal') as HTMLButtonElement;
  expect(healBtn).withContext('heal button still classed .grunt-heal').toBeTruthy();
  expect(healBtn.textContent?.trim()).withContext('labelled H, beside P and S').toBe('H');
  healBtn.click();
  fixture.detectChanges();

  expect(grunt.combinedDamage).withContext('7 off in one click, not 1').toBe(0);
});
```

---

## Decisions (settled — do not reopen)

**1. Share the existing DV input, or add a separate heal-amount input?**
**DECIDED: share the existing DV input.** The request says "the value in the
input field", singular; the row member line is already width-constrained
(`.npc-row-dv` is pinned at `3.2rem` specifically so the member row fits on one
line — `battle-tracker.component.css:759-764`); and sharing means correcting a
hit needs no retyping. Cost: a large DV left over from a burst makes a stray heal
tap large. Mitigated by AC 11 (one undo step) and AC 6 (the log names the amount).

**2. Button label.** **DECIDED by Xavier, 2026-08-22: the label is `H`.** It
pairs with the adjacent `P` and `S` buttons, costs no extra width, and stops the
button lying about what it does the way `-1` would. `.npc-row-heal` and
`.grunt-heal` must survive (AC 13), and the `btn-outline-success` styling and
input-group position stay. Do not use "Heal", "−DV" or any wider label.

**3. Tooltip wording.** **DECIDED:** replace both titles with
`"Take that many boxes off. Healing a downed grunt below a full Condition
Monitor puts it back in the fight (p. 379)."` (row copy saying "NPC" where the
grunt copy says "grunt", as today). The DV chip's own title
(`:658-659`, `:1067-1068`) gains one sentence: the same number is what the heal
control takes back off. Do **not** rename the chip from `DV` — those letters are
what tie the P/S controls to p. 379's alive-or-dead comparison, which its
current tooltip explains.

**4. Heal amount exceeding recorded damage.** **DECIDED: heal what is there, log
the real number, no warning.** Already implemented
(`GruntMember.ts:302`, `DetachedGruntParticipant.ts:273`) and already the
behaviour every existing heal test relies on. Explicitly not adding a refusal or
a confirmation.

**5. A heal that heals nothing.** **DECIDED: silent no-op, no log line** —
today's behaviour (`healRowMember` guards on `result.healed > 0` at
`:6426`). Note the deliberate asymmetry with the damage path, which *does* log
`"already out of action — hit had no effect."` (`:6205`) because that no-op is
itself a ruling (p. 379, no overflow). A heal on an undamaged grunt is a mis-tap,
not a ruling.

**6. Revive behaviour and log wording.** **DECIDED: both unchanged.**
`RULINGS.md` 2026-08-07 ("Healing can bring a downed grunt back into the fight")
is not reopened; the "is back in action" line (`:6435`) and the un-flagging via
`flagSpentNpcRows()` (`:6453`) stand. The heal log lines already interpolate
`result.healed`, so they scale with no edit.

**7. Same treatment for non-grunt participants.** **DECIDED: out of scope.**
Verified: no DV input and no P/S/heal buttons exist for a non-grunt
participant anywhere — its Condition Monitor tab
(`battle-tracker.component.html:1107-1175`) is two `app-condition-monitor` bars
plus health inputs. This would be a new feature with its own rules-adjacent
questions (which track an untyped heal comes off, overflow interaction,
`ARCHITECTURE.md` §3's `wm`/`ooc` derivation for PC-shaped participants), and
would need its own brief.

**8. Physical-before-Stun on a detached grunt.** **DECIDED: keep it.**
`DetachedGruntParticipant.healDamage` cuts Physical first
(`DetachedGruntParticipant.ts:274-282`), documented at `:261-270` as "the split
only has to be consistent, not significant" since a grunt has one combined
track. A large heal makes that split visible in the log for the first time
("healed Physical 2, Stun 3"). Changing it would be a behaviour change to a
domain method this spec otherwise leaves alone.

**9. Documentation updates.** **DECIDED:** update `ARCHITECTURE.md:728-732`
(the `DV` + `P`/`S`/`-1` sentence, now `P`/`S`/`H`) and the four in-code comments
listed as affected paths 5, 6, 8, 9. **Leave `RULINGS.md` alone.** Its 2026-08-13
entry mentions `-1` at `:517` while describing the control set of the day;
nothing is being re-decided, no ruling is reversed, and the file's convention is
to annotate only when a ruling is superseded or narrowed.
`docs/APP_DOCUMENTATION.md` never documents these controls and needs no edit.
