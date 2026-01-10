/**
 * Assistant Summary Component - Phase 6
 * Displays streaming assistant narration with status indicators
 */

import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AssistantStatus } from '../../../../core/models/ws-protocol.types';

@Component({
  selector: 'app-assistant-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './assistant-summary.component.html',
  styleUrl: './assistant-summary.component.scss'
})
export class AssistantSummaryComponent {
  readonly text = input.required<string>();
  readonly status = input.required<AssistantStatus>();
  readonly error = input<string | undefined>(undefined);
  
  readonly isIdle = computed(() => this.status() === 'idle');
  readonly isPending = computed(() => this.status() === 'pending');
  readonly isStreaming = computed(() => this.status() === 'streaming');
  readonly isCompleted = computed(() => this.status() === 'completed');
  readonly isFailed = computed(() => this.status() === 'failed');
  
  readonly hasContent = computed(() => {
    return !this.isIdle() && (this.text().length > 0 || this.isFailed());
  });
}
