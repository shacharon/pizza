/**
 * Restaurant Card Component
 * Presentational component for displaying restaurant with quick actions
 * 
 * P0 Security: Uses secure photo proxy (no API key exposure)
 */

import { Component, input, output, ChangeDetectionStrategy, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReasonLabelComponent } from '../reason-label/reason-label.component';
import type { Restaurant, Coordinates } from '../../../../domain/types/search.types';
import type { ActionType, ActionLevel } from '../../../../domain/types/action.types';
import { buildPhotoSrc, getPhotoPlaceholder } from '../../../../utils/photo-src.util';
import { I18nService } from '../../../../core/services/i18n.service';
import { calculateDistance, calculateWalkingTime, formatDistance } from '../../../../utils/distance.util';

// Near you badge threshold (meters)
export const NEAR_THRESHOLD_METERS = 600;

@Component({
  selector: 'app-restaurant-card',
  standalone: true,
  imports: [CommonModule, ReasonLabelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './restaurant-card.component.html',
  styleUrl: './restaurant-card.component.scss'
})
export class RestaurantCardComponent {
  public readonly i18n = inject(I18nService);

  // Inputs
  readonly restaurant = input.required<Restaurant>();
  readonly selected = input(false);
  readonly isTopResult = input(false); // NEW: Mobile-first UX
  readonly showReasonLabel = input(false); // NEW: Mobile-first UX
  readonly compact = input(false); // NEW: For bottom sheet/panel cards
  readonly userLocation = input<Coordinates | null>(null); // User's current location for ETA

  // Outputs
  readonly cardClick = output<Restaurant>();
  readonly actionClick = output<{ type: ActionType; level: ActionLevel }>();

  // P0 Security: Secure photo URL (no API key exposure)
  readonly photoSrc = computed(() => buildPhotoSrc(this.restaurant()));
  readonly photoPlaceholder = getPhotoPlaceholder();

  // Photo error state (for broken images)
  readonly photoError = signal(false);

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
   * Get label for open status (i18n)
   */
  getOpenStatusLabel(): string {
    const status = this.getOpenStatus();
    switch (status) {
      case 'open': return this.i18n.t('card.status.open');
      case 'closed': return this.i18n.t('card.status.closed');
      case 'unknown': return this.i18n.t('card.status.hours_unverified');
      default: return '';
    }
  }

  /**
   * NEW: Get gluten-free badge info (SOFT hints) - i18n
   * Returns badge text based on confidence level
   */
  readonly glutenFreeBadge = computed(() => {
    const hint = this.restaurant().dietaryHints?.glutenFree;
    if (!hint || hint.confidence === 'NONE') {
      return null;
    }

    // HIGH confidence: "GF"
    if (hint.confidence === 'HIGH') {
      return { text: this.i18n.t('card.dietary.gluten_free'), level: 'high' };
    }

    // MEDIUM/LOW confidence: "Maybe GF"
    return { text: this.i18n.t('card.dietary.gluten_free_maybe'), level: 'low' };
  });

  /**
   * Calculate distance and ETA from user location
   * Returns null if userLocation is not available
   */
  readonly distanceInfo = computed(() => {
    const userLoc = this.userLocation();
    const placeLoc = this.restaurant().location;
    
    if (!userLoc) {
      return null;
    }

    const distanceMeters = calculateDistance(userLoc, placeLoc);
    const walkingMinutes = calculateWalkingTime(distanceMeters);
    
    // Get i18n units
    const metersUnit = this.i18n.t('card.distance.meters_short');
    const kmUnit = this.i18n.t('card.distance.km_short');
    const minutesUnit = this.i18n.t('card.distance.minutes_short');
    
    const distanceText = formatDistance(distanceMeters, metersUnit, kmUnit);

    return {
      distanceMeters,
      distanceText,
      walkingMinutes,
      minutesUnit
    };
  });

  /**
   * Show "Near you" badge if distance < NEAR_THRESHOLD_METERS
   * Returns null if no distance info available
   */
  readonly showNearYouBadge = computed(() => {
    const info = this.distanceInfo();
    if (!info) {
      return false;
    }
    return info.distanceMeters < NEAR_THRESHOLD_METERS;
  });

  /**
   * Get closing time for today if available
   * Returns formatted time string or null
   */
  readonly closingTimeToday = computed(() => {
    const restaurant = this.restaurant();

    // Priority 1: Use currentOpeningHours.nextCloseTime if available
    if (restaurant.currentOpeningHours?.nextCloseTime) {
      try {
        const closeTime = new Date(restaurant.currentOpeningHours.nextCloseTime);
        // Check if it's today
        const now = new Date();
        if (closeTime.toDateString() === now.toDateString()) {
          return this.formatTime(closeTime);
        }
      } catch (e) {
        console.warn('[RestaurantCard] Failed to parse nextCloseTime:', e);
      }
    }

    // Priority 2: Derive from regularOpeningHours for today
    if (restaurant.regularOpeningHours?.periods) {
      const now = new Date();
      const today = now.getDay(); // 0 = Sunday, 6 = Saturday
      
      // Find today's period
      const todayPeriod = restaurant.regularOpeningHours.periods.find(p => p.open.day === today);
      
      if (todayPeriod?.close) {
        try {
          // Parse HHmm format (e.g., "2200" for 10:00 PM)
          const closeTimeStr = todayPeriod.close.time;
          const hours = parseInt(closeTimeStr.substring(0, 2), 10);
          const minutes = parseInt(closeTimeStr.substring(2, 4), 10);
          
          const closeTime = new Date(now);
          closeTime.setHours(hours, minutes, 0, 0);
          
          // Only show if closing time is in the future
          if (closeTime > now) {
            return this.formatTime(closeTime);
          }
        } catch (e) {
          console.warn('[RestaurantCard] Failed to parse regular hours:', e);
        }
      }
    }

    return null;
  });

  /**
   * Format time for display based on locale
   * Uses 24h format for consistency
   */
  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Get gluten-free badge tooltip (i18n)
   */
  getGlutenFreeTooltip(): string {
    const hint = this.restaurant().dietaryHints?.glutenFree;
    if (!hint) return '';

    return this.i18n.t('card.dietary.gluten_free_disclaimer');
  }

  /**
   * Action button labels and tooltips (i18n)
   */
  getNavigateLabel(): string {
    return this.i18n.t('card.action.navigate');
  }

  getCallLabel(): string {
    return this.i18n.t('card.action.call');
  }

  getDirectionsTitle(): string {
    return this.isActionAvailable('GET_DIRECTIONS')
      ? this.i18n.t('card.action.get_directions')
      : this.i18n.t('card.action.location_not_available');
  }

  getDirectionsAriaLabel(): string {
    return this.isActionAvailable('GET_DIRECTIONS')
      ? `${this.i18n.t('card.action.get_directions')} ${this.restaurant().name}`
      : this.i18n.t('card.action.location_not_available');
  }

  getCallTitle(): string {
    return this.isActionAvailable('CALL_RESTAURANT')
      ? this.i18n.t('card.action.call_restaurant')
      : this.i18n.t('card.action.phone_not_available');
  }

  getCallAriaLabel(): string {
    return this.isActionAvailable('CALL_RESTAURANT')
      ? `${this.i18n.t('card.action.call')} ${this.restaurant().name}`
      : this.i18n.t('card.action.phone_not_available');
  }

  /**
   * Handle photo load error
   * Set error state to show placeholder (prevents retry loops)
   */
  onPhotoError(): void {
    if (!this.photoError()) {
      console.warn('[RestaurantCard] Failed to load photo', {
        placeId: this.restaurant().placeId,
        name: this.restaurant().name,
        photoSrc: this.photoSrc()?.substring(0, 100)
      });
      this.photoError.set(true);
    }
  }

  /**
   * Get current photo source (with fallback)
   * Returns placeholder if error occurred or no photo available
   * CRITICAL: HARD GUARD against Google URLs to prevent CORS
   */
  getCurrentPhotoSrc(): string {
    const src = this.photoSrc();
    const hasError = this.photoError();

    // HARD GUARD: Block any Google URLs (CORS protection)
    if (src && this.isGoogleUrl(src)) {
      console.error('[RestaurantCard] BLOCKED Google URL in getCurrentPhotoSrc', {
        placeId: this.restaurant().placeId,
        urlPrefix: src.substring(0, 100)
      });
      return this.photoPlaceholder;
    }

    if (hasError || !src) {
      return this.photoPlaceholder;
    }

    return src;
  }

  /**
   * HARD GUARD: Check if URL is a Google URL that would cause CORS
   */
  private isGoogleUrl(url: string): boolean {
    return url.includes('googleusercontent.com') ||
      url.includes('gstatic.com') ||
      url.includes('googleapis.com') ||
      url.includes('maps.googleapis.com') ||
      url.includes('places.googleapis.com');
  }
}




