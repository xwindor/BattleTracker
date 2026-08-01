// Promoted scenarios for briefs/combat-log-readability.md.
//
// Only the in-scope part of the brief is exercised here (see the brief's
// "Scope decisions"): glitch / critical-glitch labelling on rolls that the app
// actually makes, GM roll visibility, and GM-authored glitch narration. The
// limit / opposed-test / Edge machinery the brief's other scenarios assume
// does not exist in this codebase and is explicitly out of scope.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from 'app/battle-tracker/battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { SessionSyncService, SharedLogEntry } from 'app/services/session-sync.service';
import { CRITICAL_GLITCH_LABEL, GLITCH_LABEL } from 'app/shared/log-formatter';
import { Participant } from 'Combat/Participants/Participant';
import { PlayerViewComponent } from 'app/player-view/player-view.component';
import { LogHandler } from 'Logging';

function resetCombat() {
  CombatManager.participants.clear(false);
  CombatManager.currentActors.clear(false);
  CombatManager.nextSortOrder = 0;
  CombatManager.initiativePass = 1;
  CombatManager.combatTurn = 1;
  CombatManager.started = false;
  CombatManager.passEnded = true;
}

describe('Combat log readability', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;
  let sync: SessionSyncService;
  let sent: SharedLogEntry[];
  let commands: { type: string }[];

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
    spyOn(sync, 'sendCommand').and.callFake((cmd: { type: string }) => { commands.push(cmd); });

    // Pretend a share session is live; the GM's log pane then renders the
    // shared entries rather than the local-only log.
    component.shareRoomCode = 'ABC123';
    component.sharedLogEntries = [];
  });

  afterEach(() => {
    resetCombat();
  });

  // ── Glitch labelling on a real roll ─────────────────────────────────────

  describe('S2 (in-scope part) - a roll that both succeeds and glitches', () => {
    it('labels the roll GLITCH while still reporting its hits (AC2, AC3, p. 45)', () => {
      // Nine dice, five 1s -> more than half, so a glitch; three hits stand.
      component.onGmDiceRolled([6, 5, 5, 1, 1, 1, 1, 1, 3]);

      expect(sent.length).toBe(1);
      expect(sent[0].text).toContain('3 hits');
      expect(sent[0].text).toContain('5 ones of 9');
      expect(sent[0].text).toContain(GLITCH_LABEL);
      expect(sent[0].text).not.toContain(CRITICAL_GLITCH_LABEL);
      expect(sent[0].glitch).toBe('glitch');
    });

    it('accepts GM-authored narration as its own linked entry, leaving the roll untouched (AC24, p. 45)', () => {
      component.onGmDiceRolled([6, 1, 1, 1, 2]);
      const rollEntry = sent[0];
      const rollTextBefore = rollEntry.text;

      component.setGlitchNoteDraft(rollEntry, 'Shock gloves discharge early.');
      component.submitGlitchNote(rollEntry);

      expect(sent.length).toBe(2);
      const note = sent[1];
      expect(note.gmNote).toBe(true);
      expect(note.refId).toBe(rollEntry.id);
      expect(note.text).toBe('Shock gloves discharge early.');
      // Nothing was generated for the GM and the original roll is unchanged.
      expect(rollEntry.text).toBe(rollTextBefore);
    });

    it('offers narration only on glitched entries (p. 45)', () => {
      component.onGmDiceRolled([6, 5, 4, 3, 2]);
      expect(component.canAnnotateGlitch(sent[0])).toBe(false);

      component.onGmDiceRolled([1, 1, 1, 2, 3]);
      expect(component.canAnnotateGlitch(sent[1])).toBe(true);
    });
  });

  it('labels a glitch with no hits as a CRITICAL GLITCH (AC3, p. 45)', () => {
    component.onGmDiceRolled([1, 1, 1, 2, 3]);

    expect(sent[0].text).toContain('0 hits');
    expect(sent[0].text).toContain(CRITICAL_GLITCH_LABEL);
    expect(sent[0].glitch).toBe('critical');
  });

  it('classifies a player-submitted roll the same way as a GM roll (p. 45)', () => {
    component['handleSessionCommand']({
      type: 'dice_roll',
      player: 'Wombat',
      payload: { roller: 'Wombat', values: [1, 1, 1, 6, 4] },
      timestamp: new Date().toISOString()
    });

    expect(sent[0].actor).toBe('Wombat');
    expect(sent[0].glitch).toBe('glitch');
    expect(sent[0].text).toContain('1 hit');
  });

  // ── GM roll visibility (AC25, p. 330) ───────────────────────────────────

  describe('GM roll visibility', () => {
    it('defaults to visible: a GM roll reaches the shared log and the players', () => {
      expect(component.gmRollsVisibleToPlayers).toBe(true);
      expect(component.isGmRollHiddenFromPlayers()).toBe(false);

      component.onGmDiceRolled([6, 5, 2]);

      expect(sent.length).toBe(1);
      expect(sent[0].hiddenFromPlayers).toBeUndefined();
      expect(commands.some(c => c.type === 'dice_roll')).toBe(true);
    });

    it('session override keeps every GM roll off the wire but in the GM log', () => {
      component.toggleGmRollVisibility();
      expect(component.gmRollsVisibleToPlayers).toBe(false);

      component.onGmDiceRolled([6, 5, 2]);

      expect(sent.length).toBe(0);
      expect(commands.length).toBe(0);
      expect(component.sharedLogEntries.length).toBe(1);
      expect(component.sharedLogEntries[0].hiddenFromPlayers).toBe(true);
      expect(component.sharedLogEntries[0].text).toContain('2 hits');
    });

    it('per-roll override hides exactly one roll and then resets itself', () => {
      component.toggleHideNextGmRoll();
      expect(component.isGmRollHiddenFromPlayers()).toBe(true);

      component.onGmDiceRolled([1, 1, 1]);   // hidden
      component.onGmDiceRolled([6, 6, 6]);   // visible again

      expect(component.hideNextGmRoll).toBe(false);
      expect(sent.length).toBe(1);
      expect(sent[0].text).toContain('3 hits');
      expect(component.sharedLogEntries.length).toBe(1);
      expect(component.sharedLogEntries[0].hiddenFromPlayers).toBe(true);
      expect(component.sharedLogEntries[0].text).toContain(CRITICAL_GLITCH_LABEL);
    });

    it('the toggles are reversible - flipping back restores the default', () => {
      component.toggleGmRollVisibility();
      component.toggleGmRollVisibility();
      expect(component.gmRollsVisibleToPlayers).toBe(true);

      component.toggleHideNextGmRoll();
      component.toggleHideNextGmRoll();
      expect(component.hideNextGmRoll).toBe(false);
    });

    it('narration about a hidden roll stays hidden too', () => {
      component.toggleGmRollVisibility();
      component.onGmDiceRolled([1, 1, 1]);
      const hiddenRoll = component.sharedLogEntries[0];

      component.setGlitchNoteDraft(hiddenRoll, 'Ambusher fumbles.');
      component.submitGlitchNote(hiddenRoll);

      expect(sent.length).toBe(0);
      expect(component.sharedLogEntries.length).toBe(2);
      expect(component.sharedLogEntries[1].gmNote).toBe(true);
      expect(component.sharedLogEntries[1].hiddenFromPlayers).toBe(true);
      expect(component.sharedLogEntries[1].refId).toBe(hiddenRoll.id);
    });
  });

  // ── Narration is linked to its roll by reference, not by adjacency ──────

  describe('GM narration linkage in a flat log', () => {
    // The server echoes every accepted entry back to the GM. The spy above
    // swallows that, so tests that need the GM's own pane populated replay it.
    function echo(entry: SharedLogEntry): SharedLogEntry {
      component['insertSharedLogEntry'](entry);
      return entry;
    }

    function unrelated(actor: string, text: string): void {
      echo({ actor, text, timestamp: new Date().toISOString(), id: `x-${actor}-${text.length}` });
    }

    it('names the roll it annotates even with unrelated entries logged in between', () => {
      // The roll being narrated: 1 hit, 3 ones of 5 -> GLITCH.
      component.onGmDiceRolled([1, 1, 1, 6, 2]);
      const rollEntry = echo(sent[0]);

      // Real play: several other things happen before the GM types anything,
      // including another glitched roll by someone else.
      unrelated('Cutter', 'Interrupt Full Defense');
      component['handleSessionCommand']({
        type: 'dice_roll',
        player: 'Wombat',
        payload: { roller: 'Wombat', values: [1, 1, 1, 1, 1, 6, 6, 4, 3] },
        timestamp: new Date().toISOString()
      });
      echo(sent[1]);
      unrelated('GM', 'Start Initiative Pass 2 — all Initiative Scores -10');

      component.setGlitchNoteDraft(rollEntry, 'Sight snags on his pocket.');
      component.submitGlitchNote(rollEntry);
      const note = echo(sent[sent.length - 1]);

      // The link is data, not layout.
      expect(note.refId).toBe(rollEntry.id);
      expect(note.refSummary).toContain('GM');
      expect(note.refSummary).toContain('1 hit');
      expect(note.refSummary).toContain('3 ones of 5');
      expect(note.refSummary).toContain(GLITCH_LABEL);
      // ...and it names the right roll, not the other glitch in between.
      expect(note.refSummary).not.toContain('5 ones of 9');

      fixture.detectChanges();
      const items: HTMLElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.gm-log-list .list-group-item')
      );
      const rollIndex = items.findIndex(li => li.textContent?.includes('3 ones of 5'));
      const noteIndex = items.findIndex(li => li.textContent?.includes('Sight snags on his pocket.'));
      expect(rollIndex).toBeGreaterThanOrEqual(0);
      expect(noteIndex).toBeGreaterThan(rollIndex + 1); // genuinely not adjacent

      const refLine = items[noteIndex].querySelector('[data-testid="log-entry-ref"]');
      expect(refLine).not.toBeNull();
      const refText = refLine?.textContent || '';
      expect(refText).toContain('1 hit');
      expect(refText).toContain('3 ones of 5');
      expect(refText).toContain(GLITCH_LABEL);
      expect(refText).not.toContain('5 ones of 9');
    });

    it('renders the reference on the player screen too, from the entry itself', () => {
      component.onGmDiceRolled([1, 1, 1, 6, 2]);
      const rollEntry = sent[0];
      component.setGlitchNoteDraft(rollEntry, 'Sight snags on his pocket.');
      component.submitGlitchNote(rollEntry);
      const note = sent[1];

      // The player view holds only what came over the wire - no parent lookup
      // is needed, and none is possible if the parent scrolled out of the
      // 300-entry server history.
      const playerFixture = TestBed.createComponent(PlayerViewComponent);
      const player = playerFixture.componentInstance;
      player.connected = true;
      player.state = { round: 1, pass: 1, participants: [] };
      player.log = [ note ];
      playerFixture.detectChanges();

      const refLine = playerFixture.nativeElement.querySelector('[data-testid="log-entry-ref"]');
      expect(refLine).not.toBeNull();
      expect(refLine.textContent).toContain('1 hit');
      expect(refLine.textContent).toContain('3 ones of 5');
      expect(refLine.textContent).toContain(GLITCH_LABEL);
      expect(player.getLogEntryReference(note)).toBe(note.refSummary || '');
    });
  });

  // ── AC25 covers every GM-originated roll, not just the dice roller ──────

  describe('GM roll visibility covers NPC initiative rolls (AC25, p. 330)', () => {
    function addNpc(name: string): Participant {
      component.addParticipant(false);
      const npc = CombatManager.participants.items[CombatManager.participants.items.length - 1] as Participant;
      npc.name = name;
      return npc;
    }

    it('broadcasts an NPC initiative roll while GM rolls are visible (the default)', () => {
      const npc = addNpc('Ganger A');

      component.btnRollInitiative_Click(npc);

      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Ganger A');
      expect(sent[0].text).toContain('initiative roll:');
      expect(component.sharedLogEntries.length).toBe(0); // came from the echo, not locally
    });

    it('keeps an NPC initiative roll off the wire while session-hidden is active', () => {
      const npc = addNpc('Ganger B');
      component.toggleGmRollVisibility();

      component.btnRollInitiative_Click(npc);

      expect(sent.length).toBe(0);
      expect(component.sharedLogEntries.length).toBe(1);
      expect(component.sharedLogEntries[0].actor).toBe('Ganger B');
      expect(component.sharedLogEntries[0].hiddenFromPlayers).toBe(true);
      expect(component.sharedLogEntries[0].text).toContain('initiative roll:');
    });

    it('keeps an NPC initiative-dice delta off the wire while session-hidden', () => {
      const npc = addNpc('Ganger C');
      npc.setDicesWithoutRoll(1);
      npc.diceIni = 4;                // already rolled in, so a change re-rolls
      CombatManager.started = true;   // deltas are only rolled once combat runs
      component.toggleGmRollVisibility();

      component['changeParticipantDiceCount'](npc, 3, { rollGainedDice: true });

      expect(sent.length).toBe(0);
      expect(component.sharedLogEntries.some(e => e.text.includes('initiative delta:'))).toBe(true);
      expect(component.sharedLogEntries.every(e => e.hiddenFromPlayers === true)).toBe(true);
    });

    it('never hides a player-claimed character\'s initiative roll', () => {
      const pc = addNpc('Wombat');
      component['participantOwners'].set(pc, 'Xavier');
      component.toggleGmRollVisibility();

      component.btnRollInitiative_Click(pc);

      // The setting is about the gamemaster's dice (p. 330), not the players'.
      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Wombat');
      expect(component.sharedLogEntries.length).toBe(0);
    });
  });

  // ── The one-shot cannot survive a session-visibility round trip ─────────

  describe('stale "hide next roll" arming', () => {
    it('is cleared by toggling session visibility off and back on', () => {
      component.toggleHideNextGmRoll();
      expect(component.hideNextGmRoll).toBe(true);

      component.toggleGmRollVisibility();   // -> session hidden
      expect(component.hideNextGmRoll).toBe(false);
      component.toggleGmRollVisibility();   // -> session visible again

      expect(component.gmRollsVisibleToPlayers).toBe(true);
      expect(component.hideNextGmRoll).toBe(false);
      expect(component.isGmRollHiddenFromPlayers()).toBe(false);

      component.onGmDiceRolled([6, 5, 2]);

      expect(sent.length).toBe(1);
      expect(sent[0].hiddenFromPlayers).toBeUndefined();
      expect(component.sharedLogEntries.length).toBe(0);
    });

    it('does not burn the arming on a roll made while session-hidden', () => {
      component.toggleGmRollVisibility();   // -> session hidden, arming cleared
      component.hideNextGmRoll = true;      // as if armed by other means

      component.onGmDiceRolled([6, 5, 2]);  // hidden by the session setting

      expect(component.hideNextGmRoll).toBe(true);
    });
  });

  // ── A batch that rolls nothing must not spend the one-shot ──────────────

  describe('"hide next roll" arming vs. batch roll buttons', () => {
    function addNpc(name: string): Participant {
      component.addParticipant(false);
      const npc = CombatManager.participants.items[CombatManager.participants.items.length - 1] as Participant;
      npc.name = name;
      return npc;
    }

    it('survives a batch with nothing outstanding to roll', () => {
      component.toggleHideNextGmRoll();
      expect(component.hideNextGmRoll).toBe(true);

      // Nothing outstanding: the GM tapped the button to check status.
      component.btnRollRemainingNonPlayer_Click();

      expect(component.hideNextGmRoll).toBe(true);
      expect(sent.length).toBe(0);

      // ...and the next real GM roll is the one that gets hidden.
      component.onGmDiceRolled([1, 1, 1]);
      expect(sent.length).toBe(0);
      expect(component.sharedLogEntries.length).toBe(1);
      expect(component.sharedLogEntries[0].hiddenFromPlayers).toBe(true);
      expect(component.hideNextGmRoll).toBe(false);
    });

    it('survives a batch that rolls only player-claimed characters', () => {
      const pc = addNpc('Wombat');
      component['participantOwners'].set(pc, 'Xavier');
      component.toggleHideNextGmRoll();

      component['rollOutstandingInitiative'](true);

      // A player's roll is never hidden (p. 330), so the arming is untouched.
      expect(component.hideNextGmRoll).toBe(true);
      expect(sent.length).toBe(1);
      expect(sent[0].actor).toBe('Wombat');
      expect(sent[0].hiddenFromPlayers).toBeUndefined();
    });

    it('is spent - once - by a batch that does roll a GM-run participant', () => {
      addNpc('Ganger A');
      addNpc('Ganger B');
      component.toggleHideNextGmRoll();

      component.btnRollRemainingNonPlayer_Click();

      expect(component.hideNextGmRoll).toBe(false);
      expect(sent.length).toBe(0);
      expect(component.sharedLogEntries.length).toBe(2);
      expect(component.sharedLogEntries.every(e => e.hiddenFromPlayers === true)).toBe(true);
    });
  });

  // ── Every initiative-log path answers to the visibility gate ────────────

  describe('rolled-total clamp line', () => {
    it('stays off the wire while session-hidden (p. 330)', () => {
      component.addParticipant(false);
      const npc = CombatManager.participants.items[CombatManager.participants.items.length - 1] as Participant;
      npc.name = 'Ganger D';
      npc.diceIni = 30;                 // Score moved with it
      npc.setDicesWithoutRoll(1);       // now only 1D6, so max rolled total 6
      component.toggleGmRollVisibility();

      component['enforceParticipantRollBounds']();

      expect(sent.length).toBe(0);
      const clampEntries = component.sharedLogEntries.filter(e => e.text.includes('rolled total clamped'));
      expect(clampEntries.length).toBe(1);
      expect(clampEntries[0].hiddenFromPlayers).toBe(true);
      expect(clampEntries[0].actor).toBe('Ganger D');
    });

    it('is broadcast normally while GM rolls are visible', () => {
      component.addParticipant(false);
      const npc = CombatManager.participants.items[CombatManager.participants.items.length - 1] as Participant;
      npc.name = 'Ganger E';
      npc.diceIni = 30;
      npc.setDicesWithoutRoll(1);

      component['enforceParticipantRollBounds']();

      expect(sent.length).toBe(1);
      expect(sent[0].text).toContain('rolled total clamped');
      expect(sent[0].hiddenFromPlayers).toBeUndefined();
    });

    it('does not burn a "hide next roll" arming meant for a real roll', () => {
      component.addParticipant(false);
      const npc = CombatManager.participants.items[CombatManager.participants.items.length - 1] as Participant;
      npc.name = 'Ganger F';
      npc.diceIni = 30;
      npc.setDicesWithoutRoll(1);
      component.toggleHideNextGmRoll();

      component['enforceParticipantRollBounds']();

      expect(component.hideNextGmRoll).toBe(true);
      expect(sent.length).toBe(0);
      expect(component.sharedLogEntries[0].hiddenFromPlayers).toBe(true);
    });
  });

  // ── The GM's own log says which lines the players never got ─────────────

  describe('local log marking of hidden entries', () => {
    it('tags a hidden NPC initiative roll, once, in the GM local log', () => {
      component.addParticipant(false);
      const npc = CombatManager.participants.items[CombatManager.participants.items.length - 1] as Participant;
      npc.name = 'Ganger G';
      component.toggleGmRollVisibility();
      LogHandler.logbook.length = 0;

      component.btnRollInitiative_Click(npc);

      const lines = LogHandler.logbook.filter(e => e.text.includes('initiative roll:'));
      expect(lines.length).toBe(1);
      expect(lines[0].text).toContain('(hidden from players)');
    });

    it('leaves a visible NPC initiative roll untagged, and still logs it once', () => {
      component.addParticipant(false);
      const npc = CombatManager.participants.items[CombatManager.participants.items.length - 1] as Participant;
      npc.name = 'Ganger H';
      LogHandler.logbook.length = 0;

      component.btnRollInitiative_Click(npc);

      const lines = LogHandler.logbook.filter(e => e.text.includes('initiative roll:'));
      expect(lines.length).toBe(1);
      expect(lines[0].text).not.toContain('(hidden from players)');
    });
  });

  // ── Narration says where it is going, per entry ─────────────────────────

  describe('narration visibility indicator', () => {
    it('says "will be visible to players" for a public roll even while session-hidden is lit', () => {
      component.onGmDiceRolled([1, 1, 1, 6, 2]);     // public
      const publicRoll = sent[0];
      component['insertSharedLogEntry'](publicRoll); // the server echo

      component.toggleGmRollVisibility();            // session now hidden
      component.toggleGlitchNote(publicRoll);
      fixture.detectChanges();

      expect(component.getGlitchNoteVisibilityLabel(publicRoll)).toBe('will be visible to players');
      expect(component.isGlitchNoteVisibleToPlayers(publicRoll)).toBe(true);
      const cue = fixture.nativeElement.querySelector('[data-testid="glitch-note-visibility"]');
      expect(cue).not.toBeNull();
      expect(cue.textContent).toContain('will be visible to players');

      // ...and it is telling the truth: the narration does go out.
      component.setGlitchNoteDraft(publicRoll, 'Gun jams.');
      component.submitGlitchNote(publicRoll);
      expect(sent.length).toBe(2);
      expect(sent[1].text).toBe('Gun jams.');
    });

    it('says "stays private" for a hidden roll', () => {
      component.toggleGmRollVisibility();
      component.onGmDiceRolled([1, 1, 1]);
      const hiddenRoll = component.sharedLogEntries[0];

      component.toggleGlitchNote(hiddenRoll);
      fixture.detectChanges();

      expect(component.getGlitchNoteVisibilityLabel(hiddenRoll)).toBe('stays private');
      const cue = fixture.nativeElement.querySelector('[data-testid="glitch-note-visibility"]');
      expect(cue).not.toBeNull();
      expect(cue.textContent).toContain('stays private');
    });
  });

  // ── Hidden entries survive a reconnect ──────────────────────────────────

  describe('GM-local hidden entries on reconnect', () => {
    it('are merged back in rather than wiped by the server log', async () => {
      component.toggleGmRollVisibility();
      component.onGmDiceRolled([1, 1, 1]);
      const hidden = component.sharedLogEntries[0];

      const serverLog: SharedLogEntry[] = [
        { actor: 'Wombat', text: 'rolled 5d6: [6, 5, 3, 2, 1] — 2 hits · 1 one of 5', timestamp: '2000-01-01T00:00:00.000Z', id: 'srv-1' }
      ];
      spyOn(sync, 'connect');
      spyOn(sync, 'joinAsGm').and.resolveTo({ state: null, log: serverLog });

      component.shareJoinCode = 'ABC123';
      await component.btnJoinShareSession_Click();

      expect(component.sharedLogEntries.length).toBe(2);
      expect(component.sharedLogEntries.some(e => e.id === hidden.id)).toBe(true);
      expect(component.sharedLogEntries.some(e => e.id === 'srv-1')).toBe(true);
    });

    it('interleaves them by timestamp, not by insertion order', async () => {
      // Held locally in the *wrong* order on purpose: if the merge appended
      // instead of ordering, this is the order that would survive.
      component.sharedLogEntries = [
        { actor: 'GM', text: 'hidden third', timestamp: '2000-01-01T00:00:03.000Z', id: 'h-3', hiddenFromPlayers: true },
        { actor: 'GM', text: 'hidden first', timestamp: '2000-01-01T00:00:01.000Z', id: 'h-1', hiddenFromPlayers: true }
      ];

      const serverLog: SharedLogEntry[] = [
        { actor: 'Wombat', text: 'server zero', timestamp: '2000-01-01T00:00:00.000Z', id: 'srv-0' },
        { actor: 'Wombat', text: 'server two', timestamp: '2000-01-01T00:00:02.000Z', id: 'srv-2' },
        { actor: 'Wombat', text: 'server four', timestamp: '2000-01-01T00:00:04.000Z', id: 'srv-4' }
      ];
      spyOn(sync, 'connect');
      spyOn(sync, 'joinAsGm').and.resolveTo({ state: null, log: serverLog });

      component.shareJoinCode = 'ABC123';
      await component.btnJoinShareSession_Click();

      expect(component.sharedLogEntries.map(e => e.id))
        .toEqual([ 'srv-0', 'h-1', 'srv-2', 'h-3', 'srv-4' ]);

      // The ordering sequence was reseeded to the merged order, so the next
      // hidden entry lands at the end rather than in the middle of the history.
      component.toggleHideNextGmRoll();
      component.onGmDiceRolled([1, 1, 1]);
      expect(component.sharedLogEntries.length).toBe(6);
      expect(component.sharedLogEntries[5].hiddenFromPlayers).toBe(true);
      expect(component.sharedLogEntries[5].text).toContain(CRITICAL_GLITCH_LABEL);
    });

    it('keeps them when the session closes unexpectedly, so a rejoin still has them', () => {
      component.toggleGmRollVisibility();
      component.onGmDiceRolled([1, 1, 1]);
      component.sharedLogEntries = [
        ...component.sharedLogEntries,
        { actor: 'Wombat', text: 'shared line', timestamp: new Date().toISOString(), id: 'srv-2' }
      ];

      component['handleSessionClosedExternally']();

      expect(component.sharedLogEntries.length).toBe(1);
      expect(component.sharedLogEntries[0].hiddenFromPlayers).toBe(true);
    });

    it('shows the retained entries in the GM log pane even with no room code', () => {
      component.toggleGmRollVisibility();
      component.onGmDiceRolled([1, 1, 1]);

      component['handleSessionClosedExternally']();
      fixture.detectChanges();

      expect(component.shareRoomCode).toBe('');
      expect(component.hasRetainedHiddenLogEntries()).toBe(true);
      expect(component.retainedHiddenLogEntryCount).toBe(1);

      const banner = fixture.nativeElement.querySelector('[data-testid="retained-hidden-banner"]');
      expect(banner).not.toBeNull();
      expect(banner.textContent).toContain('1 hidden GM entry retained');

      const rows: HTMLElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('[data-testid="retained-hidden-entry"]')
      );
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain(CRITICAL_GLITCH_LABEL);
    });

    it('reports no retained entries while a session is live', () => {
      component.toggleGmRollVisibility();
      component.onGmDiceRolled([1, 1, 1]);

      expect(component.shareRoomCode).toBe('ABC123');
      expect(component.hasRetainedHiddenLogEntries()).toBe(false);
    });

    it('asks before "Create Share Session" throws the retained entries away', async () => {
      component.toggleGmRollVisibility();
      component.onGmDiceRolled([1, 1, 1]);
      component['handleSessionClosedExternally']();
      const retained = component.sharedLogEntries[0];

      const confirmSpy = spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(false);
      const createSpy = spyOn(sync, 'createSession').and.resolveTo({ room: 'NEW999' });
      spyOn(sync, 'connect');

      await component.btnCreateShareSession_Click();

      expect(confirmSpy).toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
      expect(component.sharedLogEntries).toEqual([ retained ]);
      expect(component.shareRoomCode).toBe('');
      expect(component.shareInfo).toContain('Kept the retained hidden entries');
    });

    it('discards them only after the GM confirms', async () => {
      component.toggleGmRollVisibility();
      component.onGmDiceRolled([1, 1, 1]);
      component['handleSessionClosedExternally']();

      spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      spyOn(sync, 'createSession').and.resolveTo({ room: 'NEW999' });
      spyOn(sync, 'connect');
      spyOn(sync, 'onCommand');
      spyOn(sync, 'onLog');
      spyOn(sync, 'onSessionClosed');

      await component.btnCreateShareSession_Click();

      expect(component.shareRoomCode).toBe('NEW999');
      expect(component.sharedLogEntries.length).toBe(0);
    });

    it('does not ask when there is nothing retained to lose', async () => {
      const confirmSpy = spyOn(component['confirmationDialog'], 'confirm').and.resolveTo(true);
      spyOn(sync, 'createSession').and.resolveTo({ room: 'NEW999' });
      spyOn(sync, 'connect');
      spyOn(sync, 'onCommand');
      spyOn(sync, 'onLog');
      spyOn(sync, 'onSessionClosed');

      component.sharedLogEntries = [];
      component.shareRoomCode = '';

      await component.btnCreateShareSession_Click();

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(component.shareRoomCode).toBe('NEW999');
    });
  });

  // ── Ordering of the GM's own pane ───────────────────────────────────────

  it('keeps a hidden roll after the visible roll it followed, despite the echo delay', () => {
    component.onGmDiceRolled([6, 6, 6]);        // visible: goes out, echo pending
    const visible = sent[0];

    component.toggleHideNextGmRoll();
    component.onGmDiceRolled([1, 1, 1]);        // hidden: lands immediately
    const hidden = component.sharedLogEntries[0];
    expect(hidden.hiddenFromPlayers).toBe(true);

    // The server echo of the earlier roll arrives late.
    component['insertSharedLogEntry'](visible);

    expect(component.sharedLogEntries.map(e => e.id)).toEqual([ visible.id, hidden.id ]);
    expect(component.sharedLogEntries[0].hiddenFromPlayers).toBeUndefined();
    expect(component.sharedLogEntries[1].hiddenFromPlayers).toBe(true);
  });

  // ── Persistence: the log is append-only history ─────────────────────────

  it('never rewrites an existing entry - corrections are appended', () => {
    component.onGmDiceRolled([1, 1, 1, 6, 2]);
    const first = sent[0];
    const originalText = String(first.text);
    component.setGlitchNoteDraft(first, 'Gun jams.');
    component.submitGlitchNote(first);
    component.setGlitchNoteDraft(first, 'Actually: sight snags on his pocket.');
    component.submitGlitchNote(first);

    expect(sent.length).toBe(3);
    expect(sent[0].text).toBe(originalText);
    expect(sent[0].text).toContain(GLITCH_LABEL);
    expect(sent[1].text).toBe('Gun jams.');
    expect(sent[2].text).toBe('Actually: sight snags on his pocket.');
  });
});

describe('SessionSyncService log transport', () => {
  it('refuses to put a hidden entry on the wire (p. 330)', () => {
    const service = new SessionSyncService();
    service.currentRoom = 'ABC123';
    const emit = jasmine.createSpy('emit');
    (service as unknown as { socket: { emit: jasmine.Spy } }).socket = { emit };

    service.appendLog({ actor: 'GM', text: 'secret', timestamp: 'now', hiddenFromPlayers: true });
    expect(emit).not.toHaveBeenCalled();

    service.appendLog({ actor: 'GM', text: 'shared', timestamp: 'now' });
    expect(emit).toHaveBeenCalled();
  });
});
