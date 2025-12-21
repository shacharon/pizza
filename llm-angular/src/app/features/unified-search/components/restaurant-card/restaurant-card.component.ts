/**
 * Restaurant Card Component
 * Presentational component for displaying restaurant with quick actions
 */

import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Restaurant } from '../../../../domain/types/search.types';
import type { ActionType, ActionLevel } from '../../../../domain/types/action.types';

@Component({
  selector: 'app-restaurant-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './restaurant-card.component.html',
  styleUrl: './restaurant-card.component.scss'
})
export class RestaurantCardComponent {
  // Inputs
  readonly restaurant = input.required<Restaurant>();
  readonly selected = input(false);

  // Outputs
  readonly cardClick = output<Restaurant>();
  readonly actionClick = output<{type: ActionType; level: ActionLevel}>();

  onCardClick(): void {
    this.cardClick.emit(this.restaurant());
  }

  onAction(event: Event, type: ActionType): void {
    event.stopPropagation(); // Prevent card click
    const level = this.getActionLevel(type);
    this.actionClick.emit({ type, level });
  }

  private getActionLevel(type: ActionType): ActionLevel {
    // Define action levels according to Human-in-the-Loop pattern
    switch (type) {
      case 'GET_DIRECTIONS':
      case 'CALL_RESTAURANT':
      case 'VIEW_DETAILS':
      case 'VIEW_MENU':
      case 'SHARE':
        return 0; // L0: Read-only, safe actions
      case 'SAVE_FAVORITE':
        return 1; // L1: Soft actions, require approval
      default:
        return 0;
    }
  }

  getRatingStars(rating?: number): string {
    if (!rating) return '';
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    let stars = '⭐'.repeat(fullStars);
    if (hasHalfStar) stars += '✨';
    return stars;
  }

  getPriceLevel(level?: number): string {
    if (!level) return '';
    return '$'.repeat(level);
  }
}

