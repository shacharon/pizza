/**
 * AssistantDesktopPanelComponent
 * Desktop sticky panel (right side) with assistant message, quick picks, and chips
 * Only visible on desktop (>= 1024px), does not scroll independently
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RestaurantCardComponent } from '../restaurant-card/restaurant-card.component';
import type { Restaurant, AssistPayload, RefinementChip } from '../../../../domain/types/search.types';
import { SearchFacade } from '../../../../facades/search.facade';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-assistant-desktop-panel',
  standalone: true,
  imports: [CommonModule, RestaurantCardComponent],
  templateUrl: './assistant-desktop-panel.component.html',
  styleUrl: './assistant-desktop-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AssistantDesktopPanelComponent {
  @Input({ required: true }) assist!: AssistPayload;
  @Input() chips: RefinementChip[] = [];
  @Input() highlightedResults: Restaurant[] = []; // Max 3
  
  @Output() chipClick = new EventEmitter<string>();
  @Output() restaurantClick = new EventEmitter<Restaurant>();

  // Inject search facade for uiLanguage
  private searchFacade = inject(SearchFacade);

  // Dev mode check
  readonly isDev = computed(() => !environment.production);

  /**
   * Handle chip click
   */
  onChipClick(chipId: string): void {
    this.chipClick.emit(chipId);
  }

  /**
   * Handle restaurant card click
   */
  onRestaurantClick(restaurant: Restaurant): void {
    this.restaurantClick.emit(restaurant);
  }

  /**
   * Track chips by id
   */
  trackByChipId(_index: number, chip: RefinementChip): string {
    return chip.id;
  }

  /**
   * Track restaurants by id
   */
  trackById(_index: number, result: Restaurant): string {
    return result.id;
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
    return this.assist.language || this.getFallbackLanguage();
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

