import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

export interface RemoteRoll {
  id: number;
  roller: string;
  values: number[];
  rolling: boolean;
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
  @Input() incomingRoll: { roller: string; values: number[] } | null = null;
  @Output() rolledEvent = new EventEmitter<number[]>();

  diceCount = 2;

  // ── Your roll ────────────────────────────────────────────────────────────
  localValues: number[] = [];
  localRolling = false;
  private localRollTimeout: ReturnType<typeof setTimeout> | null = null;

  get localHitCount(): number {
    return this.localValues.filter(v => v >= 5).length;
  }

  // ── Other players (stacked) ───────────────────────────────────────────
  remoteRolls: RemoteRoll[] = [];
  otherPlayersVisible = true;
  private remoteIdCounter = 0;

  getHitCount(values: number[]): number {
    return values.filter(v => v >= 5).length;
  }

  // ── Face-value → rotation map ─────────────────────────────────────────
  private readonly faceRotations: Record<number, { x: number; y: number }> = {
    1: { x: 0,    y: 0   },
    2: { x: -90,  y: 0   },
    3: { x: 0,    y: -90 },
    4: { x: 0,    y: 90  },
    5: { x: 90,   y: 0   },
    6: { x: 0,    y: 180 }
  };

  constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["incomingRoll"] && this.incomingRoll) {
      this.triggerRemoteAnimation(this.incomingRoll.roller, this.incomingRoll.values);
    }
  }

  roll(): void {
    if (this.localRolling) return;
    const count = Math.max(1, Math.min(20, this.diceCount));
    const values = Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
    this.triggerLocalAnimation(values);
    this.rolledEvent.emit(values);
  }

  isHit(value: number): boolean {
    return value >= 5;
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

  private triggerLocalAnimation(values: number[]): void {
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

  private triggerRemoteAnimation(roller: string, values: number[]): void {
    const id = ++this.remoteIdCounter;
    this.remoteRolls = [...this.remoteRolls, { id, roller, values, rolling: true }];
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
