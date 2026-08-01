// Promoted scenarios for briefs/gm-npc-rolls.md — the GM resolving an ordinary
// dice-pool test on behalf of a named non-player combatant.
//
// Everything here is attribution. The resolution itself is the app's existing
// classifyRoll (pool -> hits -> ones -> glitch/critical glitch, brief pp.
// 44-45); no NPC-specific math exists, and per the brief's scope decision no
// grunt mechanic, hidden-roll mode, limit or Edge concept is introduced.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { PlayerViewComponent } from 'app/player-view/player-view.component';
import { DiceRollerComponent } from 'app/dice-roller/dice-roller.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';
import { SessionCommand, SessionSyncService, SharedLogEntry } from 'app/services/session-sync.service';
import { CRITICAL_GLITCH_LABEL, GLITCH_LABEL, formatDiceRollLogText } from 'app/shared/log-formatter';
import { classifyRoll } from 'app/shared/roll-utils';
import { LogHandler } from 'Logging';

/** The attribution used when the GM rolls as themselves rather than an NPC. */
const GM_ROLLER_NAME = BattleTrackerComponent.GM_ROLLER_NAME;

/**
 * The combatant names the "Roll as" dropdown is offering, with the two fixed
 * entries ("yourself (GM)" and "Other…") stripped off.
 */
function rollAsOptionNames(f: ComponentFixture<unknown>): string[] {
  const options: HTMLOptionElement[] = Array.from(
    f.nativeElement.querySelectorAll('[data-testid="roll-as-select"] option')
  );
  const fixed = [DiceRollerComponent.ROLL_AS_SELF, DiceRollerComponent.ROLL_AS_OTHER];
  return options.map(o => o.value).filter(v => !fixed.includes(v));
}

function resetCombat() {
  CombatManager.participants.clear(false);
  CombatManager.currentActors.clear(false);
  CombatManager.nextSortOrder = 0;
  CombatManager.initiativePass = 1;
  CombatManager.combatTurn = 1;
  CombatManager.started = false;
  CombatManager.passEnded = true;
}

describe('GM rolls on behalf of NPCs', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;
  let sent: SharedLogEntry[];
  let commands: SessionCommand[];

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
    sent = [];
    commands = [];
    spyOn(sync, 'appendLog').and.callFake((entry: SharedLogEntry) => { sent.push(entry); });
    spyOn(sync, 'sendCommand').and.callFake((cmd: SessionCommand) => { commands.push(cmd); });

    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => {
    resetCombat();
  });

  function addCombatant(name: string): Participant {
    component.addParticipant(false);
    const p = CombatManager.participants.items[CombatManager.participants.items.length - 1] as Participant;
    p.name = name;
    return p;
  }

  function rollAs(name: string | null, values: number[]): void {
    component.onGmDiceRolled({ values, rollAs: name });
  }

  // ── Scenario 1: ordinary NPC attack ──────────────────────────────────────

  describe('Scenario 1 - ordinary NPC attack', () => {
    it('logs 9 dice, 4 hits and no glitch as Ganger Bravo (AC1, AC3, AC7, AC10)', () => {
      addCombatant('Ganger Bravo');

      // 9 dice: four 5s/6s, a single 1 - one 1 of 9 is nowhere near half.
      rollAs('Ganger Bravo', [6, 6, 5, 5, 4, 3, 2, 2, 1]);

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Ganger Bravo');
      expect(sent[0].npc).toBe(true);
      expect(sent[0].text).toContain('rolled 9d6');
      expect(sent[0].text).toContain('4 hits');
      expect(sent[0].text).not.toContain(GLITCH_LABEL);
      expect(sent[0].glitch).toBe('none');
      expect(sent[0].hiddenFromPlayers).toBeUndefined();
    });

    it('exposes the same fields a player roll entry exposes (AC10)', () => {
      const values = [6, 6, 5, 5, 4, 3, 2, 2, 1];

      // A player's own roll, arriving over the wire.
      component['handleSessionCommand']({
        type: 'dice_roll',
        player: 'Wombat',
        payload: { roller: 'Wombat', values },
        timestamp: new Date().toISOString()
      });
      // The same dice, rolled by the GM for an NPC.
      rollAs('Ganger Bravo', values);

      const playerEntry = sent[0];
      const npcEntry = sent[1];
      expect(npcEntry.text).toBe(playerEntry.text);       // pool, faces, hits, glitch
      expect(npcEntry.glitch).toBe(playerEntry.glitch);
      expect(npcEntry.actor).not.toBe(playerEntry.actor); // ...only the attribution differs
    });
  });

  // ── Scenario 2: glitch with success ──────────────────────────────────────

  it('Scenario 2 - a glitched NPC roll still reports its hits (AC4, AC6, p. 45)', () => {
    addCombatant('Troll Bouncer');

    // 8 dice: 3 hits and 5 ones. More than half show a 1, so it glitches,
    // and the success stands alongside it.
    rollAs('Troll Bouncer', [6, 5, 5, 1, 1, 1, 1, 1]);

    expect(sent[0].actor).toBe('Troll Bouncer');
    expect(sent[0].npc).toBe(true);
    expect(sent[0].text).toContain('3 hits');
    expect(sent[0].text).toContain('5 ones of 8');
    expect(sent[0].text).toContain(GLITCH_LABEL);
    expect(sent[0].text).not.toContain(CRITICAL_GLITCH_LABEL);
    expect(sent[0].glitch).toBe('glitch');
  });

  // ── Scenario 3: critical glitch ──────────────────────────────────────────

  it('Scenario 3 - a glitch with zero hits is a CRITICAL GLITCH, named (AC5, AC7, p. 45)', () => {
    addCombatant('Spirit of Man');

    // 6 dice: four 1s, no 5s or 6s.
    rollAs('Spirit of Man', [1, 1, 1, 1, 4, 3]);

    expect(sent[0].actor).toBe('Spirit of Man');
    expect(sent[0].text).toContain('0 hits');
    expect(sent[0].text).toContain('4 ones of 6');
    expect(sent[0].text).toContain(CRITICAL_GLITCH_LABEL);
    expect(sent[0].glitch).toBe('critical');
  });

  // ── Scenario 4: two NPCs in one Initiative Pass ──────────────────────────

  it('Scenario 4 - two NPCs in one pass produce two separate entries (AC9)', () => {
    addCombatant('Ganger Alpha');
    addCombatant('Ganger Bravo');
    const pc = addCombatant('Wombat');
    component['participantOwners'].set(pc, 'Xavier');

    rollAs('Ganger Alpha', [6, 5, 4, 2]);
    rollAs('Ganger Bravo', [6, 6, 6, 1]);

    expect(sent.length).toBe(2);
    expect(sent.map(e => e.actor)).toEqual(['Ganger Alpha', 'Ganger Bravo']);
    expect(sent[0].text).toContain('2 hits');
    expect(sent[1].text).toContain('3 hits');
    // Neither is merged into the other, and neither lands on a player character.
    expect(sent[0].id).not.toBe(sent[1].id);
    expect(sent.some(e => e.actor === 'Wombat')).toBe(false);
    expect(sent.some(e => e.actor === GM_ROLLER_NAME)).toBe(false);

    // Players receive both, correctly named and in order.
    const broadcast = commands.filter(c => c.type === 'dice_roll');
    expect(broadcast.map(c => c.payload?.['roller'])).toEqual(['Ganger Alpha', 'Ganger Bravo']);
  });

  // ── Scenario 5: ad-hoc NPC not in the initiative order ───────────────────

  it('Scenario 5 - a free-text label with no combatant behind it still attributes (AC1)', () => {
    addCombatant('Ganger Alpha');
    expect(component.rollAsNames).not.toContain('Bartender');

    rollAs('Bartender', [6, 4, 3]);

    expect(sent[0].actor).toBe('Bartender');
    expect(sent[0].npc).toBe(true);
    expect(commands[0].payload?.['roller']).toBe('Bartender');
  });

  // ── Scenario 6: hidden NPC roll ──────────────────────────────────────────

  describe('Scenario 6 - hidden NPC roll (AC11, AC13)', () => {
    it('consumes the existing one-shot and keeps the NPC roll off the wire', () => {
      addCombatant('Ganger Bravo');
      component.toggleHideNextGmRoll();
      expect(component.hideNextGmRoll).toBe(true);

      rollAs('Ganger Bravo', [6, 5, 2]);

      expect(sent.length).toBe(0);
      expect(commands.length).toBe(0);
      expect(component.sharedLogEntries.length).toBe(1);
      expect(component.sharedLogEntries[0].actor).toBe('Ganger Bravo');
      expect(component.sharedLogEntries[0].npc).toBe(true);
      expect(component.sharedLogEntries[0].hiddenFromPlayers).toBe(true);
      // Exactly as an equivalent GM roll behaves: the one-shot is spent.
      expect(component.hideNextGmRoll).toBe(false);
    });

    it('leaves the following NPC roll visible again - no second hide mechanism', () => {
      component.toggleHideNextGmRoll();

      rollAs('Ganger Bravo', [6, 5, 2]);   // hidden
      rollAs('Ganger Bravo', [6, 6, 6]);   // visible

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Ganger Bravo');
      expect(sent[0].text).toContain('3 hits');
      expect(component.sharedLogEntries.length).toBe(1);
    });

    it('hides an NPC roll under the session-level switch too', () => {
      component.toggleGmRollVisibility();

      rollAs('Ganger Bravo', [6, 5, 2]);

      expect(sent.length).toBe(0);
      expect(component.sharedLogEntries[0].hiddenFromPlayers).toBe(true);
      expect(component.sharedLogEntries[0].actor).toBe('Ganger Bravo');
    });

    it('tags the hidden NPC roll once in the GM local log', () => {
      component.toggleHideNextGmRoll();
      LogHandler.logbook.length = 0;

      rollAs('Ganger Bravo', [6, 5, 2]);

      const lines = LogHandler.logbook.filter(e => e.text.includes('Ganger Bravo'));
      expect(lines.length).toBe(1);
      expect(lines[0].text).toContain('(hidden from players)');
    });

    it('an NPC roll is broadcast by default (AC11)', () => {
      rollAs('Ganger Bravo', [6, 5, 2]);

      expect(sent.length).toBe(1);
      expect(sent[0].hiddenFromPlayers).toBeUndefined();
      const broadcast = commands.find(c => c.type === 'dice_roll');
      expect(broadcast?.payload?.['roller']).toBe('Ganger Bravo');
      // The authenticated identity on the wire is still the GM's; only the
      // attribution changed.
      expect(broadcast?.player).toBe(GM_ROLLER_NAME);
    });
  });

  // ── Acceptance criteria not already covered above ────────────────────────

  describe('attribution mechanics', () => {
    it('falls back to the GM when no NPC is named (AC1)', () => {
      rollAs(null, [6, 5, 2]);
      expect(sent[0].actor).toBe(GM_ROLLER_NAME);
      expect(sent[0].npc).toBeUndefined();
    });

    it('treats a blank or whitespace-only label as "roll as myself"', () => {
      rollAs('   ', [6, 5, 2]);
      expect(sent[0].actor).toBe(GM_ROLLER_NAME);
      expect(sent[0].npc).toBeUndefined();
    });

    it('offers the tracker\'s current combatants, de-duplicated and unnamed ones dropped (AC1)', () => {
      addCombatant('Ganger Alpha');
      addCombatant('Ganger Bravo');
      addCombatant('Ganger Alpha');
      addCombatant('');

      expect(component.rollAsNames).toEqual(['Ganger Alpha', 'Ganger Bravo']);
    });

    it('never offers a player-claimed character in the picker (AC1)', () => {
      addCombatant('Ganger Alpha');
      const pc = addCombatant('Wombat');
      component['participantOwners'].set(pc, 'Xavier');

      // An NPC is a *non-player* combatant (p. 44); a claimed character is not
      // one, and rolling "as" them would impersonate their player.
      expect(component.rollAsNames).toEqual(['Ganger Alpha']);
      expect(component.rollAsNames).not.toContain('Wombat');
    });

    it('drops a name from the picker as soon as a player claims it, and restores it on release', () => {
      const p = addCombatant('Ganger Alpha');
      expect(component.rollAsNames).toContain('Ganger Alpha');

      component['participantOwners'].set(p, 'Xavier');
      expect(component.rollAsNames).not.toContain('Ganger Alpha');

      component['participantOwners'].delete(p);
      expect(component.rollAsNames).toContain('Ganger Alpha');
    });

    it('never offers a character marked Claimable that no player has claimed yet (AC1)', () => {
      addCombatant('Ganger Alpha');
      const pc = addCombatant('Wombat');

      // Prep: the GM earmarks Wombat for whoever turns up. Nobody has claimed
      // it, so it is still "GM-controlled" in the narrow sense - but it is
      // declared a player's character, not a non-player combatant (p. 44).
      component.btnToggleClaimable_Click(pc);

      expect(component['isGmControlled'](pc)).toBe(true);
      expect(component.rollAsNames).toEqual(['Ganger Alpha']);
      expect(component.rollAsNames).not.toContain('Wombat');
    });

    it('does not let a claimed character reappear in the picker when its player disconnects', () => {
      const pc = addCombatant('Wombat');
      component.btnToggleClaimable_Click(pc);
      component['participantOwners'].set(pc, 'Xavier');
      expect(component.rollAsNames).not.toContain('Wombat');

      // The player's tab drops mid-fight: release_claims removes the owner but
      // leaves the character claimable. It must not silently become an NPC.
      component['handleSessionCommand']({
        type: 'release_claims',
        player: 'Xavier',
        payload: {},
        timestamp: new Date().toISOString()
      });

      expect(component['participantOwners'].has(pc)).toBe(false);
      expect(component.isParticipantClaimable(pc)).toBe(true);
      expect(component.rollAsNames).not.toContain('Wombat');
    });

    it('keeps a claimable-but-unclaimed character out of the dropdown the GM sees', () => {
      addCombatant('Ganger Alpha');
      const pc = addCombatant('Wombat');
      component.btnToggleClaimable_Click(pc);
      fixture.detectChanges();

      expect(rollAsOptionNames(fixture)).toEqual(['Ganger Alpha']);
    });

    it('returns a name to the picker when the GM un-marks it Claimable', () => {
      const p = addCombatant('Ganger Alpha');
      component.btnToggleClaimable_Click(p);
      expect(component.rollAsNames).not.toContain('Ganger Alpha');

      component.btnToggleClaimable_Click(p);
      expect(component.rollAsNames).toContain('Ganger Alpha');
    });

    it('does not put a claimed character in the dropdown the GM sees', () => {
      addCombatant('Ganger Alpha');
      const pc = addCombatant('Wombat');
      component['participantOwners'].set(pc, 'Xavier');
      fixture.detectChanges();

      expect(rollAsOptionNames(fixture)).toEqual(['Ganger Alpha']);
    });

    it('uses the existing classifyRoll resolution, with no duplicate math (AC2)', () => {
      const values = [6, 5, 1, 1, 1, 2];
      rollAs('Ganger Bravo', values);

      expect(sent[0].text).toBe(formatDiceRollLogText(values));
      expect(sent[0].glitch).toBe(classifyRoll(values).glitch);
    });

    it('introduces no grunt, limit or Edge field on the entry (AC12, AC14)', () => {
      rollAs('Ganger Bravo', [6, 5, 1, 1, 1, 2]);

      const forbidden = [
        'limit', 'threshold', 'edge', 'groupEdge', 'professionalRating',
        'lieutenant', 'conditionMonitor', 'opposed'
      ];
      const keys = Object.keys(sent[0]).map(k => k.toLowerCase());
      for (const term of forbidden) {
        expect(keys).not.toContain(term.toLowerCase());
      }
      // ...and the payload the players receive carries nothing extra either.
      const payloadKeys = Object.keys(commands[0].payload || {}).map(k => k.toLowerCase());
      for (const term of forbidden) {
        expect(payloadKeys).not.toContain(term.toLowerCase());
      }
    });

    it('logs an NPC roll locally when no share session is running', () => {
      component.shareRoomCode = '';
      LogHandler.logbook.length = 0;

      rollAs('Bartender', [6, 5, 2]);

      expect(sent.length).toBe(0);
      const lines = LogHandler.logbook.filter(e => e.text.includes('Bartender'));
      expect(lines.length).toBe(1);
      expect(lines[0].text).toContain('2 hits');
    });

    it('tags the offline NPC line so it is not shaped like a player\'s own roll (AC8)', () => {
      component.shareRoomCode = '';   // no shared log, so no NPC badge to rely on
      LogHandler.logbook.length = 0;

      rollAs('Bartender', [6, 5, 2]);   // the GM, for an NPC
      rollAs(null, [6, 5, 2]);          // the GM, for themselves

      const npcLine = LogHandler.logbook.find(e => e.text.includes('Bartender'))!;
      const gmLine = LogHandler.logbook.find(e => e.text.startsWith(GM_ROLLER_NAME))!;
      expect(npcLine.text).toContain('(NPC roll)');
      expect(gmLine.text).not.toContain('(NPC roll)');
    });
  });

  // ── Sticky attribution has an end (combat boundary) ──────────────────────

  describe('the "Roll as" attribution does not survive End Combat', () => {
    it('clears the roller\'s sticky name when the GM ends combat', async () => {
      fixture.detectChanges();
      const roller = component.gmDiceRoller!;
      expect(roller).toBeDefined();
      roller.rollAs = 'Ganger Bravo';

      spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);
      await component.btnReset_Click();

      // The NPC may be dead and the scene is over: the next roll is the GM's.
      expect(roller.rollAsName).toBeNull();
    });

    it('leaves the attribution alone if the GM cancels the End Combat prompt', async () => {
      fixture.detectChanges();
      const roller = component.gmDiceRoller!;
      roller.rollAs = 'Ganger Bravo';

      spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(false);
      await component.btnReset_Click();

      expect(roller.rollAsName).toBe('Ganger Bravo');
    });

    it('so the roll after End Combat is attributed to the GM, not the dead NPC', async () => {
      fixture.detectChanges();
      const roller = component.gmDiceRoller!;
      roller.rollAs = 'Ganger Bravo';

      spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);
      await component.btnReset_Click();

      sent.length = 0;
      roller.rolledEvent.subscribe(e => component.onGmDiceRolled(e));
      roller.roll();

      expect(sent[0].actor).toBe(GM_ROLLER_NAME);
      expect(sent[0].npc).toBeUndefined();
    });
  });

  // ── The armed name is re-validated at roll time (AC1, p. 44) ─────────────
  //
  // The picker excludes claimed characters, but the field is sticky and
  // free-text: a name that was a legitimate NPC when it was armed can become a
  // player's character before the next roll. An NPC is a *non-player*
  // combatant, so the attribution has to be re-checked when the dice land, not
  // only when the name was chosen.

  describe('an armed name that has since been claimed by a player', () => {
    /** Marks `p` claimable, then claims it through the real player command. */
    function claim(p: Participant, playerName: string): void {
      component.btnToggleClaimable_Click(p);
      component['handleSessionCommand']({
        type: 'claim_character',
        player: playerName,
        payload: { participantId: component['getParticipantId'](p) },
        timestamp: new Date().toISOString()
      });
      expect(component['participantOwners'].get(p)).toBe(playerName);
      sent.length = 0;
      commands.length = 0;
    }

    it('is not attributed to that character, and is not badged NPC', () => {
      const spirit = addCombatant('Ally Spirit');
      // Armed while it was still an unclaimed, GM-run combatant.
      claim(spirit, 'Xavier');

      rollAs('Ally Spirit', [6, 5, 2]);

      expect(sent.length).toBe(1);
      expect(sent[0].actor).not.toBe('Ally Spirit');
      expect(sent[0].actor).toBe(GM_ROLLER_NAME);
      expect(sent[0].npc).toBeUndefined();
    });

    it('still rolls and logs the dice - the roll is re-attributed, never dropped', () => {
      const spirit = addCombatant('Ally Spirit');
      claim(spirit, 'Xavier');

      const values = [6, 5, 1, 1, 1, 2];
      rollAs('Ally Spirit', values);

      expect(sent.length).toBe(1);
      expect(sent[0].text).toBe(formatDiceRollLogText(values));
      expect(sent[0].glitch).toBe(classifyRoll(values).glitch);
      // ...and the players still get it.
      const broadcast = commands.filter(c => c.type === 'dice_roll');
      expect(broadcast.length).toBe(1);
      expect(broadcast[0].payload?.['roller']).toBe(GM_ROLLER_NAME);
      expect(broadcast[0].payload?.['npc']).toBe(false);
    });

    it('is not attributed even when the GM typed the claimed name freehand', () => {
      const pc = addCombatant('Wombat');
      component['participantOwners'].set(pc, 'Xavier');

      rollAs('Wombat', [6, 5, 2]);

      expect(sent[0].actor).toBe(GM_ROLLER_NAME);
      expect(sent[0].npc).toBeUndefined();
    });

    it('matches the claimed name regardless of case and surrounding spaces', () => {
      const pc = addCombatant('Wombat');
      component['participantOwners'].set(pc, 'Xavier');

      rollAs('  wombat ', [6, 5, 2]);

      expect(sent[0].actor).toBe(GM_ROLLER_NAME);
      expect(sent[0].npc).toBeUndefined();
    });

    it('disarms the field, so the GM can see the attribution is gone', () => {
      fixture.detectChanges();
      const roller = component.gmDiceRoller!;
      const spirit = addCombatant('Ally Spirit');
      roller.rollAs = 'Ally Spirit';
      claim(spirit, 'Xavier');

      rollAs('Ally Spirit', [6, 5, 2]);

      expect(roller.rollAsName).toBeNull();
    });

    // Marked Claimable but never claimed - the prep case. One rule, not two:
    // Claimable is the GM stating this is a player's character, so it is not
    // the GM's to roll as, exactly as the picker has always treated it.
    it('falls back to the GM for a claimable name no player has claimed yet', () => {
      const spirit = addCombatant('Ally Spirit');
      component.btnToggleClaimable_Click(spirit);   // claimable, but nobody has claimed it

      rollAs('Ally Spirit', [6, 5, 2]);

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe(GM_ROLLER_NAME);
      expect(sent[0].npc).toBeUndefined();
    });

    it('keeps falling back after the claim is released, because it is still claimable', () => {
      const spirit = addCombatant('Ally Spirit');
      claim(spirit, 'Xavier');
      rollAs('Ally Spirit', [6, 5, 2]);
      expect(sent[0].actor).toBe(GM_ROLLER_NAME);

      component['handleSessionCommand']({
        type: 'release_claims',
        player: 'Xavier',
        payload: {},
        timestamp: new Date().toISOString()
      });
      sent.length = 0;
      rollAs('Ally Spirit', [6, 5, 2]);

      expect(sent[0].actor).toBe(GM_ROLLER_NAME);
      expect(sent[0].npc).toBeUndefined();
    });

    it('attributes to the NPC again once the GM un-marks it Claimable', () => {
      const spirit = addCombatant('Ally Spirit');
      claim(spirit, 'Xavier');
      component['handleSessionCommand']({
        type: 'release_claims',
        player: 'Xavier',
        payload: {},
        timestamp: new Date().toISOString()
      });

      // The GM says out loud that this is not a player's character after all.
      component.btnToggleClaimable_Click(spirit);
      sent.length = 0;
      rollAs('Ally Spirit', [6, 5, 2]);

      expect(sent[0].actor).toBe('Ally Spirit');
      expect(sent[0].npc).toBe(true);
    });
  });

  // ── The picker filter and the roll-time guard are one predicate ──────────
  //
  // These two checks were written separately and drifted: the picker excluded
  // a claimable-but-unowned character while the roll-time guard only looked at
  // current ownership, so a name the picker refused to offer could still be
  // typed (or left armed) and go out attributed to a player's character. They
  // now share `isPlayerCharacterName`, and these tests hold them together.

  describe('picker and roll-time attribution agree in every claim state', () => {
    /** Rolls as `name` and reports the actor the entry was logged under. */
    function actorFor(name: string): string {
      sent.length = 0;
      rollAs(name, [6, 5, 2]);
      return sent[0].actor;
    }

    it('a player disconnecting mid-fight does not turn their character into an NPC', () => {
      const pc = addCombatant('Wombat');
      component.btnToggleClaimable_Click(pc);
      component['participantOwners'].set(pc, 'Xavier');

      // The player's tab drops: release_claims deletes the owner entry and
      // leaves `claimable` set. This is the state that used to slip through.
      component['handleSessionCommand']({
        type: 'release_claims',
        player: 'Xavier',
        payload: {},
        timestamp: new Date().toISOString()
      });
      expect(component['participantOwners'].has(pc)).toBe(false);
      expect(component.isParticipantClaimable(pc)).toBe(true);

      // Excluded from the picker...
      expect(component.rollAsNames).not.toContain('Wombat');
      // ...and, the defect, also refused when the GM types it anyway.
      expect(actorFor('Wombat')).toBe(GM_ROLLER_NAME);
      expect(sent[0].npc).toBeUndefined();
    });

    it('offers exactly the names it will actually attribute a roll to', () => {
      const alpha = addCombatant('Ganger Alpha');
      const owned = addCombatant('Wombat');
      const claimable = addCombatant('Hatchetman');
      const disconnected = addCombatant('Chrome');

      component['participantOwners'].set(owned, 'Xavier');
      component.btnToggleClaimable_Click(claimable);
      component.btnToggleClaimable_Click(disconnected);
      component['participantOwners'].set(disconnected, 'Sam');
      component['participantOwners'].delete(disconnected);   // tab dropped

      expect(component.rollAsNames).toEqual(['Ganger Alpha']);
      for (const name of ['Ganger Alpha', 'Wombat', 'Hatchetman', 'Chrome']) {
        const offered = component.rollAsNames.includes(name);
        const attributed = actorFor(name) === name;
        expect(attributed).toBe(offered);
      }
      expect(alpha.name).toBe('Ganger Alpha');   // unchanged by any of the above
    });
  });

  // ── The GM is told why a roll was re-attributed (no silent fallback) ─────

  describe('the fallback is announced to the GM', () => {
    it('names the character and says the roll went out as the GM', () => {
      const pc = addCombatant('Wombat');
      component['participantOwners'].set(pc, 'Xavier');
      component.shareInfo = '';

      rollAs('Wombat', [6, 5, 2]);

      expect(component.shareInfo).toContain('Wombat');
      expect(component.shareInfo).toContain('player character');
      expect(component.shareInfo).toContain(GM_ROLLER_NAME);
    });

    it('says nothing when the attribution was honoured', () => {
      addCombatant('Ganger Bravo');
      component.shareInfo = '';

      rollAs('Ganger Bravo', [6, 5, 2]);

      expect(component.shareInfo).toBe('');
    });

    it('says nothing when the GM rolled as themselves in the first place', () => {
      component.shareInfo = '';
      rollAs(null, [6, 5, 2]);
      expect(component.shareInfo).toBe('');
    });
  });

  // ── The GM's own dice tray never claims a roll it did not get ────────────

  describe('the local dice tray reports the actual attribution', () => {
    /** Wires the real roller to the real handler, as the template does. */
    function wireRoller(): DiceRollerComponent {
      fixture.detectChanges();
      const roller = component.gmDiceRoller!;
      roller.allowRollAs = true;
      roller.rolledEvent.subscribe(e => component.onGmDiceRolled(e));
      return roller;
    }

    it('drops the "as <name>" label when the roll fell back to the GM', () => {
      const pc = addCombatant('Wombat');
      component['participantOwners'].set(pc, 'Xavier');
      const roller = wireRoller();
      roller.rollAs = 'Wombat';

      roller.roll();

      expect(sent[0].actor).toBe(GM_ROLLER_NAME);
      // The tray must agree with the log line, not with what was asked for.
      expect(roller.localRollAs).toBeNull();
      expect(roller.attributionOverrideNote).toContain('Wombat');
    });

    it('shows the reason in the tray instead of the name', () => {
      const pc = addCombatant('Wombat');
      component['participantOwners'].set(pc, 'Xavier');
      const roller = wireRoller();
      roller.rollAs = 'Wombat';

      roller.roll();
      fixture.detectChanges();

      const label = fixture.nativeElement.querySelector('[data-testid="local-roll-attribution"]');
      expect(label).toBeNull();   // no "as Wombat"
      const note = fixture.nativeElement.querySelector('[data-testid="local-roll-attribution-override"]');
      expect(note).not.toBeNull();
      expect(note.textContent).toContain('Wombat');
      expect(note.textContent).toContain('player character');
    });

    it('keeps the NPC name in the tray when the attribution was honoured', () => {
      addCombatant('Ganger Bravo');
      const roller = wireRoller();
      roller.rollAs = 'Ganger Bravo';

      roller.roll();
      fixture.detectChanges();

      expect(sent[0].actor).toBe('Ganger Bravo');
      expect(roller.localRollAs).toBe('Ganger Bravo');
      expect(roller.attributionOverrideNote).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="local-roll-attribution"]').textContent.trim())
        .toBe('Ganger Bravo');
    });

    it('clears a previous roll\'s override note on the next roll', () => {
      const pc = addCombatant('Wombat');
      component['participantOwners'].set(pc, 'Xavier');
      const roller = wireRoller();
      roller.rollAs = 'Wombat';

      roller.roll();
      expect(roller.attributionOverrideNote).not.toBeNull();

      roller.localRolling = false;   // animation over
      roller.roll();                 // field was disarmed by the fallback

      expect(roller.attributionOverrideNote).toBeNull();
      expect(roller.localRollAs).toBeNull();
    });
  });

  // ── The sticky attribution does not outlive the NPC or the session ───────

  describe('the "Roll as" attribution does not outlive the participant it names', () => {
    it('is cleared when the armed NPC is deleted from the tracker', async () => {
      fixture.detectChanges();
      const roller = component.gmDiceRoller!;
      const bravo = addCombatant('Ganger Bravo');
      roller.rollAs = 'Ganger Bravo';

      spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);
      await component.btnDelete_Click(bravo);

      expect(roller.rollAsName).toBeNull();
    });

    it('so the GM\'s next roll is their own, not the deleted NPC\'s', async () => {
      fixture.detectChanges();
      const roller = component.gmDiceRoller!;
      const bravo = addCombatant('Ganger Bravo');
      roller.rollAs = 'Ganger Bravo';

      spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);
      await component.btnDelete_Click(bravo);

      sent.length = 0;
      roller.rolledEvent.subscribe(e => component.onGmDiceRolled(e));
      roller.roll();

      expect(sent[0].actor).toBe(GM_ROLLER_NAME);
      expect(sent[0].npc).toBeUndefined();
    });

    it('survives the deletion of some other combatant', async () => {
      fixture.detectChanges();
      const roller = component.gmDiceRoller!;
      addCombatant('Ganger Bravo');
      const alpha = addCombatant('Ganger Alpha');
      roller.rollAs = 'Ganger Bravo';

      spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(true);
      await component.btnDelete_Click(alpha);

      expect(roller.rollAsName).toBe('Ganger Bravo');
    });

    it('survives a delete the GM cancels at the confirmation prompt', async () => {
      fixture.detectChanges();
      const roller = component.gmDiceRoller!;
      const bravo = addCombatant('Ganger Bravo');
      roller.rollAs = 'Ganger Bravo';

      spyOn(component['confirmationDialog'], 'simpleConfirm').and.resolveTo(false);
      await component.btnDelete_Click(bravo);

      expect(roller.rollAsName).toBe('Ganger Bravo');
    });
  });

  describe('the "Roll as" attribution does not outlive the session', () => {
    it('is cleared when the GM closes the share session without ending combat', async () => {
      fixture.detectChanges();
      const roller = component.gmDiceRoller!;
      addCombatant('Ganger Bravo');
      roller.rollAs = 'Ganger Bravo';
      spyOn(sync, 'closeSession').and.resolveTo();
      spyOn(sync, 'disconnect');

      await component.btnCloseShareSession_Click();

      // Combat was never ended - only the session went away.
      expect(CombatManager.combatTurn).toBe(1);
      expect(roller.rollAsName).toBeNull();
    });

    it('so the first roll of the next session is the GM\'s own', async () => {
      fixture.detectChanges();
      const roller = component.gmDiceRoller!;
      roller.rollAs = 'Ganger Bravo';
      spyOn(sync, 'closeSession').and.resolveTo();
      spyOn(sync, 'disconnect');

      await component.btnCloseShareSession_Click();

      component.shareRoomCode = 'XYZ789';   // the next session
      sent.length = 0;
      roller.rolledEvent.subscribe(e => component.onGmDiceRolled(e));
      roller.roll();

      expect(sent[0].actor).toBe(GM_ROLLER_NAME);
      expect(sent[0].npc).toBeUndefined();
    });

    it('is kept when the session drops unexpectedly, because the fight is still on', () => {
      fixture.detectChanges();
      const roller = component.gmDiceRoller!;
      roller.rollAs = 'Ganger Bravo';
      spyOn(sync, 'disconnect');

      component['handleSessionClosedExternally']();

      expect(roller.rollAsName).toBe('Ganger Bravo');
    });
  });

  // ── Distinguishability on both screens (AC8, AC11) ───────────────────────

  describe('the entry reads as an NPC roll, not a player character\'s own', () => {
    it('renders an NPC badge in the GM log', () => {
      rollAs('Ganger Bravo', [6, 5, 2]);
      component['insertSharedLogEntry'](sent[0]);   // the server echo
      fixture.detectChanges();

      const badges = fixture.nativeElement.querySelectorAll('[data-testid="log-badge-npc"]');
      expect(badges.length).toBe(1);
      const row = badges[0].closest('.list-group-item') as HTMLElement;
      expect(row.textContent).toContain('Ganger Bravo');
    });

    it('renders an NPC badge on the player screen, with the attribution intact', () => {
      rollAs('Ganger Bravo', [6, 5, 2]);
      const entry = sent[0];

      const playerFixture = TestBed.createComponent(PlayerViewComponent);
      const player = playerFixture.componentInstance;
      player.connected = true;
      player.state = { round: 1, pass: 1, participants: [] };
      player.log = [entry];
      playerFixture.detectChanges();

      const badge = playerFixture.nativeElement.querySelector('[data-testid="log-badge-npc"]');
      expect(badge).not.toBeNull();
      expect(playerFixture.nativeElement.querySelector('.log-list')?.textContent)
        .toContain('Ganger Bravo');
    });

    it('puts the NPC flag on the wire so the remote dice tray can mark it too (AC8, AC11)', () => {
      rollAs('Ganger Bravo', [6, 5, 2]);
      rollAs(null, [6, 5, 2]);

      const broadcasts = commands.filter(c => c.type === 'dice_roll');
      expect(broadcasts[0].payload?.['npc']).toBe(true);
      expect(broadcasts[1].payload?.['npc']).toBe(false);
      // ...and it matches the flag on the log entry for the same roll, so the
      // tray and the log two cards below cannot disagree.
      expect(broadcasts[0].payload?.['npc']).toBe(!!sent[0].npc);
      expect(broadcasts[1].payload?.['npc']).toBe(!!sent[1].npc);
    });

    it('carries no NPC badge on a player character\'s own roll (AC8)', () => {
      component['handleSessionCommand']({
        type: 'dice_roll',
        player: 'Wombat',
        payload: { roller: 'Wombat', values: [6, 5, 2] },
        timestamp: new Date().toISOString()
      });
      component['insertSharedLogEntry'](sent[0]);
      fixture.detectChanges();

      expect(sent[0].npc).toBeUndefined();
      expect(fixture.nativeElement.querySelectorAll('[data-testid="log-badge-npc"]').length).toBe(0);
    });
  });
});

// ── The "Roll as" control itself ──────────────────────────────────────────

describe('Dice roller "Roll as" field', () => {
  let fixture: ComponentFixture<DiceRollerComponent>;
  let roller: DiceRollerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DiceRollerComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(DiceRollerComponent);
    roller = fixture.componentInstance;
  });

  /** The rendered dropdown, or null when the control is not on screen. */
  function select(): HTMLSelectElement | null {
    return fixture.nativeElement.querySelector('[data-testid="roll-as-select"]');
  }

  /** The ad-hoc name box, present only while "Other…" is picked. */
  function otherInput(): HTMLInputElement | null {
    return fixture.nativeElement.querySelector('[data-testid="roll-as-other-input"]');
  }

  /** Picks an option by its value, exactly as a tap on the dropdown would. */
  function pick(value: string): void {
    const el = select()!;
    const index = Array.from(el.options).findIndex(o => o.value === value);
    expect(index).toBeGreaterThanOrEqual(0);
    el.selectedIndex = index;
    el.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  /**
   * Render, then let `ngModel` finish writing the model into the `<select>`.
   * NgModel defers its `writeValue` to a microtask, so a bare `detectChanges`
   * leaves the dropdown's DOM value one tick behind the component.
   */
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Types into the ad-hoc name box, as the GM would. */
  function typeOther(text: string): void {
    const el = otherInput()!;
    el.value = text;
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('is off by default, so the player view never shows it', () => {
    expect(roller.allowRollAs).toBe(false);
    fixture.detectChanges();
    expect(select()).toBeNull();
    expect(otherInput()).toBeNull();
  });

  it('is shown when the GM enables it, and lists the tracker combatants', () => {
    roller.allowRollAs = true;
    roller.rollAsNames = ['Ganger Alpha', 'Ganger Bravo'];
    fixture.detectChanges();

    expect(select()).not.toBeNull();
    expect(rollAsOptionNames(fixture)).toEqual(['Ganger Alpha', 'Ganger Bravo']);
  });

  it('offers "yourself (GM)" first and "Other…" last, around the roster', () => {
    roller.allowRollAs = true;
    roller.rollAsNames = ['Ganger Alpha', 'Ganger Bravo'];
    fixture.detectChanges();

    const options = Array.from(select()!.options);
    expect(options[0].value).toBe(DiceRollerComponent.ROLL_AS_SELF);
    expect(options[0].textContent!.trim()).toBe('yourself (GM)');
    expect(options[options.length - 1].value).toBe(DiceRollerComponent.ROLL_AS_OTHER);
    expect(options[options.length - 1].textContent!.trim()).toBe('Other…');
    expect(options.map(o => o.textContent!.trim()).slice(1, -1))
      .toEqual(['Ganger Alpha', 'Ganger Bravo']);
  });

  it('starts on "yourself (GM)" with no ad-hoc box showing', () => {
    roller.allowRollAs = true;
    roller.rollAsNames = ['Ganger Alpha'];
    fixture.detectChanges();

    expect(select()!.value).toBe(DiceRollerComponent.ROLL_AS_SELF);
    expect(otherInput()).toBeNull();
    expect(roller.rollAsName).toBeNull();
  });

  it('arms the attribution when a combatant is picked from the dropdown', () => {
    roller.allowRollAs = true;
    roller.rollAsNames = ['Ganger Alpha', 'Ganger Bravo'];
    fixture.detectChanges();

    pick('Ganger Bravo');

    expect(roller.rollAsName).toBe('Ganger Bravo');
    expect(otherInput()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="roll-as-hint"]').textContent)
      .toContain('Ganger Bravo');

    let emitted: { rollAs: string | null } | null = null;
    roller.rolledEvent.subscribe(e => { emitted = e; });
    roller.roll();
    expect(emitted!.rollAs).toBe('Ganger Bravo');
  });

  it('reveals a text box on "Other…" and rolls under the typed ad-hoc name', () => {
    roller.allowRollAs = true;
    roller.rollAsNames = ['Ganger Alpha'];
    fixture.detectChanges();

    pick(DiceRollerComponent.ROLL_AS_OTHER);
    expect(otherInput()).not.toBeNull();
    // Nothing typed yet, so nothing is armed - the hint must not claim one.
    expect(roller.rollAsName).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="roll-as-hint"]').textContent)
      .toContain('logged as you');

    typeOther('Bartender');

    expect(roller.rollAsName).toBe('Bartender');
    let emitted: { rollAs: string | null } | null = null;
    roller.rolledEvent.subscribe(e => { emitted = e; });
    roller.roll();
    expect(emitted!.rollAs).toBe('Bartender');
  });

  it('keeps "Other…" and the typed name after rolling, so a repeat is zero taps', () => {
    roller.allowRollAs = true;
    roller.rollAsNames = ['Ganger Alpha'];
    fixture.detectChanges();
    pick(DiceRollerComponent.ROLL_AS_OTHER);
    typeOther('Bartender');

    const seen: (string | null)[] = [];
    roller.rolledEvent.subscribe(e => { seen.push(e.rollAs); });
    roller.roll();
    roller.localRolling = false;   // animation over
    roller.roll();
    fixture.detectChanges();

    expect(seen).toEqual(['Bartender', 'Bartender']);
    expect(select()!.value).toBe(DiceRollerComponent.ROLL_AS_OTHER);
    expect(otherInput()!.value).toBe('Bartender');
  });

  it('switches back and forth between the roster and "Other…" cleanly', () => {
    roller.allowRollAs = true;
    roller.rollAsNames = ['Ganger Alpha', 'Ganger Bravo'];
    fixture.detectChanges();

    pick('Ganger Bravo');
    expect(roller.rollAsName).toBe('Ganger Bravo');

    // Switching to Other… does not carry the roster name into the ad-hoc box:
    // it would arm a name the GM did not ask for.
    pick(DiceRollerComponent.ROLL_AS_OTHER);
    expect(otherInput()!.value).toBe('');
    expect(roller.rollAsName).toBeNull();

    typeOther('Bartender');
    expect(roller.rollAsName).toBe('Bartender');

    // ...and back to a roster name: the ad-hoc box goes away with its text.
    pick('Ganger Alpha');
    expect(otherInput()).toBeNull();
    expect(roller.rollAsName).toBe('Ganger Alpha');

    pick(DiceRollerComponent.ROLL_AS_SELF);
    expect(roller.rollAsName).toBeNull();
    expect(otherInput()).toBeNull();
  });

  it('shows an off-roster name armed from outside as "Other…" with the name filled in', async () => {
    roller.allowRollAs = true;
    roller.rollAsNames = ['Ganger Alpha'];
    roller.rollAs = 'Bartender';
    await settle();

    expect(roller.rollAsSelection).toBe(DiceRollerComponent.ROLL_AS_OTHER);
    expect(select()!.value).toBe(DiceRollerComponent.ROLL_AS_OTHER);
    expect(otherInput()!.value).toBe('Bartender');
  });

  it('shows a roster name armed from outside as that dropdown entry', async () => {
    roller.allowRollAs = true;
    roller.rollAsNames = ['Ganger Alpha', 'Ganger Bravo'];
    roller.rollAs = 'Ganger Bravo';
    await settle();

    expect(select()!.value).toBe('Ganger Bravo');
    expect(otherInput()).toBeNull();
  });

  it('collapses the ad-hoc box when the attribution is cleared', async () => {
    roller.allowRollAs = true;
    roller.rollAsNames = ['Ganger Alpha'];
    fixture.detectChanges();
    pick(DiceRollerComponent.ROLL_AS_OTHER);
    typeOther('Bartender');

    roller.clearRollAs();
    await settle();

    expect(roller.rollAsName).toBeNull();
    expect(otherInput()).toBeNull();
    expect(select()!.value).toBe(DiceRollerComponent.ROLL_AS_SELF);
  });

  it('emits the typed free-text name with the roll', () => {
    roller.allowRollAs = true;
    roller.rollAs = '  Bartender  ';
    let emitted: { values: number[]; rollAs: string | null } | null = null;
    roller.rolledEvent.subscribe(e => { emitted = e; });

    roller.roll();

    expect(emitted!.rollAs).toBe('Bartender');
    expect(emitted!.values.length).toBe(roller.diceCount);
  });

  it('emits no attribution while the field is off, whatever it holds', () => {
    roller.rollAs = 'Bartender';   // e.g. left over from a GM tab
    let emitted: { rollAs: string | null } | null = null;
    roller.rolledEvent.subscribe(e => { emitted = e; });

    roller.roll();

    expect(emitted!.rollAs).toBeNull();
  });

  it('keeps the attribution between rolls so a second NPC roll is one tap', () => {
    roller.allowRollAs = true;
    roller.rollAs = 'Ganger Bravo';
    const seen: (string | null)[] = [];
    roller.rolledEvent.subscribe(e => { seen.push(e.rollAs); });

    roller.roll();
    roller.localRolling = false;   // animation over
    roller.roll();

    expect(seen).toEqual(['Ganger Bravo', 'Ganger Bravo']);
  });

  it('clears back to rolling as yourself in one tap', () => {
    roller.allowRollAs = true;
    roller.rollAs = 'Ganger Bravo';

    roller.clearRollAs();

    expect(roller.rollAsName).toBeNull();
    let emitted: { rollAs: string | null } | null = null;
    roller.rolledEvent.subscribe(e => { emitted = e; });
    roller.roll();
    expect(emitted!.rollAs).toBeNull();
  });

  it('can be reset from outside, for the tracker\'s combat-boundary clear', () => {
    roller.allowRollAs = true;
    roller.rollAs = 'Ganger Bravo';

    roller.clearRollAs();

    expect(roller.rollAs).toBe('');
    expect(roller.rollAsName).toBeNull();
  });

  it('marks a remote NPC roll in the dice tray, matching the log badge', () => {
    roller.incomingRoll = { roller: 'Ganger Bravo', values: [6, 5, 2], npc: true };
    roller.ngOnChanges({ incomingRoll: { currentValue: roller.incomingRoll } as never });
    fixture.detectChanges();

    expect(roller.remoteRolls[0].npc).toBe(true);
    const badge = fixture.nativeElement.querySelector('[data-testid="remote-roll-npc-badge"]');
    expect(badge).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.dice-roller-attribution').textContent)
      .toContain('Ganger Bravo');
  });

  it('leaves a player\'s own remote roll unmarked in the dice tray', () => {
    roller.incomingRoll = { roller: 'Wombat', values: [6, 5, 2] };
    roller.ngOnChanges({ incomingRoll: { currentValue: roller.incomingRoll } as never });
    fixture.detectChanges();

    expect(roller.remoteRolls[0].npc).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="remote-roll-npc-badge"]')).toBeNull();
  });

  it('greys the tray label once the attribution it names is no longer current', () => {
    roller.allowRollAs = true;
    roller.rollAs = 'Ganger Bravo';
    roller.roll();
    fixture.detectChanges();
    // While the two agree, the label is not stale and nothing contradicts.
    expect(roller.isLocalAttributionStale).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="local-roll-attribution-stale"]'))
      .toBeNull();

    roller.clearRollAs();
    fixture.detectChanges();

    // The hint now says "logged as you" while the tray still names the NPC -
    // the tray label is greyed and marked as describing the previous roll.
    expect(roller.isLocalAttributionStale).toBe(true);
    const stale = fixture.nativeElement.querySelector('[data-testid="local-roll-attribution-stale"]');
    expect(stale).not.toBeNull();
    expect(stale.classList).toContain('dice-section-label--stale');
    expect(stale.textContent).toContain('previous roll');
    expect(fixture.nativeElement.querySelector('[data-testid="roll-as-hint"]').textContent)
      .toContain('logged as you');
  });

  it('labels the local tray with whoever the shown roll was made for', () => {
    roller.allowRollAs = true;
    roller.rollAs = 'Ganger Bravo';
    roller.roll();
    // Retyped mid-animation: the tray still names the roll that was made.
    roller.rollAs = 'Someone Else';
    fixture.detectChanges();

    const label = fixture.nativeElement.querySelector('[data-testid="local-roll-attribution"]');
    expect(label.textContent.trim()).toBe('Ganger Bravo');
  });
});
