# SR5E BattleTracker Documentation

This document is split into two layers:

- `At A Glance`: how to use and run the app quickly.
- `Deep Dive`: how the code and runtime behavior work in detail.

## At A Glance

### What This App Does

This is a Shadowrun 5e combat tracker with two UIs:

- `GM view` (default): full control of initiative, condition monitors, logs, and session management.
- `Player view` (`?mode=player&room=ROOMCODE`): limited visibility and controls for claimed characters.

Core capabilities:

- Track combat turn/pass/initiative order.
- Manual or automatic initiative rolls.
- Interrupt actions with initiative costs.
- Action declaration modal (Free/Simple/Complex + Matrix categories).
- Character claim system for players.
- Shared action log.
- Tie-breaking on equal initiative totals using SR5-friendly stat order.

### Quick Start (Local)

Use two terminals:

1. Start session server:

```bash
npm run server
```

2. Start Angular dev app:

```bash
npm start
```

Then open:

- GM: `http://localhost:4200`
- Player (after room created): `http://localhost:4200/?mode=player&room=ROOMCODE`

Notes:

- `npm start` uses Angular dev proxy (`proxy.conf.json`) so `/socket.io` forwards to `localhost:3001`.
- If server is not running, share/session features fail.

### Quick Start (Production)

Build and run the Node server:

```bash
npm run prebuild
npx ng build --configuration production
node server.js
```

In production, `server.js` serves:

- Socket server (`/socket.io`)
- Health endpoint (`/health`)
- Built Angular app from `dist/...`

## Deep Dive

## 1. Runtime Architecture

### Frontend stack

- Angular standalone components (no NgModule-based app shell).
- Bootstrap + ng-bootstrap UI.
- Socket.IO client for real-time GM/player sync.

Main entry points:

- `src/main.ts`: bootstraps `AppComponent`.
- `src/app/app.component.ts`: selects mode via query param:
  - `mode=player` => `PlayerViewComponent`
  - default => `BattleTrackerComponent`

### Backend/session server

`server.js` is an Express + Socket.IO server.

Responsibilities:

- Create/join/close GM rooms.
- Player joins rooms.
- Relay:
  - shared state snapshots,
  - log entries,
  - command events.
- Keep room state in-memory (not persisted).
- Serve Angular static files in production.

Session storage:

```ts
Map<roomCode, {
  state: SharedCombatState | null;
  log: SharedLogEntry[];
}>
```

## 2. Domain Model (Combat Engine)

Core classes:

- `src/Combat/CombatManager.ts`
- `src/Combat/Participants/Participant.ts`
- `src/Combat/Participants/ParticipantList.ts`
- `src/Combat/ActionHandler.ts`
- `src/InterruptTable.ts`

### Participant initiative

Each participant has:

- `baseIni`
- `diceIni` (rolled value)
- `dices` (number of d6)
- wound modifier (`wm`)
- action initiative modifiers from interrupt/action history

Current initiative formula (`Participant.getCurrentInitiative()`):

```text
diceIni + baseIni - wm - (initiativePass - 1)*10 + actionIniModifier
```

Where:

- `wm` is derived from physical/stun damage and pain tolerance.
- `actionIniModifier` is sum of applied interrupt/action modifiers.

### Status lifecycle

`StatusEnum`:

- `Waiting`
- `Active`
- `Delaying`
- `Finished`
- `OOC`

`CombatManager` transitions participants through action phases by:

- finding highest initiative waiting actors,
- marking them active,
- finishing them on action,
- advancing pass/turn when no active actors remain.

### Tie-break behavior

Sorting uses a custom comparator in `BattleTrackerComponent`:

1. Total current initiative (with edge/ooc offsets from existing model behavior)
2. Edge rating
3. Reaction
4. Intuition
5. Random tie-break seed
6. Sort order fallback

When multiple current actors still tie, `enforceSingleCurrentActor()` keeps exactly one active actor (top-ranked).

## 3. GM UI Behavior

File: `src/app/battle-tracker/battle-tracker.component.ts` + `.html` + `.css`

### Initiative prep flow (before combat turn starts)

`Start Combat Turn`:

- If no pending rolls -> starts combat turn immediately.
- If pending rolls exist:
  - enters initiative prep mode,
  - requests player roll submissions (if needed),
  - shows pending counts and action buttons.

Prep actions:

- `Request Player Rolls`
- `Roll Remaining Non-Player`
- `Force Roll Outstanding` (confirmation required)
- `Begin Combat Turn` (enabled only when no pending rolls)

### Act/Delay/Interrupt

- `Act` opens modal action planner.
- `Delay` sets status delaying and advances when needed.
- `Interrupts` use `ActionHandler.coreInterrupts` from `InterruptTable`.

Interrupts currently:

- Full Defense (-10, persistent)
- Block (-5)
- Parry (-5)
- Dodge (-5)
- Hit the Dirt (-5)
- Intercept (-5)

### Action planner validation

Rules enforced in GM and Player planners:

- Max 1 Free action selection.
- Max 2 Simple actions.
- Max 1 Complex action.
- Complex cannot be combined with Simple.
- Max one Simple attack action per action phase.
- `Call a Shot` requires a compatible attack action.
- `Multiple Attacks` requires a compatible action.
- Explicit conflict map (for example `Quick Draw` vs `Ready Weapon`).

### Claims and ownership

GM can toggle each participant:

- `Claimable` or `Private`

Players can only claim `Claimable` participants that are unowned.

## 4. Player UI Behavior

File: `src/app/player-view/player-view.component.ts` + `.html` + `.css`

### Join flow

Player opens player mode and:

1. Enters room code (or uses prefilled query param).
2. Joins room.
3. If they do not own a character:
  - claim an unclaimed claimable character, or
  - create a new character.

Player identity is a generated token for the browser tab session:

```text
pl-xxxxxxxx
```

No login/auth is used.

### Visibility restrictions

Players can see:

- initiative order,
- own initiative score,
- action log.

Players cannot see:

- full condition monitor/stats editor panel from GM UI,
- others’ numeric initiative scores.

### Roll prompts

GM `request_rolls` command shows player roll prompt.
GM `clear_roll_prompt` command hides prompt (for example after force-roll).

## 5. Shared State + Command Protocol

Socket contract is implemented by:

- server: `server.js`
- client service: `src/app/services/session-sync.service.ts`

### Core events

GM/session:

- `gm:create-session`
- `gm:join-session`
- `gm:close-session`

Shared sync:

- `session:update-state`
- `session:state`
- `session:append-log`
- `session:log-entry`
- `session:command`
- `session:closed`

Player:

- `player:join`

### Command types in use

From player to GM handler:

- `register_character`
- `claim_character`
- `release_claims`
- `roll_submission`
- `act`
- `delay`
- `interrupt`

From GM to players:

- `request_rolls`
- `clear_roll_prompt`

## 6. Logging

Two log systems exist:

- Local GM debug log (`LogHandler`) for non-shared operation.
- Shared room log (`sharedLogEntries`) synchronized by server.

Formatting highlights:

- action keywords (`Free:`, `Simple:`, `Complex:`, interrupts)
- initiative roll numbers
- physical/stun damage values
- healing values

Log list auto-scrolls to newest entries and flashes new entries briefly.

## 7. Undo/Redo Model

Files:

- `src/Common/UndoHandler.ts`
- `src/Common/Undoable.ts`

Property mutations and command actions are recorded in chapters.

- `UndoHandler.StartActions()` begins a chapter.
- property setters call `Undoable.Set(...)`.
- `Undo` and `Redo` replay/rollback chapters.

GM UI exposes undo/redo controls in toolbar.

## 8. Deployment Notes

### Static serving and socket same-origin

`server.js` serves Angular build and Socket.IO from same origin to avoid mixed-origin issues.

Static build path detection checks:

1. `dist/battle-tracker/browser`
2. `dist/browser`
3. `dist`

### CSP and production CSS

The app uses a strict CSP meta tag in `src/index.html`.

Production build setting in `angular.json` disables critical CSS inlining:

```json
"optimization": {
  "styles": {
    "inlineCritical": false
  }
}
```

This avoids CSP conflicts with stylesheet `onload` patterns and prevents “unstyled” production pages.

### Health checks

- `GET /health` returns `{ "ok": true }`

## 9. Security and Limitations

Current limitations:

- No authentication/authorization.
- `cors()` allows all origins on session server.
- Room state is in-memory only (lost on restart).
- Player identity is per-tab token, not account-based.

Before larger public use, consider:

- auth (GM + player identity),
- persistent store (Redis/Postgres),
- role authorization on server commands,
- rate limits + room TTL cleanup.

## 10. Where To Edit Things Quickly

### Add/rename declared actions and descriptions

- `src/app/shared/declared-actions.ts`

### Change interrupts and initiative costs

- `src/InterruptTable.ts`
- `src/Combat/ActionHandler.ts`

### GM initiative prep and turn start flow

- `src/app/battle-tracker/battle-tracker.component.ts`
  - `btnStartRound_Click`
  - `rollOutstandingInitiative`
  - `beginCombatTurn`
  - `updateInitiativePrepInfo`

### Claim flow and player command handling

- `src/app/battle-tracker/battle-tracker.component.ts`
  - `handleSessionCommand`
  - `upsertPlayerParticipant`
  - `getSharedParticipants`

### Session transport and socket errors

- `src/app/services/session-sync.service.ts`
- `server.js`

### Player UI restrictions and controls

- `src/app/player-view/player-view.component.ts`
- `src/app/player-view/player-view.component.html`

## 11. Suggested Next Improvements

- Persist rooms and participants to a datastore.
- Add reconnect-friendly player identity or authenticated login.
- Add server-side validation/authorization for commands.
- Add automated tests for:
  - tie-break ordering,
  - declared action validation,
  - claim/reclaim behavior.
