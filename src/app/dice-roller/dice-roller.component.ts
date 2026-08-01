import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
  ViewChild,
  ElementRef
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { GlitchLevel, RollOutcome, classifyRoll, isHitFace } from "app/shared/roll-utils";
import { getGlitchLabel } from "app/shared/log-formatter";

export interface RemoteRoll {
  id: number;
  roller: string;
  values: number[];
  rolling: boolean;
  /** The GM rolled these dice for a non-player combatant (brief p. 44). */
  npc: boolean;
}

/**
 * What the roller emits when the Roll button is pressed.
 *
 * `rollAs` is the name the roll should be attributed to instead of the person
 * who pressed the button - the gamemaster "governs the actions of the
 * non-player characters, and determines the results of tests" (brief p. 44),
 * so NPC dice are rolled by the GM but belong to the NPC. `null` means "this
 * roll is mine", which is every roll made from the player view.
 */
export interface DiceRollRequest {
  values: number[];
  rollAs: string | null;
}

@Component({
  standalone: true,
  selector: "app-dice-roller",
  templateUrl: "./dice-roller.component.html",
  styleUrls: ["./dice-roller.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule]
})
export class DiceRollerComponent implements OnChanges {
  /**
   * A roll made by somebody else, to show in the "Other Players" tray.
   *
   * `npc` mirrors the same flag the log entry carries, so the tray and the log
   * agree about what a viewer is looking at: a GM roll made on behalf of a
   * non-player combatant (brief p. 44), not that character's player rolling.
   */
  @Input() incomingRoll: { roller: string; values: number[]; npc?: boolean } | null = null;
  @Input() ownRoll: { values: number[] } | null = null;

  /**
   * Whether the "Roll as" attribution field is offered at all. Off by default:
   * this component is shared with the player view, and only the gamemaster
   * rolls on behalf of somebody else (brief p. 44). Set from the GM template.
   */
  @Input() allowRollAs = false;

  /** Names offered in the "Roll as" picker - the tracker's current combatants. */
  @Input() rollAsNames: string[] = [];

  @Output() rolledEvent = new EventEmitter<DiceRollRequest>();

  /** The ad-hoc NPC name box, present only while "Other..." is selected. */
  @ViewChild("rollAsOtherInput") rollAsOtherInput?: ElementRef<HTMLInputElement>;

  diceCount = 2;

  // ── Roll as (GM only) ────────────────────────────────────────────────────

  /**
   * The armed attribution, as a plain name. Still the single source of truth
   * for what the next roll is attributed to, whichever way it was entered:
   * the dropdown writes a tracker combatant's name here, the "Other..." text
   * field writes a typed one, and the tracker reads and clears it from
   * outside. `""` means "roll as myself".
   */
  rollAs = "";

  /** Sentinel `<option>` value for "a name that is not in the tracker". */
  static readonly ROLL_AS_OTHER = "__other__";
  /** Sentinel `<option>` value for "roll as myself (the GM)". */
  static readonly ROLL_AS_SELF = "";

  readonly ROLL_AS_OTHER = DiceRollerComponent.ROLL_AS_OTHER;
  readonly ROLL_AS_SELF = DiceRollerComponent.ROLL_AS_SELF;

  /**
   * True while the GM has picked "Other..." in the dropdown, which reveals the
   * ad-hoc name field. Held as its own flag rather than inferred purely from
   * `rollAs`, because "Other... chosen, nothing typed yet" and "rolling as
   * myself" are the same empty `rollAs` but two different pieces of UI.
   */
  private otherSelected = false;

  /**
   * Which `<option>` the dropdown shows. Derived, so an attribution armed from
   * outside (or left over from a previous roll) always renders in a state that
   * matches `rollAs`: a tracker name selects that name, an off-roster name
   * selects "Other..." and puts the name in the text field.
   */
  get rollAsSelection(): string {
    if (this.otherSelected) return DiceRollerComponent.ROLL_AS_OTHER;
    const name = this.rollAs.trim();
    if (name.length === 0) return DiceRollerComponent.ROLL_AS_SELF;
    return this.rollAsNames.includes(name)
      ? name
      : DiceRollerComponent.ROLL_AS_OTHER;
  }

  set rollAsSelection(value: string) {
    if (value === DiceRollerComponent.ROLL_AS_OTHER) {
      // Blank rather than carrying the previously picked combatant across:
      // the GM chose "Other..." because they want a name the roster does not
      // have, and a pre-filled roster name in the ad-hoc box would arm an
      // attribution they did not ask for.
      this.otherSelected = true;
      this.rollAs = "";
      this.focusOtherInputSoon();
    } else {
      this.otherSelected = false;
      this.rollAs = value;
    }
    this.cdr.markForCheck();
  }

  /**
   * True when the ad-hoc name field should be on screen - i.e. whenever the
   * dropdown reads "Other...", whether the GM picked it or an off-roster name
   * armed from outside put it there. Derived from the same expression the
   * dropdown renders, so the two can never disagree.
   */
  get isRollAsOther(): boolean {
    return this.rollAsSelection === DiceRollerComponent.ROLL_AS_OTHER;
  }

  /** The attribution for the next roll, or `null` for "roll as myself". */
  get rollAsName(): string | null {
    const name = this.rollAs.trim();
    return name.length > 0 ? name : null;
  }

  /**
   * One tap back to rolling as yourself - the undo for a mis-picked name.
   *
   * Also called from outside: the tracker clears the attribution whenever the
   * named combatant stops being the GM's to roll for (End Combat, the
   * combatant being deleted, the session being closed, or a player claiming
   * that character), so a name cannot carry past the point where it stopped
   * being true. Hence the explicit `markForCheck`: an OnPush component told to
   * reset by a parent method call gets no change-detection pass for free.
   *
   * This also collapses the "Other..." field: a clear means "the next roll is
   * mine", and leaving an empty ad-hoc box open would read as still armed.
   */
  clearRollAs(): void {
    this.rollAs = "";
    this.otherSelected = false;
    this.cdr.markForCheck();
  }

  /**
   * Put the caret in the ad-hoc name box as soon as it exists. Picking
   * "Other..." is a statement of intent to type; making the GM tap the box as
   * well would be a second tap for no decision.
   */
  private focusOtherInputSoon(): void {
    setTimeout(() => this.rollAsOtherInput?.nativeElement.focus());
  }

  /**
   * True when the local tray is still labelled with an attribution that is no
   * longer the one the next roll will use - i.e. the GM pressed Clear (or
   * retyped) after rolling. The tray label describes a roll already made and
   * the hint describes the next one; without this the two sit next to each
   * other making contradictory-looking claims.
   */
  get isLocalAttributionStale(): boolean {
    return this.localRollAs !== null && this.localRollAs !== this.rollAsName;
  }

  // ── Your roll ────────────────────────────────────────────────────────────
  localValues: number[] = [];
  localRolling = false;
  /** Who the roll currently shown in the local tray was made for, if not you. */
  localRollAs: string | null = null;

  /**
   * Why the roll in the tray was logged under a different name than the one
   * that was asked for, if it was. Set only by the parent via
   * `reportRollAttribution`: this component rolls dice and cannot know that a
   * name belongs to a player's character - that is the tracker's call.
   */
  attributionOverrideNote: string | null = null;
  private localRollTimeout: ReturnType<typeof setTimeout> | null = null;

  get localHitCount(): number {
    return this.localOutcome.hits;
  }

  /** Hits, 1s and glitch status of the local roll (brief pp. 44-45). */
  get localOutcome(): RollOutcome {
    return classifyRoll(this.localValues);
  }

  getOutcome(values: number[]): RollOutcome {
    return classifyRoll(values);
  }

  /** "GLITCH" / "CRITICAL GLITCH" / "" - the printed terms (brief p. 45). */
  getGlitchLabel(level: GlitchLevel): string {
    return getGlitchLabel(level);
  }

  get localTotal(): number {
    return this.localValues.reduce((s, v) => s + v, 0);
  }

  getTotalCount(values: number[]): number {
    return values.reduce((s, v) => s + v, 0);
  }

  // ── Other players (stacked) ───────────────────────────────────────────
  remoteRolls: RemoteRoll[] = [];
  otherPlayersVisible = true;
  private remoteIdCounter = 0;

  getHitCount(values: number[]): number {
    return classifyRoll(values).hits;
  }

  // ── Face-value → rotation map ─────────────────────────────────────────
  private readonly faceRotations: Record<number, { x: number; y: number }> = {
    1: { x: 0,    y: 0   },
    2: { x: -90,  y: 0   },
    3: { x: 0,    y: 90  },
    4: { x: 0,    y: -90 },
    5: { x: 90,   y: 0   },
    6: { x: 0,    y: 180 }
  };

  constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["incomingRoll"] && this.incomingRoll) {
      this.triggerRemoteAnimation(
        this.incomingRoll.roller,
        this.incomingRoll.values,
        !!this.incomingRoll.npc
      );
    }
    if (changes["ownRoll"] && this.ownRoll) {
      this.triggerLocalAnimation(this.ownRoll.values);
    }
  }

  roll(): void {
    if (this.localRolling) return;
    const count = Math.max(1, Math.min(50, this.diceCount));
    const values = Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
    // Captured now: the field can be retyped while the dice are still tumbling,
    // and the tray must keep naming whoever this roll was actually made for.
    // This is the *requested* attribution; the parent decides the final one and
    // reports it back through `reportRollAttribution` during the emit below.
    this.localRollAs = this.allowRollAs ? this.rollAsName : null;
    this.attributionOverrideNote = null;   // belonged to the previous roll
    this.triggerLocalAnimation(values);
    this.rolledEvent.emit({ values, rollAs: this.localRollAs });
  }

  /**
   * The parent's answer to "what did that roll actually get logged as".
   *
   * The tray label is written optimistically at roll time from the name in the
   * field, but the tracker can override the attribution when the dice land (a
   * name that turns out to be a player's character falls back to the GM). A
   * tray that kept claiming "as Wombat" over a log line reading "GM" would be
   * stating something untrue about a roll that has already gone out, so the
   * parent corrects it here and supplies the reason to show alongside.
   *
   * `null` name means "logged as you". Called synchronously from inside
   * `rolledEvent.emit`, hence the explicit `markForCheck` - OnPush gets no
   * change-detection pass from a parent method call.
   */
  reportRollAttribution(actualName: string | null, note: string | null = null): void {
    this.localRollAs = actualName;
    this.attributionOverrideNote = note;
    this.cdr.markForCheck();
  }

  isHit(value: number): boolean {
    return isHitFace(value);
  }

  /** A 1 - the face that counts toward a glitch (brief p. 45). */
  isOne(value: number): boolean {
    return value === 1;
  }

  getLocalDieStyle(index: number): Record<string, string> {
    return this.buildDieStyle(this.localValues[index]);
  }

  getRemoteDieStyle(roll: RemoteRoll, index: number): Record<string, string> {
    return this.buildDieStyle(roll.values[index]);
  }

  private buildDieStyle(face: number | undefined): Record<string, string> {
    if (face === undefined) return {};
    const rot = this.faceRotations[face] ?? { x: 0, y: 0 };
    return {
      "--target-x": `${rot.x}deg`,
      "--target-y": `${rot.y}deg`
    };
  }

  triggerLocalAnimation(values: number[]): void {
    if (this.localRollTimeout !== null) clearTimeout(this.localRollTimeout);
    this.localValues = values;
    this.localRolling = true;
    this.cdr.markForCheck();

    this.localRollTimeout = this.ngZone.runOutsideAngular(() =>
      setTimeout(() => {
        this.ngZone.run(() => {
          this.localRolling = false;
          this.localRollTimeout = null;
          this.cdr.markForCheck();
        });
      }, 1550)
    );
  }

  private triggerRemoteAnimation(roller: string, values: number[], npc = false): void {
    const id = ++this.remoteIdCounter;
    this.remoteRolls = [...this.remoteRolls, { id, roller, values, rolling: true, npc }];
    this.cdr.markForCheck();

    // Clear rolling flag after animation
    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => {
        this.ngZone.run(() => {
          this.remoteRolls = this.remoteRolls.map(r =>
            r.id === id ? { ...r, rolling: false } : r
          );
          this.cdr.markForCheck();
        });
      }, 1550);

      // Auto-remove after 10 s
      setTimeout(() => {
        this.ngZone.run(() => {
          this.remoteRolls = this.remoteRolls.filter(r => r.id !== id);
          this.cdr.markForCheck();
        });
      }, 10000);
    });
  }
}
