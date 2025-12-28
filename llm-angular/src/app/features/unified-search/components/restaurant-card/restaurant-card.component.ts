/**
 * Restaurant Card Component
 * Presentational component for displaying restaurant with quick actions
 */

import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReasonLabelComponent } from '../reason-label/reason-label.component';
import type { Restaurant } from '../../../../domain/types/search.types';
import type { ActionType, ActionLevel } from '../../../../domain/types/action.types';

@Component({
  selector: 'app-restaurant-card',
  standalone: true,
  imports: [CommonModule, ReasonLabelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './restaurant-card.component.html',
  styleUrl: './restaurant-card.component.scss'
})
export class RestaurantCardComponent {
  // Inputs
  readonly restaurant = input.required<Restaurant>();
  readonly selected = input(false);
  readonly isTopResult = input(false); // NEW: Mobile-first UX
  readonly showReasonLabel = input(false); // NEW: Mobile-first UX
  readonly compact = input(false); // NEW: For bottom sheet/panel cards

  // Outputs
  readonly cardClick = output<Restaurant>();
  readonly actionClick = output<{type: ActionType; level: ActionLevel}>();

  onCardClick(): void {
    this.cardClick.emit(this.restaurant());
  }

  /**
   * Handle action click with level-based behavior (Phase 7: UI/UX Contract)
   * 
   * Action Levels:
   * - Level 0: Immediate execution (no confirmation)
   * - Level 1: Confirmation required
   * - Level 2: High-impact confirmation + explicit explanation
   */
  onAction(event: Event, type: ActionType): void {
    event.stopPropagation(); // Prevent card click
    const level = this.getActionLevel(type);
    
    // Check if action is available (e.g., phone number required for call)
    if (!this.isActionAvailable(type)) {
      console.warn(`[RestaurantCard] Action ${type} not available for ${this.restaurant().name}`);
      return;
    }
    
    this.actionClick.emit({ type, level });
  }

  /**
   * Get action level per UI/UX Contract
   */
  private getActionLevel(type: ActionType): ActionLevel {
    switch (type) {
      // Level 0: Immediate - no confirmation needed
      case 'GET_DIRECTIONS':
      case 'CALL_RESTAURANT':  // When phone available
      case 'VIEW_DETAILS':
      case 'VIEW_MENU':
        return 0;
      
      // Level 1: Confirm first
      case 'SAVE_FAVORITE':
      case 'SHARE':
        return 1;
      
      // Level 2: High-impact - explicit confirm + explanation
      case 'DELETE_FAVORITE':
      case 'REPORT_ISSUE':
        return 2;
      
      default:
        return 0;
    }
  }

  /**
   * Check if action is available (Phase 7: Disable unavailable actions)
   */
  isActionAvailable(type: ActionType): boolean {
    const restaurant = this.restaurant();
    
    switch (type) {
      case 'CALL_RESTAURANT':
        return !!restaurant.phoneNumber;
      case 'VIEW_MENU':
        return !!restaurant.website;
      case 'GET_DIRECTIONS':
        return !!restaurant.location;
      default:
        return true; // Most actions always available
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

  /**
   * Get open/closed status with UNKNOWN handling
   */
  getOpenStatus(): 'open' | 'closed' | 'unknown' | null {
    const openNow = this.restaurant().openNow;
    if (openNow === undefined) return null;
    if (openNow === 'UNKNOWN') return 'unknown';
    return openNow ? 'open' : 'closed';
  }

  /**
   * Get label for open status
   */
  getOpenStatusLabel(): string {
    const status = this.getOpenStatus();
    switch (status) {
      case 'open': return 'Open now';
      case 'closed': return 'Closed';
      case 'unknown': return 'Hours unverified';
      default: return '';
    }
  }
}




