/**
 * AssistantDesktopPanelComponent
 * Desktop sticky panel (right side) with assistant message, quick picks, and chips
 * Only visible on desktop (>= 1024px), does not scroll independently
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RestaurantCardComponent } from '../restaurant-card/restaurant-card.component';
import type { Restaurant, AssistPayload, RefinementChip, Coordinates } from '../../../../domain/types/search.types';

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
  @Input() userLocation: Coordinates | null = null;
  
  @Output() chipClick = new EventEmitter<string>();
  @Output() restaurantClick = new EventEmitter<Restaurant>();

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
}

