import { Component, EventEmitter, Input, OnInit, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ICType, MatrixHost } from "Matrix";

@Component({
  standalone: true,
  selector: "app-ic-spawner",
  templateUrl: "./ic-spawner.component.html",
  styleUrls: ["./ic-spawner.component.css"],
  imports: [CommonModule, FormsModule]
})
export class ICSpawnerComponent implements OnInit {
  @Input({ required: true }) host!: MatrixHost;

  /** Emits the chosen ICType when the GM confirms spawn. */
  @Output() readonly spawn = new EventEmitter<ICType>();

  /** Emits when the GM cancels. */
  @Output() readonly cancel = new EventEmitter<void>();

  selectedType: ICType = ICType.Patrol;

  readonly icTypes: ICType[] = [
    ICType.Patrol,
    ICType.Killer,
    ICType.Acid,
    ICType.Blaster,
    ICType.Sparky,
    ICType.Scramble,
    ICType.TarBaby
  ];

  ngOnInit(): void {
    // Pre-select the first non-running IC type.
    const available = this.icTypes.find(t => !this.isTypeRunning(t));
    if (available) this.selectedType = available;
  }

  get initiativeBase(): number {
    return (this.host?.rating ?? 1) * 2;
  }

  get initiativeDice(): number {
    return this.selectedType === ICType.Patrol ? 2 : 4;
  }

  get initiativeMin(): number {
    return this.initiativeBase + this.initiativeDice;
  }

  get initiativeMax(): number {
    return this.initiativeBase + this.initiativeDice * 6;
  }

  get matrixCM(): number {
    return 8 + Math.ceil((this.host?.rating ?? 1) / 2);
  }

  get atCap(): boolean {
    return (this.host?.icActive?.length ?? 0) >= (this.host?.rating ?? 1);
  }

  get activeCount(): number {
    return this.host?.icActive?.length ?? 0;
  }

  isTypeRunning(type: ICType): boolean {
    return this.host?.icActive?.some(ic => ic.icType === type) ?? false;
  }

  get isDuplicateType(): boolean {
    return this.isTypeRunning(this.selectedType);
  }

  get canSpawn(): boolean {
    return !this.atCap && !this.isDuplicateType;
  }

  get validationMessage(): string {
    if (this.atCap) {
      return `Host is at maximum IC capacity (${this.host.rating}/${this.host.rating}).`;
    }
    if (this.isDuplicateType) {
      return `${this.selectedType} IC is already running in this host.`;
    }
    return "";
  }

  onSpawn(): void {
    if (!this.canSpawn) return;
    this.spawn.emit(this.selectedType);
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
