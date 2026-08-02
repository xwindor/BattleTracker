# Spec: Action Log attribution, wording and coverage

## Request

Six changes to what the shared session Action Log records and how it is worded: fix "GM" attribution on three player-command entries, reword the rolled-total-clamp line, add missing entries for `release_claims`, damage-driven status transitions, Enter/Leave Combat, and force-rolled initiative batches.

**Not in scope:** any change to initiative math, combat/turn/pass mechanics, damage application, the undo model, session-sync state shape (`SharedCombatState` / `SharedParticipantState`), the player-view log renderer, or the GM roll-visibility gate. No new `SharedLogEntry` fields. Nothing in `src/Combat/`, `src/Matrix/`, `src/Magic/` changes except as noted under Open Decision 4.

**Stop point — item 4 is rules-dependent and belongs in `/feature`, not here.** See "Rules dependency" below. Items 1, 2, 3, 5, 6 are pure UI/ergonomics and can proceed on this spec.

---

## Rules dependency (item 4)

Investigated the status model as instructed. The finding is not "ambiguous" — the mechanic **does not exist in the codebase at all**:

- `src/Combat/Participants/StatusEnum.ts` (whole file) is `Waiting=0, Active=1, Delaying=2, Finished=3, OOC=4`. There is no `Unconscious` and no `Dead`. `OOC` is dead code (ARCHITECTURE.md §8 confirms nothing in `src/` ever assigns it).
- The only "down" signal is the computed getter `Participant.ooc` (`Participant.ts:321-334`):
  ```ts
  if (this._ooc) return true;
  if (this.hasPainEditor) return this.physicalDamage >= this.physicalHealth;
  return this.physicalDamage >= this.physicalHealth || this.stunDamage >= this.stunHealth;
  ```
  It is a single boolean. It does **not** distinguish Unconscious from Dead, and it does not distinguish stun-track fill from physical-track fill.
- `overflowHealth` exists as a stored field (`Participant.ts:373-379`, default 4) and is rendered as extra Condition Monitor cells (`condition-monitor.component.ts:64-70`, `getCellStyle`'s `"overflow": n > this.health`), but **nothing anywhere in `src/` ever compares `physicalDamage` against `physicalHealth + overflowHealth`.** Grepping `nconscious|[Dd]ead|[Oo]verflow` across `src/` returns only the `overflowHealth` field plumbing and CSS. There is no death threshold implemented, cited, or ruled on.
- `RULINGS.md` has three entries (Initiative floor, astral dice, GM roll visibility). None touches unconsciousness, overflow or death. `docs/` has no match for `unconscious`/`death`/`overflow`.

So implementing `GM: {name} is down (Physical Overflow exceeded)` requires deciding, from the rulebook, (a) which track and threshold makes a character Unconscious, (b) which makes them Dead, (c) whether `>=` or `>` on the overflow boundary, (d) how Pain Editor interacts, (e) whether stun overflow bleeds into physical. All five are page-citable SR5 facts not permitted to be supplied from memory, and none is currently in the repo.

**Recommendation: split item 4 out into its own `/feature` request** ("Unconscious/Dead status detection"), scoped to add the domain-level signal (and a RULINGS.md entry), with the Action Log line as its last acceptance criterion. Items 1/2/3/5/6 ship independently of it. Everything below marked *(item 4)* is the shape the hook should take **once** that feature lands, not a licence to invent thresholds now.

---

## Current behaviour

All file references are `src/app/battle-tracker/battle-tracker.component.ts` unless stated.

**Log plumbing**
- `appendSharedLog(actor, text, extra?)` — line 1157. **Returns immediately if `shareRoomCode` is falsy** (1158-1160). Builds the entry, reserves a local order slot (`assignLogOrder`), and sends it to the server; the GM's own pane gets it back via the echo handler.
- `appendGmOnlyLog(actor, text, extra?)` — line 1183. Writes locally, tagged `hiddenFromPlayers`, never sent.
- `appendParticipantRollLog(p, logText, presetHidden?)` — line 202. Routes a participant-attributed line through the GM roll-visibility gate; player-owned participants are never hidden.
- Echo handler, line 759-766: on receiving an entry back it inserts it, and **only writes a `LogHandler` (local Action Log) line when `entry.actor !== "GM"`** (763-765).
- Rendering, `battle-tracker.component.html:500-501`: `<strong>{{ entry.actor }}</strong>: <span [innerHTML]="formatLogText(...)">`. So actor and text are concatenated as `Actor: text`.
- `getLogTextClass` (`src/app/shared/log-formatter.ts:163-174`) classifies by regex on the text: glitch → action (`/Act_Click:|Action_Click:|Interrupt|Free:|Simple:|Complex:|\bAct\b/i`) → roll (`/roll/i`) → system.

**Item 1 sites**
- `register_character`, line 837: `this.appendSharedLog("GM", \`Registered ${characterName}\`);`
- `configure_deck` deck-removed branch, line 859: `this.appendSharedLog("GM", \`${targetName} deck removed\`);`
- `claim_character`, line 952: `this.appendSharedLog("GM", \`Claimed ${target.name}\`);`

**Item 2** — `logRolledTotalClamp`, lines 3418-3429, text at 3424-3427:
```
`rolled total clamped to ${clamped} (${p.dices}D6 max); `
+ `initiative score reads ${effectiveScore} - display and Score do not `
+ `reconcile (attribute ${p.initiativeAttribute} + rolled total)`
```
Emitted via `appendParticipantRollLog(p, logText, this.isGmRollHiddenFromPlayers())` — the visibility decision is *read*, not consumed (documented 3414-3417). Sole caller: `enforceParticipantRollBounds()` line 3383-3391.

**Item 3** — `release_claims`, lines 956-972. Deletes owner entries in a loop, sets `changed`, calls `sort()`. **Zero log output of any kind** — no `appendSharedLog`, no `LogHandler`.

**Item 4** — `flushDamageLog()`, lines 1415-1449. Iterates all participants, compares `lastKnownDamage.get(id)` against current, emits `GM: {name} took Physical N, Stun M` / `... healed ...` (1441, 1444), then re-seeds the map (1447). Reached only via `recordDamageChanges()` (1405) ← `syncSharedState()` (1095), on a 500ms debounce. `syncSharedState` returns early with no `shareRoomCode` (1092), so the whole damage-log pass is session-only.

**Item 5** — `btnLeaveCombat_Click` (2116-2125) and `btnEnterCombat_Click` (2127-2132). Each writes one `LogHandler.log` line, calls `UndoHandler.StartActions()`, calls `sender.leaveCombat()` / `sender.enterCombat()`, and `sort()`. No `appendSharedLog`. `Participant.leaveCombat()` sets `this.ooc = true`; `enterCombat()` sets `this.ooc = false` (`Participant.ts:632-638`) — these write the `_ooc` backing field only; the `ooc` *getter* still returns true from damage thresholds. `getSharedParticipants()` filters OOC participants out of the broadcast list entirely (ARCHITECTURE.md §7), which is why the row vanishes from the player view with no explanation.

**Item 6** — `confirmAndForceRollOutstanding()` (3174-3186) awaits a confirmation dialog then calls `rollOutstandingInitiative(true)` (3135-3172), which builds `targets` itself (3138-3146: `!ooc && diceIni <= 0`, plus the player filter), resolves one batch visibility decision (3156-3157), and calls `rollAndLogInitiative` per target. No batch marker. `getPendingOutstandingRollCount()` (3086-3088) uses **exactly** the `targets` predicate for the `includePlayers = true` case.

---

## Affected paths

### Sites that must change

| # | Location | Change |
|---|---|---|
| 1a | `battle-tracker.component.ts:837` | attribution |
| 1b | `battle-tracker.component.ts:859` | attribution |
| 1c | `battle-tracker.component.ts:952` | attribution |
| 2 | `battle-tracker.component.ts:3424-3427` (+ doc comment 3393-3417) | wording |
| 3 | `battle-tracker.component.ts:962-967` | new entry in loop |
| 4 | `battle-tracker.component.ts:1415-1449` + `lastKnownDamage` value shape at `:444` | new entry — **blocked, see Rules dependency** |
| 5 | `battle-tracker.component.ts:2116-2132` | two new entries |
| 6 | `battle-tracker.component.ts:3174-3186` | one new entry |

### Same pattern, not mentioned in the request — found by exhaustive search

Audited every `appendSharedLog` call site (18 of them) and every branch of `handleSessionCommand` (802-1089).

**A. `command.player` is never a human name.** This is the load-bearing finding and it invalidates the request's stated approach for items 1 and 3. `src/app/player-view/player-view.component.ts:116`:
```ts
this.playerToken = `pl-${Math.random().toString(36).slice(2, 10)}`;
```
Every command the player client sends uses `player: this.playerToken` (many call sites), and `joinAsPlayer(room, this.playerToken)` at :162 means the *server's* `socket.data.playerName` is the token too. `participantOwners` values are tokens (`battle-tracker.component.ts:1662`), and `SharedParticipantState.ownerName` carries the token (`:1119`). There is no player-name input anywhere in `player-view.component.ts` (fields at :22-56: `room`, `playerToken`, `characterName`, …).

Routing `command.player` into the actor slot as requested would produce log lines reading **`pl-k3f9a2b1: Registered Wombat`**. That is strictly worse than `GM:`.

**B. The existing convention for player-originated entries is the *character* name, not the player.** Every other player-command handler already does this deliberately: `roll_submission` delta → `target.name || "Player"` (:989); `roll_submission` full → `target.name || "Player"` (:1023); `delay` → `target.name || "Player"` (:1059); `act` → `performAct(target, …, target.name || "Player")` (:1045, consumed at :1962/1969); `interrupt` → `btnAction_Click(target, action, target.name || "Player")` (:1074, consumed at :2140). The three sites in item 1 are the **odd ones out against five existing siblings**, which is the real defect. The fix is to bring them onto the existing convention, not to introduce a sixth attribution scheme.

**C. Two further player-command branches log nothing to the shared log** — same defect class as item 3, not mentioned in the request:
- `configure_astral` (906-933): `isAstral` on/off and projection toggles write only `LogHandler.log` (:917, :923), which players never see. Astral projection changes Initiative Dice and Score.
- `configure_deck` jack-in / jack-out / stat-edit branches (872-902): only the *deck-removed* branch logs. A player jacking into Hot-Sim mid-combat changes their dice count and Score with no shared-log trace at all.

Recommend folding both into this change (Open Decision 3). They are the same one-line-per-branch fix and leaving them out means shipping a half-consistent log.

**D. `btnRollRemainingNonPlayer_Click` (3118-3121) has the same missing-batch-marker defect as item 6.** It calls `rollOutstandingInitiative(false)` and produces an identical undifferentiated cascade of per-participant roll lines. If item 6's rationale ("no marker distinguishing a batch from an organic cascade") is valid, it applies here too — arguably more, since this is the button the GM presses every turn.

**E. Only one clamp-message site.** Searched for the clamp text and for other "assertion-phrased" log strings; `logRolledTotalClamp` is the only one, and `enforceParticipantRollBounds` is its only caller. No duplication.

### Sites that read the state being changed

- `getLogTextClass` / `formatLogText` (`log-formatter.ts:163-228`) — regex-driven on text. New/changed strings must be checked against it (see AC13).
- Echo handler `:763` — `entry.actor !== "GM"` gates the local `LogHandler` mirror. Changing an actor from `"GM"` to a character name **adds a local Action Log line that does not exist today**.
- `mergeHiddenLogEntries` (:2218) / `reseedLogOrder` (:2234) — unaffected (no new hidden entries proposed).
- `player-view.component.ts:665,679` — renders the same entries; unaffected structurally.

---

## Proposed approach

**Items 1 + 3 — one shared decision, applied at four sites.** Attribute to the *character* name via the existing `target.name || "Player"` idiom, and reword the texts so actor+text reads naturally under the `Actor: text` renderer:

- `:837` → actor `characterName`, text `"joined the session"` (actor `Registered {characterName}` would render `Wombat: Registered Wombat`).
- `:859` → actor `targetName`, text `"deck removed"`.
- `:952` → actor `target.name || "Player"`, text `"claimed by a player"`.
- `:962-967` → inside the existing loop, per participant actually released: actor `participant.name || "Participant"`, text `"claim released"`.

These are four call sites of one convention, not four independent fixes. Rather than four literals, add one private helper next to `appendSharedLog`, e.g. `appendPlayerCommandLog(target: IParticipant, text: string)` that resolves the actor from the participant and forwards to `appendSharedLog` — that is the choke point the existing five sibling sites should also be migrated onto in a follow-up, so a future handler cannot reintroduce the `"GM"` literal.

**Item 2** — replace the string literal at 3424-3427 only. Keep `appendParticipantRollLog(p, logText, this.isGmRollHiddenFromPlayers())` exactly as-is (visibility read, not consumed). Update the doc comment at 3393-3417, which currently describes the old wording's claims. See Open Decision 2 on whether to keep the "do not reconcile" clause.

**Item 4 (blocked)** — when the status feature lands, the hook belongs **inside** `flushDamageLog`'s existing loop, between the damage/heal lines (1445) and the map re-seed (1447), reading the new domain signal. Critically: **extend the existing `lastKnownDamage` value shape** (`:444`, `{ physical, stun }` → `{ physical, stun, status }`) rather than adding a seventh side-map. ARCHITECTURE.md §8 flags manual side-map bookkeeping as a live hazard, and `lastKnownDamage` is already correctly maintained at all nine sites (`:1422`, `:1447`, `:1549`, `:1624`, `:1681`, `:2033`, `:2071`, `:2548`, `:2753-2754`); a new map would have to replicate every one with no compiler enforcement. Re-seed the status **every flush unconditionally**, in both directions, so an undo/heal back below the threshold re-arms the transition.

**Item 5** — add `appendSharedLog("GM", …)` to both handlers, after the `leaveCombat()`/`enterCombat()` call so the log reflects what actually happened. `enterCombat()` only clears `_ooc`; if `p.ooc` is still true from damage the participant does *not* reappear in the player list, so the re-entry line must be guarded on `!sender.ooc` after the call (Open Decision 5).

**Item 6** — capture the count **after** the `await confirmed` and **before** `rollOutstandingInitiative(true)`, using `getPendingOutstandingRollCount()` (whose predicate is identical to `rollOutstandingInitiative`'s `targets` filter for `includePlayers = true`). Emit the summary before the batch, so `assignLogOrder` places it ahead of the individual roll lines. Suppress when the count is 0.

---

## Acceptance criteria

1. `register_character` produces exactly one shared log entry whose `actor` is the registered character's name and whose `actor` is not `"GM"` and does not match `/^pl-/`.
2. `configure_deck` with `isMatrix: false` produces exactly one shared log entry attributed to the target participant's name, not `"GM"` and not the player token.
3. `claim_character` produces exactly one shared log entry attributed to the claimed participant's name, not `"GM"` and not the player token.
4. `release_claims` for a player owning N claimable participants produces exactly N shared log entries, one per released participant, each attributed to that participant's name. A `release_claims` that releases nothing produces zero entries.
5. No log entry produced anywhere in `handleSessionCommand` contains the raw value of `command.player`.
6. The rolled-total-clamp entry no longer contains the substring `"do not reconcile"` (unless Open Decision 2 is answered "keep it"), and still contains: the clamped rolled total, the string `D6` preceded by `p.dices`, and `p.getCurrentInitiative()`.
7. The rolled-total-clamp entry never contains the raw `currentInitiativeScore` when it differs from `getCurrentInitiative()` (preserves the existing regression coverage at `battle-tracker.component.spec.ts:921`).
8. With the GM roll-visibility gate hiding GM rolls, the reworded clamp entry is still `hiddenFromPlayers: true` and still not sent to the server; with it visible, still sent. The clamp entry still does not consume the "hide next roll" one-shot.
9. `btnLeaveCombat_Click` produces exactly one shared log entry `GM: {name} left combat`; `btnEnterCombat_Click` produces exactly one `GM: {name} re-entered combat` **only when the participant is actually back in combat afterwards** (`!sender.ooc`).
10. `confirmAndForceRollOutstanding` with N outstanding participants produces exactly one summary entry naming N, ordered before all N per-participant roll entries in `sharedLogEntries`. N equals the number of participants whose `diceIni` actually changed.
11. Force-rolling with zero outstanding participants (or cancelling the dialog) produces zero summary entries.
12. Every new/changed entry produces zero output when `shareRoomCode` is empty (inherited from `appendSharedLog`'s early return) — no new local-only logging path is introduced.
13. Every new/changed entry text, passed through `getLogTextClass`, yields the intended class and does not accidentally land in `log-text-action` via the `\bAct\b` / `Interrupt` alternation.
14. `npm test` passes; `npm run lint` passes.
15. *(item 4, deferred — out of scope for this implementation)* Not implemented under this spec.

---

## Regression risk

- **Two existing specs break on item 2.** `src/scenarios/combat-log-readability.spec.ts:445` (`e.text.includes('rolled total clamped')`) and `:461` (`toContain('rolled total clamped')`) assert the literal old prefix. Both must be updated to the new wording. `battle-tracker.component.spec.ts:884/897/918/936/953` match `/clamped/i`, which survives if the new text keeps the word "clamped" — it does under the proposed wording. `:886` `toContain('26')` and `:920` `toContain('15')` survive (`Score is 26`). `:921` `not.toContain('25')` survives.
- **New local Action Log lines.** Because the echo handler at `:763` mirrors to `LogHandler` only when `actor !== "GM"`, items 1a/1b/1c and item 3 will start writing lines into the GM's *local* Action Log pane that do not exist today. Intended, but it changes `LogHandler.logbook` contents and any spec using a `logDuring`-style helper (`battle-tracker.component.spec.ts:865`) over a region that includes a session command.
- **Server-driven `release_claims` on disconnect.** `server.js:275-310` emits a synthetic `release_claims` (with `player = socket.data.playerName`, i.e. the token) whenever a player socket drops while owning a claimable participant. Item 3 therefore fires on **every player disconnect, tab refresh and network blip**, not only on a deliberate release. `player-view.component.ts:139-145` also fires one on `ngOnDestroy`, so a player navigating away produces one from the client *and* one from the server. Wording must not imply intent (hence `"claim released"`, not `"Released claim on …"`), and AC4's "exactly N" must tolerate the double-fire being idempotent — the second pass finds no owner and releases nothing.
- **`gm-npc-rolls.spec.ts` uses `release_claims` four times** (`:335`, `:575`, `:591`, `:631`) with `shareRoomCode = 'ABC123'` set (`:70`), so `sent` will now receive entries. Checked each: `:326-344` never inspects `sent`; `:568-585` clears `sent` at `:580` after the release; `:587-604` clears at `:599`. **No break** — but any future edit to those tests must keep the clear.
- **Item 6 vs. hidden batches.** `rollOutstandingInitiative` can resolve `hiddenForBatch = true`, sending every individual roll to `appendGmOnlyLog`. A summary emitted through `appendSharedLog` would then be *visible* to players while the rolls it summarises are not — telling players "the GM force-rolled 4 characters" and nothing else. See Open Decision 6.
- **Undo does not resync.** `btnUndo_Click` (`:2285-2288`) calls `UndoHandler.Undo()` and nothing else — no `sort()`, no `syncSharedState()`. So an undo produces no immediate log output; the damage flush (and any item-4 status hook) lands on the *next* mutation that syncs. This is existing behaviour for the `took`/`healed` lines and must not be "fixed" here.
- **`participantIds` identity churn.** Item 4's status memory is keyed by participant id via `lastKnownDamage`; the Matrix/astral type-swap path preserves the id (`:2740`, `:2753-2754`), so extending the existing map inherits correct behaviour for free. A separate map would not. (Not actionable until item 4 is unblocked.)
- **No dedicated `handleSessionCommand` spec exists** (ARCHITECTURE.md "Test coverage"). Items 1 and 3 have no direct coverage today; new tests belong in `src/scenarios/` per the stated convention.

---

## Scenarios to survive

**S1 — Ordinary: player registers, claims, rolls.**
Player joins room, submits `register_character` for "Wombat", then `claim_character` on a pre-made "Wombat" row, then a roll.
Expected log, in order: `Wombat: joined the session` → `Wombat: claimed by a player` → `Wombat: initiative roll: REA(5) + INT(4) + [6, 3] (9) = 18`. No `GM:` prefix, no `pl-` token anywhere, three consistent character-attributed lines that a player reading the log recognises as themselves.

**S2 — Edge: force-roll with a stale display total.**
Combat started. A decker at 3D6 rolled 18, then jacked out to 1D6 (small lost-dice roll), leaving `diceIni = 16` over the new max of 6 and holding Full Defense. GM edits an unrelated name field → `enforceParticipantRollBounds` clamps to 6 and logs. GM then force-rolls 2 remaining NPCs.
Expected: one clamp line `Decker: initiative roll clamped to 6 (max 1D6); Score is 15` — 15 being `getCurrentInitiative()`, never the raw 25 — followed by `GM: Force-rolled initiative for 2 outstanding participants`, then exactly two per-participant roll lines. The summary count is 2, not 3: the decker already has `diceIni > 0` and is not in `targets`.

**S3 — Undo: GM mis-clicks Leave Combat.**
GM clicks Leave Combat on "Ganger Alpha" mid-pass, log shows `GM: Ganger Alpha left combat`, the row vanishes from the player view. GM hits Undo. `UndoHandler.Undo()` restores `_ooc = false`; **no log line is emitted** (undo does not sync) and the row does not reappear on player screens until the next action that calls `sort()`. This is existing behaviour and the spec does not change it — but the log now contains a "left combat" entry with no matching return, which a GM reading back will see. AC9's guard is what stops the mirror-image lie: clicking Enter Combat on a participant whose `ooc` getter is still true from damage must **not** log "re-entered combat", because they haven't.

**S4 — Live at the table, mid-combat, players waiting.**
Pass 2. A player's laptop sleeps. Server fires `release_claims`; the log gets `Wombat: claim released` and the row goes unowned but stays visible (still `claimable`). The GM marks the Wombat with unconscious-level damage — the damage flush emits `GM: Wombat took Physical 6` (item 4's status line is deferred, out of scope here). Thirty seconds later the player reconnects and sends `register_character` again, re-claims, and the GM force-rolls the two NPCs still outstanding. The sequence reads as a coherent narrative in the shared log with no `GM:`-attributed line claiming credit for something a player did, and no `pl-8f2a91bc` visible to anyone.

**S5 — Duplicate/rapid release.** Player closes the tab: `ngOnDestroy` sends `release_claims` and the socket drop makes the server send a second. Expected: N entries from the first, 0 from the second (no owners left to release). The log must not double every disconnect.

---

## Open decisions

**Resolved 2026-08-01 — all defaults accepted, including deferring item 4 to a separate `/feature` request.**

1. **Actor for player-command entries: character name (recommended) vs. player token vs. keep `"GM"`.**
   *Recommended default: character name*, matching the five existing sibling handlers (`:989`, `:1023`, `:1059`, `:1045`, `:1074`). The original request asked for `command.player`, but that value is a random opaque token (`player-view.component.ts:116`) and would render as `pl-k3f9a2b1: Registered Wombat`. There is no human player name in the system to use. If real player names are wanted in the log, that is a separate feature (add a name field to the player join form and thread it through `joinAsPlayer`, `ownerName`, and `participantOwners`) and should be scoped on its own.

2. **Does the clamp line keep saying the two numbers disagree?**
   The proposed wording drops both `- display and Score do not reconcile` and `(attribute {n} + rolled total)`. That is the clause that tells a GM *why* the line exists; without it the line states two numbers side by side and leaves the reader to spot the gap. *Recommended default: use `initiative roll clamped to {clamped} (max {dices}D6); Score is {effectiveScore} (attribute {attr} + rolled total do not match)`* — GM-facing phrasing as requested, but the mismatch stays stated. If the shorter form as originally proposed is preferred, that is fine too; it is a judgment call, not a correctness issue.

3. **Fold in `configure_astral` and the `configure_deck` matrix branches (finding C)?**
   *Recommended default: yes.* Same defect, same one-line fix, and shipping items 1+3 without them leaves the log inconsistent in exactly the way this change is meant to fix. If declined, add them to `docs/FEATURE-BACKLOG.md` explicitly rather than letting them lapse.

4. **Add `btnRollRemainingNonPlayer_Click` to item 6 (finding D)?**
   *Recommended default: yes*, e.g. `GM: Rolled initiative for {N} non-player participants` using `getPendingNonPlayerRollCount()`. It is the button pressed every turn; the force-roll path is the rarer one.

5. **`GM: {name} re-entered combat` when `ooc` is still true from damage.**
   *Recommended default: suppress the line* (guard on `!sender.ooc` after `enterCombat()`), because the participant does not reappear in the player-visible list and the line would be false.

6. **Visibility of the item-6 batch summary when the batch itself is hidden.**
   *Recommended default: route the summary through the same batch decision* — if `hiddenForBatch` is true, emit the summary via `appendGmOnlyLog`, else `appendSharedLog`. This needs the decision resolved in `rollOutstandingInitiative` (line 3157) to be visible to `confirmAndForceRollOutstanding`, which means either returning it from `rollOutstandingInitiative` or hoisting the summary emission inside it. Hoisting it inside is cleaner and also makes Open Decision 4 a one-line addition. RULINGS.md's GM-roll-visibility entry says GM rolls default visible with an opt-out; a summary that leaks the existence of hidden rolls partially defeats the opt-out.

7. **Wording of `register_character` when re-sent.**
   `upsertPlayerParticipant` handles a *re-registration* (a player editing their sheet, or reconnecting) through the same path, so `Wombat: joined the session` fires again on every re-submit. *Recommended default: accept it* — a re-register genuinely is the player re-announcing themselves, and suppressing it needs a "have we seen this token before" check that duplicates state `participantOwners` already holds. If it proves noisy at the table, gate on whether the participant already existed.
