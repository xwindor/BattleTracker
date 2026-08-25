# Spec: the player view opens on a claim-or-create chooser

## Request

Replace the player view's always-fully-expanded "Claim Or Create Character"
panel with a two-button chooser — **Claim a Character** / **Create a New
Character** — that reveals only the chosen branch, with a way back.

**Not in scope:** the `register_character`, `claim_character`,
`release_claims` or `claim_denied` command payloads or semantics; anything in
`server.js` or `server/`; `SessionSyncService` and every wire type on it
(`SharedCombatState`, `SharedParticipantState`, `SharedGmState`,
`SharedLogEntry`); the GM component (`battle-tracker.component.ts` /
`.html`) including `upsertPlayerParticipant`, `handleSessionCommand`,
`btnToggleClaimable_Click`, `btnReleaseClaim_Click`, `denyClaim` and
`getSharedParticipants`; the fields, defaults, validation or layout of the
character-creation form itself; the initiative-order list, the dice roller, the
Action Log pane, the "Your Character" card, the cyberdeck panel or the Awakened
panel; player identity/token persistence across reloads; multi-character
ownership; anything in `ARCHITECTURE.md` §1–§7 concerning combat state.

**Not rules-dependent.** No SR5 mechanic, number or timing question is
involved. Claiming and ownership are an app-level concept with no rulebook
counterpart — `ARCHITECTURE.md` §3 states outright that there is no PC/NPC
distinction in the domain model and that "player-controlled" is tracked entirely
outside the combat engine. The one adjacent idea that *is* rules-dependent —
deriving a fuller character sheet's Condition Monitor size or Initiative Dice
from attributes — is excluded by Open Decision 1 and belongs in `/feature`.

---

## Current behaviour

### The panel

`src/app/player-view/player-view.component.html`:

| Lines | What |
|---|---|
| `:1-27` | Room-code card: room input (`:7`, disabled while `connected`), Join button (`:10-12`), `error` (`:15-17`), `info` (`:18-20`), the "GM not connected" warning (`:21-25`, `data-testid="gm-not-connected"`) |
| `:29` | `@if (connected && state)` — gates **everything** below, including the panel this spec changes |
| `:30` | `@if (ownParticipants.length === 0)` — the onboarding gate |
| `:31-104` | The card. Header text `Claim Or Create Character` at `:32` |
| `:34-54` | `@if (unclaimedParticipants.length > 0)` — the claim sub-panel: `.cli-claim-panel` wrapper (`:35`), label (`:36`), `<select [(ngModel)]="selectedClaimParticipantId">` (`:38-48`) whose options read `#{{order}} {{name}}{{ooc ? ' (Out of Action)' : ''}}` (`:46`), Claim button `(click)="claimSelectedCharacter()"` (`:49-51`) |
| `:55-96` | The create form, rendered **unconditionally** whenever the card is open: `.cli-create-grid` (`:55`) holding two `.cli-create-row`s — Character/Init Dice/Overflow/Reaction/Intuition/Edge (`:56-85`, with a commented-out "Will to live" cell at `:81-84`) and Physical CM/Stun CM (`:86-95`) |
| `:97-101` | `Create New Character` button, `(click)="createCharacter()"` |
| `:105+` | Initiative Order card, Dice Roller card, Action Log card, "Your Character" card — all outside this spec |

So the claim sub-panel is conditional on there being something to claim; the
create form is not conditional on anything. Both render simultaneously.

### The component

`src/app/player-view/player-view.component.ts`:

- `:22` `room = ""`; `:23` `private playerToken = ""`; `:24-31` the create-form
  fields (`characterName`, `initiativeDice`, `edgeRating`, `reaction`,
  `intuition`, `overflowHealth`, `physicalHealth`, `stunHealth`); `:44`
  `connected`; `:51` `gmConnected`; `:52` `error`; `:53` `state`; `:58` `info`;
  `:59` `selectedClaimParticipantId`.
- `:122-130` `ngOnInit()` — mints `this.playerToken = \`pl-${Math.random().toString(36).slice(2, 10)}\``
  **on every component init**, reads `?room=` into `this.room` (prefill only —
  it does not auto-join), reads `bt.playerNotifyMuted.v1` from `localStorage`.
  **There is no other `localStorage` use and the token is never persisted.**
- `:132-154` `ngOnDestroy()` — sends `release_claims` if still connected, then
  `session.disconnect()`.
- `:164-249` `join()` — `session.connect()`, `await session.joinAsPlayer(room, playerToken)`,
  sets `connected`/`gmConnected`, `applyIncomingState(state)`, seeds `log`,
  attaches `onState`/`onLog`/`onCommand`/`onGmPresence`/`onReconnect`/
  `onDisconnect`/`onSessionClosed`. Ends at `:243-245` with
  `if (this.ownParticipants.length === 0) { this.info = "Claim a character from the list or create a new one."; }`
- `:255-269` `rejoinAfterReconnect()` — same `joinAsPlayer` call with the **same
  token** (transport reconnect keeps identity), pulls state and log, sets
  `info = "Reconnected."`.
- `:271-289` `createCharacter()` — fire-and-forget `register_character` command
  carrying the eight form fields plus `isMatrix: false`; sets
  `info = "Create character request sent."`. No ack, no validation, no guard on
  `gmConnected`, no guard on an empty name.
- `:528-545` `claimSelectedCharacter()` — clears `info` and `error`; if
  `selectedClaimParticipantId` is empty sets `info = "Select a character to claim."`
  and returns; otherwise sends `claim_character` and sets
  `info = "Claim request sent."`. Again no ack and no `gmConnected` guard.
- `:699-701` `private get allParticipants()` — `state?.participants` sorted by
  `order`.
- `:711-713` `get visibleParticipants()` — `allParticipants.filter(p => !p.ooc)`.
- `:722-725` `get ownParticipants()` — `allParticipants.filter(p => (p.ownerName||"").toLowerCase() === playerToken.toLowerCase())`.
- `:733-735` `get unclaimedParticipants()` — `allParticipants.filter(p => p.claimable === true && !p.ownerName)`.
- `:737-739` `get primaryCharacter()` — `ownParticipants[0] ?? null`.
- `:1004-1018` `private findReleasedOwnCharacters(next)` — compares the **current**
  `ownParticipants` against the incoming array; a still-present participant that
  lost its `ownerName` is reported.
- `:1020-1066` `private applyIncomingState(next)` — combat-started transitions,
  then `const isFirstState = this.state === null`, then
  `const releasedNames = this.findReleasedOwnCharacters(next)` (**before**
  `this.state = next` at `:1038`), then the released-notice `info` at `:1039-1044`,
  then deck/astral field restoration off `primaryCharacter` at `:1047-1065`.

### Styling

`src/styles.scss:1399-1506` defines every `cli-*` class the card uses:
`.cli-claim-panel` (`:1399`), `.cli-claim-panel .form-label` (`:1405`),
`.cli-claim-row` (`:1413`), `.cli-create-grid` (`:1417`), `.cli-create-row`
(`:1422`), `.cli-create-cell` (`:1429`, `:1437`, `:1441`), `.cli-create-cell
.form-label` (`:1445`), `.cli-create-cell .form-control` (`:1454`, `:1462`,
`:1466`), `.cli-field-label` (`:1471`), and the seven per-field label colours
`.cli-label-character` / `-initdice` / `-edge` / `-reaction` / `-intuition` /
`-overflow` / `-physical` / `-stun` (`:1475-1506`). None of these live in
`player-view.component.css`.

### Identity, and what a reload does

- The token is minted in `ngOnInit` and is not stored anywhere. **A full page
  reload produces a new token**, so `ownParticipants` is empty and the player is
  a stranger to the room.
- The reloading tab's old socket disconnects. `server.js:1113-1123` reads
  `socket.data.room` / `socket.data.playerName` and calls
  `releasePlayerClaims(room, playerName)` (`server.js:401-444`), which strips
  `ownerName` from any `claimable` participant in `session.state.participants`
  **and** from `session.state.oocOwnership`, persists via `touchSession`, and
  broadcasts both a fresh `session:state` and a synthetic
  `session:command release_claims`.
- The GM tab's `release_claims` branch
  (`battle-tracker.component.ts:2950-2976`) drops the owner from
  `participantOwners` and logs one line per released participant.
- Net effect: **a reload always requires a re-claim**, and the character is
  genuinely free again by the time the reloaded tab joins.
- A *transport* reconnect is different: `rejoinAfterReconnect()` reuses the same
  in-memory token, so identity survives a server restart or a dropped
  connection without a re-claim.

### What the server does with a player join

`server.js:855-886` (`player:join`): looks up `sessions.get(room)`, refuses with
`roomNotFoundReason(room)` if absent, calls `detachSocketFromPreviousRoom`,
joins, sets `socket.data.role = "player"` / `.room` / `.playerName`, and acks
`{ ok, state: playerFacingState(session.state), log, playerName, gmConnected }`.
`playerFacingState` (`:192-198`) strips only `oocOwnership`.

`session.state` is `null` for a room that has never been pushed to
(`getOrCreateSession`, `server.js:311-329`), so `state` in that ack can be
`null`. In practice `btnCreateShareSession_Click`
(`battle-tracker.component.ts:1124`, `syncSharedState()` at `:1181`) pushes in
the same tick as the create, and a room loaded from disk always has content, so
the null window is sub-second. See Open Decision 8.

`session:command` (`server.js:996-1030`) validates role, allowlist, the
`command.player`-matches-`socket.data.playerName` rule and an 8 KB cap, then
**broadcasts to the room with no ack**. Nothing tells the player whether their
`claim_character` or `register_character` was ever applied; only the GM tab
applies it (`ARCHITECTURE.md` §7, "Commands").

---

## Affected paths

**I searched the whole repo for every surface that offers a claim or a character
creation to a player** — `unclaimedParticipants`, `createCharacter(`,
`claimSelectedCharacter(`, `selectedClaimParticipantId`, `Claim Or Create`,
across `src/`, `server.js`, `server/` and `docs/`. **There is exactly one, and
it is the panel described above.** The only other hits are the two getters'
definitions/doc comments in the same component, one spec file, and prose in
`ARCHITECTURE.md:1709`, `docs/APP_DOCUMENTATION.md:295`,
`briefs/persistent-rooms.md:398,418` and
`briefs/gm-reconnect-state-loss-spec.md:91`. There is no second claim UI, no
second create form, and no GM-side equivalent to keep in step.

Files that **must** change:

1. **`src/app/player-view/player-view.component.html`** — the block at `:30-104`
   only. Nothing above `:29` or below `:104` changes.
2. **`src/app/player-view/player-view.component.ts`** — new state and methods
   (below), plus edits to exactly four existing members: `join()` (`:243-245`),
   `rejoinAfterReconnect()` (`:255-269`), `applyIncomingState()` (`:1020-1066`),
   and — only if Open Decision 5 is taken — `createCharacter()` (`:271-289`) and
   `claimSelectedCharacter()` (`:528-545`).
3. **`src/scenarios/persistent-rooms.spec.ts`** — one test only:
   `'badges a downed character on its own claim-list entry, so nobody claims one
   thinking it is up'` at `:3451-3459`. It sets `component.connected = true`,
   calls `applyIncomingState(...)`, calls `detectChanges()` and then queries
   `fixture.nativeElement.querySelectorAll('option')`. Under the chooser the
   `<select>` is not rendered until the claim branch is opened, so this test
   fails unless it first puts the component on the claim branch. **This is the
   only DOM-level assertion against the panel anywhere in the suite** — every
   other player-view test in that file (`:3270-3275`, `:3300`, `:3308`,
   `:3354-3361`, `:3413-3432`, `:3434-3449`, `:3461-3470`) asserts on getters or
   on `.player-participant` / `[data-testid="player-badge-ooc"]` /
   `[data-testid="gm-not-connected"]`, none of which move.
4. **`src/scenarios/player-join-claim-or-create.spec.ts`** — new file, per the
   `src/scenarios/` convention (`ARCHITECTURE.md`, "Test coverage"). Must live
   under `src/` or Karma will never compile it.
5. **`docs/APP_DOCUMENTATION.md`** — §4 "Join flow", `:309-325`. Step 3
   currently reads "If they do not own a character: claim an unclaimed claimable
   character, or create a new character" and must describe the chooser.

Files that must **not** change, verified by reading them: `server.js`,
`server/room-guards.js`, `server/session-store.js`, `server/gm-state-channel.js`,
`src/app/services/session-sync.service.ts`,
`src/app/battle-tracker/battle-tracker.component.ts` and `.html`,
`ARCHITECTURE.md`.

Files that change only if a decision is taken: **`src/styles.scss`** — add a
`.cli-join-choice` block near `:1399` **only** if the two buttons need layout
beyond Bootstrap's `d-flex gap-2 flex-wrap`. Prefer no new CSS. Do not touch the
existing `cli-*` rules; the claim and create markup they style moves but is
otherwise unchanged.

---

## Proposed approach

One choke point, in the component, with the template reading it. Do not spread
the branch decision across the template with compound conditions.

### Component state

Add to `PlayerViewComponent`:

- `joinChoice: "none" | "claim" | "create" = "none"` — public, so tests can set
  it directly.
- `private hadOwnCharacter = false` — edge-detection for the reset rule below.

### Component methods

- `chooseClaim(): void` — `this.joinChoice = "claim"; this.error = ""; this.info = "";`
- `chooseCreate(): void` — `this.joinChoice = "create"; this.error = ""; this.info = "";`
- `backToJoinChoice(): void` — `this.joinChoice = "none"; this.selectedClaimParticipantId = ""; this.info = ""; this.error = "";`
- `get canClaimAnything(): boolean` — `this.unclaimedParticipants.length > 0`.

### Reset rules — edge-triggered, never level-triggered

This is the part most likely to be got wrong. `applyIncomingState` runs on
**every** broadcast, several times a minute during play. Resetting `joinChoice`
whenever `ownParticipants.length === 0` would close the create form under a
player's fingers each time the GM sorts the list.

- In `join()`: set `joinChoice = "none"` immediately after `this.connected = true`.
- In `rejoinAfterReconnect()`: leave `joinChoice` alone. The token is unchanged,
  so a player mid-form keeps their form.
- In `applyIncomingState(next)`, **after** `this.state = next` (`:1038`) so the
  getters read the new state: compute `const ownsNow = this.ownParticipants.length > 0;`
  then `if (this.hadOwnCharacter && !ownsNow) { this.joinChoice = "none"; this.selectedClaimParticipantId = ""; }`
  then `this.hadOwnCharacter = ownsNow;`. Place this after the existing
  released-notice block (`:1039-1044`) so that `info` message is not clobbered,
  and before the deck/astral restoration at `:1047`.
- **Do not reset on submit.** `createCharacter()` and `claimSelectedCharacter()`
  leave `joinChoice` where it is. The request is fire-and-forget with no ack
  (`server.js:1029`); closing the branch on submit would leave a player staring
  at two buttons with no idea whether anything happened, and would lose a typed
  form if the GM is offline. The branch closes on its own when the card
  disappears because `ownParticipants` became non-empty.

### Template shape

Replace `player-view.component.html:31-103` (the card body; keep the `@if
(ownParticipants.length === 0)` gate at `:30` and the card wrapper) with three
mutually exclusive blocks inside the same `.card-body`:

1. `@if (joinChoice === 'none')` — a `data-testid="player-join-choice"` container
   holding two buttons: `data-testid="player-choose-claim"` calling
   `chooseClaim()` and `[disabled]="!canClaimAnything"`, and
   `data-testid="player-choose-create"` calling `chooseCreate()`. When
   `!canClaimAnything`, render a `data-testid="player-claim-unavailable"` line
   under the buttons explaining why (Open Decision 2).
2. `@if (joinChoice === 'claim')` — a `data-testid="player-claim-panel"`
   container holding the **unchanged** claim markup lifted verbatim from
   `:35-53` (same `cli-claim-panel` / `cli-claim-row` classes, same `<select>`,
   same option text including the `(Out of Action)` suffix at `:46`, same Claim
   button), plus a Back control `data-testid="player-join-choice-back"` calling
   `backToJoinChoice()`.
3. `@if (joinChoice === 'create')` — a `data-testid="player-create-panel"`
   container holding the **unchanged** create markup lifted verbatim from
   `:55-101` (both `.cli-create-row`s, all eight inputs with identical
   `[(ngModel)]` bindings and `min` attributes, the commented-out cell at
   `:81-84` preserved as-is, and the Create button), plus the same Back control.

Change the card header (`:32`) from `Claim Or Create Character` to something
that reads correctly in all three states — `Your Character` is wrong (that
header is already used at `:253`); use `Get A Character`.

The `@if (unclaimedParticipants.length > 0)` condition at `:34` is **removed**;
its job moves to `canClaimAnything` gating the chooser button.

### Wording

- `join()` `:244`: `"Claim a character from the list or create a new one."` →
  `"Choose whether to claim a character the GM has set up, or create a new one."`
- Claim button label: `Claim a Character`. Create button label:
  `Create a New Character`. The inner submit buttons keep their existing labels
  (`Claim` at `:50`, `Create New Character` at `:99`).

### Wire contract

**None.** No socket event, payload field, ack shape or stored-state field
changes. `player:join`, `session:command`, `register_character`,
`claim_character`, `release_claims`, `claim_denied`, `SharedCombatState` and
`SharedParticipantState` are all untouched, in both directions. The GM tab
receives byte-identical commands and its `handleSessionCommand` branches at
`battle-tracker.component.ts:2724` and `:2913` are unchanged. If Open Decision 5
is taken, the only new input is `this.gmConnected`, which the component already
holds from the `player:join` ack (`session-sync.service.ts:616-625`) and keeps
current via `onGmPresence` (`player-view.component.ts:216-218`).

### Persistence and GM-side visibility

Nothing is persisted. `joinChoice` is transient per-tab UI state of exactly the
kind `ARCHITECTURE.md` §7 describes as "this tab's own transient panel/selection
state… never sent to the server at all". Nothing new appears on the GM screen,
in the Action Log, in `session.state`, in `session.gmState`, or in the room's
JSON file on disk.

---

## Acceptance criteria

1. A player who joins a room and holds no character sees exactly two buttons —
   "Claim a Character" and "Create a New Character" — and neither the character
   dropdown nor any create-form input is present in the DOM at that moment.
2. Tapping "Claim a Character" renders the dropdown and its Claim button, and
   renders no create-form input.
3. Tapping "Create a New Character" renders all eight create-form inputs and the
   Create button, and renders no dropdown.
4. From either branch, the Back control returns the card to the two-button state
   and removes that branch's controls from the DOM.
5. The dropdown's option text is unchanged from today, including the
   `#{order} {name}` prefix and the ` (Out of Action)` suffix for an entry whose
   `ooc` is true.
6. The create form's eight inputs bind to the same component fields with the
   same `min` attributes as before, and `createCharacter()` sends a
   `register_character` command with a payload identical field-for-field to
   today's.
7. `claimSelectedCharacter()` sends a `claim_character` command carrying
   `participantId` equal to `selectedClaimParticipantId`, unchanged from today.
8. When `unclaimedParticipants` is empty, the "Claim a Character" button is
   present and disabled, and a visible explanatory line accompanies it.
9. When a participant later becomes claimable, the same button becomes enabled
   on the next incoming state with no player interaction.
10. The whole card is absent from the DOM whenever `ownParticipants.length > 0`,
    in all three chooser states.
11. A player mid-way through the create branch who receives an unrelated state
    broadcast (e.g. the GM sorts the order, or damage changes) stays on the
    create branch with their typed values intact.
12. When a player who held a character stops holding one — the GM releases the
    claim, or the character leaves the encounter — the card reappears in the
    two-button state, not in whichever branch was last open, and
    `selectedClaimParticipantId` is cleared.
13. Submitting either branch does **not** close it; the branch stays open until
    the card itself disappears because the player now holds a character.
14. A transport reconnect (`rejoinAfterReconnect`) leaves the current branch and
    any typed create-form values untouched.
15. No socket event name, payload field, ack field or persisted field differs
    from before this change, verified by the fact that no file under `server/`,
    no `server.js` line, and no type in `session-sync.service.ts` is modified.
16. Nothing new is written to `sharedLogEntries`, the local Action Log, or the
    GM's screen as a result of a player using the chooser.
17. `npm test` passes, including the updated `persistent-rooms.spec.ts` test at
    `:3451` and the new scenario file.
18. `npm run lint` and `npm run build` both pass.

---

## Regression risk

| What could break | Covered by |
|---|---|
| The downed-character claim-list badge disappears from the player's reach | `src/scenarios/persistent-rooms.spec.ts:3451-3459` — **will fail as written** and must be updated to open the claim branch first. Do not delete it; AC 5 depends on it. |
| The claim command stops carrying the selected id | `persistent-rooms.spec.ts:3264-3275` (calls `claimSelectedCharacter()` directly, so it does not exercise the new gate — add DOM coverage in the new spec) |
| `unclaimedParticipants` / `ownParticipants` / `primaryCharacter` filtering changes | `persistent-rooms.spec.ts:3354-3361`, `:3419-3432` — getter-level, unaffected, and must stay green as proof the getters were not touched |
| A downed character becomes playable | `persistent-rooms.spec.ts:3413-3417`, `:3434-3449` — reads `visibleParticipants` and `.player-participant`, unaffected |
| The "GM released your character" notice regresses | `persistent-rooms.spec.ts:3282-3362` — the new reset rule runs inside `applyIncomingState` next to that notice; the reset must be placed **after** the `info` assignment at `:1039-1044` or the notice is silently overwritten |
| The "GM not connected" warning regresses | `persistent-rooms.spec.ts:3155-3179` (`data-testid="gm-not-connected"`) — only relevant if Open Decision 5 is taken; it must not reuse or move that element |
| Log rendering on the player screen regresses | `src/scenarios/gm-npc-rolls.spec.ts:892-907` and `src/scenarios/combat-log-readability.spec.ts:255-278` both construct a `PlayerViewComponent` with `connected = true` and `state.participants: []` and query log DOM. With the chooser they will render the two buttons instead of the create form; neither asserts on the panel, so both should stay green. If either fails, the change has leaked outside the card. |
| The panel's styling breaks | No spec coverage. The `cli-*` rules in `styles.scss:1399-1506` are element/class-scoped, not structure-scoped, so lifting the markup unchanged should preserve them — verify by eye at phone width, since the create grid is a hand-tuned responsive layout. |

Not a risk, stated so nobody goes looking: **the in-flight undo removal.** The
working tree has uncommitted work deleting `src/Common/UndoHandler.ts`,
`src/Common/Undoable.ts`, `src/Common/index.ts` and `src/assets/undo.svg`. The
player view never referenced any of them, and this change introduces nothing
undoable. Do not add an undo step, and do not assume `UndoHandler` exists.

---

## Scenarios to survive

Write these as `src/scenarios/player-join-claim-or-create.spec.ts`, following
the `TestBed.configureTestingModule({ imports: [PlayerViewComponent], providers:
appConfig.providers })` pattern used at `persistent-rooms.spec.ts:3140-3151`,
with `spyOn(sync, 'connect')` and `spyOn(sync, 'joinAsPlayer')`.

**S1 — the ordinary case: a player claims the character the GM set up.**
Join a room whose state carries one participant `{ id: 'p-1', name: 'Wombat',
order: 1, claimable: true, ownerName: undefined }`.
*Expect:* `joinChoice === 'none'`; `[data-testid="player-join-choice"]` present;
`[data-testid="player-choose-claim"]` present and **not** disabled; no `<select>`
and no input bound to `characterName` in the DOM.
Tap `player-choose-claim`, `detectChanges()`.
*Expect:* `[data-testid="player-claim-panel"]` present, one `<option>` reading
`#1 Wombat`; no create input present.
Set `selectedClaimParticipantId = 'p-1'`, tap Claim.
*Expect:* exactly one command sent, `{ type: 'claim_character', player:
<token>, payload: { participantId: 'p-1' } }`.
Feed the same state back with `ownerName` = the token via `applyIncomingState`.
*Expect:* the whole card is gone from the DOM; `primaryCharacter?.id === 'p-1'`.

**S2 — the ordinary case, other branch: a drop-in player creates one.**
Join a room whose state has `participants: []`.
*Expect:* `player-choose-claim` present and **disabled**;
`[data-testid="player-claim-unavailable"]` present.
Tap `player-choose-create`, set the eight fields, tap Create.
*Expect:* one `register_character` command whose payload equals
`{ characterName, initiativeDice, edgeRating, reaction, intuition,
overflowHealth, physicalHealth, stunHealth, isMatrix: false }` with the typed
values — byte-identical in shape to what `createCharacter()` sends today.
*Expect:* `joinChoice` is still `'create'` and the form is still rendered (AC 13).

**S3 — edge case: nothing to claim, then something to claim, with no
interaction.**
Join with `participants: []`. Assert `player-choose-claim` disabled.
Now `applyIncomingState({ ..., participants: [{ id: 'p-9', name: 'Ork',
order: 1, claimable: true }] })` and `detectChanges()`.
*Expect:* the same button is now enabled, `player-claim-unavailable` is gone,
and `joinChoice` is still `'none'` — the arriving character must not jump the
player into a branch they did not choose.
Second half of the same scenario, the reverse edge: with the create branch open
and `characterName` typed, deliver an unrelated state broadcast (same
participants, `round` bumped).
*Expect:* `joinChoice === 'create'` and `characterName` unchanged (AC 11) — this
is the level-vs-edge trigger bug, and it is the single most likely defect.

**S4 — the reversal (there is no undo stack; this is what stands in for one).**
Two halves, both required.
(a) *Player-side reversal.* Tap `player-choose-create`, type a name, tap
`player-join-choice-back`.
*Expect:* `joinChoice === 'none'`, both chooser buttons rendered, no create input
in the DOM, `selectedClaimParticipantId === ''`.
(b) *GM-side reversal.* Reach the owned state as in S1, so the card is gone.
Then deliver a state where the same participant is still present with
`ownerName: undefined` — this is exactly what `btnReleaseClaim_Click`
(`battle-tracker.component.ts:2683-2690`) and the server's `releasePlayerClaims`
(`server.js:401-444`) produce.
*Expect:* the card is back; `joinChoice === 'none'` (AC 12), **not** the branch
that was open before; and the existing released-character notice still fires —
`info` contains the character name, `released`, and `Claim` (this is
`persistent-rooms.spec.ts:3303-3312`'s assertion, and it must still hold with the
reset rule in place).

**S5 — live at the table: a player's tablet dies in the middle of pass 2 and
they rejoin while four other players wait.**
Set up a started combat (`started: true`, `round: 1`, `pass: 2`) with the
player's character `{ id: 'p-1', claimable: true, ownerName: <token> }` and two
other participants, one `active: true`.
Simulate the reload by creating a **fresh** `PlayerViewComponent` (a new token,
matching `ngOnInit`'s behaviour) and joining a state in which `p-1` now has
`ownerName: undefined` — the state `releasePlayerClaims` broadcast when the old
socket dropped.
*Expect:* the new tab shows the two-button chooser, `player-choose-claim` is
enabled, and the initiative order card below it is rendered with the fight still
in pass 2 (`state.started === true`) — the chooser must not hide or block the
order, because the other four players' turns are still resolving on screen.
Tap Claim, select `p-1`, submit.
*Expect:* one `claim_character` command; on the state that comes back with the
new token as `ownerName`, the card disappears and `primaryCharacter?.id ===
'p-1'` with `initiativeScore` intact — the returning player is back in the order
without the GM touching anything.
*Also expect:* no `register_character` command is sent at any point in this
scenario. A returning player must never be nudged down the create path, because
`upsertPlayerParticipant` (`battle-tracker.component.ts:3830-3926`) would find no
participant for the new token, build a **second** row for the same character, and
put it in the initiative order mid-pass.

**S6 — GM absent (only if Open Decision 5 is taken).**
Join with `gmConnected: false` and `participants: []`.
*Expect:* both chooser buttons still reachable (not disabled by GM absence), and
a visible line saying the request will not take effect until the GM is back.
Tap create and submit.
*Expect:* the command is still sent, and the on-screen message does not claim
success.

---

## Open decisions

**1. Does "create a new character" mean a fuller character sheet?**
*Recommended: no — the existing eight fields, unchanged.* The eight inputs at
`player-view.component.html:55-95` map one-to-one onto what
`handleSessionCommand`'s `register_character` branch
(`battle-tracker.component.ts:2724-2778`) reads and what
`upsertPlayerParticipant` (`:3830-3926`) writes — `name`, `overflowHealth`,
`physicalHealth`, `stunHealth`, the Edge/Reaction/Intuition side-maps, and the
dice count via `applyRegisteredDiceCount` (`:3943-3959`). Adding fields means
extending that payload, that branch, that method and every side-map it touches.
Worse, the obvious "fuller sheet" content (deriving Condition Monitor boxes from
Body/Willpower the way `gruntConditionMonitorBoxes` does for grunts, or
Initiative Dice from augmentations) is rules-dependent and needs a page-cited
brief through `/feature`, per `CLAUDE.md`. Note also the existing backlog items
"Player identity / accounts and cross-room saved characters" and "Chummer
(.chum5) character import" (`docs/FEATURE-BACKLOG.md:165-188`), which is where a
real character document belongs.

**2. Claim button when `unclaimedParticipants` is empty — hide or disable?**
*Recommended: disable, with a reason line.* Hiding makes the "two buttons"
contract conditional and gives the player no way to distinguish "not offered" from
"broken". Disabled-with-reason also self-heals: `unclaimedParticipants` is a
getter over the live broadcast, so `btnToggleClaimable_Click`
(`battle-tracker.component.ts:2643-2650`) enabling the button on the player's
screen costs the GM one tap and the player nothing. Pinned by ACs 8 and 9 and
scenario S3.

**3. A way back from a chosen branch?**
*Recommended: yes, a Back control on both branches.* Without it a mis-tap needs
a page reload, and a reload costs the player their claim (`ngOnInit` mints a new
token; the server releases on disconnect). Pinned by AC 4 and S4(a).

**4. Gate on "just joined" or on "holds no character"?**
*Recommended: "holds no character" — keep the existing
`ownParticipants.length === 0` condition at `:30` exactly as it is.* The literal
request says "when players first join", but that condition already covers three
situations: the first join, a post-reload join, and a GM release/removal. Tying
the chooser to a one-shot "just joined" flag would strand the third case with no
route back to claiming. The cost is that the reset rule has to be edge-triggered
(see "Proposed approach"), which is the trickiest part of this change.

**5. Should either button warn or refuse while `gmConnected` is false?**
*Recommended: warn, do not refuse.* `session:command` is broadcast with no ack
(`server.js:1029`) and only the GM tab applies it
(`ARCHITECTURE.md` §7, "Commands"), so with no GM socket in the room a claim or
create silently evaporates while the player reads "Claim request sent." Refusing
would leave them with no path at all in a room they were legitimately invited
to. The component already holds `gmConnected` (`:51`, seeded from the
`player:join` ack, kept current by `onGmPresence` at `:216-218`), so this is a
message, not new plumbing. **Use a new element**, not the existing
`data-testid="gm-not-connected"` warning at `player-view.component.html:21-25`,
so that test (`persistent-rooms.spec.ts:3155-3179`) is unaffected. Adds scenario
S6 and no new AC unless taken.

**6. Should a claim survive a full page reload?**
*Recommended: no change here.* Today the token is minted per `ngOnInit`
(`:123`), the dying socket triggers `releasePlayerClaims` (`server.js:1113-1123`
→ `:401-444`), and the returning tab must re-claim. Persisting the token to
`localStorage` alongside `bt.playerNotifyMuted.v1` looks like a two-line change
and is not: it would make a claim outlive the socket that made it, which is
precisely the stale-owner class `ARCHITECTURE.md` §7 documents at length
(`claim_denied`, `reconcileOwnershipFromServer`, `btnReleaseClaim_Click` all
exist to clean up after it), and it would need answers for two tabs sharing one
token, and for how a claim is ever released when a player genuinely leaves.
`docs/FEATURE-BACKLOG.md:165-176` already holds this as its own item with the
right opening questions. Confirm you are content that a reload means re-claim —
which, with this change, at least lands the player on a clean two-button screen.

**7. Should a player be able to hold more than one character?**
*Recommended: no — unchanged.* `upsertPlayerParticipant`
(`battle-tracker.component.ts:3844-3850`) finds its target by scanning
`participantOwners` for the first participant owned by that token, so a second
`register_character` from the same token overwrites the first rather than adding
one. `primaryCharacter` (`:737-739`) likewise takes `ownParticipants[0]`. The
chooser is hidden while a player holds a character (AC 10), so the situation is
unreachable through the UI either way. Do not add a "create another" affordance.

**8. Should the chooser render before the room has any state at all?**
*Recommended: no — keep the `@if (connected && state)` gate at `:29` as-is.*
`session.state` is `null` for a room never pushed to
(`server.js:311-329`), and `player:join` returns that `null` verbatim
(`:880`, `playerFacingState` at `:192-198` passes null straight through), so
`applyIncomingState(null)` leaves `state` null and the whole lower half of the
view — chooser included — is hidden. In practice
`btnCreateShareSession_Click` pushes in the same tick as the create
(`battle-tracker.component.ts:1181`) and a room restored from disk always has
content, so the window is sub-second and unreachable for a rejoined room.
Closing it means rendering the onboarding card on `connected` alone and having
the claim branch report "nothing available" against a null state — contained,
but a second, separable change with its own ACs. Recommending "leave it" rather
than deciding silently.

**9. Card header wording.**
*Recommended: `Get A Character`.* The current `Claim Or Create Character`
(`:32`) describes a panel that no longer shows both at once, and `Your
Character` is already taken by the panel at `:253`. Low stakes; state a
preference so the implementer does not invent one.
