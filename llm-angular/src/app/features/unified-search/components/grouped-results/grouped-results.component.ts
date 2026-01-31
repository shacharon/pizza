/**
 * GroupedResultsComponent
 * Displays search results grouped by proximity (Exact vs Nearby)
 * Phase B: Street grouping UI
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RestaurantCardComponent } from '../restaurant-card/restaurant-card.component';
import type { ResultGroup, RestaurantResult, ActionDefinition } from '../../../../domain/types/search.types';
import { t, type Lang } from '../../../../i18n/search-narration.i18n';

export interface ActionClickEvent {
  restaurant: RestaurantResult;
  action: ActionDefinition;
}

@Component({
  selector: 'app-grouped-results',
  standalone: true,
  imports: [CommonModule, RestaurantCardComponent],
  templateUrl: './grouped-results.component.html',
  styleUrl: './grouped-results.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GroupedResultsComponent {
  @Input() groups: ResultGroup[] = [];
  @Input() loading = false;
  @Input() uiLanguage: Lang = 'en'; // UI language for i18n
  
  // Expose t function for template
  readonly t = t;
  
  @Output() restaurantClick = new EventEmitter<RestaurantResult>();
  @Output() actionClick = new EventEmitter<ActionClickEvent>();

  /**
   * Track groups by kind for performance
   */
  trackByKind(_index: number, group: ResultGroup): string {
    return group.kind;
  }

  /**
   * Track results by id for performance
   */
  trackById(_index: number, result: RestaurantResult): string {
    return result.id;
  }

  /**
   * Handle restaurant card click
   */
  onRestaurantClick(restaurant: RestaurantResult): void {
    this.restaurantClick.emit(restaurant);
  }

  /**
   * Handle action click on restaurant card
   */
  onActionClick(restaurant: RestaurantResult, action: ActionDefinition): void {
    this.actionClick.emit({ restaurant, action });
  }

  /**
   * Get group CSS class based on kind
   */
  getGroupClass(kind: string): string {
    return `group-${kind.toLowerCase()}`;
  }

  /**
   * Check if groups have any results
   */
  get hasAnyResults(): boolean {
    return this.groups.some(g => g.results.length > 0);
  }
}
