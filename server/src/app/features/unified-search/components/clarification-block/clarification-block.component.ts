/**
 * Clarification Block Component
 * Displays clarification questions with choice buttons (Answer-First UX)
 */

import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Clarification, ClarificationChoice } from '../../../../domain/types/search.types';

@Component({
  selector: 'app-clarification-block',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './clarification-block.component.html',
  styleUrl: './clarification-block.component.scss'
})
export class ClarificationBlockComponent {
  // Inputs
  readonly clarification = input.required<Clarification>();

  // Outputs
  readonly choiceSelected = output<ClarificationChoice>();

  /**
   * Handle choice click
   */
  onChoiceClick(choice: ClarificationChoice): void {
    this.choiceSelected.emit(choice);
  }

  /**
   * TrackBy function for choices
   */
  trackByChoiceId(_index: number, choice: ClarificationChoice): string {
    return choice.id;
  }
}

