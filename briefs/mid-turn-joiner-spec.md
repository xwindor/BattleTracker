# Spec: prompting a mid-turn combat joiner to roll Initiative

**Scope-boundary note, before anything else:** the request's phrasing —
"prompted to roll initiative straight away... rather than waiting" — is
ambiguous between "reachable by the GM sooner" and "opens automatically with no
GM click." The latter would cross a binding, already-decided line in `SCOPE.md`
(Open Questions, 2026-09-16): a mandatory, non-dismissible prompt must not
appear unless the GM specifically asked for it. If the intent is
auto-open-on-add, that is a deliberate expansion of that rule and needs
Xavier's explicit sign-off (Scope Question A), not an implementer's default.

## Request

Extend the existing GM-triggered, mandatory Initiative-roll pop-up (built for
the pre-combat case in `briefs/player-initiative-prompt-spec.md`) so it can
also be triggered for a participant added after a Combat Turn has already
started, with the correct late-entry Initiative Score penalty applied per
Core p. 160.

## Governing rules

1. **Late entry to a Combat Turn already in progress.** A character who enters
   combat after it has already begun rolls their Initiative Score normally
   (Initiative Attribute + rolled Initiative Dice), then subtracts 10 for each
   Initiative Pass that has already occurred. This may or may not leave them
   enough Score to act in the current Combat Turn. (Core p. 160)

2. **Initiative Score and Initiative Passes.** Initiative Score = Initiative
   Attribute + Initiative Dice roll (Edge lets you roll the maximum of 5D6, once
   per Combat Turn). Everyone acts in descending Score order within a pass; at
   the end of each pass the GM subtracts 10 from every character's Score; this
   repeats until every character is at 0 or below, ending the Combat Turn.
   Wound modifiers *may* affect Initiative Score on this and any subsequent
   Combat Turns. (Core p. 159 — validator-corrected: the book says "may",
   not "persist")

3. **Wound Modifier affects Initiative Score.** The Wound Modifier penalty is
   applied to a character's Initiative attribute, and therefore their
   Initiative Score, during combat. (Core p. 170) The change is made
   immediately after the injury and can affect the order even within the same
   Initiative Pass. (Core p. 160 — validator-corrected: the immediacy is on
   Core p. 160, not Core p. 170)

4. **No floor on Initiative Score.** Initiative Score is never clamped at 0;
   the book's own worked examples show negative Scores. Governs a late joiner
   whose post-penalty Score lands at or below zero. (Core p. 160 — cached,
   analyst 2026-07-31, `RULINGS.md` "No floor on Initiative Score")

5. **Free Actions and defence are not gated by Score; Simple/Complex actions
   are.** A participant at Initiative Score 0 or below may still take one Free
   Action per pass and defend normally, but may not declare a Simple or Complex
   action. (**Core p. 160 only** — validator-corrected 2026-09-19: the sentence
   is printed on Core p. 160; Core p. 159 does not say it, so the earlier "Core p. 159–160"
   range was over-broad. Cached, analyst 2026-08-07, `RULINGS.md`
   "Simple/Complex actions are blocked at Initiative Score 0 or below")

## Interactions and exceptions

- **Merged/reinforcement NPC rows take the identical maths.** A brand-new NPC
  row created mid-fight is a genuine late joiner and takes the same
  −10-per-elapsed-pass penalty; only a row *joining an existing row* is exempt,
  because it inherits that row's standing Score. (`RULINGS.md` 2026-08-04,
  citing Core p. 160)
- **A Combat-Turn-boundary spawn takes no penalty.** IC launched "at the
  beginning of each Combat Turn" rolls with zero elapsed passes — the same rule
  at the "0 passes elapsed" boundary, not an exception. (`RULINGS.md`
  2026-08-28)
- **An existing participant switching Initiative type (astral projection, VR
  mode) is not a late joiner.** A mode change on someone already in the fight
  changes their Initiative Dice as a relative delta, not a fresh
  roll-and-penalise. The app already distinguishes this: participant insertion
  takes a flag meaning "this Score is already correct for the current pass,
  don't re-penalise it," used for in-place type swaps and reconnect/restore,
  never for a genuinely new participant. (Core p. 159–160)
- **Wound modifiers stack with the late-entry penalty**, additively; neither
  replaces the other. (Core p. 159, Core p. 170)
- **Tie-breaking is untouched.** A late joiner tying an existing participant is
  resolved by the ordinary ERIC procedure (Edge, Reaction, Intuition, coin
  toss); "just joined" changes nothing. (Core p. 159)

## Edge cases the book defines

1. **Joining during Pass 1, before any pass has completed:** zero passes have
   occurred, so no penalty. Score = Attribute + rolled dice. (Core p. 160)
2. **The resulting Score is 0 or below:** an unremarkable, possible outcome —
   not an error case. (Core p. 160)
3. **A new Combat Turn begins after the joiner is added:** everyone, including
   the late joiner, rolls a completely fresh Initiative Test; no late-entry
   penalty carries into the new Combat Turn. (Core p. 159)

## Undefined / needs a table ruling

1. **Is a late joiner spliced into the currently-executing pass's remaining
   order, or must they always wait for the next pass?** The book strongly
   implies the former ("they may get an Action Phase during the current Combat
   Turn or they may not") but never spells out the procedure. **Recommended
   default:** insert them into the ordinary pool of participants still waiting
   to act this pass; whether they act this pass falls out of the normal
   "highest Score acts next" comparison. This matches the engine's existing
   behaviour for every other participant type.
2. **GM-triggered or automatic roll request?** Workflow, not rules.
   **Recommended default:** GM-triggered (Scope Question A).
3. **"Force Roll Outstanding" reachable mid-combat on a late joiner?**
   Workflow, not rules. **Recommended default:** yes (Scope Question B).
4. **A participant who was already in the fight, went unconscious, and regains
   consciousness mid-turn:** Core p. 160 is written for someone not yet in the
   fight and does not address this. **Out of scope** for this feature — do not
   fold it into this implementation's logic.

## Scope classification

**TRACK**

- Computing the late-entry Initiative Score: roll normally, then subtract 10
  per Initiative Pass already elapsed (Core p. 160). Already correctly
  implemented in the combat engine; this feature must not change that maths,
  only make it reachable through a roll prompt instead of manual entry.
- Never clamping the resulting Score at zero (Core p. 160; `RULINGS.md`
  2026-07-31).
- Gating Simple/Complex actions — but not Free Actions or defence — at Score 0
  or below (Core p. 160 only; `RULINGS.md` 2026-08-07). Already applies
  generally; no new logic.
- Placing the late joiner into the same waiting-to-act pool as everyone else
  (Core p. 160). Already the engine's default for any new participant.
- A completely fresh roll with no carried-over penalty at the next Combat Turn
  boundary (Core p. 159). Already correct.
- Giving the GM a way to trigger and record this roll through the existing
  pop-up/roll machinery once combat has started. **This is the actual
  feature:** extending reachability of an already-correct calculation.

**GM RESOLVES**

- Overriding the printed maths for a specific late joiner (the app defaults to
  the rule but never refuses a manual edit).
- Whether a participant returning from unconsciousness counts as a late joiner
  (undefined item 4; not part of this feature).

**OUT OF SCOPE**

- Nothing specific to this feature beyond `SCOPE.md`'s general exclusions.

**SCOPE QUESTIONS**

- **A. Auto-open the roll pop-up the instant a late player character is added,
  vs. requiring a GM click.** *For:* one less click at exactly this moment.
  *Against:* directly conflicts with the binding 2026-09-16 rule in `SCOPE.md`
  that a mandatory prompt must wait for an explicit GM ask; adopting it means
  amending that rule.
- **B. Whether "Force Roll Outstanding" reaches a late joiner mid-combat.**
  *For:* keeps the GM's "keep the game moving" tool available at all times.
  *Against:* may feel more intrusive mid-scene than in the pre-combat lull.

## Acceptance criteria

1. When a participant is added while combat has started and the current
   Initiative Pass is greater than 1, their recorded Initiative Score, once
   rolled, equals (Initiative Attribute + rolled Initiative Dice) − 10 ×
   (current Initiative Pass − 1). (Core p. 160)
2. When a participant is added during Initiative Pass 1, no late-entry penalty
   applies; Score = Initiative Attribute + rolled Initiative Dice.
   (Core p. 160, with Core p. 159)
3. A late joiner's Score is never clamped at 0 and may be recorded and shown as
   zero or negative. (Core p. 160; `RULINGS.md` 2026-07-31)
4. A late joiner at 0 or below may declare one Free Action per pass and defend,
   and may not declare a Simple or Complex action. (Core p. 160 only;
   `RULINGS.md` 2026-08-07)
5. A late joiner is placed into the same eligible-to-act pool as every other
   Waiting participant: if their rolled-and-penalised Score is higher than any
   participant who has not yet acted in the current pass, they act in that same
   pass; otherwise they wait. (Table default — Undefined item 1, adopted by
   Xavier 2026-09-18. Core p. 160 only promises a chance within the Combat
   Turn and does not describe this procedure; validator-corrected.)
6. At the start of each subsequent Initiative Pass after joining, the late
   joiner's running Score decreases by exactly 10, like everyone else's.
   (Core p. 159)
7. At the next Combat Turn boundary, the late joiner rolls a completely fresh
   Initiative Test with no late-entry penalty carried over. (Core p. 159)
8. A GM can trigger a roll request (and, per Scope Question B's default, a
   force-roll) for a late-joining player character after combat has started,
   using the same pop-up mechanism already built for the pre-combat case.

## Gameplay scenarios to survive

1. **Ordinary case.** A player character is added during Pass 2. The GM
   triggers a roll; Attribute 9 + 3 dice = 14 raw, −10 for the one elapsed pass
   = 4. If 4 beats everyone still waiting in Pass 2, they act this pass;
   otherwise they wait for Pass 3, where they lose another 10 (to −6).
2. **A tie.** The late joiner's post-penalty Score matches an existing Waiting
   participant's. ERIC tie-breaking resolves it exactly as for any two
   participants.
3. **Mid-turn state change.** A late joiner added in Pass 2 doesn't act that
   pass; before Pass 3 they cross a Wound Modifier threshold. Their Score drops
   immediately from the wound (Core p. 170 for the penalty, Core p. 160 for
   the immediacy), then loses the ordinary 10 at the
   start of Pass 3 (Core p. 159) — both apply, stacked.
4. **A character in two initiative tracks.** A player's decker already in the
   fight in AR switches to hot-sim VR mid-turn. This is a mode swap, not a late
   joiner: dice change by a relative delta, and the −10-per-elapsed-pass
   penalty must NOT be applied.
5. **Unconscious participant.** A player character who was in the fight, went
   down, and is healed back mid-turn is not this case — do not silently apply
   the late-entry penalty (undefined item 4).
6. **Multiple joiners.** Two player characters added in the same Pass 3 each
   roll independently and each loses 10 × 2 = 20; no shared penalty; each is
   placed purely on their own Score.

## Rules-notes entries held for Stage 5

The analyst derived these and could not write them (read-only). Per the
`/feature` pipeline they are appended to `docs/rules-notes/core-combat.md` in
Stage 5, after Xavier approves — not before.

```
### Late entry to a Combat Turn already in progress
- **Printed page:** Core p. 160 (source file: `rules/core/pages/p0162.txt`)
- **verified:** analyst 2026-09-18
- **Rule:** A character who enters combat after it has already begun rolls their Initiative Score normally (Initiative Attribute + Initiative Dice), then subtracts 10 for each Initiative Pass that has already occurred. This may or may not leave them enough Score for an Action Phase in the current Combat Turn.
- **Interacts with:** Core p. 159 (Initiative Score/Passes, per-pass -10 decay), Core p. 170 (wound modifiers applied to Initiative attribute/Score), RULINGS.md 2026-07-31 "No floor on Initiative Score", RULINGS.md 2026-08-04 "A merged Grunt Group is a new row, and takes the late-entry penalty", RULINGS.md 2026-08-28 "IC launched at the start of a Combat Turn rolls normally and acts that turn".
- **Undefined:** The book does not state the mechanical procedure for slotting a mid-pass late joiner into the already-executing pass's remaining turn order (see `briefs/mid-turn-joiner-spec.md`, Undefined item 1).

### Determining Initiative Score and Initiative Passes
- **Printed page:** Core p. 159 (source file: `rules/core/pages/p0161.txt`)
- **verified:** analyst 2026-09-18
- **Rule:** Initiative Score = Initiative Attribute + Initiative Dice roll (Edge allows rolling the maximum 5D6 once per Combat Turn). Everyone acts in descending Score order during the first Initiative Pass; at the end of each pass the GM subtracts 10 from everyone's Score, and this repeats until every character's Score is 0 or less, ending the Combat Turn. Wound modifiers *may* affect Initiative Score on the current and subsequent Combat Turns (validator 2026-09-18: the book says "may", not "carry onto").
- **Interacts with:** Core p. 160 (late entry maths, mid-turn Initiative changes), Core p. 170 (wound modifier mechanics).
- **Undefined:** none noted for this entry.

### Wound Modifier applies to Initiative attribute/Score
- **Printed page:** Core p. 170 (source file: `rules/core/pages/p0172.txt`)
- **verified:** analyst 2026-09-18
- **Rule:** The Wound Modifier penalty is applied to a character's Initiative attribute, and therefore their Initiative Score, during combat.
- **Interacts with:** Core p. 159 (wound modifiers *may* affect Initiative on this and later Combat Turns), Core p. 160 and Core p. 158 step 1 (the change is applied immediately after the injury, even within the same Initiative Pass, and does not let the character act again) — validator-corrected 2026-09-18.
- **Undefined:** none noted for this entry.
```

---

# Implementation plan (sr5-change-scoper)

## Verification against the code (confirms the analyst's "maths is already right")

**Where the penalty is applied.** At **add time**, not roll time.
`CombatManager.addParticipant(participant, carriesRunningScore=false)`
(`src/Combat/CombatManager.ts:239-251`) applies
`-(initiativePass - 1) * INITIATIVE_PASS_DECAY` to `currentInitiativeScore`
immediately on insertion, while `diceIni` is still 0. The roll lands later
through the `diceIni` setter (`Participant.ts:170-176`), which applies only
the 0→n **delta**. So penalty-then-roll = attribute − 10×(pass−1) + roll: no
double-count, no loss. Already asserted by `CombatManager.spec.ts:352-357`
(`12 + 7 − 10 = 9`).

**`roll_submission` guard** (`battle-tracker.component.ts:3438`,
`started && target.diceIni > 0`) reads `diceIni`, not the Score. A
penalised-at-add joiner still has `diceIni === 0`, so the roll is accepted.
No change.

**Pending counts and targeting.** `pendingRoll` (`diceIni <= 0`, ~`:3705`),
the pending-count getters (`:9050-9064`), `requestPlayerRolls()`
(`:9066-9082`) and `rollOutstandingInitiative()` (`:9106-9171`) never
reference `combatManager.started`. They already count and target a late
joiner correctly. **No code changes — only reachability.**

**`rollsRequested` mid-turn is already safe.** `syncRollModal()`
(`player-view.component.ts:992-1022`) requires the player's own
`pendingRoll === true`; setting the global flag mid-turn cannot reopen the
modal for anyone who already rolled.

**Splicing into the current pass (rules-spec Undefined item 1).** A new
`Participant` is `status: Waiting` and lands in `CombatManager.participants`,
which `getNextActors()` (`:199-222`) scans on every advance. The recommended
default is already the engine's behaviour. No engine change.

## Every place with the same pattern

1. "+ Participant" — `addParticipant()` (`:6721-6747`): default
   `carriesRunningScore=false`, correctly penalised. **In scope.**
2. **`upsertPlayerParticipant()`** (`:4306-4412`) via `register_character`
   (`:3079-3134`): a brand-new player registering mid-fight;
   `combatManager.addParticipant(target)` at `:4359`, correctly penalised.
   **A second real mid-fight-joiner path the request didn't mention; same
   gap, same fix. In scope.**
3. `addGrunt()` (`:6772`), new NPC row (`:7072`), merge into a new row
   (`:7433`): genuine NPC late joiners, correctly penalised; never
   player-owned, but must be reachable by Force Roll Outstanding mid-combat.
4. Detach-to-standalone (`:7923`) — see "Pre-existing concern" below.
5. The four promote/demote type swaps (`:8427, :8512, :8595, :8676`) pass
   `carriesRunningScore=true`. **Correct; must not be touched.**
6. Per-row GM dice button `btnRollInitiative_Click()` →
   `rollAndLogInitiative()` (`:5476-5478`, `:6583-6601`; template
   `.html:340-343`): **already reachable mid-combat and correct.** Regression
   guard only.
7. `DiceRollerComponent`: no initiative-specific logic; nothing to change.

## Affected paths

- `battle-tracker.component.html:70-98` — the Initiative Prep card, gated
  `@if(!combatManager.started && initiativePrepActive)`. Add a **sibling**
  mid-combat block; do not reuse this one wholesale, because it renders
  "Begin Combat Turn" (`:91-94`), which must never appear once
  `combatManager.started` is true.
- `battle-tracker.component.ts` — a new template-facing predicate, e.g.
  `hasOutstandingMidCombatRolls()` = `combatManager.started &&
  hasPendingInitiativeRolls()` (`:9046-9048`, already state-independent).
  **Do not overload `initiativePrepActive`**: its documented meaning is "the
  pre-combat prep panel shows," and it is cleared by `beginCombatTurn()`,
  `btnReset_Click()` and session teardown.
- `requestPlayerRolls()`, `rollOutstandingInitiative()`,
  `confirmAndForceRollOutstanding()`, the pending-count getters,
  `updateInitiativePrepInfo()` — **no changes**; wire the new buttons to
  them. Do not duplicate their logic into a parallel mid-combat method.
- `btnBeginCombatTurn_Click()` / `beginCombatTurn()` — must stay unreachable
  once `combatManager.started` is true.

**Confirmed correct, do not touch:** `CombatManager.addParticipant()`;
`Participant.diceIni` setter and `applyInitiativeScoreDelta`; the
`roll_submission` guard; `PlayerViewComponent.syncRollModal()`;
`getSharedParticipants()`'s `pendingRoll`; `rollAndLogInitiative()` and its
button; `upsertPlayerParticipant()`.

## Proposed approach

1. A second card on the GM screen, gated
   `@if(combatManager.started && hasOutstandingMidCombatRolls())`, labelled
   "Pending Rolls" (not "Initiative Prep"), containing "Request Player
   Rolls" and "Force Roll Outstanding" (plus "Roll Remaining Non-Player" per
   Open Decision 3). No "Begin Combat Turn."
2. Wire those buttons to the existing `requestPlayerRolls()` /
   `confirmAndForceRollOutstanding()` / `rollOutstandingInitiative(false)`.
   Only a visibility predicate and, if needed, thin passthrough handlers are
   new.
3. Nothing in `CombatManager`, `Participant`, or the session-sync payload
   changes. UI reachability only.

## Size check

Small — well under a day. One template block, one predicate, existing
buttons rewired. No new domain logic, no new session-sync fields.

## Acceptance criteria (technical, extending the rules spec's AC 1–8)

1–7 need no new code; verify via existing tests plus the scenarios below.

8. With `combatManager.started === true` and at least one participant with
   `diceIni <= 0 && !ooc`, a "Request Player Rolls" control is reachable and,
   when clicked, sends `request_rolls` and sets `rollsRequested` exactly as
   it does pre-combat, reusing `requestPlayerRolls()` verbatim.
9. The same holds for a participant created via `register_character`
   mid-combat, not only via "+ Participant".
10. "Begin Combat Turn" never renders while `combatManager.started === true`.
11. A player who has already rolled this Combat Turn never sees their pop-up
    reopen as a side effect of the GM requesting a roll for a later joiner.
12. The per-row GM dice button keeps working mid-combat exactly as before.

## Regression risk

- `initiativePrepActive`'s pre-combat behaviour must not be disturbed;
  covered by `player-initiative-prompt.spec.ts` "Regression: prep-time
  request (combat not started yet)", which exists because a previous change
  broke exactly this.
- `rollsRequested` clearing (on `beginCombatTurn()` and on a fully-resolved
  batch) is unchanged but now exercised mid-combat; re-assert it there.
- `CombatManager.spec.ts:308-357` (late-entry maths) must pass unmodified.
- `player-initiative-prompt.spec.ts` Item A / Item B blocks must pass
  unmodified; `syncRollModal()` is not being changed.

## Scenarios to survive

**Every scenario must drive the real GM flow into a running combat turn** —
start a round and advance a pass via the real handlers, and assert
`combatManager.started === true` at the moment of adding. Do not use a state
helper that defaults `started: true`; a previous change shipped a total
failure because every test assumed combat was already running.

1. **Ordinary, mid-combat.** Pass 2; GM adds a player-owned participant via
   the real "+ Participant" handler, then clicks the new mid-combat "Request
   Player Rolls". Assert `request_rolls` sent, that player's modal opens,
   roll submitted, Score = attribute + roll − 10.
2. **New registration mid-fight.** During Pass 3 a different player submits
   `register_character`. Assert −20 is applied before any roll, and the
   mid-combat "Request Player Rolls" reaches them.
3. **Stale request cleared.** GM requests, late joiner rolls. Assert
   `rollsRequested` clears, the pending count returns to zero, and no
   already-rolled participant's modal opens at any point.
4. **At the table, others waiting.** Pass 2; three players have acted. A
   fourth arrives; GM requests rolls. Assert only the new player's modal
   opens (the other three stay closed throughout); if their post-penalty
   Score beats anyone still Waiting this pass, `getNextActors()` picks them
   up this pass.

## Open decisions

1. **Scope Question A — GM click vs. auto-open.** Default: GM click only
   (binding `SCOPE.md` 2026-09-16 rule).
2. **Scope Question B — Force Roll mid-combat.** Default: yes.
3. **"Roll Remaining Non-Player" in the mid-combat panel?** Default: yes; it
   explicitly excludes player-owned participants (`:9112`).
4. **Panel label.** Default: "Pending Rolls", not "Initiative Prep".
5. **Detach-to-standalone penalty** — resolved, see below; not part of this
   feature.

## Detach-to-standalone: checked, not a defect

The planner flagged `detachRowMember()` (`battle-tracker.component.ts:7923`)
as possibly double-penalising a detached grunt, on the belief that a detach
inherits the row's running Score. Checked by the orchestrator against the
code: it does **not** inherit it, deliberately. `NpcRowParticipant.
detachMember()` (`src/Grunts/NpcRowParticipant.ts:424-453`) builds a fresh
participant carrying the row's `baseIni` and dice count but **not** its
`diceIni` or running Score; `detachRowMember()`'s own doc comment
(`:7899-7902`) states the detached NPC "has not rolled, so the GM rolls its
own Initiative Test, and `addParticipant` applies the ordinary late-entry
penalty for elapsed passes (Core p. 160). Decision 7's 'no penalty' covers joining
a row, not leaving one." So the penalty is applied exactly once, by design.
It is, however, a genuine NPC late joiner with `diceIni === 0`, so it is one
of the participants the mid-combat "Force Roll Outstanding" / "Roll Remaining
Non-Player" must reach — already true, since those filter on `diceIni <= 0`.

## RESOLVED (Xavier, 2026-09-18) — all recommended defaults adopted

- Scope Question A: **GM click only.** The roll pop-up must never open
  automatically when a late joiner is added.
- Scope Question B: **Force Roll Outstanding is reachable mid-combat.**
- Undefined item 4 (unconscious participant regaining consciousness):
  **out of scope**, not implemented, no logic added for it.
- Open Decision 3: **"Roll Remaining Non-Player" is included** in the
  mid-combat panel.
- Open Decision 4: panel labelled **"Pending Rolls"**.
- Undefined item 1 (splicing into the current pass): the recommended default,
  already the engine's behaviour — no engine change.

## RESOLVED — validation round 1 (Xavier, 2026-09-18)

The Stage 3 validator returned **FAIL (playability)**; rules correctness
PASS. Fix-round requirements, all binding:

- **D1/D2 — the request signal must switch off.** `rollsRequested` must be
  cleared (a) as soon as no non-`ooc` player-owned participant still owes a
  roll (`diceIni <= 0`), whichever way the last roll lands — a player's own
  `roll_submission`, the per-row GM dice button, a typed value, Force Roll or
  Roll Remaining Non-Player; and (b) when a Combat Turn **ends**, not only
  when the next begins. A mandatory pop-up must never open without a GM
  request: not for a second late joiner later in the same turn, and not for
  anyone between turns.
- **D4 — warn, never block (answer 5).** When the GM advances the turn order
  (Next / End Combat Turn, or whatever control moves the order on) while any
  participant still owes an Initiative roll mid-combat, show a warning naming
  who, with a way to proceed anyway. This is a new "limit watched" in the
  sense of `SCOPE.md`'s "Enforcing legality" section — warned, never refused.
- **D6 — panel visibility (answers 6–8).** The mid-combat "Pending Rolls"
  panel names each participant still owed a roll; shows whether a player-roll
  request is currently outstanding; and mid-combat only, "Roll Remaining
  Non-Player" is enabled even while a player still owes a roll. Pre-combat
  behaviour of that button is unchanged.
- **Citations corrected** (see Governing rules 2 and 3): wound immediacy is
  Core p. 160; Core p. 159 says wound modifiers "may" affect Initiative. The
  Stage 5 rules-notes entry for wound modifiers must cite both pages.

## RESOLVED — validation round 2: redesign (Xavier, 2026-09-18) — BINDING

Round-2 validation FAILED. Orchestrator diagnosis: an **incomplete
implementation — the same defect class reappearing through new paths**.
Round-1 D1, round-2 D1 (release/reclaim silently cancels a request), round-2 D2
(the row dice button never broadcasts) and round-2 D4 (one request covers people
never asked) all come from one cause: the request is a single table-wide on/off
switch (`rollsRequested`), but the rule is per person — "this player was
asked." Deriving that switch from "does anyone owe a roll" is wrong in both
directions. Xavier chose the redesign below. It **supersedes** the round-1
D1/D2 choke point (`clearRollsRequestedIfSatisfied()` and the global
`rollsRequested` predicate), and the round-1 D4 wording on which controls warn.

**A. Per-person "asked" state (the single choke point).** Replace the
table-wide switch with a per-participant record of who has been asked to roll,
carried on the shared state so it survives a player's refresh/reconnect.
- A player's roll pop-up opens **only** if their primary character has been
  asked, still owes a roll (`pendingRoll`), and is not `ooc`.
- **New per-row control:** a button next to the existing dice button on a
  player-owned participant's row that asks **that one player** to roll. Shown
  only when that participant is player-owned, owes a roll, is not `ooc`, and a
  session is open. This is Xavier's design.
- The existing **"Request Player Rolls"** buttons (pre-combat Initiative Prep
  panel and the mid-combat Pending Rolls panel) mark every player-owned,
  non-`ooc` participant **currently** owing a roll as asked. Anyone who arrives
  afterwards is **not** asked until the GM presses a button again. (Orchestrator
  assumption, stated to Xavier.)
- A participant stops being "asked" **only** when: their roll lands by any route
  (player's own `roll_submission`, the per-row GM dice button, a typed value on
  the card, Force Roll Outstanding, Roll Remaining Non-Player); the GM clears the
  prompt; they are marked `ooc`; they are removed; the Combat Turn ends; combat
  ends. **Losing or regaining ownership (a phone sleeping, a dropped connection,
  a release and re-claim) must NOT clear it** — on reconnect the pop-up comes
  back, which is the staged roll-prompt change's own promise.
- **Every roll-landing path must broadcast immediately**, including the per-row
  GM dice button (`rollAndLogInitiative`), which the validator confirmed does
  not broadcast today. A player whose roll the GM made must see their pop-up
  close at once.
- This replaces a mechanism the **staged** roll-prompt change introduced
  (`SharedCombatState.rollsRequested`, read by
  `PlayerViewComponent.syncRollModal()`). Replace it cleanly; update that
  change's tests only where they assert the old table-wide switch; every one of
  its behaviours must still hold (pre-combat request, reconnect reopening,
  no pop-up without a GM request, non-dismissible, the Done button). Report
  every existing test you had to change and why.

**B. Indicator, not warning, for a participant with no Initiative yet.** Each
participant row shows a clear marker while that participant still owes an
Initiative roll mid-combat (e.g. a just-joined late entrant). It is a visual
cue only; it does not interrupt anything.

**C. Warn only when the Initiative Pass is about to end.** When the GM takes the
action that would **end the current Initiative Pass** — the Act, Delay or other
control that empties the pass, and the Next Pass / End Combat Turn button —
while any non-`ooc` participant still owes an Initiative roll, show a warning
naming who, with "proceed anyway" and "cancel". Never block. An Act that does
not end the pass gets no warning. This replaces the round-1 D4 wording.

**D. Late rolls — no engine change (Xavier's rule, confirmed against the
book).** A late joiner acts in the current pass only if their post-penalty
Score (attribute + roll − 10 × passes already occurred) is above 0 **and**
their roll lands before the pass ends (Core p. 160 late entry; Core p. 159:
only characters above 0 act). The warning in C is what gives the GM the chance
to wait for the roll; if the GM proceeds, the joiner waits for the next pass.
Do **not** add logic that reopens an ended pass.

**E. Fix the mid-combat status line**, which reads "All initiative rolls ready.
Begin Combat Turn." after "Roll Remaining Non-Player" mid-fight (that button
does not exist then), and keeps a stale "Waiting for initiative…" after a
player's own roll mid-fight.

**F. Keep round-1 D6**: the mid-combat Pending Rolls panel names who is owed a
roll, shows **who has been asked** (replacing the table-wide "request
outstanding" line), and "Roll Remaining Non-Player" stays enabled mid-combat
while a player is owed. Pre-combat panel behaviour unchanged.

## RESOLVED — validation round 3 (Xavier, 2026-09-19) — BINDING

Round-3 validation: **rules correctness PASS** (every citation re-derived and
held; the late-entry maths untouched and correct), **playability PASS WITH
FIXES**. The recurring "who has been asked" defect class is fixed — release and
re-claim, the row dice button, and uninvited pop-ups all behave. The items
below are mostly genuinely separate defects; item 4 is the last residue of the
old class. All are approved for this round.

**1. One pass-ending warning, on the GM screen, that blocks nothing
(supersedes item C's dialog placement).** Item C's confirm dialogs only cover
GM button presses, so the most common way a pass ends at this table — a player
tapping Act or Delay on their own phone — warns nobody, and the late joiner
silently loses the pass. Same for a grunt-row member's Act, Leave Combat or
Delete on the only current actor, and a spent NPC row dropped automatically by
a damage/heal handler. Replace with a **state-driven notice on the GM screen**:
whenever the participant now due to act is the last one able to act in this
Initiative Pass and any non-`ooc` participant still owes an Initiative roll,
the GM screen shows who still owes it (e.g. "Last turn of this pass — Late
still owes a roll"). It is driven by the order's state, not by a click, so it
covers players' phones, grunt groups and automatic paths alike, and never asks
a remote player anything. **Keep** the existing confirmation on Next Pass /
End Combat Turn (a roll landing there can still earn another pass).
**Remove** the confirmation from Act and Delay, which double-warns for the same
person (round-3 defect 7).

**2. New table ruling — a participant who has not rolled is not given a turn
until they roll.** Today an unrolled late joiner can be handed an Action Phase
on their bare Initiative attribute, ahead of someone who has rolled, and their
player could act without ever rolling. Core p. 160 has a late entrant "roll for
their Initiative Score as normal"; there is no Score to act on until they do.
Skip any participant with `diceIni <= 0` when choosing who acts next, mid-
combat; they enter the order as soon as their roll lands. Xavier approved this
as a table ruling (2026-09-19) — the orchestrator records it in `RULINGS.md` at
Stage 5. Report anything this breaks for participants who legitimately never
roll.

**3. Status-line regression (round-3 defect 4).** The round-2 fix made
`updateInitiativePrepInfo` run on every roll, so pre-combat it can read "All
initiative rolls ready. Begin Combat Turn." (a button not on screen then), it
overwrites session messages such as "Reconnected to session…" or "Copied player
link.", and mid-fight "All initiative rolls in." sticks for the rest of the
fight. Show the text only while a roll panel is actually visible, and never
overwrite an unrelated session message.

**4. Re-registering as a different character type must keep the "asked"
record** (round-3 defect 5 — last residue of the old defect class). A player
switching between decker and non-decker is replaced by a brand-new participant
that is not asked, so their pop-up closes and the late-entry penalty is applied
a second time. Carry the "asked" state across that replacement (same player,
same request) and drop the stale record. Add the new per-person record to
`ARCHITECTURE.md` §8's side-map cleanup list.

**5. The player's own roll wins (Xavier's decision, 2026-09-19 — note this
reverses the orchestrator's recommendation).** When the GM has already rolled
for a participant with the per-row dice button and that player's own roll then
arrives, **the player's roll counts** and replaces the GM's, both pre-combat
and mid-combat. Constrain it so this cannot be abused or fired by a stale
client: accept the superseding submission only for a participant who was asked
to roll this Combat Turn and whose player has not already submitted one, and
only once — a second submission is ignored. Write a log line making the
supersession visible to the GM. Do not let a submission from a previous Combat
Turn overwrite anything. Report the mechanism you chose.

**6. Asking one player chimes only that player** (round-3 defect 8). The
per-row ask currently sends the same room-wide command as "Request Player
Rolls", re-nudging and re-chiming every other player whose pop-up is open.

**7. Show who has been asked** on the participant's own row, and in the
pre-combat Initiative Prep panel as well as the mid-combat one (round-3
defect 9).

**8. Guard against the same Act running twice** (round-3, pre-existing but made
more likely). While a GM confirm dialog is open for a player-owned participant,
the player can tap Act on their phone; the GM's "Advance Anyway" then runs the
Act again — duplicate log line, extra advance, and if the first Act ended the
Combat Turn the order moves while combat reads as stopped. Check the
participant is still the one due to act before applying a deferred Act.

**9. Documentation.** `docs/APP_DOCUMENTATION.md`'s roll-prompt section
(~lines 382–442) still describes the removed table-wide switch as live; update
it to the per-person model, the per-row ask button, the pass-ending notice and
the superseding-roll rule. Update `ARCHITECTURE.md` §8 per item 4.

## RESOLVED — validation round 4 (Xavier, 2026-09-19) — BINDING

Round-4 validation: **rules correctness PASS** (all pages re-derived; one
citation tightened — Free Action/defence at Score 0 or below is **Core p. 160
only**, already corrected in Governing rule 5). **Playability FAIL**, because
the round's headline deliverable does not fire. Diagnosis: the same class as
before — one fact ("can this participant still act this pass") derived in two
places that drifted apart when item 2 changed only one of them. Items 2–8
below are genuinely separate. All approved.

**1. The pass-end notice never fires for a real character (breaks-play).**
`pendingPassEndRollNotice()`'s "is anyone else still waiting" test
(`p !== actor && !p.ooc && status === Waiting && getCurrentInitiative() > 0`)
was not updated when item 2 added `&& p.diceIni > 0` to
`CombatManager.getNextActors()`. An unrolled joiner with any ordinary
Initiative rating counts as "still waiting" here while the engine refuses them
a turn, so the notice returns null in exactly the case it exists for. Its six
tests only pass because they set `late.baseIni = 0`.
**Fix:** derive eligibility **once** — a single shared predicate used by both
`getNextActors()` and the notice, so they cannot disagree again. Re-test with
realistic Initiative ratings (e.g. 10 in Pass 1, 12 penalised to 2 in Pass 2).

**2. Act declaration window still double-acts (breaks-play).** Item 8 was
closed only for the removed confirm dialog. The GM's Act *declaration* modal
stays open; `submitActModal()`/`performAct()` check nothing about status, while
the player's own `act` command already ignores a participant that is not Active
or Delaying. GM opens Hero's Act window, Hero's player taps Act first, GM
submits: duplicate declared-action log line, and an extra advance if the order
had emptied. **Fix:** refuse `submitActModal()` when the participant is no
longer Active or Delaying, matching the player-side guard.

**3. Roll-status line permanently silenced (round-3 item 3 regression).**
`setRollStatusText()` writes only when `shareInfo` is empty or holds its own
previous text, but nothing ever clears `shareInfo` ("Copied player link.",
"Reconnected to session…", "Joined session…"). After any of those the roll
status never appears again for the session. **Fix:** give the roll status its
own display slot rather than competing for the session banner.

**4. Item 5's "asked to roll this Combat Turn" precondition is missing.** The
code gates only on "the GM rolled for this player-owned participant this Combat
Turn". Not reachable today (every real sender goes through the locked pop-up,
which only opens for an asked character; `autoRollForMode` is dead code), but
it is the guard that stops an unasked client overwriting a GM roll. **Fix:**
add the precondition.

**5. Interrupts for an unrolled participant (Xavier, corrected in discussion).**
The interrupt buttons are on the **player's** screen and the non-dismissible
roll pop-up blocks that screen, so an *asked* player genuinely cannot reach
them — Xavier's point holds. The remaining gap is the window **before** the GM
asks: a mid-fight arrival with no request yet has a usable screen and
`canInterrupt` has no "has rolled" condition, so they can spend Initiative from
an unrolled attribute. **Fix:** gate Initiative-costing interrupts on having
rolled, the same way item 2 gates acting. Do not gate ordinary defence.

**6. Seize the Initiative is NOT blocked by the pop-up (Xavier, corrected in
discussion).** "Seize Initiative" is a **GM-side** control
(`battle-tracker.component.html:462` → `sender.seizeInitiative()`,
`battle-tracker.component.ts:5650`), so the player's pop-up cannot prevent it.
Core p. 160: seizing moves you to the top "regardless of your Initiative
Score." Item 2's skip currently overrides that, so Edge spent on seizing buys
nothing for an unrolled participant. **Fix:** a participant who has seized the
Initiative is exempt from item 2's skip. Recorded as a table ruling at Stage 5
alongside item 2's own ruling.

**7. "Nobody can act" message.** When no participant can be given a turn
because every remaining one still owes a roll, the GM screen must say so
plainly instead of the pass ending silently. Do not change the ruling itself.

**8. Documentation.** `ARCHITECTURE.md` still describes the roll-submission
guard as applying only "while combat is started" (the round-3 change removed
that condition), and does not document item 2's ruling anywhere despite being
the authoritative reference for turn order. Update both.

**Backlogged, not fixed here:** merging the currently-acting grunt into a row
is now impossible, because merging requires an unrolled grunt and item 2 means
an unrolled grunt never acts. `combat-boundary-logging.spec.ts` had to place
its acting grunt by hand as a result. Xavier: backlog (2026-09-19).

## RESOLVED — validation round 5 (Xavier, 2026-09-19) — BINDING

Round-5 validation: **rules correctness PASS WITH FIXES**, **playability PASS
WITH FIXES**. The round-4 headline works — `canParticipantActThisPass()` is a
single shared rule used by both `getNextActors()` and the pass-end notice, and
the notice fires for realistic Initiative ratings. Every cited page was
re-derived and holds. The items below are approved.

**Rules hygiene, first, because it governs Stage 5.** The validator's judgement,
which the orchestrator accepts: the core rulebook **does not compel** either of
the rulings this feature now rests on. Core p. 160's "regardless of your
Initiative Score" is about the *magnitude* of a Score, not its *absence*; Core p. 160
still tells a latecomer to "roll for their Initiative Score as normal", and
Core p. 161 orders multiple seizers "in order of their Initiative Scores", which
presupposes a rolled Score. Core p. 167 conditions an Interrupt Action on having
"enough Initiative Score left… to pay the price" — again a magnitude test — and
Core p. 160's "she can also respond to attacks by dodging or defending herself" is
explicitly about a Score of 0 or less, not an unrolled one. **The book is silent
on a combatant who is in the fight without a rolled Score.** Items 2, 5, 6 and
the new item 10 are therefore **table rulings**, recorded as Xavier's at Stage 5,
and no code comment or document may present them as printed rules. Correct any
comment or doc that currently does.

**1. Enforce the "must have rolled" gate on interrupts GM-side (breaks-rules).**
`canInterrupt` only greys the player's buttons; the `interrupt` command handler
enforces nothing, so a stale or double-tapped phone can still spend Initiative a
participant never rolled. The `act` and `delay` handlers already check status on
receipt — `interrupt` must apply the equivalent check. Recurrence of the
"one fact, two places" class.

**2. Remove the third hand-written copy of the eligibility rule.**
`nobodyCanActRollNotice()` re-derives "not ooc, Waiting, Score above 0, hasn't
rolled, hasn't seized" by hand. Express it as the negation of
`canParticipantActThisPass()`. This is the same drift item 1 of round 4 existed
to end.

**3. The Act window must not fail silently.** `submitActModal()` correctly
refuses a participant who is no longer Active or Delaying, but returns with no
feedback: the window stays open and the GM presses Submit again. Close it and
say why (e.g. "Hero has already acted this pass"), or disable Submit the moment
the participant stops being due to act.

**4. Finish item 5's precondition.** A superseding player roll is accepted only
for a participant asked to roll this Combat Turn **and whose player has not
already submitted one** this Combat Turn. Only the first half is implemented, so
a duplicate or delayed player submission can overwrite a GM's deliberate
re-roll.

**5. Carry the seize across a type-mismatch re-registration (breaks-rules).**
Core p. 161: the move to the top "lasts for the entire Combat Turn (meaning
multiple Initiative Passes)". Today a same-player re-registration that changes
character type rebuilds the participant and drops the seize — Edge spent,
nothing bought. Carry it the way the "asked" records already are, and add it to
`ARCHITECTURE.md` §8's list.

**6. The status line is a receipt, not a live readout tied to its panel
(Xavier's decision, 2026-09-21).** Round-3 item 3 had asked for "All initiative
rolls in." to disappear the instant the Pending Rolls panel does, on the theory
that the line should only show while a roll panel is visible. Xavier accepted
the tracker's actual, already-implemented behaviour instead: the line stays on
screen until the next pass or Combat Turn boundary, the same way a receipt
stays on the counter after the till closes. Gating the line on the panel would
make "All initiative rolls in." flash and vanish in the same instant the last
roll lands - not enough time for the GM to ever read it - so this is not a
defect to fix; it is the correct behaviour, and round-3 item 3's original
framing is superseded by this decision.

**7. Stale citation, two remaining places.** Acceptance criterion 4 and the
TRACK bullet in this file still read "Core p. 159–160" for Free Action/defence
at Score 0 or below. It is **Core p. 160 only**. Stage 5 must not carry the
range into `docs/rules-notes/`.

**8. Two test files take the forbidden shortcut.** The seize tests and the
"nobody can act" tests set the combat-running flag by hand instead of starting a
turn through the real GM flow — the exact shortcut that hid a total failure in
an earlier round. Rewrite them to drive the real flow.

**9. Seize exempts a participant from BOTH gates (Xavier, 2026-09-19).**
Today a seized-but-unrolled participant may take a full Action Phase but may not
declare an Initiative-costing Interrupt Action, because the seize exemption was
applied to the acting gate only. Apply it to the interrupt gate too, so the two
agree. Table ruling, recorded at Stage 5.

**10. An unrolled participant does not hold the Combat Turn open (Xavier,
2026-09-19).** Core p. 159 ends the Combat Turn once all characters are at 0 or
less; under item 2's ruling an unrolled participant has no Score, so it must not
be their bare attribute that keeps the turn alive (`isOver()` /
`hasMoreIniPasses()` currently count it). An unrolled participant neither acts
nor holds the turn open. The "nobody can act" notice is what warns the GM
first. Table ruling, recorded at Stage 5.

**Reported, not fixed here — carried to the next increment:** Core p. 161 orders
multiple seizers "in order of their Initiative Scores"; with two unrolled
seizers the tracker orders them on bare attributes, which are not Scores.
Xavier has asked for Seize (and Blitz, Core p. 159's "Edge lets you roll the
maximum of 5D6") to move into the player's roll pop-up, where the book puts the
Edge decision. That is a separate, rules-dependent increment through `/feature`,
not this round.

## RESOLVED — jack-out now prompts the player (Xavier, 2026-09-20) — BINDING

Reverses the 2026-09-17 decision recorded in
`briefs/player-initiative-prompt-spec.md` ("jacking out entirely stays
automatic"). Xavier, after hands-on testing: "ive changed my mind dont make
the jack out automatic."

**A player-initiated jack out prompts that player to roll the lost dice**, in
the same non-dismissible delta modal a VR mode switch already uses, worded as a
subtraction. The GM side must not roll those dice itself for this path, or the
loss is counted twice. All the existing delta-prompt machinery applies
unchanged: the owed amount rides on the shared state so it survives a refresh
or reconnect; it is cleared on every participant-replacing path; guard A (fix
round 5 of `briefs/player-initiative-prompt-spec.md`) still settles any earlier
unrolled delta before computing a new one.

**Orchestrator assumptions, stated to Xavier and correctable by him:**
- A **GM-initiated** jack out (`gmJackOut`, and any jack-out the GM triggers
  from their own screen) **stays automatic**, consistent with the standing rule
  that a change the GM makes on their own screen resolves immediately and never
  stalls the table on a player.
- **Removing the deck entirely** (the demote-to-plain-Participant path) stays
  automatic, unchanged.
- A jack out that happens while the participant cannot act (VR catatonia,
  out of combat) must not open a prompt — report if that state is reachable
  here.

Not to be implemented until the in-flight UI fix round lands, to avoid two
agents editing the same files.
