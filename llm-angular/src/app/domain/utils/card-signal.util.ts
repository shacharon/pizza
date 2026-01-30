/**
 * Card Signal Utility
 * Computes canonical UX signal for result cards
 * 
 * PRIORITY ORDER (only ONE signal per card):
 * 1. OPEN/CLOSED (hard rule - always wins if exists)
 * 2. PRICE (cheap/mid/expensive)
 * 3. DISTANCE (nearby signal)
 * 4. INTENT_MATCH (e.g., "Great for breakfast")
 */

import { Restaurant, CardSignal, CardSignalType } from '../types/search.types';
import { getSignalLabel, getIntentLabel, SupportedLanguage } from '../i18n/signal-labels';

/**
 * Compute the single highest-priority signal for a restaurant card
 * Returns null if no signal is applicable
 * 
 * @param restaurant - Restaurant data
 * @param userLocation - Optional user location for distance calculation
 * @param language - Language for labels (defaults to Hebrew)
 * @returns CardSignal or null
 */
export function computeCardSignal(
  restaurant: Restaurant,
  userLocation?: { lat: number; lng: number },
  language: SupportedLanguage = 'he'
): CardSignal | null {
  
  // PRIORITY 1: OPEN/CLOSED (hard rule - always wins)
  if (restaurant.openNow === true) {
    return {
      type: 'OPEN_NOW',
      priority: 1,
      label: getSignalLabel('OPEN_NOW', language),
    };
  }
  
  if (restaurant.openNow === false) {
    return {
      type: 'CLOSED_NOW',
      priority: 1,
      label: getSignalLabel('CLOSED_NOW', language),
    };
  }
  
  // PRIORITY 2: PRICE (cheap/mid/expensive)
  if (restaurant.priceLevel) {
    if (restaurant.priceLevel === 1) {
      return {
        type: 'PRICE_CHEAP',
        priority: 2,
        label: getSignalLabel('PRICE_CHEAP', language),
        metadata: { priceLevel: 1 }
      };
    }
    
    if (restaurant.priceLevel === 2) {
      return {
        type: 'PRICE_MID',
        priority: 2,
        label: getSignalLabel('PRICE_MID', language),
        metadata: { priceLevel: 2 }
      };
    }
    
    if (restaurant.priceLevel >= 3) {
      return {
        type: 'PRICE_EXPENSIVE',
        priority: 2,
        label: getSignalLabel('PRICE_EXPENSIVE', language),
        metadata: { priceLevel: restaurant.priceLevel }
      };
    }
  }
  
  // PRIORITY 3: DISTANCE (nearby signal)
  // Show "NEARBY" if distance < 500m
  if (restaurant.distanceMeters !== undefined && restaurant.distanceMeters < 500) {
    return {
      type: 'NEARBY',
      priority: 3,
      label: getSignalLabel('NEARBY', language),
      metadata: { distanceMeters: restaurant.distanceMeters }
    };
  }
  
  // PRIORITY 4: INTENT_MATCH (e.g., "Great for breakfast")
  if (restaurant.matchReason) {
    // Try to get localized intent label, fall back to matchReason
    const intentLabel = getIntentLabel(restaurant.matchReason, language);
    
    return {
      type: 'INTENT_MATCH',
      priority: 4,
      label: intentLabel,
      metadata: { matchReason: restaurant.matchReason }
    };
  }
  
  // PRIORITY 5: POPULARITY (highly rated)
  // Show "POPULAR" if rating >= 4.5 AND reviews >= 100
  if (restaurant.rating && restaurant.rating >= 4.5 && 
      restaurant.userRatingsTotal && restaurant.userRatingsTotal >= 100) {
    return {
      type: 'POPULAR',
      priority: 5,
      label: getSignalLabel('POPULAR', language),
      metadata: { 
        rating: restaurant.rating,
        reviewCount: restaurant.userRatingsTotal
      }
    };
  }
  
  // No signal applicable
  return null;
}

/**
 * Get signal color for UI styling
 * Maps signal type to semantic color
 */
export function getSignalColor(signal: CardSignal): string {
  switch (signal.type) {
    case 'OPEN_NOW':
      return '#10b981';  // Green (accent color)
    
    case 'CLOSED_NOW':
      return '#9ca3af';  // Light gray (calm)
    
    case 'PRICE_CHEAP':
    case 'PRICE_MID':
    case 'PRICE_EXPENSIVE':
      return '#6b7280';  // Medium gray (neutral)
    
    case 'NEARBY':
      return '#6b7280';  // Medium gray (neutral)
    
    case 'INTENT_MATCH':
      return '#6b7280';  // Medium gray (neutral)
    
    default:
      return '#9ca3af';  // Light gray (fallback)
  }
}

/**
 * Check if signal should be emphasized (bold/accent)
 * Only OPEN_NOW is emphasized (green accent)
 */
export function isSignalEmphasized(signal: CardSignal): boolean {
  return signal.type === 'OPEN_NOW';
}
