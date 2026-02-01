/**
 * RankedResultsComponent
 * Displays search results as a single ranked list (mobile-first UX)
 * Replaces grouped display with flat, authoritative ranking
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RestaurantCardComponent } from '../restaurant-card/restaurant-card.component';
import type { Restaurant } from '../../../../domain/types/search.types';
import { t, type Lang } from '../../../../i18n/search-narration.i18n';

@Component({
  selector: 'app-ranked-results',
  standalone: true,
  imports: [CommonModule, RestaurantCardComponent],
  templateUrl: './ranked-results.component.html',
  styleUrl: './ranked-results.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RankedResultsComponent {
  @Input() results: Restaurant[] = [];
  @Input() loading = false;
  @Input() showReasonLabels = true; // Top result gets reason label
  @Input() uiLanguage: Lang = 'en'; // UI language for i18n

  // Expose t function for template
  readonly t = t;

  @Output() restaurantClick = new EventEmitter<Restaurant>();

  /**
   * Get the top result (first in ranked list)
   */
  get topResult(): Restaurant | null {
    return this.results[0] || null;
  }

  /**
   * Handle restaurant card click
   */
  onRestaurantClick(restaurant: Restaurant): void {
    this.restaurantClick.emit(restaurant);
  }

  /**
   * Track restaurants by id for performance
   */
  trackById(_index: number, result: Restaurant): string {
    return result.id;
  }
}

