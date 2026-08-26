# Spec: collapse the player view's Room card after a successful join

## Request

Once `connected` is true, replace the player view's top card — the room text
input and the disabled "Join Session" button — with a compact, non-card row that
displays the joined room code, and give the card's four message lines a home that
survives the collapse.

**Not in scope:** the pre-join card itself (it keeps its input, its Join button
and its behaviour, and is simply gated on `!connected`); `join()`'s connect /
`joinAsPlayer` / listener-attachment logic; `rejoinAfterReconnect()`;
`ngOnInit`'s `?room=` prefill and per-tab token minting; token persistence across
reloads; any "leave room" / "change room" affordance (Open Decision 3); the
`joinChoice` chooser and everything it gates (`player-view.component.html:29-139`);
the initiative order, dice roller, Action Log, "Your Character", cyberdeck and
Awakened panels; `SessionSyncService` and every wire type on it; `server.js` and
`server/`; the GM component in either file; anything in `ARCHITECTURE.md` §1-§7
concerning combat state; the GM view's own join bar
(`battle-tracker.component.html:4-16` — see "Affected paths", which explains why
it is not the same pattern).

**Not rules-dependent.** No SR5 mechanic, number or timing question is involved.
Room joining is app-level session plumbing with no rulebook counterpart. Nothing
in this change reads or writes initiative, Condition Monitors, actions or turn
state.

**Is a spec warranted?** Yes, but barely, and only because of two traps that are
not visible from the request: the four message lines live inside the markup being
removed and are written from 34 sites across the component, and the block below
the card is gated on `connected && state`, so a collapsed row placed inside that
gate disappears exactly when it is the only thing left on screen. The template
edit itself is small.

---

## Current behaviour

### The card

`src/app/player-view/player-view.component.html:1-27`, inside
`<div class="player-view container py-3">` at `:1`:

| Lines | What |
|---|---|
| `:2-3` | `<div class="card mb-3"><div class="card-body">` — the card wrapper. No `card-header`. |
| `:4-14` | A `.row.g-2` holding two columns |
| `:5-8` | `col-12 col-sm-6 col-md-3` — `<label class="form-label">Room</label>` and `<input type="text" class="form-control" [(ngModel)]="room" [disabled]="connected" placeholder="Room code">` |
| `:9-13` | `col-12 col-sm-6 col-md-3 d-flex align-items-end` — `<button class="btn btn-primary w-100" (click)="join()" [disabled]="connected \|\| !room">Join Session</button>` |
| `:15-17` | `@if (error) { <div class="text-danger mt-2">{{ error }}</div> }` |
| `:18-20` | `@if (info) { <div class="text-info mt-2">{{ info }}</div> }` |
| `:21-25` | `@if (connected && !gmConnected) { <div class="text-warning mt-2" data-testid="gm-not-connected">GM not connected. This is the room's last saved state; it will update when the GM rejoins.</div> }` |
| `:26-27` | closing `</div></div>` |

`:29` opens `@if (connected && state) {`, which gates **everything else in the
view** — the "Get A Character" card (`:30-139`), the Initiative Order card
(`:140-248`), the Dice Roller (`:250-257`), the Action Log (`:259-284`) and the
"Your Character" card (`:286-469`). It closes at `:470`. The card at `:2-27` is
the only markup outside that gate.

The app shell hides the navbar and footer in player mode
(`src/app/app.component.html:6` and `:34`, both `[hidden]="mode === 'player'"`),
so this card is the only chrome above the fold. There is no other place on the
player screen where the room code appears.

### Every consumer of `room`

`src/app/player-view/player-view.component.ts`:

- `:22` — declaration, `room = ""`.
- `:162-165` — `ngOnInit()` reads `?room=` and assigns `this.room = room.toUpperCase()`. Prefill only; it does not auto-join.
- `:206` — `join()` calls `this.session.joinAsPlayer(this.room.trim().toUpperCase(), this.playerToken)`. **The normalized value is not written back to `this.room`.**
- `:295` — `rejoinAfterReconnect()` early-returns unless `this.connected && this.room`.
- `:299` — `rejoinAfterReconnect()` re-normalizes the same way, again without writing back.
- `:278` — the `onSessionClosed` message interpolates `payload?.room || this.room`.
- Template `:7` — the only render site.

`SessionSyncService.currentRoom` (`session-sync.service.ts:418`) holds the
normalized code, assigned at `:621` on a successful `joinAsPlayer`. It is not
reachable from the template: `session` is a private constructor parameter
(`player-view.component.ts:157`).

### Every consumer of `connected`

`src/app/player-view/player-view.component.ts`:

- `:44` — declaration, `connected = false`.
- `:131` — `onPlayerDiceRolled()` returns early if false.
- `:183` — `ngOnDestroy()` sends `release_claims` only if `this.connected && this.session.currentRoom`.
- `:207` — `join()` sets it true after a successful `joinAsPlayer`.
- `:268` — `onSessionClosed` sets it **false** (and `state = null`, `promptRoll = false`).
- `:295` — `rejoinAfterReconnect()` guard.
- Template `:7`, `:10`, `:21`, `:29` — the four render sites.

Note what does **not** set it false: `onDisconnect` (`:263-266`) sets
`gmConnected = false` and an `info` line but leaves `connected` true, so a
transport drop keeps the view in its post-join state.

### Every consumer of `join()`

- Template `:10` — the only `(click)` binding.
- `src/scenarios/persistent-rooms.spec.ts:3159, :3174, :3189, :3229, :3299, :3328, :3370` — seven direct `await component.join()` calls.
- `src/scenarios/player-join-claim-or-create.spec.ts:46` — one call inside the file's `join(state, gmConnected)` helper, used by every test in the file.

No other production call site exists.

### Every write site of the three message lines

`error` (rendered only at template `:16`):

| Line | Value | `connected` at that moment |
|---|---|---|
| `:202` | `""` (cleared at the top of `join()`) | false |
| `:244` | `Could not claim …` (`claim_denied` command) | **true** |
| `:277` | closed-room / ended-room message (`onSessionClosed`) | set false at `:268`, one line earlier |
| `:286` | `join()`'s catch — the join failed | false |
| `:303` | `""` (`rejoinAfterReconnect` success) | **true** |
| `:306` | `Lost connection to the room.` (`rejoinAfterReconnect` catch) | **true** |
| `:579` | `""` (`claimSelectedCharacter`) | **true** |
| `:814`, `:820`, `:828` | `""` (`chooseClaim`/`chooseCreate`/`backToJoinChoice`) | **true** |
| `:1130` | `""` (`applyIncomingState`, on a release) | **true** |

`info` (rendered only at template `:19`):

| Line | Value | `connected` |
|---|---|---|
| `:203` | `""` (`join()` top) | false |
| `:234` | `GM ended combat.` (`combat_ended` command) | true |
| `:242` | `""` (`claim_denied`) | true |
| `:265` | `Reconnecting to the session server...` (`onDisconnect`) | true |
| `:283` | `Choose whether to claim a character the GM has set up, or create a new one.` (`join()` tail) | true |
| `:304` | `Reconnected.` (`rejoinAfterReconnect`) | true |
| `:311`, `:330` | `""`, then `Create character request sent[…]` (`createCharacter`) | true |
| `:380`, `:402`, `:425`, `:439`, `:457` | `""` (`jackIn`, `confirmMode`, `jackOut`, `removeDeckConfig`, `removeAstral`) | true |
| `:576`, `:581`, `:592` | `""`, `Select a character to claim.`, `Claim request sent[…]` (`claimSelectedCharacter`) | true |
| `:815`, `:821`, `:827` | `""` (`chooseClaim`/`chooseCreate`/`backToJoinChoice`) | true |
| `:1117` | `Combat turn complete. Waiting for GM to start the next combat turn.` (`applyIncomingState`) | true |
| `:1123` | `""` (`applyIncomingState`, combat restarted) | true |
| `:1132-1133` | `The GM released <names> … Tap Claim a Character to take control back.` | true |
| `:1153` | `""` (`applyIncomingState`, pending-request success edge) | true |

`gmConnected` (drives template `:21-25`): `:51` declaration (default `true`),
`:209` seeded from the `player:join` ack, `:256` `onGmPresence`, `:264`
`onDisconnect` sets false. Also read by `createCharacter()` `:330`,
`claimSelectedCharacter()` `:592`, and template `:132` (a **second**,
independent GM-absent notice, `data-testid="player-gm-absent-notice"`, inside the
"Get A Character" card — unaffected by this change and not to be merged with
`gm-not-connected`).

**The load-bearing fact:** all but four of those 34 writes happen while
`connected` is true. Deleting the card without relocating `:15-25` silently
removes every one of those messages from the screen.

### Styling

- `src/app/player-view/player-view.component.css` — **no rule targets this card.** `.player-view .card-header` (`:8`) does not match it (it has no header). Verified by reading the whole file.
- `src/styles.scss` — the theme rules that reach this markup are all generic: `:root body .card` (`:461-467`), `:root body .card-header` (`:469-485`), `:root body .form-control::placeholder` (`:690-693`), `:root body .text-muted` (`:1132`), `.text-info` (`:1136`), `.text-warning` (`:1140`), `.text-danger` (`:1144`). None is keyed to the room card, and `.player-view` appears nowhere in `styles.scss`.
- The `cli-*` rules at `styles.scss:1399-1506` belong to the claim/create panels, not this card.

Consequence: no stylesheet edit is required, and the four Bootstrap text-colour
utilities the messages use are already themed.

---

## Affected paths

### The pattern search

I searched `src/` for every instance of the "control disabled once joined"
pattern and for every room-join surface:

- `[disabled]="connected` → **2 hits, both in `player-view.component.html`** (`:7`, `:10`).
- `Join Session` → `player-view.component.html:11`; `battle-tracker.component.html:7`; and three GM-facing message strings at `battle-tracker.component.ts:2028`, `:2088`, `:2104`.
- `Room code` / `[(ngModel)]="room"` → `player-view.component.html:6-7` only.

**There is exactly one instance of the pattern being changed.** The GM view's
join bar (`battle-tracker.component.html:4-16`) is **not** a second call site and
must not be touched: its input at `:6` is never disabled and its Join button at
`:7` is never disabled, because a GM tab can legitimately switch rooms mid-
session (`liveEncounterRooms`, `ARCHITECTURE.md` §7). The GM view already has the
compact display this change is asking for — `Room {{ shareRoomCode }}` at
`battle-tracker.component.html:29-38` — which is the visual precedent to follow,
not a thing to change.

### Files that must change

1. **`src/app/player-view/player-view.component.html`** — lines `:1-27` only. Nothing at `:28` or below changes.
2. **`src/app/player-view/player-view.component.ts`** — `join()` only, and only if Open Decision 6 is taken: one assignment of the normalized code back to `this.room`. **No other method, field or getter changes.** In particular do not touch `ngOnInit`, `ngOnDestroy`, `rejoinAfterReconnect`, `applyIncomingState`, `createCharacter`, `claimSelectedCharacter`, `chooseClaim`, `chooseCreate`, `backToJoinChoice`, or any getter.
3. **`src/scenarios/player-room-box-collapse.spec.ts`** — new file, following the `src/scenarios/` convention. It must live under `src/` or Karma will not compile it.
4. **`docs/APP_DOCUMENTATION.md`** — §4 "Join flow", steps 1-2 at `:311-314`. Step 3 (`:315-324`) describes the chooser and is unchanged.

### Tests that render the affected markup

Exhaustive list of every spec that constructs a `PlayerViewComponent`:

| File | Where | What it does with the card |
|---|---|---|
| `src/scenarios/persistent-rooms.spec.ts` | `:3155-3168`, `:3170-3179` | **Asserts on `[data-testid="gm-not-connected"]` after `await component.join()`.** The only DOM assertion against markup inside the card. Must keep passing unchanged. |
| `src/scenarios/persistent-rooms.spec.ts` | `:3436`, `:3452`, `:3467` | Sets `component.connected = true` **directly**, never calling `join()`, so `component.room === ''` while the post-join markup renders. Asserts only on `.player-participant`, `option`, `[data-testid="player-badge-ooc"]`. |
| `src/scenarios/player-join-claim-or-create.spec.ts` | `:43-48` helper, used by every test | Calls `join()` with `room = 'ABC123'`. Global DOM queries are `querySelector('select')` (`:65`, `:117`), `querySelectorAll('option')` (`:73`), `nativeElement.textContent` (`:307`). The input count at `:122-123` is scoped to `[data-testid="player-create-panel"]`. **None is affected by removing a text input**, but `:65` and `:117` assert `select` is null — confirm nothing new introduces one. |
| `src/Grunts/npc-row.spec.ts` | `:2784-2805` | `player.connected = true` directly, `room === ''`. Asserts on badge testids and `textContent` containing `'Wombat'`. |
| `src/scenarios/combat-log-readability.spec.ts` | `:265-278` | `player.connected = true` directly, `room === ''`. Asserts on `[data-testid="log-entry-ref"]`. |
| `src/scenarios/gm-npc-rolls.spec.ts` | `:896-907` | `player.connected = true` directly, `room === ''`. Asserts on `[data-testid="log-badge-npc"]` and `.log-list`. |

Four of the six drive `connected = true` with an empty `room`. Whatever renders
in the collapsed state must therefore be harmless with `room === ""` — see AC 4.

I also searched every `*.spec.ts` under `src/` for `querySelectorAll('input'`,
`querySelectorAll("input"`, `querySelectorAll('.card'` and `card-body`: **one
hit total**, `player-join-claim-or-create.spec.ts:122`, already scoped. No test
counts inputs or cards across the whole player view. There are no e2e,
Playwright or Cypress tests in the repo.

### Files that must NOT change

Verified by reading: `src/app/player-view/player-view.component.css`,
`src/styles.scss`, `src/app/app.component.html`,
`src/app/battle-tracker/battle-tracker.component.html`,
`src/app/battle-tracker/battle-tracker.component.ts`,
`src/app/services/session-sync.service.ts`, `server.js`, `server/`,
`ARCHITECTURE.md` (it does not describe this markup anywhere),
`briefs/player-join-claim-or-create-spec.md` (a record of a completed change;
leave it as written).

---

## Proposed approach

One template restructure of `player-view.component.html:1-27` into three
siblings, all outside the `@if (connected && state)` gate at `:29`. There is no
shared choke point to route through because there is only one call site; the
work is entirely in deciding where the pieces land.

### 1. The pre-join card — gated, otherwise unchanged

Wrap the existing card in `@if (!connected) { … }`. Inside it:

- Keep `:4-14` verbatim except for the two `[disabled]` bindings, which lose their now-dead `connected` term: the input at `:7` drops `[disabled]="connected"` entirely, and the button at `:10` becomes `[disabled]="!room"`.
- Move `:15-25` out (see 3).
- Give the card `data-testid="player-room-join-card"` so the collapse is directly assertable.

Do **not** change the label, the placeholder, the column classes, or the button
label. Do not add a spinner or an in-flight guard: `connected` only flips after
the `await` at `:206` resolves, so a double-tap during an in-flight join already
fires two `joinAsPlayer` calls today. That is pre-existing and explicitly out of
scope.

### 2. The collapsed row — gated on `connected && room`

A plain, non-card row, `data-testid="player-room-bar"`, using Bootstrap
utilities only (`small text-muted mb-2` plus whatever flex utilities the layout
needs). It contains the word `Room` and the code in a
`data-testid="player-room-code"` span. No `.card`, no `.card-body`, no border, no
new CSS class, no new stylesheet rule — the theme already colours
`.text-muted` (`styles.scss:1132`).

Gated on `connected && room` rather than `connected` alone so the four specs that
set `connected = true` with an empty `room` do not render a dangling `Room`
label (AC 4).

Follow the shape of the GM view's `battle-tracker.component.html:29-38`, minus
the link and the Copy button.

### 3. The message strip — ungated

A container rendered unconditionally, `data-testid="player-message-strip"`,
holding the three blocks lifted **verbatim** from `:15-25`:

- `@if (error) { <div class="text-danger mt-2">{{ error }}</div> }`
- `@if (info) { <div class="text-info mt-2">{{ info }}</div> }`
- `@if (connected && !gmConnected) { <div class="text-warning mt-2" data-testid="gm-not-connected">…</div> }`

Same conditions, same classes, same text, same `data-testid`. The
`gm-not-connected` block keeps its own `connected &&` term; do not fold it into
an outer condition, because `persistent-rooms.spec.ts:3155-3179` pins exactly
that behaviour and folding it changes nothing but adds risk.

The strip is a sibling of both blocks above and sits **after** them, so message
placement is identical before and after joining.

### 4. Order on screen

```text
@if (!connected) { <pre-join card> }
@if (connected && room) { <collapsed room row> }
<message strip>            <-- always
@if (connected && state) { … everything else, unchanged … }
```

Both new gates are mutually exclusive with each other by construction, so the
view never shows a room field and a room line at the same time.

### 5. `join()` (Open Decision 6 only)

If taken: in `join()`, compute the normalized code once and both pass it to
`joinAsPlayer` and assign it back — i.e. replace the inline expression at `:206`
with a local, assign `this.room` from that local **after** `joinAsPlayer`
resolves and before `this.connected = true` at `:207`. Assigning after resolution
means a failed join leaves what the player typed intact for them to correct.

Do not make the same change in `rejoinAfterReconnect()` (`:299`) — by then
`this.room` is already normalized, so it would be a no-op.

### Wire contract

**None.** No socket event, payload field, ack field or persisted field changes.
`player:join`, `session:command` and every type in `session-sync.service.ts` are
untouched in both directions. Nothing new is written to `sharedLogEntries`, the
GM screen, `session.state`, `session.gmState` or the room's file on disk.

---

## Acceptance criteria

1. Before a successful join (`connected === false`), `[data-testid="player-room-join-card"]` is present, contains an enabled `input` bound to `room` with placeholder `Room code`, and contains an enabled-when-`room`-is-non-empty button labelled `Join Session`.
2. After `join()` resolves successfully, `[data-testid="player-room-join-card"]` is absent from the DOM, and no `input[placeholder="Room code"]` and no element with the text `Join Session` exists anywhere in the view.
3. After a successful join, `[data-testid="player-room-bar"]` is present and `[data-testid="player-room-code"]` contains the joined room code.
4. When `connected` is true and `room` is the empty string (a component driven directly, as four existing specs do), `[data-testid="player-room-bar"]` is absent — no stray `Room` label renders.
5. `[data-testid="player-room-bar"]` carries neither the `card` nor the `card-body` class, and is not a descendant of any element carrying them.
6. `[data-testid="player-message-strip"]` is present in the DOM both before and after joining, irrespective of `state` being `null`.
7. With `connected === true` and `error` non-empty, the error text is visible in the DOM.
8. With `connected === true` and `info` non-empty, the info text is visible in the DOM.
9. With `connected === true` and `gmConnected === false`, `[data-testid="gm-not-connected"]` is present and its text contains `GM not connected`.
10. With `connected === true` and `gmConnected === true`, `[data-testid="gm-not-connected"]` is absent.
11. With `connected === false` and `error` non-empty (a failed join), the error text is visible in the DOM.
12. With `connected === true` and `state === null`, `[data-testid="player-room-bar"]` and `[data-testid="player-message-strip"]` still render, and the view is not empty.
13. When `onSessionClosed` fires, `connected` becomes false and `[data-testid="player-room-join-card"]` returns, with the input enabled and still holding the room code, and the closed/ended `error` message visible.
14. Tapping Join a second time is impossible after a successful join, because the button is not in the DOM (superseding today's disabled state).
15. `join()` sends no command and performs no socket work that it did not perform before this change; `sendCommand` is not called by rendering, collapsing or expanding anything in this region.
16. If Open Decision 6 is taken: after a successful `join()` with `room` set to `'abc123'`, `component.room === 'ABC123'` and `[data-testid="player-room-code"]` reads `ABC123`. If the decision is declined, `component.room` is unchanged by `join()`.
17. No file under `server/`, no line of `server.js`, and no type in `src/app/services/session-sync.service.ts` is modified.
18. No rule is added to or removed from `src/app/player-view/player-view.component.css` or `src/styles.scss`.
19. `npm test`, `npm run lint` and `npm run build` all pass, including
    `persistent-rooms.spec.ts:3155-3179` unchanged and every test in
    `player-join-claim-or-create.spec.ts` unchanged.

---

## Regression risk

| What could break | Why | Covered by |
|---|---|---|
| **A message stops being shown after joining** — the primary risk. 30 of 34 `info`/`error` writes happen while `connected` is true, and their only render sites are `:16` and `:19` inside the card being removed. | If the strip is placed inside the `!connected` branch, or inside `@if (connected && state)`, whole classes of message vanish silently. | No existing test asserts `info`/`error` render in the DOM at all — they all assert the *field*. New spec S4 and S5 must add DOM-level coverage. ACs 7, 8, 11. |
| The "GM not connected" warning regresses | `persistent-rooms.spec.ts:3155-3168` queries `[data-testid="gm-not-connected"]` after `join()`; `:3170-3179` asserts it is absent when the GM is present. Moving the element while keeping the testid and the `connected && !gmConnected` condition keeps both green. | `persistent-rooms.spec.ts:3155-3179` — must pass **unmodified**. If it needs editing, the move was done wrong. |
| The blank-room window gets worse | `@if (connected && state)` at `:29` hides everything below; `state` is `null` for a room never pushed to (`server.js:311-329`, `playerFacingState` passes `null` through). Today the card proves the app is alive. A collapsed row placed inside the gate would leave a genuinely empty page. | New spec S2. AC 12. |
| The four specs that set `connected = true` directly start rendering a stray `Room` label | `persistent-rooms.spec.ts:3436/3452/3467`, `npc-row.spec.ts:2785`, `combat-log-readability.spec.ts:267`, `gm-npc-rolls.spec.ts:898` all leave `room === ''`. | None of them asserts on it, so they will not fail — which is why AC 4 exists to pin it rather than relying on a test to catch it. |
| A player can no longer see which room they are in | The card was the only place the code appeared, and the navbar is hidden in player mode (`app.component.html:6`). | ACs 3, 12. New spec S1, S5. |
| Rejoin after a Close Room stops working | `onSessionClosed` (`:267-281`) sets `connected = false` but leaves `this.room` set. The card must return **prefilled**, or a player has to retype a code they can no longer see. | New spec S3. AC 13. |
| The claim/create chooser is disturbed | It lives at `:29-139` and is not touched. `player-join-claim-or-create.spec.ts` (554 lines, 20 tests) is the tripwire. | The whole of `player-join-claim-or-create.spec.ts` — must pass **unmodified**. |
| Theme/layout breakage | The theme's `.card` rule (`styles.scss:461`) draws the panel border and shadow that make the box a box; removing the wrapper is exactly the intent. `.text-muted`/`.text-info`/`.text-warning`/`.text-danger` are all themed (`:1132-1146`), so the strip needs no new CSS. | No spec coverage — verify by eye at 360px, the player view's supported floor (`player-view.component.css:468-470`). |

**Not a risk, stated so nobody goes looking:** there is no undo system. It was
removed in commit `426827b`; `ARCHITECTURE.md` §4 is a deleted section. Do not
add an undo step and do not assume `UndoHandler` exists. The reversal here is the
`connected` transition, covered by S3.

---

## Scenarios to survive

Write these as `src/scenarios/player-room-box-collapse.spec.ts`, following the
`TestBed.configureTestingModule({ imports: [PlayerViewComponent], providers:
appConfig.providers })` pattern at `player-join-claim-or-create.spec.ts:22-33`,
with `spyOn(sync, 'connect')` and `spyOn(sync, 'joinAsPlayer')`.

**S1 — the ordinary case: a player joins and the box collapses.**
Create the fixture, `detectChanges()`, assert before joining:
`[data-testid="player-room-join-card"]` present; it contains
`input[placeholder="Room code"]` with `disabled === false`; the Join button is
present. Set `component.room = 'ABC123'`; stub `joinAsPlayer` to resolve
`{ state: { round: 1, pass: 1, participants: [] }, log: [], gmConnected: true }`;
`await component.join()`; `detectChanges()`.
*Expect:* `[data-testid="player-room-join-card"]` is `null`;
`fixture.nativeElement.querySelector('input[placeholder="Room code"]')` is
`null`; `fixture.nativeElement.textContent` does not contain `Join Session`;
`[data-testid="player-room-bar"]` is not `null` and
`[data-testid="player-room-code"]?.textContent` contains `ABC123`; the bar's
`closest('.card')` is `null` (AC 5); the chooser
(`[data-testid="player-join-choice"]`) renders below it.

**S2 — the edge case: joined, but the room has no state yet.**
Stub `joinAsPlayer` to resolve `{ state: null, log: [], gmConnected: true }` with
`room = 'ABC123'`; `await join()`; `detectChanges()`.
*Expect:* `component.state === null`; `[data-testid="player-join-choice"]` is
`null` (the whole lower half is gated off, unchanged);
`[data-testid="player-room-bar"]` is **not** null and shows `ABC123`;
`[data-testid="player-message-strip"]` is **not** null. This is the scenario the
collapse can silently make worse, and it is why the row lives outside the
`connected && state` gate.

**S3 — the reversal (there is no undo stack; the `connected` transition stands in for one).**
Join as in S1 with `gmConnected: true`. Capture the `onSessionClosed` handler
with `spyOn(sync, 'onSessionClosed').and.callFake(h => { closed = h; })` before
joining, the pattern at `persistent-rooms.spec.ts:3185-3187`. Assert the
collapsed bar is present. Now call `closed({ room: 'ABC123', persisted: true })`
and `detectChanges()`.
*Expect:* `component.connected === false`;
`[data-testid="player-room-join-card"]` is back; its input is **not** disabled
and its value/binding still holds `ABC123`;
`[data-testid="player-room-bar"]` is `null`; the `error` text is visible in the
DOM and contains `still saved` (AC 11, AC 13). Then re-stub `joinAsPlayer`, call
`await component.join()` again and `detectChanges()`.
*Expect:* the card is gone and the bar is back — the transition is symmetric in
both directions.

**S4 — the message that would otherwise vanish: a GM releases a claim mid-session.**
Join owning a character: state `{ round: 1, pass: 1, participants: [{ id: 'p-mine',
name: 'Wombat', order: 1, active: false, playerControlled: true, claimable: true,
ownerName: component['playerToken'] }] }`. Assert the collapsed bar is present and
`[data-testid="player-join-choice"]` is `null` (they hold a character, so the
chooser card is not on screen). Now call
`component['applyIncomingState'](<same state with ownerName: undefined>)` and
`detectChanges()`.
*Expect:* `component.info` contains `Wombat` and `released` (pinned today by
`persistent-rooms.spec.ts:3303-3312`) **and** that text is present in
`fixture.nativeElement.textContent` — this is the assertion that does not exist
today and is the whole reason for the message strip. Repeat the DOM half for
`component.error` by feeding a `claim_denied` command through the captured
`onCommand` handler (`persistent-rooms.spec.ts:3225-3244`'s pattern) and
asserting the denial text is on screen.

**S5 — live at the table: a player's phone drops the connection in pass 2 while four others wait.**
Set up a started fight: state `{ round: 1, pass: 2, started: true, passEnded:
false, participants: [ <the player's own character, owned>, <an active NPC>,
<a third> ] }`. Join with `room = 'ABC123'`, `gmConnected: true`, capturing the
`onDisconnect` handler via `spyOn(sync, 'onDisconnect').and.callFake(h => { dropped = h; })`
before joining. Assert `textContent` contains `Pass 2` and the collapsed bar
shows `ABC123`.
Now fire `dropped()` and `detectChanges()`.
*Expect:* `component.connected` is still **true** (`onDisconnect` does not clear
it), so `[data-testid="player-room-join-card"]` is still absent — the player is
not thrown back to a join form mid-fight; `[data-testid="player-room-bar"]` still
shows `ABC123`, so they can read the code out to the GM; the text `Reconnecting
to the session server` is visible in the DOM; `[data-testid="gm-not-connected"]`
is present (`onDisconnect` sets `gmConnected = false`).
Then re-stub `joinAsPlayer` with the same started state and
`await component['rejoinAfterReconnect']()`; `detectChanges()`.
*Expect:* `component.info === 'Reconnected.'` and that text is visible in the
DOM; `Pass 2` is still on screen; the join card never reappeared at any point in
the scenario; `sendCommand` was never called.

**S6 — the existing GM-absence contract, unchanged.**
Join with `gmConnected: false`. *Expect:* `[data-testid="gm-not-connected"]`
present, text contains `GM not connected` (AC 9). Join a second fixture with
`gmConnected: true`. *Expect:* it is `null` (AC 10). This duplicates
`persistent-rooms.spec.ts:3155-3179` deliberately — that file's copy is the
tripwire for the move, this one documents the contract in the file a future
reader of this change will open.

---

## Open decisions

**1. Where do `error`, `info` and the GM-not-connected warning live after the collapse?**
*Recommended: one ungated message strip, sibling to both the pre-join card and
the collapsed row, rendering all three blocks verbatim from `:15-25`.*
The alternatives are worse in specific ways. Duplicating the three blocks into
both branches doubles the markup and lets the two copies drift — and the
`gm-not-connected` testid would then exist twice, breaking
`persistent-rooms.spec.ts:3165`'s `querySelector` semantics the moment both
render. Putting them inside the collapsed row makes a fixed-height line grow by
up to three wrapped lines as messages arrive, which is the jitter the collapse is
meant to remove. Putting them inside `@if (connected && state)` loses every
message in the null-state window (S2) and every message shown while
`connected === false` (`join()`'s catch at `:286`, `onSessionClosed` at `:277`).
Pinned by ACs 6-12 and scenarios S2, S3, S4, S5.

**2. Is the room code copyable — a Copy button, or plain selectable text?**
*Recommended: plain text, no button.* Six characters the player has already
typed once, selectable by default in every browser. The GM view's Copy button
(`battle-tracker.component.html:34-36`) copies `shareUrl`, a full URL — a
different job with a real ergonomic payoff. A Copy button here means a
`navigator.clipboard` call, a fallback path for insecure contexts, and a
transient "Copied" state to render — all new surface for no clear gain. If Xavier
wants it, it is a separate two-line change with its own AC.

**3. Is there a way back to the input — a "Leave Room" or "Change Room" control — or is reload the only exit?**
*Recommended: no affordance; reload remains the exit, unchanged from today.*
Today the input is disabled, not usable, so nothing is being removed. A Leave
Room button is not a display change: it has to decide whether to send
`release_claims` the way `ngOnDestroy` does (`:183-189`), whether to call
`session.disconnect()`, whether to clear `state`, `log`, `promptRoll`,
`joinChoice` and the deck/astral panel fields, and whether the GM's Action Log
gets a "player left" line. `onSessionClosed` (`:267-281`) is the closest existing
teardown and it clears only `connected`, `state` and `promptRoll` — a Leave
button reusing it would leave a stale log and stale deck fields on screen. That
is its own change with its own ACs. Note also that reload is already the common
path: `playerToken` is minted fresh in `ngOnInit` (`:160`) and never persisted,
so a refresh always drops the player to the pre-join state anyway.

**4. Should the collapsed row show connection status?**
*Recommended: no status indicator.* The component holds no "transport is up"
flag — `connected` means "we completed a join", and it stays true through a
transport drop (`onDisconnect` at `:263-266` deliberately does not clear it). The
two failure states that matter already announce themselves in the strip:
`gm-not-connected` (`:21-25`) and `Reconnecting to the session server...`
(`:265`). A green "connected" dot would be a fourth thing to keep in step with
those and is informative only in the state where nothing is wrong. If a signal is
wanted later, the honest one is a transport flag on `SessionSyncService`, which
does not exist yet.

**5. Card, plain bar, or merged into the top of the card below?**
*Recommended: a plain bar of its own, outside every card and outside the
`connected && state` gate.* A card is the thing being removed — the theme's
`:root body .card` (`styles.scss:461-467`) is what draws the border, inset ring
and shadow that make it read as a module. Merging into the card below fails
because there is no single stable card below: `@if (ownParticipants.length === 0)`
(`:30`) removes the "Get A Character" card the moment the player claims, and
`@if (connected && state)` (`:29`) removes the Initiative Order card in the
null-state window. Either way the room code would disappear along with its host
at exactly the moments a player most wants to check it. Pinned by ACs 5 and 12.

**6. Should the displayed code be what was typed, or the normalized code that was actually joined?**
*Recommended: the normalized code — assign it back to `this.room` in `join()`.*
`join()` computes `this.room.trim().toUpperCase()` at `:206` for the wire and
throws it away; `this.room` keeps the raw text. Room codes are `/^[A-Z0-9]{6}$/`
(`ARCHITECTURE.md` §7, `server.js`), so a player who types `abc123` joins
`ABC123` but would see `abc123` on the collapsed line — and would read that back
to the GM. Assigning after the `await` resolves means a *failed* join still
leaves their typing intact to correct. This also makes the `onSessionClosed`
message at `:278` (`payload?.room || this.room`) consistent in its fallback
branch. Cost: one local variable and one assignment in `join()`. No test asserts
`component.room` after a join, and every test sets it already uppercase
(`persistent-rooms.spec.ts:3157` and six siblings;
`player-join-claim-or-create.spec.ts:45`, `:299`), so nothing existing changes
behaviour. Pinned by AC 16, which is written to cover both answers.
