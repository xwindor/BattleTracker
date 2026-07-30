# BattleTracker — Persistent Player Characters

**Design plan, not an implementation brief.** Decomposition into agent prompts happens after this doc is reviewed.

Prepared: 2026-05-13 · Updated: 2026-05-23
Companion to: `docs/SR5E_Matrix_Module_Plan.docx`

---

## 1. The problem

When a player joins a BattleTracker session today they re-type their full character stats every time:

- `characterName`, `initiativeDice`, `edgeRating`, `reaction`, `intuition`
- `overflowHealth`, `physicalHealth`, `stunHealth`

These values are sent via the `register_character` Socket.IO command, the GM constructs a `Participant` on receipt (`battle-tracker.component.ts` → `upsertPlayerParticipant`), and on the next session the player starts again from scratch. The `playerToken` itself (`pl-XXXX`) is regenerated on every page load, so even "the same player came back" has no meaning to the system.

The goal: a returning player has their character stats and identity persist between sessions, without forcing decisions about auth, accounts, or server-side storage we aren't ready for.

---

## 2. Scope

### In scope (v1)

1. **Stable per-browser player identity.** Same browser = same `playerToken` forever.
2. **Saved character templates on the player's browser.** Templates live in the player's `localStorage`; survive reloads, server restarts, and the GM closing the session.
3. **"Load template" into the create-character form.** Selecting a saved character populates the form fields. Player still clicks Create to register it with the GM.
4. **"Resume character" auto-claim.** If on join the GM's current session already has a participant whose `ownerName` matches this browser's `playerToken`, surface a "Resume X" affordance instead of re-registering.
5. **Forward-compatibility with Matrix and Magic modules.** The template schema accommodates decker fields and an awakened discriminator from day one so no v2 migration is needed when those modules land.

### Out of scope (v1)

- Cross-device portability — templates live on one browser only.
- Cross-session character persistence on the server — combat state still dies with the session.
- Authentication of any kind — `playerToken` is a bearer token, valid only as long as the browser keeps it.
- GM-side NPC roster — separate feature (see §10).
- Character sharing between players — separate feature.
- Persisting in-combat state (damage, OS, status) — only the *stat template* persists, not the live participant.

### Explicit non-goal

We are not building anything that survives clearing `localStorage`. If the user clears browser data they lose their characters. This is acceptable for v1 because it costs us nothing and unblocks the user-visible benefit immediately.

---

## 3. Relationship to the Matrix and Magic modules

### 3.1 Schema must be kind-aware from day one

The Matrix module introduces `MatrixParticipant extends Participant` with new fields (`vrMode`, `attack`, `sleaze`, `dataProcessing`, `firewall`, `deviceRating`, etc.). The Magic module introduces `AstralParticipant` with `isAwakened` and `astralProjecting` booleans. Of these, the deck attributes (A/S/D/F + Device Rating, preferred VR mode) and the awakened discriminator are *character-level* attributes the player would want to save; runtime state (OS, marks, jacked-in status, astral projection state) should never be persisted.

The template schema therefore needs:

- A `kind: 'physical' | 'matrix' | 'awakened'` discriminator (extensible later: `'rigger'`, etc., without a schema bump).
- An optional `matrix: { ... }` sub-object present only when `kind === 'matrix'`.
- An optional `awakened: { }` sub-object present only when `kind === 'awakened'` (initially empty — nothing to persist yet beyond the discriminator itself, but the slot must exist).

### 3.2 GM-side `upsertPlayerParticipant` — Matrix branch: ✅ DONE

As of the Matrix Steps 1–2 landing on main, `upsertPlayerParticipant` already handles decker registration. It:

- Creates `new MatrixParticipant()` when `isMatrix === true` in the payload (vs. `new Participant()` for physical characters).
- Handles type-mismatch detection — if a player re-registers switching from physical to matrix or vice versa, the old participant is torn down and a new one constructed.
- Sets all deck attributes and VR mode from the payload.

**Wire format note:** The current implementation uses `isMatrix: boolean` in the `register_character` payload (not the `kind: 'matrix'` string this plan originally proposed). Deck configuration after initial registration uses a **separate command type**, `configure_deck`, which was not anticipated in the original plan. See §5.3.

The `kind === 'awakened'` GM-side branch does not yet exist because `AstralParticipant` has not landed on main. That branch is Magic module's responsibility, analogous to what Matrix Phase 1 did for deckers.

### 3.3 Sequencing vs Matrix and Magic phases

| Branch / Phase | Status | Notes |
|---|---|---|
| `main` — Matrix Steps 1–2 | ✅ Shipped | `MatrixParticipant`, `ICParticipant`, OS counter, decker badge, player deck panel, GM `upsertPlayerParticipant` matrix branch |
| `feat/matrix-module` — Steps 3–5 | 🔄 In progress | IC spawner, workflow panel, host & target creation |
| `feat/magic-module` — Astral initiative | 🔄 In progress | `AstralParticipant`, awakened/astral-projecting toggle; not yet merged to main |
| Persistent Characters v1 | ⬜ Not started | **Independent of all of the above — can ship now.** |
| Matrix Steps 6–11 | ⬜ Planned | Mark tracking, reveals, OS automation, full workflow |
| Persistent Characters v2 | ⬜ Design pending | Server-side persistence; only after v1 lands |

Persistent Characters v1 is **independent** of all in-flight branches. The only file coordination needed:

- `player-view.component.ts` / `.html` — Persistent Characters adds the "My Characters" panel and template load/save logic. Matrix Steps 3–5 and the Magic module do not touch these files. No conflict.
- `upsertPlayerParticipant` — already handles Matrix; the Awakened branch is Magic's responsibility. This plan does not need to touch that function for v1 (physical characters only need the existing `new Participant()` path).

### 3.4 Server hardening must allowlist all active command types

If we add server-side trust enforcement (bug-sweep agenda), the allowlist must include the Matrix-introduced types already in use: `configure_deck`, `roll_submission` (with `isDelta`), `dice_roll`, and any future magic commands. This plan introduces no new command types.

---

## 4. User-facing experience

### 4.1 First-time player flow (unchanged feel, new persistence)

1. Player loads the player URL with `?room=ABCDEF` (or types the code).
2. **New:** browser silently looks up its `playerToken` in `localStorage`. If missing, generates one once and persists it.
3. Player sees the join screen. **New:** above the create-character form, a "My Characters" section is empty with a tooltip: "Save a character below to reuse it next time."
4. Player fills in Razor: name, dice, edge, R, I, health. **New:** alongside "Create Character" is "Save & Create" — saves the template *and* registers.
5. Combat happens.
6. Player closes browser tab.

### 4.2 Returning player flow (the actual win)

1. Player loads the player URL again days later (same browser).
2. Page reads the persisted `playerToken` — same identity as before.
3. "My Characters" lists Razor. Player clicks **Load** → form is pre-filled. Player clicks **Create Character** (which sends `register_character` as today) and joins combat.
4. Alternative: if the GM happens to already have a participant in the session with `ownerName === playerToken` and a matching name, the player sees a **Resume Razor** button at the top of the screen. Clicking it sends `claim_character` against that participant ID and skips the create-character form entirely.

### 4.3 GM experience

Almost no change in v1.

- The GM does not see "saved templates" on their side — these live in the player's browser.
- The GM does see that returning players have a stable token, which means their existing `participantOwners` map keyed by `ownerName` stays consistent across the player's reloads within the same session lifetime.
- The GM-side `upsertPlayerParticipant` already branches on `isMatrix` and transparently produces a `MatrixParticipant` instance when a decker registers. No GM-side UI change required by this plan.

### 4.4 Decker player flow — current state (Matrix Steps 1–2 already live)

The decker panel is **already built** in the player view. The actual flow as implemented:

1. Player registers via the normal `register_character` form (physical character: `isMatrix: false`).
2. After their character appears, the "Your Character" card shows a **Cyberdeck** button in the header.
3. Clicking Cyberdeck expands the deck panel. Player enters ASDF + Device Rating and clicks **Create** → sends `configure_deck { isMatrix: true, create: true, ...stats }`. The GM's `upsertPlayerParticipant` switches the participant to a `MatrixParticipant` instance.
4. Player selects AR / Cold-Sim / Hot-Sim and clicks **Jack In** → sends `configure_deck { jackIn: true, vrMode, ...stats }`. This sets initiative mode and VR catatonia.
5. Once jacked in, player can switch modes or Jack Out from the same panel.

**What the persistent character template adds for deckers:** when the player loads a `kind: 'matrix'` template, the create-character form pre-fills name/stats, and the deck panel pre-fills A/S/D/F + Device Rating + preferred VR mode. The player still clicks Create then Cyberdeck → Create → Jack In, but types nothing twice.

### 4.5 Awakened player flow (anticipated — feat/magic-module, not yet on main)

When `AstralParticipant` lands:

1. Player opens the create-character form. **New (Magic-aware UI):** the form has a "Character type" toggle: Physical / Decker / Awakened.
2. Selecting **Awakened** reveals any awakened-specific fields (none in the initial cut — `awakened: {}` sub-object is empty until Magic module defines persistable stats).
3. Save & Create writes a template with `kind: 'awakened'` and a minimal `awakened: {}` sub-object.
4. On the GM side, the Magic module's `upsertPlayerParticipant` branch (to be added by that agent) constructs an `AstralParticipant` when `isAwakened === true` arrives.

The Awakened form toggle can ship with v1 (it only shows the discriminator) even before `AstralParticipant` lands on main — the GM gracefully falls back to `new Participant()` if the magic branch isn't there yet.

---

## 5. Data model

### 5.1 Template shape

`PlayerCharacterTemplate` (stored in player browser localStorage). All numeric fields are integers.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable UUID generated at save time. Survives renames. |
| `kind` | `'physical' \| 'matrix' \| 'awakened'` | Discriminator. Extensible to `'rigger'` etc. without schema bump. |
| `characterName` | string | Displayed name. Used as the default participant name on register. |
| `initiativeDice` | number | 1–5. For deckers in AR mode; overridden by VR mode at jack-in time. |
| `edgeRating` | number | Edge attribute. |
| `reaction` | number | Reaction attribute. |
| `intuition` | number | Intuition attribute. |
| `overflowHealth` | number | Overflow CM boxes. |
| `physicalHealth` | number | Physical CM boxes. |
| `stunHealth` | number | Stun CM boxes. |
| `matrix?` | object | Present iff `kind === 'matrix'`. See below. |
| `awakened?` | object | Present iff `kind === 'awakened'`. Currently `{}` — extensible when Magic module defines persistable stats. |
| `createdAt` | ISO string | For sorting in the "My Characters" list. |
| `updatedAt` | ISO string | For sorting / display. |

`PlayerCharacterTemplate.matrix` (only when `kind === 'matrix'`):

| Field | Type | Notes |
|---|---|---|
| `vrMode` | `'AR' \| 'cold-sim' \| 'hot-sim'` | Default mode to pre-select in the deck panel. |
| `attack` | number | Deck Attack attribute. |
| `sleaze` | number | Deck Sleaze attribute. |
| `dataProcessing` | number | Deck Data Processing attribute. |
| `firewall` | number | Deck Firewall attribute. |
| `deviceRating` | number | Deck Device Rating. |

**Not persisted** (session-only state): `overwatch`, `marksPlaced`, `jackedIn`, `blocksPhysicalActions`, `astralProjecting`. These reset every session.

### 5.2 localStorage layout

Two keys:

- `bt.playerToken.v1` → string. The stable identity for this browser. Generated once.
- `bt.playerCharacters.v1` → JSON-encoded record `{ [id: string]: PlayerCharacterTemplate }`.

Both keys are versioned (`.v1`) so we can migrate later without a guessing game.

Note: `bt.playerNotifyMuted.v1` already exists in the codebase (player-view mute preference). The new keys follow the same naming convention and must not collide.

### 5.3 Wire protocol (Socket.IO) — actual current format and what changes

**`register_character` command payload — current format:**

The server receives: `characterName`, `initiativeDice`, `edgeRating`, `reaction`, `intuition`, `overflowHealth`, `physicalHealth`, `stunHealth`, `isMatrix` (boolean).

The current `isMatrix` field drives `upsertPlayerParticipant` to create either `new Participant()` or `new MatrixParticipant()`. This is already implemented.

For Persistent Characters v1, the payload is unchanged. The `kind` field lives in the template on the client; the translation to `isMatrix: boolean` happens at register time in the player view.

**`configure_deck` command — already in use, not in the original plan:**

Sent by the player after initial registration to activate, configure, jack in, or jack out a cyberdeck. The payload carries:

- `isMatrix: boolean` — always `true` for activation; `false` to remove the deck.
- `create: true` — initial deck activation (stats only, no VR mode set yet).
- `jackIn: true` — jack-in or mid-combat mode switch; includes `vrMode`.
- `jackOut: true` — jack-out; reverts to physical initiative.
- Deck stats: `dataProcessing`, `attack`, `sleaze`, `firewall`, `deviceRating`.

This command type is handled in `battle-tracker.component.ts` alongside `register_character`. No server.js changes needed (server relays all commands as-is).

**Awakened wire format (anticipated — Magic module):** expected to add `isAwakened: boolean` to `register_character`, analogous to `isMatrix`. This plan does not define it — that's the Magic module's responsibility.

**`claim_character` command — unchanged.** Continues to send `participantId`. The "Resume Razor" affordance is a UI shortcut to the existing claim flow.

### 5.4 Auto-claim heuristic

On player join, the player view receives the current `SharedCombatState`. To decide whether to show a "Resume X" button, the player view looks for a participant where:

- `ownerName === this.playerToken` (exact match), AND
- `claimable === true`, AND
- The player has a template whose `characterName` equals the participant's name

If multiple matches, list all of them with separate Resume buttons.

If zero matches, "Resume" is not shown — player goes through the normal load/create flow.

---

## 6. Design decisions (with rationale)

### D1. Why client-side localStorage, not server-side persistence
- **Simplicity**: zero server changes, no DB, no auth. Ships fast.
- **Honest scope**: a persistent character that survives the server restart but not browser data clear is more useful than the user thinks, and forces zero security thinking.
- **Migration story**: v2 (server-side) can read v1 templates and offer to import them.

### D2. Why the `kind` discriminator
- The Matrix module added `MatrixParticipant`. The Magic module is adding `AstralParticipant`. If we don't discriminate now we'll do it later with data migration.
- Cost of adding the discriminator now: ~10 lines of type definition. Cost of adding it later: data migration + every consumer needs a fallback.
- The wire protocol uses `isMatrix: boolean` for the GM side (already done). The template uses `kind` as a human-readable discriminator that can drive UI toggle state and is translated to the appropriate wire flags at register time.

### D3. Why a stable `playerToken` per browser, not per-character
- The `participantOwners` map in battle-tracker is keyed by `ownerName`, which is the `playerToken`. One token per browser keeps the existing claim logic untouched.
- Multiple characters per browser are handled by the template list, not by multiple tokens.
- Honest tradeoff: a returning player on a different device looks like a new player. That's the line we're not crossing in v1.

### D4. Why "Resume" is a separate affordance from "Load"
- **Load** rehydrates the form and lets the player edit before registering. Useful when the character has changed (level up, new gear).
- **Resume** skips the form entirely and re-attaches to an existing participant in the session. Useful when nothing has changed.
- Two buttons because the use cases are different. Resume is also conditional (requires the GM session to already have a matching participant); Load always works.

### D5. Why we don't persist live state (damage, OS, status)
- Combat state belongs to a combat, not to a character.
- Persisting damage across sessions is a different feature ("save game") with different UX expectations.
- The Matrix module explicitly resets OS on jack-out — persisting OS across browser reloads would violate the rules.

### D6. Why no GM-side UI in v1
- Adding GM-side template management (NPC roster, pregens to push to players) is a bigger feature with different stakeholders.
- v1 is strictly "the player doesn't retype stats." Anything beyond that is v2 or a sibling feature.

### D7. Why the template stores deck stats separately from the create-character form
- The player-view deck panel (`deckConfigExpanded`) is a post-registration step triggered by the "Cyberdeck" button — it is not part of the create-character form.
- Saving a `kind: 'matrix'` template captures both form fields (name, REA, INT, dice, edge, health) and deck panel fields (A/S/D/F, Device Rating, preferred VR mode) so the player doesn't have to re-enter either set.
- On Load, the template pre-fills both the create-character form and the component-level deck stat fields (`this.dataProcessing`, etc.) so they're ready when the player expands the deck panel.

---

## 7. Risks and trade-offs

| Risk | Mitigation |
|---|---|
| Player clears `localStorage` → loses everything. | Document it. v2 (server-side) addresses it later. |
| Player on a new device → no characters. | Same. Out of scope for v1. |
| Schema needs a fourth character kind (rigger) later. | The `kind` discriminator is open-ended; add a `rigger` sub-object and a fourth toggle. No migration. |
| Two players on the same browser session (unusual but possible — shared family laptop). | The `playerToken` is per-browser, so they'd share characters and identity. Document, don't solve. |
| GM closes a session and reopens it with the same room code → does Resume work? | Room codes regenerate per session in the existing code; the GM would have to reuse the same room ID for Resume to work. Server-side state is wiped on `gm:close-session`. Resume requires the session to currently have a matching participant, so it only works within an active session lifetime. Acceptable. |
| Auto-claim wrong character because two templates share the same `characterName`. | Match is on `ownerName === playerToken` first, then name. Two characters from the same browser with the same name is a user error — we display both Resume buttons and let them pick. |
| `configure_deck` is sent before Load pre-fills deck stats, so the panel shows stale defaults. | On Load, set component fields (`this.dataProcessing`, etc.) before the player opens the deck panel. The player sees correct values when they click Cyberdeck. |

---

## 8. Integration points (files affected)

This section is for the eventual implementation agent. Not exhaustive — the prompt will name specifics.

### Player-side (all changes here)
- `src/app/player-view/player-view.component.ts` — adds:
  - Stable `playerToken` from `localStorage` instead of `Math.random()` on every init (currently line 109: `this.playerToken = \`pl-${Math.random()...}\`` — this must change)
  - Template list UI, load/save handlers
  - Pre-fill logic for both the create-character form fields and the deck stat fields (`this.dataProcessing`, `this.attack`, etc.)
  - Resume button logic using `ownerName` matching
- `src/app/player-view/player-view.component.html` — the actual form changes (My Characters panel above the create-character form; Save & Create button alongside Create)
- **New**: `src/app/services/player-character-store.service.ts` — Angular-injectable wrapper over `localStorage`

### Wire format
- `src/app/services/session-sync.service.ts` — no type changes needed for v1 physical characters. The `SharedParticipantState` interface already carries `isMatrix`, `vrMode`, and all deck stats. If the Awakened template toggle lands in v1, add `isAwakened?: boolean` to `SharedParticipantState` and the `register_character` payload type.

### GM-side (no changes needed for v1)
- `src/app/battle-tracker/battle-tracker.component.ts` — `upsertPlayerParticipant` already handles the Matrix branch (`isMatrix === true → new MatrixParticipant()`). No changes for v1 physical-character persistence. The Awakened branch is Magic module's responsibility.

### Server
- `server.js` — **no changes**. Server is an opaque relay.

---

## 9. Acceptance criteria for v1

1. A player can save the current form values as a template.
2. A saved template appears in "My Characters" after a full page reload.
3. Clicking Load populates the form with the template's values (and, for `kind: 'matrix'`, also pre-fills the deck stat fields).
4. Clicking Save & Create both saves the template and sends `register_character` (no duplicate template).
5. The `playerToken` is identical across page reloads in the same browser (currently regenerates on every load — this is the primary technical change needed in `ngOnInit`).
6. Clearing `localStorage` then reloading produces a fresh empty state (no error, no orphan templates).
7. A returning player whose character is still in the GM's session sees a "Resume X" button and clicking it claims that participant without re-registering.
8. A decker template (`kind: 'matrix'`) saves and loads correctly. On Load, the create-character form is pre-filled and the deck stat fields (`this.dataProcessing`, `this.attack`, etc.) are pre-set so that when the player clicks Cyberdeck the values are already populated.
9. An awakened template (`kind: 'awakened'`) saves and loads correctly with the discriminator. The GM falls back to `new Participant()` until the Magic module's branch lands (same graceful degradation pattern as deckers pre-Matrix Phase 1).
10. No server.js changes are required for any of the above.

---

## 10. Adjacent features explicitly NOT in this plan

These are tempting but separate. Flagged so we don't quietly scope-creep:

- **GM-side roster** of recurring NPCs/pregens (saved by the GM, recallable from the GM panel). Different stakeholder, different storage layout.
- **GM-pushed pregens** ("here, play this character"). Requires bidirectional template wire format.
- **Cross-device sync** for player characters. Needs server storage + identity. This is the v2 design.
- **Character sharing between players**. ("Send your Razor to me so I can play him next week.")
- **Versioned template history.** (Roll back to "Razor before he got cyberware.")
- **Import/export to file or paste-buffer**. (Useful for backup; not needed for v1.)

Some of these are good ideas. None of them are this plan.

---

## 11. Open questions for review

The original list, with answers where the existing code has resolved them:

1. **Confirm v1 scope is localStorage-only.** If you'd rather skip v1 and go straight to server-side, the design changes materially (auth model, durability, identity).

2. **Save & Create vs. separate Save / Create buttons?** Doc currently proposes both Save & Create *and* a separate Save (since you might want to save a template you're about to edit instead of register). Or just Save alongside Create? Pick one.

3. **Decker-form fields in v1?** ✅ **Answered by existing code.** The deck panel is already live on the player view. The template should save deck stats (`kind: 'matrix'` with `matrix: { ... }`) to pre-fill that panel. The Awakened toggle (`kind: 'awakened'`) can also ship in v1 with an empty `awakened: {}` sub-object since the form toggle is trivial to add.

4. **Auto-claim — silent or confirmed?** Should "Resume Razor" be a button the player explicitly clicks (current proposal), or auto-claim on join if there's an exact match?

5. **Template name uniqueness.** If a player saves a second template under an existing `characterName`, do we overwrite, error, or keep both (UUIDs are separate)? Current proposal: keep both, UUIDs distinguish them, the list shows them in update-date order.

6. **Template deletion UX.** Doc assumes a trash icon per template with a confirm dialog. Confirm that's fine; or do you want bulk-clear / export-first?

7. **Should `Resume` survive a GM-side `End Combat` but before `Close Room`?** Currently `End Combat` calls `softReset` on all participants — the participants stay in the room. So Resume would still work. Confirm that's the intended behavior.

8. **`overflowHealth`, `physicalHealth`, `stunHealth` — do these belong in the template at all?** They're derived from `Body` in SR5E (overflow = Body, physical CM = 8 + Body/2). If we expose Body as a single input, the template is smaller. Or we keep them as overrides for monstrous statblocks. Current proposal: keep all three explicit because they're already in the create-character form today; don't widen scope by restructuring the form.

---

## 12. What's next

Persistent Characters v1 is unblocked today. It does not depend on any in-flight branch.

**Anticipated prompts, in order:**

1. **Identity-and-store prompt** — Create `PlayerCharacterStoreService` (localStorage wrapper) and fix `ngOnInit` in `player-view.component.ts` to use a stable `bt.playerToken.v1` from `localStorage` instead of regenerating on every load. This is the single most impactful change and unblocks everything else.

2. **Player-form UI prompt** — Add the "My Characters" panel above the create-character form. Load / Save & Create buttons. For `kind: 'matrix'` templates, also pre-fill the deck stat fields. For `kind: 'awakened'`, just store the discriminator (no extra fields yet). Confirm the Save & Create vs. separate buttons question first.

3. **Resume button prompt** — On join, compare the incoming `SharedCombatState` participant list against saved templates keyed by `ownerName === playerToken`. Surface Resume buttons. Wire to existing `claim_character` command.

4. **Handoff note to Magic module** — When `AstralParticipant` lands, the `upsertPlayerParticipant` agent should add an `isAwakened === true → new AstralParticipant()` branch, analogous to the existing Matrix branch. The wire payload should add `isAwakened: boolean` to `register_character`. The Persistent Characters template's `awakened: {}` sub-object can be extended at that point with any persistable stats.

5. **v2 design-doc prompt** (only after v1 lands) — server-side persistence, cross-device identity, import/export.

We'll write those one at a time, with you driving.
