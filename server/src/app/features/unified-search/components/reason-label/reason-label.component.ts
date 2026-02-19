/**
 * ReasonLabelComponent
 * Micro-component for "Best match" reason label on top result
 * Shows why this restaurant is ranked #1
 */

import { Component, Input, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Restaurant } from '../../../../domain/types/search.types';
import { I18nService } from '../../../../core/services/i18n.service';

@Component({
  selector: 'app-reason-label',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reason-label.component.html',
  styleUrl: './reason-label.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReasonLabelComponent {
  private i18n = inject(I18nService);

  @Input({ required: true }) restaurant!: Restaurant;

  /**
   * Compute reason text from restaurant properties (i18n)
   * Priority: backend matchReasons > auto-derived signals
   */
  readonly reasonText = computed(() => {
    const parts: string[] = [this.i18n.t('reason.best_match')];

    // Use backend-provided match reasons if available
    if (this.restaurant.matchReasons && this.restaurant.matchReasons.length > 0) {
      const reasons = this.restaurant.matchReasons;

      if (reasons.includes('open_now') && this.restaurant.openNow === true) {
        parts.push(this.i18n.t('reason.open_now'));
      }
      if (reasons.includes('highly_rated') || reasons.includes('exceptional_rating')) {
        if (this.restaurant.rating) {
          parts.push(`${this.restaurant.rating}⭐`);
        }
      }
      if (reasons.includes('very_close') || reasons.includes('nearby')) {
        parts.push(this.i18n.t('reason.closest_option'));
      }
    } else {
      // Fallback: auto-derive from properties
      if (this.restaurant.openNow === true) {
        parts.push(this.i18n.t('reason.open_now'));
      }
      if (this.restaurant.rating && this.restaurant.rating >= 4.5) {
        parts.push(`${this.restaurant.rating}⭐`);
      }
    }

    return parts.join(' · ');
  });
}

