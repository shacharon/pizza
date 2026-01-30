/**
 * Signal Labels (i18n-ready)
 * Centralized copy for card signals in Hebrew and English
 * 
 * RULES:
 * - Short (max 2-3 words)
 * - Neutral tone
 * - No emojis
 * - No percentages or scores
 * 
 * Future: Wire to i18n service for dynamic language switching
 */

import { CardSignalType } from '../types/search.types';

export type SupportedLanguage = 'he' | 'en';

/**
 * Signal label map by language
 * Structure: { signalType: { language: label } }
 */
export const SIGNAL_LABELS: Record<CardSignalType, Record<SupportedLanguage, string>> = {
  // Priority 1: Open/Closed
  OPEN_NOW: {
    he: 'פתוח עכשיו',
    en: 'Open now'
  },
  
  CLOSED_NOW: {
    he: 'סגור עכשיו',
    en: 'Closed now'
  },
  
  // Priority 2: Price
  PRICE_CHEAP: {
    he: 'זול',
    en: 'Cheap'
  },
  
  PRICE_MID: {
    he: 'בינוני',
    en: 'Mid-price'
  },
  
  PRICE_EXPENSIVE: {
    he: 'יקר',
    en: 'Expensive'
  },
  
  // Priority 3: Distance
  NEARBY: {
    he: 'קרוב',
    en: 'Nearby'
  },
  
  // Priority 4: Intent match
  INTENT_MATCH: {
    he: 'מתאים',
    en: 'Good match'
  },
  
  // Priority 5: Popularity
  POPULAR: {
    he: 'פופולרי',
    en: 'Popular'
  }
};

/**
 * Extended signal labels for common intent patterns
 * Used when matchReason is available
 */
export const INTENT_LABELS: Record<string, Record<SupportedLanguage, string>> = {
  // Meal times
  breakfast: {
    he: 'טוב לארוחת בוקר',
    en: 'Good for breakfast'
  },
  
  lunch: {
    he: 'טוב לארוחת צהריים',
    en: 'Good for lunch'
  },
  
  dinner: {
    he: 'טוב לארוחת ערב',
    en: 'Good for dinner'
  },
  
  brunch: {
    he: 'טוב לברנץ\'',
    en: 'Good for brunch'
  },
  
  // Occasions
  date: {
    he: 'רומנטי',
    en: 'Romantic'
  },
  
  family: {
    he: 'משפחתי',
    en: 'Family-friendly'
  },
  
  group: {
    he: 'טוב לקבוצות',
    en: 'Good for groups'
  },
  
  business: {
    he: 'עסקי',
    en: 'Business dining'
  },
  
  // Atmosphere
  casual: {
    he: 'נינוח',
    en: 'Casual'
  },
  
  fancy: {
    he: 'מפואר',
    en: 'Fine dining'
  },
  
  cozy: {
    he: 'אינטימי',
    en: 'Cozy'
  },
  
  trendy: {
    he: 'טרנדי',
    en: 'Trendy'
  },
  
  // Service
  takeout: {
    he: 'טייק אווי',
    en: 'Takeout'
  },
  
  delivery: {
    he: 'משלוחים',
    en: 'Delivery'
  },
  
  outdoor: {
    he: 'ישיבה בחוץ',
    en: 'Outdoor seating'
  },
  
  // Quality
  highly_rated: {
    he: 'מדורג גבוה',
    en: 'Highly rated'
  },
  
  popular: {
    he: 'פופולרי',
    en: 'Popular'
  },
  
  hidden_gem: {
    he: 'אבן חן מוסתרת',
    en: 'Hidden gem'
  }
};

/**
 * Distance labels (for future use)
 * Currently using NEARBY only, but prepared for distance ranges
 */
export const DISTANCE_LABELS: Record<string, Record<SupportedLanguage, string>> = {
  very_close: {
    he: 'קרוב מאוד',
    en: 'Very close'
  },
  
  nearby: {
    he: 'קרוב',
    en: 'Nearby'
  },
  
  walkable: {
    he: 'הליכה קצרה',
    en: 'Short walk'
  },
  
  moderate: {
    he: 'מרחק בינוני',
    en: 'Moderate distance'
  },
  
  far: {
    he: 'רחוק',
    en: 'Far'
  }
};

/**
 * Get label for signal type in specified language
 * Falls back to English if language not found
 * 
 * @param signalType - Signal type to get label for
 * @param language - Language code (he/en)
 * @returns Localized label
 */
export function getSignalLabel(
  signalType: CardSignalType,
  language: SupportedLanguage = 'he'
): string {
  const labels = SIGNAL_LABELS[signalType];
  return labels?.[language] || labels?.en || signalType;
}

/**
 * Get intent match label in specified language
 * Returns generic "Good match" if specific intent not found
 * 
 * @param intentKey - Intent key (e.g., "breakfast", "family")
 * @param language - Language code (he/en)
 * @returns Localized intent label
 */
export function getIntentLabel(
  intentKey: string,
  language: SupportedLanguage = 'he'
): string {
  const labels = INTENT_LABELS[intentKey.toLowerCase()];
  if (labels) {
    return labels[language] || labels.en;
  }
  
  // Fallback to generic match label
  return SIGNAL_LABELS.INTENT_MATCH[language];
}

/**
 * Get distance label in specified language
 * 
 * @param distanceKey - Distance key (e.g., "nearby", "far")
 * @param language - Language code (he/en)
 * @returns Localized distance label
 */
export function getDistanceLabel(
  distanceKey: string,
  language: SupportedLanguage = 'he'
): string {
  const labels = DISTANCE_LABELS[distanceKey.toLowerCase()];
  if (labels) {
    return labels[language] || labels.en;
  }
  
  // Fallback to nearby
  return DISTANCE_LABELS['nearby'][language];
}

/**
 * Detect language from text (simple heuristic)
 * Returns 'he' if Hebrew characters detected, 'en' otherwise
 * 
 * @param text - Text to detect language from
 * @returns Language code (he/en)
 */
export function detectLanguage(text: string): SupportedLanguage {
  const hasHebrew = /[\u0590-\u05FF]/.test(text);
  return hasHebrew ? 'he' : 'en';
}
