import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { AstralParticipant } from "Magic";

@Component({
  standalone: true,
  selector: "app-astral-badge",
  templateUrl: "./astral-badge.component.html",
  styleUrls: ["./astral-badge.component.css"],
  imports: [CommonModule]
})
export class AstralBadgeComponent {
  @Input({ required: true }) participant!: AstralParticipant;
}
