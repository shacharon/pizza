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
import { calculateDistance, calculateWalkingTime, formatDistance, formatDistanceWithIntent } from '../../../../utils/distance.util';
import { buildWoltSearchUrl, buildTenbisSearchUrl, buildMishlohaSearchUrl } from '../../../../utils/provider-url-builder.util';
import { formatTimeFromDate, formatTimeFromRaw } from '../../../../shared/utils/time-formatter';
import type { ProviderState } from '../../../../domain/types/search.types';

// Near you badge threshold (meters)
export const NEAR_THRESHOLD_METERS = 600;

/**
 * Helper function: Format single-line open status + hours
 * Pure function with no side effects
 * 
 * @param params - Opening hours information
 * @returns Object with text and tone for display
 */
export function formatOpenStatusLine(params: {
  isOpenNow: boolean | 'UNKNOWN' | undefined;
  closeTime: string | null;          // HH:mm format
  nextOpenTime: string | null;        // HH:mm format
  hoursRange: string | null;          // e.g., "09:00–22:00"
  isClosingSoon: boolean;             // true if closing in < 1 hour
  i18nGetText: (key: string, vars?: Record<string, string>) => string;
}): { text: string; tone: 'open' | 'closed' | 'closing-soon' | 'neutral' } {
  const { isOpenNow, closeTime, nextOpenTime, hoursRange, isClosingSoon, i18nGetText } = params;

  // Handle UNKNOWN or undefined status
  if (isOpenNow === 'UNKNOWN' || isOpenNow === undefined) {
    return {
      text: i18nGetText('card.status.hours_unverified'),
      tone: 'neutral'
    };
  }

  // OPEN: Check if closing soon (< 1 hour)
  if (isOpenNow === true) {
    if (closeTime && isClosingSoon) {
      return {
        text: i18nGetText('card.hours.closing_soon', { time: closeTime }),
        tone: 'closing-soon'
      };
    }
    if (closeTime) {
      return {
        text: i18nGetText('card.hours.open_now_until', { time: closeTime }),
        tone: 'open'
      };
    }
    return {
      text: i18nGetText('card.status.open'),
      tone: 'open'
    };
  }

  // CLOSED: Prefer "Closed · opens at HH:mm", fallback to "Closed · hours: HH:mm–HH:mm", else just "Closed"
  if (isOpenNow === false) {
    if (nextOpenTime) {
      return {
        text: i18nGetText('card.hours.closed_opens_at', { time: nextOpenTime }),
        tone: 'closed'
      };
    }
    if (hoursRange) {
      return {
        text: i18nGetText('card.hours.closed_hours', { range: hoursRange }),
        tone: 'closed'
      };
    }
    return {
      text: i18nGetText('card.status.closed'),
      tone: 'closed'
    };
  }

  // Fallback (should never reach here)
  return {
    text: '',
    tone: 'neutral'
  };
}

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

  // TEMP DEBUG: Track logged cards to avoid spam
  private static debuggedCards = new Set<string>();

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
   * Calculate distance and ETA from user location with intent-based formatting
   * Returns null if userLocation is not available
   * 
   * Distance modes:
   * - Walking (< 1 km): Shows walking time (e.g., "~10 min walk")
   * - Short drive (1-5 km): Shows rounded km (e.g., "~3 km")
   * - Far (> 5 km): Shows rounded km (e.g., "~30 km")
   */
  readonly distanceInfo = computed(() => {
    const userLoc = this.userLocation();
    const placeLoc = this.restaurant().location;
    
    if (!userLoc) {
      return null;
    }

    const distanceMeters = calculateDistance(userLoc, placeLoc);
    
    // Use intent-based formatting (no decimals, no "from me")
    const formatted = formatDistanceWithIntent(
      distanceMeters,
      (key, params) => this.i18n.t(key as keyof import('../../../../core/services/i18n.service').I18nKeys, params)
    );

    // TEMP DEBUG: Log once per card (remove after debugging)
    const cardId = this.restaurant().placeId;
    if (!RestaurantCardComponent.debuggedCards.has(cardId)) {
      RestaurantCardComponent.debuggedCards.add(cardId);
      console.log('[RestaurantCard DEBUG]', {
        name: this.restaurant().name,
        distanceMeters,
        distanceKm: (distanceMeters / 1000).toFixed(2),
        formattedText: formatted.text,
        mode: formatted.mode,
        openNow: this.restaurant().openNow,
        hasCurrentOpeningHours: !!this.restaurant().currentOpeningHours,
        currentNextCloseTime: this.restaurant().currentOpeningHours?.nextCloseTime,
        hasRegularHours: !!this.restaurant().regularOpeningHours,
        regularPeriodsCount: this.restaurant().regularOpeningHours?.periods?.length,
        derivedClosingTime: this.closingTimeToday()
      });
    }

    return {
      distanceMeters,
      text: formatted.text,
      mode: formatted.mode
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
   * 
   * Rules:
   * - Show ONLY if place is currently OPEN
   * - Show ONLY if closing time is confidently available for TODAY
   * - Priority 1: currentOpeningHours.nextCloseTime
   * - Priority 2: derive from regularOpeningHours (if unambiguous)
   * - If closed or ambiguous → return null
   */
  readonly closingTimeToday = computed(() => {
    const restaurant = this.restaurant();

    // RULE: Only show if place is currently open
    const openStatus = this.getOpenStatus();
    if (openStatus !== 'open') {
      return null; // Don't show if closed, unknown, or missing
    }

    // Priority 1: Use currentOpeningHours.nextCloseTime if available
    if (restaurant.currentOpeningHours?.nextCloseTime) {
      try {
        const closeTime = new Date(restaurant.currentOpeningHours.nextCloseTime);
        const now = new Date();
        
        // Check if it's today (handle both same-day and after-midnight closes)
        // For same-day closes: compare date strings
        const isSameDay = closeTime.toDateString() === now.toDateString();
        
        // For after-midnight closes: check if close time is within next 6 hours and before 6am
        const timeDiffMs = closeTime.getTime() - now.getTime();
        const isWithin6Hours = timeDiffMs > 0 && timeDiffMs < 6 * 60 * 60 * 1000;
        const isEarlyMorning = closeTime.getHours() < 6;
        const isNextDayEarlyMorning = isWithin6Hours && isEarlyMorning;
        
        if (isSameDay || isNextDayEarlyMorning) {
          return this.formatTime(closeTime);
        }
      } catch (e) {
        console.warn('[RestaurantCard] Failed to parse nextCloseTime:', e);
      }
    }

    // Priority 2: Derive from regularOpeningHours for today (ONLY if unambiguous)
    if (restaurant.regularOpeningHours?.periods) {
      const now = new Date();
      const today = now.getDay(); // 0 = Sunday, 6 = Saturday
      
      // Find all periods for today
      const todayPeriods = restaurant.regularOpeningHours.periods.filter(p => p.open.day === today);
      
      // RULE: Only use if exactly ONE period for today (unambiguous)
      if (todayPeriods.length !== 1) {
        return null; // Multiple periods or no periods → ambiguous
      }
      
      const todayPeriod = todayPeriods[0];
      
      if (todayPeriod?.close) {
        try {
          // Parse HHmm format (e.g., "2200" for 10:00 PM)
          const closeTimeStr = todayPeriod.close.time;
          
          // Guard: Ensure time string is defined
          if (!closeTimeStr) {
            return null;
          }
          
          const hours = parseInt(closeTimeStr.substring(0, 2), 10);
          const minutes = parseInt(closeTimeStr.substring(2, 4), 10);
          
          const closeTime = new Date(now);
          closeTime.setHours(hours, minutes, 0, 0);
          
          // Handle after-midnight closing times (e.g., 01:00 = 1am next day)
          if (hours < 6 && closeTime <= now) {
            closeTime.setDate(closeTime.getDate() + 1);
          }
          
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
   * Check if restaurant is closing soon (less than 1 hour)
   * Returns true if open AND closing in < 60 minutes
   */
  readonly isClosingSoon = computed(() => {
    const restaurant = this.restaurant();
    const openStatus = this.getOpenStatus();
    
    // Only applicable if currently open
    if (openStatus !== 'open') {
      return false;
    }

    const now = new Date();

    // Priority 1: Check currentOpeningHours.nextCloseTime
    if (restaurant.currentOpeningHours?.nextCloseTime) {
      try {
        const closeTime = new Date(restaurant.currentOpeningHours.nextCloseTime);
        const timeDiffMs = closeTime.getTime() - now.getTime();
        const timeDiffMinutes = timeDiffMs / (60 * 1000);
        
        // Closing soon if within next 60 minutes
        return timeDiffMinutes > 0 && timeDiffMinutes <= 60;
      } catch (e) {
        // Parsing error, skip
      }
    }

    // Priority 2: Check regularOpeningHours for today
    if (restaurant.regularOpeningHours?.periods) {
      const today = now.getDay();
      const todayPeriods = restaurant.regularOpeningHours.periods.filter(p => p.open.day === today);
      
      if (todayPeriods.length === 1) {
        const todayPeriod = todayPeriods[0];
        if (todayPeriod?.close?.time) {
          try {
            const closeTimeStr = todayPeriod.close.time;
            const hours = parseInt(closeTimeStr.substring(0, 2), 10);
            const minutes = parseInt(closeTimeStr.substring(2, 4), 10);
            
            const closeTime = new Date(now);
            closeTime.setHours(hours, minutes, 0, 0);
            
            // Handle after-midnight closing times
            if (hours < 6 && closeTime <= now) {
              closeTime.setDate(closeTime.getDate() + 1);
            }
            
            const timeDiffMs = closeTime.getTime() - now.getTime();
            const timeDiffMinutes = timeDiffMs / (60 * 1000);
            
            // Closing soon if within next 60 minutes
            return timeDiffMinutes > 0 && timeDiffMinutes <= 60;
          } catch (e) {
            // Parsing error, skip
          }
        }
      }
    }

    return false;
  });

  /**
   * Format time for display based on locale
   * Uses 24h format for consistency
   * Applies closing time formatting (00:00 → 24:00)
   */
  private formatTime(date: Date): string {
    return formatTimeFromDate(date);
  }

  /**
   * Get next opening time for closed restaurants
   * Returns formatted time string (HH:mm) or null
   */
  private getNextOpenTime(): string | null {
    const restaurant = this.restaurant();
    
    // Only show for closed restaurants
    const openStatus = this.getOpenStatus();
    if (openStatus !== 'closed') {
      return null;
    }

    // Try to derive from regularOpeningHours
    if (restaurant.regularOpeningHours?.periods) {
      const now = new Date();
      const today = now.getDay(); // 0 = Sunday, 6 = Saturday
      const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

      // Check today's periods first (for later today openings)
      const todayPeriods = restaurant.regularOpeningHours.periods
        .filter(p => p.open.day === today && p.open.time) // Filter out periods with undefined time
        .sort((a, b) => (a.open.time || '').localeCompare(b.open.time || ''));

      for (const period of todayPeriods) {
        const openTimeStr = period.open.time;
        
        // Guard: Skip if time string is undefined
        if (!openTimeStr) {
          continue;
        }
        
        const hours = parseInt(openTimeStr.substring(0, 2), 10);
        const minutes = parseInt(openTimeStr.substring(2, 4), 10);
        const openTimeMinutes = hours * 60 + minutes;
        
        if (openTimeMinutes > currentTimeMinutes) {
          return formatTimeFromRaw(openTimeStr);
        }
      }

      // If no opening today, check tomorrow
      const tomorrow = (today + 1) % 7;
      const tomorrowPeriods = restaurant.regularOpeningHours.periods
        .filter(p => p.open.day === tomorrow && p.open.time) // Filter out periods with undefined time
        .sort((a, b) => (a.open.time || '').localeCompare(b.open.time || ''));

      if (tomorrowPeriods.length > 0) {
        const firstPeriod = tomorrowPeriods[0];
        const openTimeStr = firstPeriod.open.time;
        
        // Guard: Ensure time string is defined
        if (!openTimeStr) {
          return null;
        }
        
        return formatTimeFromRaw(openTimeStr);
      }
    }

    return null;
  }

  /**
   * Get hours range for today (e.g., "09:00–22:00")
   * Returns formatted range string or null
   */
  private getTodayHoursRange(): string | null {
    const restaurant = this.restaurant();
    
    if (restaurant.regularOpeningHours?.periods) {
      const now = new Date();
      const today = now.getDay();
      
      const todayPeriods = restaurant.regularOpeningHours.periods.filter(p => p.open.day === today);
      
      // Only show if exactly one period for today (unambiguous)
      if (todayPeriods.length === 1) {
        const period = todayPeriods[0];
        if (period.close) {
          const openTimeStr = period.open.time;
          const closeTimeStr = period.close.time;
          
          // Guard: Ensure time strings are defined before parsing
          if (!openTimeStr || !closeTimeStr) {
            return null;
          }
          
          const openTime = formatTimeFromRaw(openTimeStr);
          const closeTime = formatTimeFromRaw(closeTimeStr);
          
          return `${openTime}–${closeTime}`;
        }
      }
    }

    return null;
  }

  /**
   * Single-line status + hours display
   * Computed signal that uses the pure helper function
   */
  readonly statusLine = computed(() => {
    const restaurant = this.restaurant();
    const openStatus = this.getOpenStatus();
    const isOpenNow = restaurant.openNow;
    const closeTime = this.closingTimeToday();
    const nextOpenTime = this.getNextOpenTime();
    const hoursRange = this.getTodayHoursRange();
    const isClosingSoon = this.isClosingSoon();

    return formatOpenStatusLine({
      isOpenNow,
      closeTime,
      nextOpenTime,
      hoursRange,
      isClosingSoon,
      i18nGetText: (key, vars) => this.i18n.t(key as keyof import('../../../../core/services/i18n.service').I18nKeys, vars)
    });
  });

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

  /**
   * Provider links (Wolt, 10bis, Mishloha) - inline text links
   * Only shows providers when status === FOUND and url is valid
   * Returns array of provider links to display (empty array if none)
   */
  readonly providerLinks = computed(() => {
    const restaurant = this.restaurant();
    const restaurantName = restaurant.name;
    const providers = restaurant.providers || {};

    // Provider configurations (Wolt, 10bis, Mishloha)
    const providerConfigs: Array<{
      id: 'wolt' | 'tenbis' | 'mishloha';
      label: string;
      urlPrefix: string;
    }> = [
      {
        id: 'wolt',
        label: 'Wolt',
        urlPrefix: 'https://wolt.com/'
      },
      {
        id: 'tenbis',
        label: '10bis',
        urlPrefix: 'https://www.10bis.co.il/next/'
      },
      {
        id: 'mishloha',
        label: 'Mishloha',
        urlPrefix: 'https://www.mishloha.co.il/now/r/'
      }
    ];

    // Only include providers with FOUND status and valid URLs
    const validLinks = providerConfigs
      .map(config => {
        const providerState = providers[config.id];
        
        // Only show if status is FOUND and url exists
        if (providerState?.status !== 'FOUND' || !providerState.url) {
          return null;
        }

        // URL validation (optional safety check)
        const url = providerState.url;
        if (!url.startsWith(config.urlPrefix)) {
          // Log validation failure in development mode only
          if (typeof ngDevMode !== 'undefined' && ngDevMode) {
            console.warn(`[RestaurantCard] Invalid ${config.label} URL for ${restaurantName}:`, {
              url,
              expectedPrefix: config.urlPrefix
            });
          }
          return null;
        }

        return {
          id: config.id,
          label: config.label,
          url: url,
        };
      })
      .filter((link): link is NonNullable<typeof link> => link !== null);

    return validLinks;
  });

  /**
   * Handle provider link click
   * Opens provider URL in new tab
   */
  onProviderLinkClick(event: Event, providerId: 'wolt' | 'tenbis' | 'mishloha'): void {
    event.stopPropagation();
    event.preventDefault();

    const link = this.providerLinks().find(l => l.id === providerId);
    if (!link || !link.url) {
      return;
    }

    // Open provider URL in new tab
    window.open(link.url, '_blank', 'noopener,noreferrer');

    console.log('[RestaurantCard] Provider link clicked', {
      placeId: this.restaurant().placeId,
      name: this.restaurant().name,
      providerId,
      url: link.url.substring(0, 100),
    });
  }

}




