/**
 * i18n Types
 * Language support for deterministic services (chips, fallback messages)
 */

export type Lang = 'he' | 'en' | 'ar' | 'ru';

export type TranslationVars = Record<string, string | number>;

export interface Translations {
  // Chip labels
  chip: {
    delivery: string;
    budget: string;
    topRated: string;
    openNow: string;
    map: string;
    closest: string;
    takeout: string;
    romantic: string;
    family: string;
    nearby: string;
    expandSearch: string;
  };
  
  // Assistant fallback messages
  fallback: {
    noResults: string;
    noResultsTryExpand: string;
    geocodingFailed: string;
    geocodingFailedTryCity: string;
    foundPlaces: string;
    foundPlacesCanFilter: string;
    whatToDo: string;
    lowConfidence: string;
    apiError: string;
    timeout: string;
    quotaExceeded: string;
    liveDataUnavailable: string;
  };
  
  // Sort/filter actions
  action: {
    sortByRating: string;
    sortByPrice: string;
    sortByDistance: string;
    filterCheap: string;
    filterExpensive: string;
    showOnMap: string;
  };
}

/**
 * Normalize language code to supported Lang type
 */
export function normalizeLang(lang?: string): Lang {
  if (!lang) return 'en';
  
  const normalized = lang.toLowerCase().split('-')[0]; // 'he-IL' -> 'he'
  
  switch (normalized) {
    case 'he':
    case 'iw': // Old Hebrew code
      return 'he';
    case 'ar':
      return 'ar';
    case 'ru':
      return 'ru';
    case 'en':
    default:
      return 'en';
  }
}

/**
 * Get text direction for language
 */
export function getTextDirection(lang: Lang): 'rtl' | 'ltr' {
  return (lang === 'he' || lang === 'ar') ? 'rtl' : 'ltr';
}



