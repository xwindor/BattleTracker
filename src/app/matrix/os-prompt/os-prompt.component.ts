import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  standalone: true,
  selector: 'app-os-prompt',
  templateUrl: './os-prompt.component.html',
  styleUrls: ['./os-prompt.component.css'],
  imports: [CommonModule, FormsModule]
})
export class OsPromptComponent {
  @Input() actionEntries: Array<{ name: string; delta: number }> = [];
  @Input() suggestedDelta = 0;
  @Input() deckerName = '';

  mode: 'confirm' | 'modify' = 'confirm';
  customDelta = 0;

  constructor(private activeModal: NgbActiveModal) {}

  accept(): void {
    this.activeModal.close(this.suggestedDelta);
  }

  startModify(): void {
    this.customDelta = this.suggestedDelta;
    this.mode = 'modify';
  }

  applyCustom(): void {
    this.activeModal.close(Math.max(0, Number(this.customDelta) || 0));
  }

  cancel(): void {
    this.activeModal.dismiss('cancel');
  }
}
