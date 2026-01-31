/**
 * Restaurant Card Component
 * Presentational component for displaying restaurant with quick actions
 * 
 * P0 Security: Uses secure photo proxy (no API key exposure)
 * Non-blocking rendering: Defers photo loading to avoid blocking list rendering
 */

import { Component, input, output, ChangeDetectionStrategy, computed, signal, effect, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReasonLabelComponent } from '../reason-label/reason-label.component';
import type { Restaurant, CardSignal } from '../../../../domain/types/search.types';
import type { ActionType, ActionLevel } from '../../../../domain/types/action.types';
import { buildPhotoSrc, getPhotoPlaceholder } from '../../../../utils/photo-src.util';
import { computeCardSignal, getSignalColor, isSignalEmphasized } from '../../../../domain/utils/card-signal.util';

@Component({
  selector: 'app-restaurant-card',
  standalone: true,
  imports: [CommonModule, ReasonLabelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './restaurant-card.component.html',
  styleUrl: './restaurant-card.component.scss'
})
export class RestaurantCardComponent implements AfterViewInit {
  // Inputs
  readonly restaurant = input.required<Restaurant>();
  readonly selected = input(false);
  readonly isTopResult = input(false); // NEW: Mobile-first UX
  readonly showReasonLabel = input(false); // NEW: Mobile-first UX
  readonly compact = input(false); // NEW: For bottom sheet/panel cards

  // Outputs
  readonly cardClick = output<Restaurant>();
  readonly actionClick = output<{ type: ActionType; level: ActionLevel }>();

  // P0 Security: Secure photo URL (no API key exposure)
  readonly photoSrc = computed(() => buildPhotoSrc(this.restaurant()));
  readonly photoPlaceholder = getPhotoPlaceholder();

  // Photo error state (for broken images)
  readonly photoError = signal(false);

  // Non-blocking photo loading: Defer photo binding until after initial render
  readonly shouldLoadPhoto = signal(false);

  /**
   * UX SIGNALS: Canonical card signal (priority-based)
   * Computes the single highest-priority signal to display
   * 
   * PRIORITY ORDER:
   * 1. OPEN/CLOSED (hard rule - always wins)
   * 2. PRICE (cheap/mid/expensive)
   * 3. DISTANCE (nearby)
   * 4. INTENT_MATCH (e.g., "Great for breakfast")
   */
  readonly cardSignal = computed<CardSignal | null>(() => {
    return computeCardSignal(this.restaurant());
  });

  ngAfterViewInit(): void {
    // Defer photo loading to next frame (non-blocking)
    // This ensures card text/layout renders immediately, photos load after
    requestAnimationFrame(() => {
      this.shouldLoadPhoto.set(true);
    });
  }

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

  /**
   * Get calm open status text (UX polish)
   * Replaces aggressive CLOSED badge with calm text
   */
  getOpenStatusText(): string {
    const status = this.getOpenStatus();
    switch (status) {
      case 'open': return 'פתוח עכשיו';
      case 'closed': return 'סגור עכשיו';
      case 'unknown': return 'שעות לא מאומתות';
      default: return '';
    }
  }

  /**
   * Format review count (UX polish)
   * Examples: 114, 1.2K, 10K
   */
  formatReviewCount(count: number): string {
    if (count >= 1000) {
      return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return count.toString();
  }

  /**
   * MOBILE NOISE REDUCTION: Check if rating has low review count
   * Returns true if reviews < 20 (for de-emphasis on mobile)
   */
  isLowReviewCount(): boolean {
    const count = this.restaurant().userRatingsTotal;
    return !count || count < 20;
  }

  /**
   * Get shortened address (single line)
   * MOBILE NOISE REDUCTION: Keeps only city/street (most minimal)
   */
  getShortAddress(address: string): string {
    if (!address) return '';

    // Remove ", Israel" or ", ישראל" suffix
    let short = address.replace(/, (Israel|ישראל)$/i, '');

    // MOBILE NOISE REDUCTION: Even more aggressive - max 50 chars
    if (short.length > 50) {
      const parts = short.split(',');
      // Take first 1-2 parts only (street + city)
      short = parts.slice(0, 2).join(',');
    }

    // Final truncation if still too long
    if (short.length > 50) {
      short = short.substring(0, 47) + '...';
    }

    return short.trim();
  }

  /**
   * Get display tags (filtered, max 1-2)
   * MOBILE NOISE REDUCTION: Aggressively hide low-signal chips
   * - Technical tags (point_of_interest, establishment)
   * - Generic categories (food, store)
   * - Price tier indicators (if shown elsewhere)
   */
  getDisplayTags(): string[] {
    const tags = this.restaurant().tags || [];

    // MOBILE NOISE REDUCTION: Expanded list of low-signal tags to hide
    const lowSignalTags = [
      // Technical
      'point_of_interest',
      'establishment',
      'premise',
      'locality',
      // Generic food
      'food',
      'store',
      'restaurant',
      'מסעדה',
      'אוכל',
      'מזון',
      // Generic categories that don't add value
      'meal_takeaway',
      'meal_delivery',
      'lodging',
      'general',
      'other'
    ];

    // Filter out low-signal tags
    const filtered = tags.filter(tag =>
      !lowSignalTags.some(low => tag.toLowerCase().includes(low.toLowerCase()))
    );

    // MOBILE NOISE REDUCTION: Max 2 high-signal tags only
    // Prioritize cuisine/dietary tags over generic descriptors
    const cuisineKeywords = ['italian', 'sushi', 'pizza', 'burger', 'chinese', 'indian',
      'איטלקי', 'סושי', 'פיצה', 'המבורגר', 'סיני', 'הודי'];

    const sorted = filtered.sort((a, b) => {
      const aIsCuisine = cuisineKeywords.some(kw => a.toLowerCase().includes(kw));
      const bIsCuisine = cuisineKeywords.some(kw => b.toLowerCase().includes(kw));
      if (aIsCuisine && !bIsCuisine) return -1;
      if (!aIsCuisine && bIsCuisine) return 1;
      return 0;
    });

    return sorted.slice(0, 2);
  }

  /**
   * NEW: Get gluten-free badge info (SOFT hints)
   * Returns badge text based on confidence level
   */
  readonly glutenFreeBadge = computed(() => {
    const hint = this.restaurant().dietaryHints?.glutenFree;
    if (!hint || hint.confidence === 'NONE') {
      return null;
    }

    // HIGH confidence: "GF"
    if (hint.confidence === 'HIGH') {
      return { text: 'GF', level: 'high' };
    }

    // MEDIUM/LOW confidence: "Maybe GF"
    return { text: 'Maybe GF', level: 'low' };
  });

  /**
   * Get gluten-free badge tooltip
   */
  getGlutenFreeTooltip(): string {
    const hint = this.restaurant().dietaryHints?.glutenFree;
    if (!hint) return '';

    // Detect language from restaurant name (simple heuristic)
    const hasHebrew = /[\u0590-\u05FF]/.test(this.restaurant().name);

    if (hasHebrew) {
      return 'מבוסס על רמזים בטקסט — לא מובטח';
    }
    return 'Based on text signals — not guaranteed';
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
   * UX SIGNALS: Get signal color for styling
   * Maps signal type to semantic color
   */
  getCardSignalColor(): string {
    const signal = this.cardSignal();
    return signal ? getSignalColor(signal) : '#9ca3af';
  }

  /**
   * UX SIGNALS: Check if signal should be emphasized
   * Only OPEN_NOW is emphasized (green accent)
   */
  isCardSignalEmphasized(): boolean {
    const signal = this.cardSignal();
    return signal ? isSignalEmphasized(signal) : false;
  }

  /**
   * UX SIGNALS: Get signal label for display
   * Returns the computed signal label or empty string
   */
  getCardSignalLabel(): string {
    const signal = this.cardSignal();
    return signal ? signal.label : '';
  }

  /**
   * NEW: Extract primary cuisine/category for display under title
   * Returns emoji + category (e.g. "🍣 Sushi · Asian")
   */
  getCuisineTag(): string {
    const tags = this.restaurant().tags || [];

    // Cuisine mapping with emojis
    const cuisineMap: { [key: string]: { emoji: string; label: string } } = {
      'sushi': { emoji: '🍣', label: 'Sushi' },
      'pizza': { emoji: '🍕', label: 'Pizza' },
      'italian': { emoji: '🍝', label: 'Italian' },
      'burger': { emoji: '🍔', label: 'Burger' },
      'chinese': { emoji: '🥡', label: 'Chinese' },
      'indian': { emoji: '🍛', label: 'Indian' },
      'mexican': { emoji: '🌮', label: 'Mexican' },
      'japanese': { emoji: '🍱', label: 'Japanese' },
      'thai': { emoji: '🍜', label: 'Thai' },
      'mediterranean': { emoji: '🥙', label: 'Mediterranean' },
      'american': { emoji: '🍔', label: 'American' },
      'asian': { emoji: '🥢', label: 'Asian' },
      'middle_eastern': { emoji: '🥙', label: 'Middle Eastern' },
      'seafood': { emoji: '🦞', label: 'Seafood' },
      'steakhouse': { emoji: '🥩', label: 'Steakhouse' },
      'vegan': { emoji: '🌱', label: 'Vegan' },
      'vegetarian': { emoji: '🥗', label: 'Vegetarian' },
      'cafe': { emoji: '☕', label: 'Cafe' },
      'bar': { emoji: '🍺', label: 'Bar' },
      'bakery': { emoji: '🥐', label: 'Bakery' },
      'dessert': { emoji: '🍰', label: 'Dessert' },
      // Hebrew mappings
      'סושי': { emoji: '🍣', label: 'סושי' },
      'פיצה': { emoji: '🍕', label: 'פיצה' },
      'איטלקי': { emoji: '🍝', label: 'איטלקי' },
      'המבורגר': { emoji: '🍔', label: 'המבורגר' },
      'סיני': { emoji: '🥡', label: 'סיני' },
      'הודי': { emoji: '🍛', label: 'הודי' },
      'יפני': { emoji: '🍱', label: 'יפני' },
      'תאילנדי': { emoji: '🍜', label: 'תאילנדי' },
      'ים תיכוני': { emoji: '🥙', label: 'ים תיכוני' },
      'אמריקאי': { emoji: '🍔', label: 'אמריקאי' },
      'אסייתי': { emoji: '🥢', label: 'אסייתי' },
      'מזרח תיכוני': { emoji: '🥙', label: 'מזרח תיכוני' },
      'פירות ים': { emoji: '🦞', label: 'פירות ים' },
      'בשרים': { emoji: '🥩', label: 'בשרים' },
      'טבעוני': { emoji: '🌱', label: 'טבעוני' },
      'צמחוני': { emoji: '🥗', label: 'צמחוני' },
      'בית קפה': { emoji: '☕', label: 'בית קפה' },
      'בר': { emoji: '🍺', label: 'בר' },
      'מאפייה': { emoji: '🥐', label: 'מאפייה' },
    };

    // Find first matching cuisine from tags
    for (const tag of tags) {
      const normalized = tag.toLowerCase().trim();
      for (const [key, value] of Object.entries(cuisineMap)) {
        if (normalized.includes(key)) {
          return `${value.emoji} ${value.label}`;
        }
      }
    }

    // Default fallback
    return '🍽️ Restaurant';
  }

  /**
   * NEW: Get compact city + distance line for address
   * Format: "📍 City · 2.3 km"
   */
  getCompactAddress(): string {
    const restaurant = this.restaurant();
    const address = restaurant.address || '';

    // Extract city (simple heuristic - get last non-Israel part)
    let city = '';
    if (address) {
      const parts = address.split(',').map(p => p.trim());
      // Filter out "Israel", "ישראל", and street numbers
      const filtered = parts.filter(p =>
        !p.match(/^(Israel|ישראל)$/i) &&
        !p.match(/^\d+$/)
      );
      // Take the last part as city
      city = filtered[filtered.length - 1] || filtered[0] || '';
    }

    // Add distance if available
    if (restaurant.distanceMeters !== undefined) {
      const km = (restaurant.distanceMeters / 1000).toFixed(1);
      return city ? `📍 ${city} · ${km} km` : `📍 ${km} km`;
    }

    return city ? `📍 ${city}` : '📍 Location';
  }

  /**
   * NEW: Get opening time if restaurant is closed
   * Returns "Opens at HH:MM" or empty string
   */
  getOpeningTime(): string {
    // Note: This requires backend to provide next opening time
    // For now, return empty - can be enhanced later with opening hours data
    return '';
  }

  /**
   * NEW: Check if restaurant name should be clickable
   * Always true - name is primary navigation target
   */
  isNameClickable(): boolean {
    return true;
  }
}




