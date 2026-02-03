/**
 * AssistantBottomSheetComponent
 * Mobile bottom sheet with up to 3 highlighted restaurant cards
 * Opens on chip click, shows "Quick Picks"
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RestaurantCardComponent } from '../restaurant-card/restaurant-card.component';
import type { Restaurant, Coordinates } from '../../../../domain/types/search.types';

@Component({
  selector: 'app-assistant-bottom-sheet',
  standalone: true,
  imports: [CommonModule, RestaurantCardComponent],
  templateUrl: './assistant-bottom-sheet.component.html',
  styleUrl: './assistant-bottom-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AssistantBottomSheetComponent {
  @Input() visible = false;
  @Input() highlightedResults: Restaurant[] = []; // Max 3
  @Input() title = 'Quick Picks';
  @Input() userLocation: Coordinates | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() restaurantClick = new EventEmitter<Restaurant>();

  /**
   * Close sheet when clicking backdrop
   */
  onBackdropClick(): void {
    this.close.emit();
  }

  /**
   * Handle restaurant card click
   */
  onRestaurantClick(restaurant: Restaurant): void {
    this.restaurantClick.emit(restaurant);
  }

  /**
   * Track restaurants by id
   */
  trackById(_index: number, result: Restaurant): string {
    return result.id;
  }
}

