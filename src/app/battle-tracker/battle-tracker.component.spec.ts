import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleTrackerComponent } from './battle-tracker.component';
import { appConfig } from 'app/app.config';
import { CombatManager } from 'Combat';
import { Participant } from 'Combat/Participants/Participant';
import { IParticipant } from 'Combat/Participants/IParticipant';
import { SharedCombatState } from 'app/services/session-sync.service';
import { MatrixParticipant } from 'Matrix/MatrixParticipant';
import { VRMode } from 'Matrix/VRMode';
import { AstralParticipant } from 'Magic';
import { UndoHandler } from 'Common';
import { LogHandler } from 'Logging';
import { interruptTable } from 'InterruptTable';

/** Full Defense: an Interrupt Action costing -10 Initiative Score (brief F9, p. 167). */
const FULL_DEFENSE = interruptTable.find(a => a.key === 'fullDefense')!;

/** Reset the singleton CombatManager to a clean, un-started encounter. */
function resetCombat() {
  CombatManager.participants.clear(false);
  CombatManager.currentActors.clear(false);
  CombatManager.nextSortOrder = 0;
  CombatManager.initiativePass = 1;
  CombatManager.combatTurn = 1;
  CombatManager.started = false;
  CombatManager.passEnded = true;
}

function rolled(name: string, attribute: number, dice: number, roll: number): Participant {
  const p = new Participant();
  p.name = name;
  p.baseIni = attribute;
  p.setDicesWithoutRoll(dice);
  CombatManager.participants.insert(p, false);
  p.diceIni = roll;
  return p;
}

/**
 * Force the component's single-die roller to produce a known sequence, so the
 * dice-count paths are deterministic. Returns the spy.
 */
function scriptDice(component: BattleTrackerComponent, values: number[]): jasmine.Spy {
  const spy = spyOn<never>(component as never, 'rollInitiativeDie' as never);
  spy.and.returnValues(...(values as never[]));
  return spy as unknown as jasmine.Spy;
}

describe('BattleTrackerComponent', () => {
  let component: BattleTrackerComponent;
  let fixture: ComponentFixture<BattleTrackerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BattleTrackerComponent],
      providers: appConfig.providers
    }).compileComponents();

    fixture = TestBed.createComponent(BattleTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    resetCombat();
  });

  afterEach(() => {
    resetCombat();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Acceptance criterion 8 (brief F5, p. 160): a mid-turn Initiative Dice
  // decrease rolls the lost dice and subtracts the *whole* total.
  describe('mid-turn Initiative Dice decrease', () => {
    it('subtracts the full rolled total from the Score even when the roll exceeds the dice-total display floor', () => {
      const p = rolled('Doped', 10, 3, 4); // 3D6 rolled a total of 4 -> Score 14
      CombatManager.started = true;
      // Losing 2D6; force the lost dice to roll 11 - more than diceIni - 1.
      scriptDice(component, [6, 5]);

      component['changeParticipantDiceCount'](p, 1);

      expect(p.currentInitiativeScore).toBe(3); // 14 - 11, not truncated
      expect(p.diceIni).toBe(1);                // display floor only
    });

    it('subtracts the whole total in the ordinary (unfloored) case too', () => {
      const p = rolled('Doped', 10, 3, 12); // Score 22
      CombatManager.started = true;
      scriptDice(component, [3, 4]);

      component['changeParticipantDiceCount'](p, 1);

      expect(p.currentInitiativeScore).toBe(15); // 22 - 7
      expect(p.diceIni).toBe(5);
    });
  });

  // The Score only moves when dice are actually rolled (brief F5, p. 160), so
  // bounds-clamping triggered by an unrelated edit must be Score-neutral.
  it('clamping diceIni after an unrelated field edit does not change the Score', () => {
    const p = rolled('Typo', 10, 3, 18);  // Score 28
    p.setDicesWithoutRoll(1);             // max roll is now 6, diceIni is out of bounds
    const before = p.currentInitiativeScore;

    component['enforceParticipantRollBounds']();

    expect(p.diceIni).toBe(6);                      // display clamped
    expect(p.currentInitiativeScore).toBe(before);  // Score untouched
  });

  // Defect 2: the restored Score must match the pass count it is restored at
  // (brief pp. 159-160).
  describe('restoreFromSharedState', () => {
    function state(pass: number, score: number): SharedCombatState {
      return {
        round: 1,
        pass,
        started: true,
        passEnded: false,
        currentInitiative: score,
        participants: [{
          id: 'p-1',
          name: 'Restored',
          order: 1,
          active: false,
          initiativeScore: score,
          playerControlled: false,
          initiativeDice: 1,
          pendingRoll: false,
          reaction: 5,
          intuition: 5
        }]
      };
    }

    it('reconstructs the broadcast Score verbatim when joining mid-combat at pass 3', () => {
      component['restoreFromSharedState'](state(3, 4));

      const p = CombatManager.participants.items[0] as IParticipant;
      expect(CombatManager.initiativePass).toBe(3);
      expect(p.getCurrentInitiative()).toBe(4); // not 10 (undecayed) and not -16
    });

    // Defect 2: a restored participant who had already rolled must not come
    // back marked as still needing to roll, and a stale roll must not stack a
    // fresh Initiative Test on the already-decayed Score (rolled once per
    // Combat Turn, pp. 159-160).
    describe('already-rolled state (rejoin at pass 3)', () => {
      /** GM was broadcast at pass 3: Wombat rolled 4 on 1D6, Score now 4. */
      function midCombatState(): SharedCombatState {
        return {
          round: 1,
          pass: 3,
          started: true,
          passEnded: false,
          currentInitiative: 4,
          participants: [{
            id: 'p-1',
            name: 'Wombat',
            order: 1,
            active: false,
            initiativeScore: 4,
            playerControlled: true,
            ownerName: 'Kicker',
            initiativeDice: 1,
            pendingRoll: false,
            rolledInitiativeTotal: 4,
            reaction: 5,
            intuition: 5
          }]
        };
      }

      it('restores diceIni so the participant is not flagged pendingRoll', () => {
        component['restoreFromSharedState'](midCombatState());

        const p = CombatManager.participants.items[0] as IParticipant;
        expect(p.diceIni).toBe(4);
        expect(p.getCurrentInitiative()).toBe(4);
        expect(component['getSharedParticipants']()[0].pendingRoll).toBeFalse();
      });

      it('disables the GM roll button for the restored participant', () => {
        component['restoreFromSharedState'](midCombatState());
        fixture.detectChanges();

        const row = fixture.nativeElement.querySelector('#participant0') as HTMLElement;
        const rollBtn = row.querySelector('button.gm-roll-btn') as HTMLButtonElement;
        expect(rollBtn.disabled).toBeTrue();
      });

      it('does not stack a fresh Initiative Test on the restored Score', () => {
        component['restoreFromSharedState'](midCombatState());
        const p = CombatManager.participants.items[0] as IParticipant;

        component['handleSessionCommand']({
          type: 'roll_submission',
          player: 'Kicker',
          payload: { participantId: 'p-1', roll: 5 },
          timestamp: new Date().toISOString()
        });

        expect(p.getCurrentInitiative()).toBe(4); // not 9
        expect(p.diceIni).toBe(4);
      });

      it('falls back to a non-zero rolled total for legacy payloads without the field', () => {
        const legacy = midCombatState();
        delete legacy.participants[0].rolledInitiativeTotal;

        component['restoreFromSharedState'](legacy);

        const p = CombatManager.participants.items[0] as IParticipant;
        expect(p.diceIni).toBeGreaterThan(0);
        expect(p.getCurrentInitiative()).toBe(4); // Score still restored verbatim
      });

      it('still flags a genuinely unrolled participant as pendingRoll', () => {
        const unrolled = midCombatState();
        unrolled.participants[0].pendingRoll = true;
        unrolled.participants[0].rolledInitiativeTotal = 0;

        component['restoreFromSharedState'](unrolled);

        const p = CombatManager.participants.items[0] as IParticipant;
        expect(p.diceIni).toBe(0);
        expect(component['getSharedParticipants']()[0].pendingRoll).toBeTrue();
      });
    });

    it('does not decay against a stale local pass count', () => {
      CombatManager.initiativePass = 5; // stale local value before the restore
      CombatManager.started = true;

      component['restoreFromSharedState'](state(2, 7));

      const p = CombatManager.participants.items[0] as IParticipant;
      expect(CombatManager.initiativePass).toBe(2);
      expect(p.getCurrentInitiative()).toBe(7);
    });
  });

  // Defect 1: a typed dice-total edit must move the running Initiative Score
  // only by the legitimate rolled-total delta (p. 160), and the DOM input must
  // end up showing the clamped model value. Exercised through the real DOM so
  // the ngModel write-ordering bug (raw value reaching the Score-moving setter
  // before any validation) is actually reproduced.
  describe('GM dice-total input (typed edit)', () => {
    /** The rolled-dice-total input for participant row `index`. */
    function diceTotalInput(index: number): HTMLInputElement {
      const row = fixture.nativeElement.querySelector('#participant' + index) as HTMLElement;
      return row.querySelector('input.inpDiceIni') as HTMLInputElement;
    }

    /**
     * Type into the input the way a GM does: the DOM value changes, the
     * DefaultValueAccessor fires, ngModel pushes the raw value out through
     * (ngModelChange). Awaiting stability lets ngModel's own write-back of the
     * clamped model value (queued as a microtask) land in the DOM.
     */
    async function type(input: HTMLInputElement, text: string) {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('does not inflate the Score when an out-of-range total is typed, and shows the clamped value', async () => {
      const p = rolled('Wombat', 6, 1, 4); // 1D6, already rolled 4 -> Score 10
      p.baseIni = 8;                       // attribute 8 -> Score 12
      expect(p.currentInitiativeScore).toBe(12);
      fixture.detectChanges();

      const input = diceTotalInput(0);
      await type(input, '44'); // max legal total for 1D6 is 6

      // Clamped to 6: Score moves by the 4 -> 6 delta only, never by 44 - 4.
      expect(p.diceIni).toBe(6);
      expect(p.currentInitiativeScore).toBe(14); // 12 + 2, NOT 52
      expect(input.value).toBe('6');             // DOM agrees with the model
    });

    it('applies the ordinary in-range correction as a delta', async () => {
      const p = rolled('Wombat', 6, 2, 4); // 2D6, max 12
      p.baseIni = 8;                       // Score 12
      fixture.detectChanges();

      await type(diceTotalInput(0), '9');

      expect(p.diceIni).toBe(9);
      expect(p.currentInitiativeScore).toBe(17); // 12 + (9 - 4)
    });

    it('never lets a typed edit push the Score above attribute + max roll', async () => {
      const p = rolled('Wombat', 6, 1, 0); // not yet rolled
      p.baseIni = 8;
      fixture.detectChanges();

      await type(diceTotalInput(0), '999');

      expect(p.diceIni).toBe(6);
      expect(p.currentInitiativeScore).toBe(14); // 8 + 6, the 1D6 maximum
      expect(diceTotalInput(0).value).toBe('6');
    });

    it('is a single undo step per edit', async () => {
      const p = rolled('Wombat', 6, 1, 4);
      p.baseIni = 8;
      fixture.detectChanges();

      await type(diceTotalInput(0), '44');
      expect(p.currentInitiativeScore).toBe(14);

      UndoHandler.Undo();

      expect(p.diceIni).toBe(4);
      expect(p.currentInitiativeScore).toBe(12);
    });
  });

  // Defect 6 / acceptance criterion 8 (p. 160): losing Initiative Dice
  // mid-combat rolls the lost dice and subtracts the total, "along with any
  // decrease to their Initiative Attribute" - both halves.
  describe('demoteToParticipant (deck removed mid-combat)', () => {
    function jackedInDecker(): MatrixParticipant {
      const mp = new MatrixParticipant();
      mp.name = 'Decker';
      mp.dataProcessing = 7;
      mp.setDicesWithoutRoll(4);    // hot sim
      mp.baseIni = 12;              // DP 7 + INT 5
      CombatManager.participants.insert(mp, false);
      mp.diceIni = 14;              // Score 26
      component['participantReactions'].set(mp, 5);
      component['participantIntuitions'].set(mp, 5);
      return mp;
    }

    it('subtracts both the attribute delta and the newly-rolled lost dice', () => {
      const mp = jackedInDecker();
      expect(mp.currentInitiativeScore).toBe(26);
      CombatManager.started = true;
      scriptDice(component, [4, 3, 2]);

      const p = component['demoteToParticipant'](mp);

      expect(p.dices).toBe(1);
      expect(p.baseIni).toBe(10);            // REA 5 + INT 5, attribute -2
      expect(p.currentInitiativeScore).toBe(15); // 26 - 2 (attribute) - 9 (lost dice)
      expect(p.diceIni).toBe(5);             // 14 - 9, display stays in step
    });

    // Parity with gmJackOut(): outside a running combat no dice are rolled and
    // nothing is subtracted; only the attribute delta lands. The stale
    // dice-total display that leaves behind is cosmetic - the bounds clamp is
    // Score-neutral (see enforceParticipantRollBounds).
    it('leaves the Score alone when combat has not started', () => {
      const mp = jackedInDecker();
      CombatManager.started = false;

      const p = component['demoteToParticipant'](mp);

      expect(p.currentInitiativeScore).toBe(24); // attribute delta only
      expect(p.diceIni).toBe(14);
    });
  });

  // Acceptance criterion 5 (brief p. 160): a character at Score 0 or below can
  // still defend, so the Interrupts UI stays on screen - individual actions are
  // disabled by canUseAction() instead (brief F9, p. 167).
  it('keeps the Interrupts dropdown visible at Initiative Score 0', () => {
    const p = rolled('Spent', 6, 1, 4); // Score 10
    CombatManager.nextIniPass();        // -> 0
    CombatManager.started = true;
    expect(p.getCurrentInitiative()).toBe(0);

    fixture.detectChanges();

    const toggle = fixture.nativeElement.querySelector('#interruptDropdownButton');
    expect(toggle).toBeTruthy();
  });

  it('still refuses an interrupt the participant cannot pay for at Score 0', () => {
    const p = rolled('Spent', 6, 1, 4);
    CombatManager.nextIniPass(); // -> 0
    const parry = { key: 'parry', iniMod: -5 };

    expect(p.canUseAction(parry)).toBeFalse();
    component.btnAction_Click(p, parry);
    expect(p.actionHistory).toEqual([]);
    expect(p.getCurrentInitiative()).toBe(0);
  });

  // ---------------------------------------------------------------------
  // Regressions for the three call sites that could change a participant's
  // Initiative Dice count without rolling the delta and moving the running
  // Initiative Score (brief F5 / criteria 7-8, p. 160), plus the 5D6 hard cap
  // (criterion 9, pp. 52/288).
  // ---------------------------------------------------------------------

  /**
   * Type into a number input the way a GM does: the DOM value changes, the
   * DefaultValueAccessor fires, ngModel pushes the value out through
   * (ngModelChange). Awaiting stability lets ngModel's write-back of the model
   * value land in the DOM.
   */
  async function typeInto(input: HTMLInputElement, text: string) {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * The Initiative Dice *count* box on participant row `index`.
   *
   * The row's E/R/I/D now collapse behind a twirly and render as a read-only
   * `E2 R5 I4 D2` summary until expanded, so the input does not exist in the
   * DOM at rest. This opens that row's twirly through its real control - the
   * same click the GM makes - rather than reaching into `expandedStatEditors`,
   * so these stay end-to-end DOM tests of the box the GM actually types in.
   */
  function rowDiceCountInput(index: number): HTMLInputElement {
    const row = fixture.nativeElement.querySelector('#participant' + index) as HTMLElement;
    if (!row.querySelector('input.gm-dice-count-input')) {
      const twirl = row.querySelector('[data-testid="stat-twirl"]') as HTMLButtonElement;
      twirl.click();
      fixture.detectChanges();
    }
    return row.querySelector('input.gm-dice-count-input') as HTMLInputElement;
  }

  /** Select `p` and open the details pane's Stats tab, then return its dice input. */
  function openStatsTab(p: IParticipant): HTMLInputElement {
    component.selectActor(p);
    fixture.detectChanges();
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('.detailsBar nav button')
    ) as HTMLButtonElement[];
    const stats = links.find(b => (b.textContent || '').trim() === 'Stats');
    expect(stats).withContext('Stats tab button').toBeTruthy();
    stats!.click();
    fixture.detectChanges();
    return fixture.nativeElement
      .querySelector('input.gm-stats-dice-count-input') as HTMLInputElement;
  }

  // Broken site 1: the Stats-tab box used a two-way [(ngModel)] *plus* an
  // explicit (ngModelChange). Angular wrote the new count onto the participant
  // before the handler ran, so the handler compared the new value against
  // itself and never rolled. Exercised through the real DOM so the write
  // ordering is genuinely reproduced.
  describe('Stats-tab Initiative Dice count input (DOM)', () => {
    it('rolls the gained die and adds it to the running Score', async () => {
      const p = rolled('Kicker', 8, 1, 3); // 1D6 rolled 3 -> Score 11
      CombatManager.started = true;
      expect(p.currentInitiativeScore).toBe(11);
      scriptDice(component, [4]);

      const input = openStatsTab(p);
      await typeInto(input, '2');

      expect(p.dices).toBe(2);
      expect(p.diceIni).toBe(7);                 // 3 + the new die
      expect(p.currentInitiativeScore).toBe(15); // 11 + 4, not 11
    });

    it('rolls the lost dice and subtracts them on a decrease', async () => {
      const p = rolled('Kicker', 8, 3, 12); // Score 20
      CombatManager.started = true;
      scriptDice(component, [5, 2]);

      await typeInto(openStatsTab(p), '1');

      expect(p.dices).toBe(1);
      expect(p.currentInitiativeScore).toBe(13); // 20 - 7
    });

    // Acceptance criterion 9 (pp. 52/288): 5D6 hard cap, call site 1 of 2.
    it('rejects a count above the 5D6 hard cap', async () => {
      const p = rolled('Wired', 8, 1, 3); // Score 11
      CombatManager.started = true;
      scriptDice(component, [1, 1, 1, 1, 1]);

      const input = openStatsTab(p);
      await typeInto(input, '9');

      expect(p.dices).toBe(5);                   // not 9
      expect(p.currentInitiativeScore).toBe(15); // only 4 dice gained, 1 each
      expect(input.value).toBe('5');             // DOM agrees with the model
    });
  });

  // Acceptance criterion 9 (pp. 52/288): 5D6 hard cap, call site 2 of 2 - the
  // participant-row dice-count box.
  describe('row Initiative Dice count input (DOM)', () => {
    it('rejects a count above the 5D6 hard cap', async () => {
      const p = rolled('Wired', 8, 1, 3); // Score 11
      CombatManager.started = true;
      scriptDice(component, [1, 1, 1, 1, 1]);
      fixture.detectChanges();

      const input = rowDiceCountInput(0);
      await typeInto(input, '9');

      expect(p.dices).toBe(5);
      expect(p.currentInitiativeScore).toBe(15);
      expect(input.value).toBe('5');
    });

    it('is undoable as a single step', async () => {
      const p = rolled('Wired', 8, 1, 3); // Score 11
      CombatManager.started = true;
      scriptDice(component, [4]);
      fixture.detectChanges();

      UndoHandler.StartActions();
      await typeInto(rowDiceCountInput(0), '2');
      expect(p.currentInitiativeScore).toBe(15);

      UndoHandler.Undo();

      expect(p.dices).toBe(1);
      expect(p.diceIni).toBe(3);
      expect(p.currentInitiativeScore).toBe(11);
    });
  });

  // Broken site 2: onVRModeChange (the "Switch Mode" control) called
  // applyVRMode with no roll and no Score delta at all, so a mid-combat
  // interface-mode switch changed `dices` silently.
  describe('onVRModeChange (Switch Mode)', () => {
    function coldSimDecker(): MatrixParticipant {
      const mp = new MatrixParticipant();
      mp.name = 'Decker';
      mp.dataProcessing = 7;
      mp.setDicesWithoutRoll(3);   // cold sim
      mp.baseIni = 12;             // DP 7 + INT 5
      mp.vrMode = VRMode.ColdSim;
      mp.jackedIn = true;
      CombatManager.participants.insert(mp, false);
      mp.diceIni = 10;             // Score 22
      component['participantReactions'].set(mp, 5);
      component['participantIntuitions'].set(mp, 5);
      return mp;
    }

    it('rolls the gained die and adds it to the Score on Cold Sim -> Hot Sim', () => {
      const mp = coldSimDecker();
      CombatManager.started = true;
      expect(mp.currentInitiativeScore).toBe(22);
      scriptDice(component, [5]);

      component.onVRModeChange(mp, VRMode.HotSim);

      expect(mp.dices).toBe(4);
      expect(mp.diceIni).toBe(15);
      expect(mp.currentInitiativeScore).toBe(27); // 22 + 5, not 22
    });

    it('rolls the lost dice and subtracts them on Cold Sim -> AR', () => {
      const mp = coldSimDecker();
      CombatManager.started = true;
      scriptDice(component, [4, 3]);

      component.onVRModeChange(mp, VRMode.AR);

      expect(mp.dices).toBe(1);
      // Attribute drops DP+INT 12 -> REA+INT 10 (-2), plus the 7 lost dice.
      expect(mp.currentInitiativeScore).toBe(13); // 22 - 2 - 7
      expect(mp.diceIni).toBe(3);
    });

    it('does not roll or move the Score outside a running combat', () => {
      const mp = coldSimDecker();
      CombatManager.started = false;
      const before = mp.currentInitiativeScore;

      component.onVRModeChange(mp, VRMode.HotSim);

      expect(mp.dices).toBe(4);
      expect(mp.currentInitiativeScore).toBe(before);
    });
  });

  // Broken site 3: demoteFromAstralParticipant set `dices = 1` directly with no
  // roll and no Score delta - the same defect its Matrix twin
  // (demoteToParticipant) had already had fixed.
  describe('demoteFromAstralParticipant (Awakened status removed mid-combat)', () => {
    function projectingMage(): AstralParticipant {
      const ap = new AstralParticipant();
      ap.name = 'Mage';
      ap.astralProjecting = true;
      ap.setDicesWithoutRoll(3);   // e.g. an Initiative-Dice enhancer is running
      ap.baseIni = 10;             // INT 5 x 2
      CombatManager.participants.insert(ap, false);
      ap.diceIni = 12;             // Score 22
      component['participantReactions'].set(ap, 5);
      component['participantIntuitions'].set(ap, 5);
      return ap;
    }

    it('rolls the lost dice and subtracts the total', () => {
      const ap = projectingMage();
      expect(ap.currentInitiativeScore).toBe(22);
      CombatManager.started = true;
      scriptDice(component, [4, 3]);

      const p = component['demoteFromAstralParticipant'](ap);

      expect(p.dices).toBe(1);
      expect(p.baseIni).toBe(10);                // REA 5 + INT 5, no attribute delta
      expect(p.currentInitiativeScore).toBe(15); // 22 - 7, not 22
      expect(p.diceIni).toBe(5);
    });

    // Parity with demoteToParticipant / gmJackOut.
    it('leaves the Score alone when combat has not started', () => {
      const ap = projectingMage();
      CombatManager.started = false;

      const p = component['demoteFromAstralParticipant'](ap);

      expect(p.dices).toBe(1);
      expect(p.currentInitiativeScore).toBe(22);
    });
  });

  // The already-correct sites must behave identically after being migrated
  // onto the central engine method.
  describe('migrated sites keep their previous Score outcomes', () => {
    function arDecker(): MatrixParticipant {
      const mp = new MatrixParticipant();
      mp.name = 'Decker';
      mp.dataProcessing = 7;
      mp.setDicesWithoutRoll(1);
      mp.baseIni = 10;             // REA 5 + INT 5
      CombatManager.participants.insert(mp, false);
      mp.diceIni = 4;              // Score 14
      component['participantReactions'].set(mp, 5);
      component['participantIntuitions'].set(mp, 5);
      return mp;
    }

    it('gmJackIn applies the attribute delta plus only the gained dice', () => {
      const mp = arDecker();
      CombatManager.started = true;
      component.setPendingVrMode(mp, VRMode.HotSim);
      scriptDice(component, [3, 4, 5]);

      component.gmJackIn(mp);

      expect(mp.dices).toBe(4);
      expect(mp.baseIni).toBe(12);               // DP 7 + INT 5
      expect(mp.currentInitiativeScore).toBe(28); // 14 + 2 (attribute) + 12 (dice)
      expect(mp.diceIni).toBe(16);
    });

    it('gmJackOut applies the attribute delta plus only the lost dice', () => {
      const mp = arDecker();
      mp.setDicesWithoutRoll(4);
      mp.baseIni = 12;
      mp.vrMode = VRMode.HotSim;
      mp.jackedIn = true;
      mp.diceIni = 14;             // Score 14 + 2 + 10 = 26
      expect(mp.currentInitiativeScore).toBe(26);
      CombatManager.started = true;
      scriptDice(component, [4, 3, 2]);

      component.gmJackOut(mp);

      expect(mp.dices).toBe(1);
      expect(mp.baseIni).toBe(10);
      expect(mp.currentInitiativeScore).toBe(15); // 26 - 2 (attribute) - 9 (dice)
      expect(mp.diceIni).toBe(5);
    });

    it('gmJackOut still leaves the Score alone outside a running combat', () => {
      const mp = arDecker();
      mp.setDicesWithoutRoll(4);
      mp.baseIni = 12;
      mp.diceIni = 14;
      CombatManager.started = false;

      component.gmJackOut(mp);

      expect(mp.dices).toBe(1);
      expect(mp.currentInitiativeScore).toBe(24); // attribute delta only
      expect(mp.diceIni).toBe(14);
    });
  });

  // Astral Initiative is 2D6 base against Physical's 1D6 (Initiative Attribute
  // Chart, p. 159), and projecting mid-turn "gains the die (and the change in
  // Initiative) for their Astral Initiative during that Combat Turn" (p. 160).
  // toggleAstralProjecting previously moved only the attribute half and left
  // the dice count untouched, so projecting gained no die at all.
  describe('toggleAstralProjecting (dice half)', () => {
    /** Awakened, not projecting. REA 5 / INT 5, so the attribute half is a no-op. */
    function awakened(dice = 1, roll = 4): AstralParticipant {
      const ap = new AstralParticipant();
      ap.name = 'Mage';
      ap.setDicesWithoutRoll(dice);
      ap.baseIni = 10;             // REA 5 + INT 5
      CombatManager.participants.insert(ap, false);
      ap.diceIni = roll;           // Score 14 at the defaults
      component['participantReactions'].set(ap, 5);
      component['participantIntuitions'].set(ap, 5);
      return ap;
    }

    it('gains a die, rolls it and adds it to the running Score when projecting', () => {
      const ap = awakened();       // 1D6, rolled 4 -> Score 14
      CombatManager.started = true;
      expect(ap.currentInitiativeScore).toBe(14);
      scriptDice(component, [5]);

      component.toggleAstralProjecting(ap);

      expect(ap.astralProjecting).toBeTrue();
      expect(ap.dices).toBe(2);                  // 1D6 physical -> 2D6 astral
      expect(ap.diceIni).toBe(9);                // 4 + the newly rolled die
      expect(ap.currentInitiativeScore).toBe(19); // 14 + 5, not 14
    });

    it('loses that die, rolls it and subtracts it when returning from astral space', () => {
      const ap = awakened();
      CombatManager.started = true;
      scriptDice(component, [5, 3]);

      component.toggleAstralProjecting(ap); // out: +5 -> Score 19, 2D6
      component.toggleAstralProjecting(ap); // back: -3

      expect(ap.astralProjecting).toBeFalse();
      expect(ap.dices).toBe(1);
      expect(ap.diceIni).toBe(6);                // 9 - 3
      expect(ap.currentInitiativeScore).toBe(16); // 19 - 3
    });

    // The dice change is a RELATIVE +1/-1, not an absolute "set to 2D6": a
    // magician already carrying bonus Initiative Dice from another source must
    // keep them (an absolute overwrite would silently drop two of these three).
    it('adds one die on top of bonus dice from another source rather than overwriting the count', () => {
      const ap = awakened(3, 12);  // 3D6 (e.g. Increase Reflexes), rolled 12 -> Score 22
      CombatManager.started = true;
      expect(ap.currentInitiativeScore).toBe(22);
      scriptDice(component, [6]);

      component.toggleAstralProjecting(ap);

      expect(ap.dices).toBe(4);                  // 3 + 1, NOT 2
      expect(ap.diceIni).toBe(18);               // 12 + the one new die
      expect(ap.currentInitiativeScore).toBe(28); // 22 + 6
    });

    it('returning from astral space also subtracts only one die from a bonus-stacked pool', () => {
      const ap = awakened(3, 12);
      CombatManager.started = true;
      scriptDice(component, [6, 2]);

      component.toggleAstralProjecting(ap);
      component.toggleAstralProjecting(ap);

      expect(ap.dices).toBe(3);                  // back to the physical pool, bonus intact
      expect(ap.currentInitiativeScore).toBe(26); // 28 - 2
    });

    it('does not roll or move the Score outside a running combat', () => {
      const ap = awakened();
      CombatManager.started = false;

      component.toggleAstralProjecting(ap);

      expect(ap.dices).toBe(2);                  // count still tracks the mode
      expect(ap.currentInitiativeScore).toBe(14); // no roll owed, Score untouched
    });

    it('is undoable as a single step', () => {
      const ap = awakened();
      CombatManager.started = true;
      scriptDice(component, [5]);

      component.toggleAstralProjecting(ap);
      expect(ap.currentInitiativeScore).toBe(19);

      UndoHandler.Undo();

      expect(ap.astralProjecting).toBeFalse();
      expect(ap.dices).toBe(1);
      expect(ap.diceIni).toBe(4);
      expect(ap.currentInitiativeScore).toBe(14);
    });

    // Defect D1: the return trip used to re-apply the constant -1 regardless of
    // what the outbound trip actually achieved. A dice decrease "rolls the
    // number of lost dice and subtracts the total" (p. 160) - you only roll and
    // subtract dice you actually lose - and the 5D6 hard cap (pp. 52/288) can
    // mean the outbound trip gained nothing at all.
    describe('round trip against the 5D6 cap (defect D1)', () => {
      it('gains nothing when already at the 5D6 cap: no roll, no Score change', () => {
        const ap = awakened(5, 20);   // already capped (e.g. Increase Reflexes), Score 30
        CombatManager.started = true;
        const die = scriptDice(component, []);

        component.toggleAstralProjecting(ap);

        expect(ap.astralProjecting).toBeTrue();
        expect(ap.dices).toBe(5);                   // cap absorbed the die
        expect(die).not.toHaveBeenCalled();         // nothing lost or gained to roll
        expect(ap.currentInitiativeScore).toBe(30); // Score untouched
        expect(ap.projectionDiceGain).toBe(0);      // realized gain, not the constant
      });

      it('gives nothing back on return when the cap absorbed the gain: the round trip nets to zero', () => {
        const ap = awakened(5, 20);   // Score 30, 5D6
        CombatManager.started = true;
        const die = scriptDice(component, []);

        component.toggleAstralProjecting(ap);  // out: absorbed by the cap
        component.toggleAstralProjecting(ap);  // back

        expect(ap.astralProjecting).toBeFalse();
        expect(ap.dices).toBe(5);                   // net zero dice
        expect(die).not.toHaveBeenCalled();         // net zero rolls
        expect(ap.currentInitiativeScore).toBe(30); // net zero Score
        expect(ap.diceIni).toBe(20);
      });

      // Mirror direction: the die WAS granted, then something else took it away
      // while still projecting. There is nothing left to give back on return.
      it('gives nothing back on return when the gained die was already lost by another path', () => {
        const ap = awakened();        // 1D6, rolled 4 -> Score 14
        CombatManager.started = true;
        const die = scriptDice(component, [5, 3]);

        component.toggleAstralProjecting(ap);            // out: +5 -> Score 19, 2D6
        expect(ap.projectionDiceGain).toBe(1);
        component['changeParticipantDiceCount'](ap, 1);  // GM drops her back to 1D6: -3
        expect(ap.dices).toBe(1);
        expect(ap.currentInitiativeScore).toBe(16);

        component.toggleAstralProjecting(ap);            // back to physical

        expect(ap.astralProjecting).toBeFalse();
        expect(ap.dices).toBe(1);                   // already at the floor
        expect(die).toHaveBeenCalledTimes(2);       // no third die rolled on return
        expect(ap.currentInitiativeScore).toBe(16); // nothing left to subtract
        expect(ap.projectionDiceGain).toBe(0);
      });

      // Un-regression: the ordinary (uncapped) round trip still rolls both ways.
      it('still rolls and applies both halves of an ordinary uncapped round trip', () => {
        const ap = awakened();        // 1D6, rolled 4 -> Score 14
        CombatManager.started = true;
        const die = scriptDice(component, [5, 3]);

        component.toggleAstralProjecting(ap);   // out: +5 -> 19
        expect(ap.dices).toBe(2);
        expect(ap.currentInitiativeScore).toBe(19);

        component.toggleAstralProjecting(ap);   // back: -3 -> 16

        expect(ap.dices).toBe(1);
        expect(die).toHaveBeenCalledTimes(2);
        expect(ap.currentInitiativeScore).toBe(16);
      });
    });
  });

  // A Score-neutral bounds clamp can leave the rolled-total box and the Score
  // column irreconcilable (attribute + rolled total != Score). That is correct
  // per p. 160 but must not be silent - the clamp logs a line naming both.
  describe('rolled-total clamp legibility', () => {
    /** Log entries added by `body`, newest last. */
    function logDuring(body: () => void): string[] {
      const before = LogHandler.logbook.length;
      body();
      return LogHandler.logbook.slice(before).map(e => e.text);
    }

    it('logs the unreconcilable gap when an unrelated edit clamps the rolled total', () => {
      const p = rolled('Decker', 10, 3, 18); // Score 28
      CombatManager.started = true;
      scriptDice(component, [1, 1]);         // small lost-dice roll
      component['changeParticipantDiceCount'](p, 1);
      expect(p.currentInitiativeScore).toBe(26); // 28 - 2
      expect(p.diceIni).toBe(16);                // over the new 1D6 max of 6

      // The GM now edits some unrelated field on some row.
      const texts = logDuring(() => component.onParticipantUpdated());

      expect(p.diceIni).toBe(6);                  // clamped for display
      expect(p.currentInitiativeScore).toBe(26);  // Score still untouched
      const clampLog = texts.find(t => /clamped/i.test(t));
      expect(clampLog).withContext('clamp log line').toBeTruthy();
      expect(clampLog).toContain('26');           // the running Score
      expect(clampLog).toContain('6');            // the clamped display total
    });

    it('logs nothing on an ordinary edit where the two numbers still reconcile', () => {
      const p = rolled('Ganger', 10, 3, 12); // Score 22, in bounds
      CombatManager.started = true;

      const texts = logDuring(() => component.onParticipantUpdated());

      expect(p.diceIni).toBe(12);
      expect(texts.filter(t => /clamped/i.test(t))).toEqual([]);
    });

    // Defect D2: the log used to read the raw `currentInitiativeScore` backing
    // field. The number the GM actually sees in the Ini column is
    // `getCurrentInitiative()` - the running Score plus Initiative already
    // committed to Interrupt Actions (brief F9, p. 167) - so a participant
    // holding Full Defense was named a number that appears nowhere on screen.
    describe('effective vs raw Initiative Score (defect D2)', () => {
      it('names the effective Score the Ini column shows, not the raw stored one', () => {
        const p = rolled('Wombat', 10, 3, 18);   // Score 28
        CombatManager.started = true;
        p.doAction(FULL_DEFENSE);                // -10 -> Ini column reads 18
        scriptDice(component, [1, 2]);
        component['changeParticipantDiceCount'](p, 1);
        expect(p.currentInitiativeScore).toBe(25);   // raw stored
        expect(p.getCurrentInitiative()).toBe(15);   // what the GM sees
        expect(p.diceIni).toBe(15);                  // over the new 1D6 max

        const texts = logDuring(() => component.onParticipantUpdated());

        const clampLog = texts.find(t => /clamped/i.test(t));
        expect(clampLog).withContext('clamp log line').toBeTruthy();
        expect(clampLog).toContain('15');            // effective Score
        expect(clampLog).not.toContain('25');        // never the raw backing field
      });

      it('still logs when the raw Score reconciles but the visible one does not', () => {
        const p = rolled('Wombat', 10, 3, 18);   // Score 28
        CombatManager.started = true;
        p.applyInitiativeScoreDelta(-12);        // bare Score debit -> raw 16
        p.setDicesWithoutRoll(1);                // display max is now 6
        p.doAction(FULL_DEFENSE);                // effective 6
        expect(p.currentInitiativeScore).toBe(16); // raw: 10 + clamped 6 reconciles
        expect(p.getCurrentInitiative()).toBe(6);  // effective: does not

        const texts = logDuring(() => component.onParticipantUpdated());

        expect(p.diceIni).toBe(6);
        const clampLog = texts.find(t => /clamped/i.test(t));
        expect(clampLog).withContext('clamp log line').toBeTruthy();
        expect(clampLog).toContain('6');
      });

      it('stays silent when the visible Score reconciles even though the raw one does not', () => {
        const p = rolled('Wombat', 10, 3, 18);   // Score 28
        CombatManager.started = true;
        p.applyInitiativeScoreDelta(-2);         // raw 26
        p.setDicesWithoutRoll(1);                // display max is now 6
        p.doAction(FULL_DEFENSE);                // effective 16 = attribute 10 + 6
        expect(p.currentInitiativeScore).toBe(26);
        expect(p.getCurrentInitiative()).toBe(16);

        const texts = logDuring(() => component.onParticipantUpdated());

        expect(p.diceIni).toBe(6);               // clamped for display
        expect(texts.filter(t => /clamped/i.test(t))).toEqual([]);
      });
    });
  });

  // A `register_character` resent mid-combat with a changed dice count (the
  // player activated a drug/spell and re-submitted their form) is a mid-turn
  // Initiative Dice change, not setup: it must roll the delta and move the
  // running Score (p. 160), not silently overwrite the count.
  describe('register_character resent mid-combat', () => {
    function register(dice: number) {
      component['handleSessionCommand']({
        type: 'register_character',
        player: 'Kicker',
        payload: {
          characterName: 'Kicker',
          initiativeDice: dice,
          reaction: 5,
          intuition: 5
        },
        timestamp: new Date().toISOString()
      });
      return CombatManager.participants.items[0] as IParticipant;
    }

    it('rolls the gained die and adds it to the Score when the count changes after rolling', () => {
      const p = register(1);       // first-time setup: no roll owed
      expect(p.dices).toBe(1);
      CombatManager.started = true;
      p.diceIni = 4;               // this turn's Initiative Test -> Score 14
      expect(p.currentInitiativeScore).toBe(14);
      scriptDice(component, [5]);

      register(2);                 // re-submitted after a drug kicked in

      expect(p.dices).toBe(2);
      expect(p.diceIni).toBe(9);                 // 4 + the new die
      expect(p.currentInitiativeScore).toBe(19); // 14 + 5, not 14
    });

    it('rolls the lost dice and subtracts them on a decrease', () => {
      const p = register(3);
      CombatManager.started = true;
      p.diceIni = 12;              // Score 22
      scriptDice(component, [5, 2]);

      register(1);

      expect(p.dices).toBe(1);
      expect(p.currentInitiativeScore).toBe(15); // 22 - 7
    });

    it('is still a plain no-roll setup for a genuinely new participant', () => {
      CombatManager.started = true;
      const spy = scriptDice(component, [6, 6, 6, 6]);

      const p = register(3);

      expect(p.dices).toBe(3);
      expect(p.diceIni).toBe(0);                // no Initiative Test yet
      expect(p.currentInitiativeScore).toBe(10); // attribute only
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not roll when the participant has not taken this turn\'s Initiative Test', () => {
      const p = register(1);
      CombatManager.started = true;
      const spy = scriptDice(component, [6, 6, 6, 6]);

      register(3);

      expect(p.dices).toBe(3);
      expect(p.currentInitiativeScore).toBe(10);
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not roll when combat has not started', () => {
      const p = register(1);
      CombatManager.started = false;
      p.diceIni = 4;
      const spy = scriptDice(component, [6, 6, 6, 6]);

      register(4);

      expect(p.dices).toBe(4);
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
