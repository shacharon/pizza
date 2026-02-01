/**
 * Assistant Strip Component
 * Displays AI-generated guidance with recommended next actions
 */

import { Component, input, output, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AssistPayload, RefinementChip } from '../../../../domain/types/search.types';
import { SearchFacade } from '../../../../facades/search.facade';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-assistant-strip',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assistant-strip.component.html',
  styleUrl: './assistant-strip.component.scss'
})
export class AssistantStripComponent {
  // Inputs
  readonly assist = input.required<AssistPayload>();
  readonly chips = input.required<RefinementChip[]>();
  
  // Outputs
  readonly actionClick = output<string>();

  // Inject search facade for uiLanguage
  private searchFacade = inject(SearchFacade);

  // Dev mode check
  readonly isDev = computed(() => !environment.production);
  
  /**
   * Get primary chip to highlight
   */
  get primaryChip(): RefinementChip | undefined {
    const primaryId = this.assist().primaryActionId;
    if (!primaryId) return undefined;
    return this.chips().find(c => c.id === primaryId);
  }
  
  /**
   * Get secondary chips for quick actions
   */
  get secondaryChips(): RefinementChip[] {
    const secondaryIds = this.assist().secondaryActionIds || [];
    return this.chips().filter(c => secondaryIds.includes(c.id));
  }
  
  /**
   * Handle chip click
   */
  onChipClick(chipId: string): void {
    this.actionClick.emit(chipId);
  }
  
  /**
   * Track chips by ID for performance
   */
  trackByChipId(_index: number, chip: RefinementChip): string {
    return chip.id;
  }

  /**
   * Check if assistant message language is RTL (Hebrew or Arabic)
   */
  isRTL(): boolean {
    const lang = this.getEffectiveLanguage();
    return lang === 'he' || lang === 'ar';
  }

  /**
   * Get effective language (with fallback)
   */
  getEffectiveLanguage(): string {
    return this.assist().language || this.getFallbackLanguage();
  }

  /**
   * Get fallback language (uiLanguage or 'en')
   */
  private getFallbackLanguage(): string {
    const request = this.searchFacade.searchRequest();
    return request?.uiLanguage || 'en';
  }

  /**
   * Get uiLanguage for debug display
   */
  getUILanguage(): string {
    const request = this.searchFacade.searchRequest();
    return request?.uiLanguage || 'n/a';
  }
}

