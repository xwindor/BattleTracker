// Promoted scenarios for briefs/action-log-improvements.md.
//
// Covers the spec's acceptance criteria 1-14 and its gameplay scenarios
// S1-S5. AC15 (item 4, damage-driven status transitions) is explicitly
// deferred by the spec's "Rules dependency" section and is not exercised here.
//
// The subject is what the shared session Action Log *says* and who it says it
// about - not initiative math, which has its own suite
// (running-initiative-score.spec.ts).

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { IParticipant } from 'Combat/Participants/IParticipant';
import { Participant } from 'Combat/Participants/Participant';
import { MatrixParticipant } from 'Matrix/MatrixParticipant';
import { SessionSyncService, SharedLogEntry } from 'app/services/session-sync.service';
import { ConfirmationDialogService } from 'app/confirmation-dialog/confirmation-dialog.service';
import { getLogTextClass } from 'app/shared/log-formatter';
import { interruptTable } from 'InterruptTable';
import { LogHandler } from 'Logging';

const FULL_DEFENSE = interruptTable.find(a => a.key === 'fullDefense')!;

/**
 * A player token as the player client actually mints it
 * (`player-view.component.ts`: `pl-${Math.random().toString(36).slice(2, 10)}`).
 * Opaque, not a human name - the whole point of the attribution change is that
 * this value must never reach the log.
 */
const PLAYER_TOKEN = 'pl-8f2a91bc';
const OTHER_PLAYER_TOKEN = 'pl-k3f9a2b1';

function resetCombat() {
  CombatManager.participants.clear(false);
  CombatManager.currentActors.clear(false);
  CombatManager.nextSortOrder = 0;
  CombatManager.initiativePass = 1;
  CombatManager.combatTurn = 1;
  CombatManager.started = false;
  CombatManager.passEnded = true;
}

describe('Action Log attribution, wording and coverage', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;
  let dialog: ConfirmationDialogService;
  /** Entries that actually went out on the wire, in send order. */
  let sent: SharedLogEntry[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();

    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    resetCombat();

    sync = TestBed.inject(SessionSyncService);
    dialog = TestBed.inject(ConfirmationDialogService);
    sent = [];
    // Stand in for the server echo: a broadcast entry reaches the GM's own
    // pane by coming back from the server, which is what puts visible and
    // hidden entries into one ordered list. Without this the ordering
    // assertions (AC10) would only ever see the hidden half.
    spyOn(sync, 'appendLog').and.callFake((entry: SharedLogEntry) => {
      sent.push(entry);
      component['insertSharedLogEntry'](entry);
    });
    spyOn(sync, 'sendCommand').and.stub();

    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => {
    resetCombat();
  });

  // ── helpers ────────────────────────────────────────────────────────────

  function addCombatant(name: string): Participant {
    component.addParticipant(false);
    const p = CombatManager.participants.items[
      CombatManager.participants.items.length - 1
    ] as Participant;
    p.name = name;
    return p;
  }

  function command(type: string, player: string, payload: Record<string, unknown> = {}) {
    component['handleSessionCommand']({
      type,
      player,
      payload,
      timestamp: new Date().toISOString()
    });
  }

  function registerCharacter(player: string, characterName: string) {
    command('register_character', player, {
      characterName,
      initiativeDice: 2,
      edgeRating: 3,
      reaction: 5,
      intuition: 4,
      overflowHealth: 4,
      physicalHealth: 10,
      stunHealth: 10
    });
  }

  function findByName(name: string): IParticipant {
    return CombatManager.participants.items.find(p => p.name === name)!;
  }

  /** Every log entry the GM's pane holds, in display order. */
  function paneTexts(): string[] {
    return component.sharedLogEntries.map(e => `${e.actor}: ${e.text}`);
  }

  // ── AC1, AC5 - register_character ──────────────────────────────────────

  describe('register_character (AC1, AC5)', () => {
    it('logs exactly one entry attributed to the character, not "GM" and not the token', () => {
      registerCharacter(PLAYER_TOKEN, 'Wombat');

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Wombat');
      expect(sent[0].actor).not.toBe('GM');
      expect(sent[0].actor).not.toMatch(/^pl-/);
      expect(sent[0].text).toBe('joined the session');
    });

    it('never leaks the raw player token into actor or text', () => {
      registerCharacter(PLAYER_TOKEN, 'Wombat');

      for (const entry of sent) {
        expect(entry.actor).not.toContain(PLAYER_TOKEN);
        expect(entry.text).not.toContain(PLAYER_TOKEN);
      }
    });

    // D2. An empty character name used to fall back to `command.player`, which
    // `upsertPlayerParticipant` writes straight onto `participant.name` - so
    // the token became the row's *permanent* name, not just one bad log line.
    it('D2 - an empty character name never becomes the participant name', () => {
      command('register_character', PLAYER_TOKEN, {
        characterName: '',
        initiativeDice: 1,
        reaction: 4,
        intuition: 4
      });

      const registered = CombatManager.participants.items[0];
      expect(registered.name).not.toBe(PLAYER_TOKEN);
      expect(registered.name).not.toMatch(/^pl-/);
      expect(registered.name).toBe('Unnamed Character');
      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Unnamed Character');
    });

    // Same defect via the other door: a client that puts the token in the name
    // field itself (a reload restores the token but not the character name).
    // The check is an *exact* comparison against `command.player`, so this is
    // caught by identity, not by looking `pl-`-ish.
    it('D2 - a character name equal to the sender\'s own token is refused', () => {
      command('register_character', PLAYER_TOKEN, {
        characterName: PLAYER_TOKEN,
        initiativeDice: 1
      });

      expect(CombatManager.participants.items[0].name).toBe('Unnamed Character');
      expect(sent[0].actor).not.toMatch(/^pl-/);
    });

    // N1. The shape heuristic that used to back D2 destroyed legitimate names:
    // a character genuinely called "PL-2077" matched `/^pl-[a-z0-9]{4,}$/i` and
    // was permanently renamed to the fallback, recoverable only by the GM
    // hand-editing the name box. The token is available exactly at this call
    // site (`command.player`), so identity is the right test, not shape.
    it('N1 - keeps a legitimate character name that merely looks token-shaped', () => {
      registerCharacter(PLAYER_TOKEN, 'PL-2077');

      expect(CombatManager.participants.items[0].name).toBe('PL-2077');
      expect(CombatManager.participants.items[0].name).not.toBe('Unnamed Character');
      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('PL-2077');
    });

    // The same name is still refused when it *is* this player's token, so the
    // narrower check has not reopened the leak it replaced.
    it('N1 - still refuses that name when it is literally the sender\'s token', () => {
      command('register_character', 'PL-2077', {
        characterName: 'PL-2077',
        initiativeDice: 1
      });

      expect(CombatManager.participants.items[0].name).toBe('Unnamed Character');
    });

    it('D2 - a whitespace-only character name does not leak the token either', () => {
      command('register_character', PLAYER_TOKEN, {
        characterName: '   ',
        initiativeDice: 1
      });

      expect(CombatManager.participants.items[0].name).toBe('Unnamed Character');
      expect(sent[0].actor).not.toContain(PLAYER_TOKEN);
    });

    // Open decision 7, resolved: a re-register genuinely is the player
    // re-announcing themselves, so it fires again rather than being suppressed.
    it('re-announces on a re-submission (open decision 7)', () => {
      registerCharacter(PLAYER_TOKEN, 'Wombat');
      registerCharacter(PLAYER_TOKEN, 'Wombat');

      expect(sent.length).toBe(2);
      expect(sent.every(e => e.actor === 'Wombat')).toBe(true);
    });
  });

  // ── AC2 - configure_deck ───────────────────────────────────────────────

  describe('configure_deck (AC2, AC5)', () => {
    beforeEach(() => {
      registerCharacter(PLAYER_TOKEN, 'Slamm-0');
      sent.length = 0;
    });

    it('attributes the deck-removed entry to the participant, not "GM"', () => {
      command('configure_deck', PLAYER_TOKEN, { isMatrix: false });

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Slamm-0');
      expect(sent[0].actor).not.toBe('GM');
      expect(sent[0].actor).not.toMatch(/^pl-/);
      expect(sent[0].text).toBe('deck removed');
    });

    // Finding C: a player jacking in mid-combat changes their Initiative Dice
    // count and running Score. That used to leave no shared-log trace at all.
    it('logs a jack-in with its VR mode (finding C)', () => {
      command('configure_deck', PLAYER_TOKEN, {
        isMatrix: true, jackIn: true, vrMode: 'hot-sim', dataProcessing: 5
      });

      const jackIn = sent.filter(e => e.text.startsWith('jacked in'));
      expect(jackIn.length).toBe(1);
      expect(jackIn[0].actor).toBe('Slamm-0');
      expect(jackIn[0].text).toBe('jacked in (Hot Sim)');
    });

    // D6. `jackIn: true` carries both events. A decker already in Hot Sim who
    // drops to Cold Sim never left the Matrix, so "jacked in (Cold Sim)" would
    // describe a connection that did not happen.
    it('D6 - a VR mode switch logs as a switch, not as a fresh jack-in', () => {
      command('configure_deck', PLAYER_TOKEN, {
        isMatrix: true, jackIn: true, vrMode: 'hot-sim', dataProcessing: 5
      });
      expect(sent.filter(e => e.text === 'jacked in (Hot Sim)').length).toBe(1);
      sent.length = 0;

      // Already jacked in: this is Switch Mode, not Jack In.
      command('configure_deck', PLAYER_TOKEN, {
        isMatrix: true, jackIn: true, vrMode: 'cold-sim', dataProcessing: 5
      });

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Slamm-0');
      expect(sent[0].text).toBe('switched to Cold Sim');
      expect(sent[0].text).not.toContain('jacked in');
    });

    it('D6 - jacking in again after a jack-out is a jack-in, not a switch', () => {
      command('configure_deck', PLAYER_TOKEN, {
        isMatrix: true, jackIn: true, vrMode: 'cold-sim', dataProcessing: 5
      });
      command('configure_deck', PLAYER_TOKEN, {
        isMatrix: true, jackOut: true, dataProcessing: 5
      });
      sent.length = 0;

      command('configure_deck', PLAYER_TOKEN, {
        isMatrix: true, jackIn: true, vrMode: 'hot-sim', dataProcessing: 5
      });

      expect(sent.length).toBe(1);
      expect(sent[0].text).toBe('jacked in (Hot Sim)');
    });

    it('logs a jack-out (finding C)', () => {
      command('configure_deck', PLAYER_TOKEN, {
        isMatrix: true, jackIn: true, vrMode: 'cold-sim', dataProcessing: 5
      });
      sent.length = 0;

      command('configure_deck', PLAYER_TOKEN, {
        isMatrix: true, jackOut: true, dataProcessing: 5
      });

      const jackOut = sent.filter(e => e.text === 'jacked out');
      expect(jackOut.length).toBe(1);
      expect(jackOut[0].actor).toBe('Slamm-0');
    });

    it('logs initial deck creation, and applies a bare stat edit silently (finding C)', () => {
      command('configure_deck', PLAYER_TOKEN, {
        isMatrix: true, create: true, dataProcessing: 4
      });
      expect(sent.filter(e => e.text === 'deck configured').length).toBe(1);

      sent.length = 0;
      command('configure_deck', PLAYER_TOKEN, {
        isMatrix: true, dataProcessing: 6, attack: 2
      });

      // The stats still land...
      const mp = findByName('Slamm-0') as MatrixParticipant;
      expect(mp.dataProcessing).toBe(6);
      expect(mp.attack).toBe(2);
      // ...but a bare stat-edit payload is unreachable from the real player
      // client (every `configure_deck` it sends carries create/jackIn/jackOut/
      // isMatrix:false), so it deliberately writes no shared-log line.
      expect(sent.length).toBe(0);
    });
  });

  // ── D1 - dice_roll must not leak the player token ──────────────────────

  describe('dice_roll attribution (D1, AC5)', () => {
    /** The dice-roll payload the player client actually sends. */
    function playerDiceRoll(roller: string) {
      command('dice_roll', PLAYER_TOKEN, {
        roller,
        diceCount: 3,
        values: [6, 5, 2]
      });
    }

    it('keeps a real character name', () => {
      playerDiceRoll('Wombat');

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Wombat');
    });

    // The client sends `roller: characterName || playerToken`, so a player who
    // has not named a character (or whose reload cleared it) puts the raw token
    // in the name slot itself.
    it('D1 - falls back to a non-token label when the roller is the token', () => {
      playerDiceRoll(PLAYER_TOKEN);

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Player');
      expect(sent[0].actor).not.toMatch(/^pl-/);
      expect(sent[0].actor).not.toBe(PLAYER_TOKEN);
    });

    it('D1 - falls back to a non-token label when no roller is sent at all', () => {
      command('dice_roll', PLAYER_TOKEN, { diceCount: 3, values: [6, 5, 2] });

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Player');
      expect(sent[0].actor).not.toContain(PLAYER_TOKEN);
    });

    it('D1 - never routes command.player into the actor, even as a last resort', () => {
      playerDiceRoll('');
      playerDiceRoll('   ');
      playerDiceRoll(PLAYER_TOKEN);

      expect(sent.length).toBe(3);
      for (const entry of sent) {
        expect(entry.actor).not.toBe(PLAYER_TOKEN);
        expect(entry.actor).not.toMatch(/^pl-/);
        expect(entry.text).not.toContain(PLAYER_TOKEN);
      }
      // ...and the roll still animates the GM's tray under the safe label.
      expect(component.incomingDiceRoll?.roller).toBe('Player');
    });

    // N1, the dice_roll half. The leak this guard exists for is the client
    // substituting *its own* token, so the test is identity-first: a
    // token-shaped string that is not this sender's token is a name.
    it('N1 - keeps a legitimate character name that merely looks token-shaped', () => {
      playerDiceRoll('PL-2077');

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('PL-2077');
    });
  });

  // ── Finding C - configure_astral ───────────────────────────────────────

  describe('configure_astral (finding C, AC5)', () => {
    beforeEach(() => {
      registerCharacter(PLAYER_TOKEN, 'Hatchetman');
      sent.length = 0;
    });

    it('logs Awakened on and off, attributed to the character', () => {
      command('configure_astral', PLAYER_TOKEN, { isAstral: true });
      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Hatchetman');
      expect(sent[0].text).toBe('is now Awakened');

      sent.length = 0;
      command('configure_astral', PLAYER_TOKEN, { isAstral: false });
      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Hatchetman');
      expect(sent[0].text).toBe('removed Awakened status');
    });

    it('logs entering and returning from astral space', () => {
      command('configure_astral', PLAYER_TOKEN, { isAstral: true });
      sent.length = 0;

      command('configure_astral', PLAYER_TOKEN, { project: true });
      const out = sent.filter(e => e.text.startsWith('entered astral space'));
      expect(out.length).toBe(1);
      expect(out[0].actor).toBe('Hatchetman');

      sent.length = 0;
      command('configure_astral', PLAYER_TOKEN, { project: false });
      const back = sent.filter(e => e.text.startsWith('returned from astral space'));
      expect(back.length).toBe(1);
      expect(back[0].actor).toBe('Hatchetman');
    });

    it('logs nothing when the requested projection state is already current', () => {
      command('configure_astral', PLAYER_TOKEN, { isAstral: true });
      sent.length = 0;

      command('configure_astral', PLAYER_TOKEN, { project: false });

      expect(sent.length).toBe(0);
    });
  });

  // ── AC3 - claim_character ──────────────────────────────────────────────

  describe('claim_character (AC3, AC5)', () => {
    it('attributes the claim to the claimed participant', () => {
      const pc = addCombatant('Wombat');
      component.btnToggleClaimable_Click(pc);
      sent.length = 0;

      command('claim_character', PLAYER_TOKEN, {
        participantId: component['getParticipantId'](pc)
      });

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Wombat');
      expect(sent[0].actor).not.toBe('GM');
      expect(sent[0].actor).not.toMatch(/^pl-/);
      expect(sent[0].text).toBe('claimed by a player');
    });

    it('logs nothing when the claim is refused (already owned)', () => {
      const pc = addCombatant('Wombat');
      component.btnToggleClaimable_Click(pc);
      component['participantOwners'].set(pc, OTHER_PLAYER_TOKEN);
      sent.length = 0;

      command('claim_character', PLAYER_TOKEN, {
        participantId: component['getParticipantId'](pc)
      });

      expect(sent.length).toBe(0);
    });
  });

  // ── AC4 - release_claims ───────────────────────────────────────────────

  describe('release_claims (AC4, AC5)', () => {
    /** Marks `name` claimable and owned by `player`. */
    function claimed(name: string, player: string): Participant {
      const p = addCombatant(name);
      component.btnToggleClaimable_Click(p);
      component['participantOwners'].set(p, player);
      return p;
    }

    it('logs exactly one entry per participant released, named for that participant', () => {
      claimed('Wombat', PLAYER_TOKEN);
      claimed('Sparky', PLAYER_TOKEN);
      claimed('Not Mine', OTHER_PLAYER_TOKEN);
      sent.length = 0;

      command('release_claims', PLAYER_TOKEN);

      expect(sent.length).toBe(2);
      expect(sent.map(e => e.actor)).toEqual(['Wombat', 'Sparky']);
      expect(sent.every(e => e.text === 'claim released')).toBe(true);
      expect(sent.every(e => e.actor !== 'GM')).toBe(true);
      expect(sent.every(e => !/^pl-/.test(e.actor))).toBe(true);
    });

    it('logs nothing when the release frees nothing', () => {
      claimed('Not Mine', OTHER_PLAYER_TOKEN);
      sent.length = 0;

      command('release_claims', PLAYER_TOKEN);

      expect(sent.length).toBe(0);
    });

    // S5. A closing tab produces two release_claims: one from the client's
    // ngOnDestroy and one the server synthesises on the dropped socket. The
    // second must find nothing to release and log nothing.
    it('S5 - a duplicate release from the same disconnect adds no second entry', () => {
      claimed('Wombat', PLAYER_TOKEN);
      claimed('Sparky', PLAYER_TOKEN);
      sent.length = 0;

      command('release_claims', PLAYER_TOKEN);
      expect(sent.length).toBe(2);

      command('release_claims', PLAYER_TOKEN);
      expect(sent.length).toBe(2);
    });
  });

  // ── AC6, AC7, AC8 - the rolled-total clamp line ────────────────────────

  describe('rolled-total clamp wording (AC6, AC7, AC8)', () => {
    /**
     * A participant whose displayed rolled total no longer fits their dice
     * count - the decker who rolled big on 3D6 and then jacked out to 1D6.
     */
    function overRangeCombatant(name: string): Participant {
      const p = addCombatant(name);
      p.baseIni = 10;
      p.setDicesWithoutRoll(3);
      p.diceIni = 18;              // Score 28
      p.setDicesWithoutRoll(1);    // display max is now 6
      return p;
    }

    it('states the clamp, the dice cap, the Score and the mismatch', () => {
      overRangeCombatant('Decker');
      sent.length = 0;

      component['enforceParticipantRollBounds']();

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Decker');
      expect(sent[0].text).toBe(
        'initiative roll clamped to 6 (max 1D6); Score is 28 '
        + '(attribute 10 + rolled total do not match)'
      );
      expect(sent[0].text).not.toContain('do not reconcile');
      expect(sent[0].text).toContain('1D6');
    });

    // AC7 / defect D2: the number named is the effective Score the Ini column
    // shows (running Score + Initiative committed to Interrupt Actions), never
    // the raw backing field, which appears nowhere on screen.
    it('names the effective Score, never the raw stored one, under Full Defense', () => {
      const p = overRangeCombatant('Decker');
      p.doAction(FULL_DEFENSE);
      expect(p.currentInitiativeScore).toBe(28);
      expect(p.getCurrentInitiative()).toBe(18);
      sent.length = 0;

      component['enforceParticipantRollBounds']();

      expect(sent.length).toBe(1);
      expect(sent[0].text).toContain('Score is 18');
      expect(sent[0].text).not.toContain('28');
    });

    it('stays off the wire while GM rolls are session-hidden, and stays hidden', () => {
      overRangeCombatant('Decker');
      component.toggleGmRollVisibility();
      sent.length = 0;
      component.sharedLogEntries = [];

      component['enforceParticipantRollBounds']();

      expect(sent.length).toBe(0);
      expect(component.sharedLogEntries.length).toBe(1);
      expect(component.sharedLogEntries[0].hiddenFromPlayers).toBe(true);
      expect(component.sharedLogEntries[0].text).toContain('initiative roll clamped');
    });

    it('does not spend the "hide next roll" one-shot', () => {
      overRangeCombatant('Decker');
      component.toggleHideNextGmRoll();

      component['enforceParticipantRollBounds']();

      expect(component.hideNextGmRoll).toBe(true);
    });
  });

  // ── AC9 - Leave / Enter Combat ─────────────────────────────────────────

  describe('Leave and Enter Combat (AC9)', () => {
    it('logs exactly one "left combat" entry attributed to the GM', () => {
      const p = addCombatant('Ganger Alpha');
      sent.length = 0;

      component.btnLeaveCombat_Click(p);

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('GM');
      expect(sent[0].text).toBe('Ganger Alpha left combat');
    });

    it('logs "re-entered combat" when the participant is actually back', () => {
      const p = addCombatant('Ganger Alpha');
      component.btnLeaveCombat_Click(p);
      sent.length = 0;

      component.btnEnterCombat_Click(p);

      expect(p.ooc).toBe(false);
      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('GM');
      expect(sent[0].text).toBe('Ganger Alpha re-entered combat');
    });

    // Open decision 5, resolved: `enterCombat()` only clears the manual flag.
    // A participant still OOC from damage does not reappear in the player list,
    // so claiming they re-entered combat would be a lie.
    it('suppresses "re-entered combat" while still OOC from damage', () => {
      const p = addCombatant('Ganger Alpha');
      p.physicalDamage = p.physicalHealth;   // down on the physical track
      expect(p.ooc).toBe(true);
      component.btnLeaveCombat_Click(p);
      sent.length = 0;

      component.btnEnterCombat_Click(p);

      expect(p.ooc).toBe(true);
      expect(sent.length).toBe(0);
    });

    // S3: undo restores the state but emits no log line - `btnUndo_Click`
    // calls `UndoHandler.Undo()` and nothing else. Existing behaviour, stated
    // here so a future change to it is a deliberate one.
    it('S3 - undoing a mis-clicked Leave Combat emits no log line', () => {
      const p = addCombatant('Ganger Alpha');
      sent.length = 0;
      component.btnLeaveCombat_Click(p);
      expect(sent.length).toBe(1);

      component.btnUndo_Click();

      expect(p.ooc).toBe(false);
      expect(sent.length).toBe(1);
    });
  });

  // ── AC10, AC11 - batch roll markers ────────────────────────────────────

  describe('batch initiative roll markers (AC10, AC11)', () => {
    it('marks a non-player batch and orders the marker before its rolls', () => {
      addCombatant('Ganger A');
      addCombatant('Ganger B');
      addCombatant('Ganger C');
      sent.length = 0;
      component.sharedLogEntries = [];

      component.btnRollRemainingNonPlayer_Click();

      expect(sent.length).toBe(4);
      expect(sent[0].actor).toBe('GM');
      expect(sent[0].text).toBe('Rolled initiative for 3 non-player participants');
      expect(sent.slice(1).map(e => e.actor)).toEqual(['Ganger A', 'Ganger B', 'Ganger C']);
      // ...and in the GM's own pane, the marker sorts ahead of the rolls.
      expect(paneTexts()[0]).toBe('GM: Rolled initiative for 3 non-player participants');
      expect(component.sharedLogEntries.length).toBe(4);
    });

    it('counts only participants whose roll actually happened', () => {
      const rolled = addCombatant('Already Rolled');
      rolled.diceIni = 7;
      addCombatant('Ganger A');
      const owned = addCombatant('Wombat');
      component['participantOwners'].set(owned, PLAYER_TOKEN);
      sent.length = 0;

      component.btnRollRemainingNonPlayer_Click();

      // Only Ganger A: the rolled one and the player-owned one are not targets.
      // D5: a batch of one is singular - "1 participants" reads as a bug.
      expect(sent[0].text).toBe('Rolled initiative for 1 non-player participant');
      expect(sent.length).toBe(2);
    });

    it('D5 - pluralises the force-roll marker for a batch of one', async () => {
      spyOn(dialog, 'confirm').and.resolveTo(true);
      addCombatant('Ganger A');
      sent.length = 0;

      await component['confirmAndForceRollOutstanding']();

      expect(sent[0].text).toBe('Force-rolled initiative for 1 outstanding participant');
    });

    it('marks a force-roll batch, counting the player characters it includes', async () => {
      spyOn(dialog, 'confirm').and.resolveTo(true);
      addCombatant('Ganger A');
      const owned = addCombatant('Wombat');
      component['participantOwners'].set(owned, PLAYER_TOKEN);
      sent.length = 0;
      component.sharedLogEntries = [];

      await component['confirmAndForceRollOutstanding']();

      expect(sent[0].actor).toBe('GM');
      expect(sent[0].text).toBe('Force-rolled initiative for 2 outstanding participants');
      expect(sent.length).toBe(3);
      expect(paneTexts()[0]).toBe('GM: Force-rolled initiative for 2 outstanding participants');
    });

    it('AC11 - emits no marker when nothing is outstanding', () => {
      const rolled = addCombatant('Already Rolled');
      rolled.diceIni = 7;
      sent.length = 0;
      component.sharedLogEntries = [];

      component.btnRollRemainingNonPlayer_Click();

      expect(sent.length).toBe(0);
      expect(component.sharedLogEntries.length).toBe(0);
    });

    it('AC11 - emits no marker when the force-roll dialog is cancelled', async () => {
      spyOn(dialog, 'confirm').and.resolveTo(false);
      addCombatant('Ganger A');
      sent.length = 0;

      await component['confirmAndForceRollOutstanding']();

      expect(sent.length).toBe(0);
    });

    // Open decision 6, resolved: the marker follows the batch's own visibility
    // decision. A visible "the GM rolled 3 characters" beside three hidden
    // rolls would leak the existence of the rolls the GM opted out of showing.
    it('keeps the marker hidden when the batch it summarises is hidden', () => {
      addCombatant('Ganger A');
      addCombatant('Ganger B');
      component.toggleGmRollVisibility();
      sent.length = 0;
      component.sharedLogEntries = [];

      component.btnRollRemainingNonPlayer_Click();

      expect(sent.length).toBe(0);
      expect(component.sharedLogEntries.length).toBe(3);
      expect(component.sharedLogEntries.every(e => e.hiddenFromPlayers === true)).toBe(true);
      expect(component.sharedLogEntries[0].text)
        .toBe('Rolled initiative for 2 non-player participants');
    });
  });

  // ── AC12 - nothing is logged without a share session ───────────────────

  describe('no share session (AC12)', () => {
    beforeEach(() => {
      component.shareRoomCode = '';
      component.sharedLogEntries = [];
    });

    // D4. `appendGmOnlyLog` has no session check of its own, so the hidden
    // branch of the batch marker used to write a "(hidden from players)" line
    // into the GM's local pane with no session and no players to hide it from.
    it('D4 - a hidden batch marker still produces nothing with no session', () => {
      addCombatant('Ganger A');
      addCombatant('Ganger B');
      component.toggleGmRollVisibility();     // GM rolls hidden
      expect(component.isGmRollHiddenFromPlayers()).toBe(true);
      LogHandler.logbook.length = 0;

      component.btnRollRemainingNonPlayer_Click();

      expect(sent.length).toBe(0);
      expect(component.sharedLogEntries.length).toBe(0);
      expect(LogHandler.logbook.some(e => e.text.includes('Rolled initiative for'))).toBe(false);
      expect(LogHandler.logbook.some(e => e.text.includes('hidden from players'))).toBe(false);
    });

    it('D4 - the same holds for a hidden force-roll batch', async () => {
      spyOn(dialog, 'confirm').and.resolveTo(true);
      addCombatant('Ganger A');
      component.toggleGmRollVisibility();
      LogHandler.logbook.length = 0;

      await component['confirmAndForceRollOutstanding']();

      expect(sent.length).toBe(0);
      expect(component.sharedLogEntries.length).toBe(0);
      expect(LogHandler.logbook.some(e => e.text.includes('Force-rolled initiative'))).toBe(false);
    });

    it('produces no shared entries from any of the new or changed sites', () => {
      registerCharacter(PLAYER_TOKEN, 'Wombat');
      const wombat = findByName('Wombat');
      component.btnToggleClaimable_Click(wombat);
      command('release_claims', PLAYER_TOKEN);

      const ganger = addCombatant('Ganger A');
      component.btnLeaveCombat_Click(ganger);
      component.btnEnterCombat_Click(ganger);
      component.btnRollRemainingNonPlayer_Click();

      const decker = addCombatant('Decker');
      decker.baseIni = 10;
      decker.setDicesWithoutRoll(3);
      decker.diceIni = 18;
      decker.setDicesWithoutRoll(1);
      component['enforceParticipantRollBounds']();

      expect(sent.length).toBe(0);
      expect(component.sharedLogEntries.length).toBe(0);
    });

    // D8. The two GM-side astral status buttons are the one deliberate
    // exception to AC12's "no new local-only logging path": they route through
    // `appendParticipantEventLog`, which falls back to the plain Action Log
    // when there is no session, because otherwise a GM running combat without
    // a share session would get no record of the event at all. Nothing goes on
    // the wire either way. Documented here so the exception stays intentional.
    it('D8 - enableAstral writes one local line and nothing to the wire', () => {
      const mage = addCombatant('Mage');
      LogHandler.logbook.length = 0;

      component.enableAstral(mage);

      expect(sent.length).toBe(0);
      expect(component.sharedLogEntries.length).toBe(0);
      const local = LogHandler.logbook.filter(e => e.text === 'Mage is now Awakened');
      expect(local.length).toBe(1);
    });

    it('D8 - disableAstral writes one local line and nothing to the wire', () => {
      const mage = addCombatant('Mage');
      component.enableAstral(mage);
      const astral = findByName('Mage');
      LogHandler.logbook.length = 0;

      component.disableAstral(astral);

      expect(sent.length).toBe(0);
      expect(component.sharedLogEntries.length).toBe(0);
      const local = LogHandler.logbook.filter(e => e.text === 'Mage removed Awakened status');
      expect(local.length).toBe(1);
    });
  });

  // ── AC13 - classification of every new/changed text ────────────────────

  describe('log text classification (AC13)', () => {
    const systemTexts = [
      'joined the session',
      'claimed by a player',
      'claim released',
      'deck removed',
      'deck configured',
      'jacked in (Hot Sim)',
      'jacked in (Cold Sim)',
      'jacked in (AR)',
      'switched to Cold Sim',
      'switched to Hot Sim',
      'switched to AR',
      'jacked out',
      'is now Awakened',
      'removed Awakened status',
      'entered astral space (INT\xD72 initiative)',
      'returned from astral space (REA+INT initiative)',
      'Ganger Alpha left combat',
      'Ganger Alpha re-entered combat'
    ];

    for (const text of systemTexts) {
      it(`classifies "${text}" as a system line`, () => {
        expect(getLogTextClass(text)).toBe('log-text-system');
      });
    }

    const rollTexts = [
      'initiative roll clamped to 6 (max 1D6); Score is 28 (attribute 10 + rolled total do not match)',
      'Rolled initiative for 3 non-player participants',
      'Force-rolled initiative for 2 outstanding participants'
    ];

    for (const text of rollTexts) {
      it(`classifies "${text.slice(0, 40)}..." as a roll line`, () => {
        expect(getLogTextClass(text)).toBe('log-text-roll');
      });
    }
  });

  // ── Gameplay scenarios ─────────────────────────────────────────────────

  describe('S1 - a player registers, claims and rolls', () => {
    it('reads as three consistent character-attributed lines', () => {
      // A pre-made row the GM has marked claimable.
      const row = addCombatant('Wombat');
      component.btnToggleClaimable_Click(row);
      sent.length = 0;

      // The player registers, claims that row, then rolls.
      command('claim_character', PLAYER_TOKEN, {
        participantId: component['getParticipantId'](row)
      });
      command('roll_submission', PLAYER_TOKEN, {
        participantId: component['getParticipantId'](row),
        roll: 9,
        diceValues: [6, 3]
      });

      expect(sent.map(e => e.actor)).toEqual(['Wombat', 'Wombat']);
      expect(sent[0].text).toBe('claimed by a player');
      expect(sent[1].text).toContain('initiative roll:');
      for (const entry of sent) {
        expect(entry.actor).not.toBe('GM');
        expect(entry.actor).not.toMatch(/^pl-/);
        expect(entry.text).not.toMatch(/pl-[a-z0-9]{8}/);
      }
    });
  });

  describe('S2 - force-roll with a stale display total', () => {
    it('logs the clamp, then the batch marker, then exactly the rolls it counted', () => {
      CombatManager.started = true;
      const decker = addCombatant('Decker');
      decker.baseIni = 10;
      decker.setDicesWithoutRoll(3);
      decker.diceIni = 18;             // Score 28
      decker.setDicesWithoutRoll(1);   // now over the 1D6 max
      decker.doAction(FULL_DEFENSE);   // Ini column reads 18
      addCombatant('Ganger A');
      addCombatant('Ganger B');
      sent.length = 0;
      component.sharedLogEntries = [];

      // An unrelated field edit clamps the display total and logs the gap.
      component['enforceParticipantRollBounds']();
      // ...then the GM force-rolls what is still outstanding.
      component['rollOutstandingInitiative'](true);

      const texts = paneTexts();
      expect(texts[0]).toBe(
        'Decker: initiative roll clamped to 6 (max 1D6); Score is 18 '
        + '(attribute 10 + rolled total do not match)'
      );
      // The count is 2, not 3: the decker already has diceIni > 0.
      expect(texts[1]).toBe('GM: Force-rolled initiative for 2 outstanding participants');
      expect(texts.length).toBe(4);
      expect(component.sharedLogEntries.slice(2).map(e => e.actor))
        .toEqual(['Ganger A', 'Ganger B']);
      // Never the raw stored Score.
      expect(texts[0]).not.toContain('28');
    });
  });

  describe('S4 - a laptop sleeps and comes back mid-fight', () => {
    it('reads as a coherent narrative with no "GM" credit and no token', () => {
      registerCharacter(PLAYER_TOKEN, 'Wombat');
      const wombat = findByName('Wombat');
      addCombatant('Ganger A');
      addCombatant('Ganger B');
      sent.length = 0;
      component.sharedLogEntries = [];

      // The laptop sleeps; the server releases the claim.
      command('release_claims', PLAYER_TOKEN);
      // The row stays visible because it is still claimable.
      expect(component.isParticipantClaimable(wombat)).toBe(true);

      // The player reconnects, re-registers and re-claims.
      registerCharacter(PLAYER_TOKEN, 'Wombat');
      command('claim_character', PLAYER_TOKEN, {
        participantId: component['getParticipantId'](wombat)
      });

      // The GM force-rolls the two NPCs still outstanding.
      component['rollOutstandingInitiative'](false);

      expect(paneTexts()).toEqual([
        'Wombat: claim released',
        'Wombat: joined the session',
        'Wombat: claimed by a player',
        'GM: Rolled initiative for 2 non-player participants',
        ...component.sharedLogEntries.slice(4).map(e => `${e.actor}: ${e.text}`)
      ]);
      expect(component.sharedLogEntries.slice(4).map(e => e.actor))
        .toEqual(['Ganger A', 'Ganger B']);
      for (const entry of component.sharedLogEntries) {
        expect(entry.actor).not.toMatch(/^pl-/);
        expect(entry.text).not.toContain(PLAYER_TOKEN);
      }
      // The batch marker is the only GM-attributed line; the three player
      // events are attributed to Wombat and the two rolls to the gangers.
      expect(component.sharedLogEntries.filter(e => e.actor === 'GM').length).toBe(1);
    });
  });

  // The local Action Log now mirrors player-command entries, because the echo
  // handler only skips the mirror for actor === "GM". Stated here because it
  // changes LogHandler.logbook contents for anything reading it.
  describe('local Action Log mirroring', () => {
    it('does not write a local line for a GM-attributed batch marker', () => {
      addCombatant('Ganger A');
      LogHandler.logbook.length = 0;

      component.btnRollRemainingNonPlayer_Click();

      expect(LogHandler.logbook.some(e => e.text.includes('Rolled initiative for'))).toBe(false);
    });
  });
});
