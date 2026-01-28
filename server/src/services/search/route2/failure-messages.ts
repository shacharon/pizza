/**
 * Route2 Failure Messages
 * Fallback error messages and default constants
 */

import type { PreGoogleBaseFilters } from './shared/shared-filters.types.js';
import type { PostConstraints } from './shared/post-constraints.types.js';

/**
 * Generate fallback assistant message for pipeline failures
 */
export function generateFailureFallbackMessage(errorKind: string | undefined, error: unknown): {
  message: string;
  suggestedAction: string | null;
} {
  const errorMsg = error instanceof Error ? error.message : 'unknown error';
  
  switch (errorKind) {
    case 'DNS_FAIL':
      return {
        message: 'אנחנו נתקלים בבעיה בחיבור לשרתים. אנא נסה שוב בעוד מספר דקות.',
        suggestedAction: 'retry'
      };
      
    case 'TIMEOUT':
      return {
        message: 'החיפוש לוקח יותר זמן מהרגיל. אנא נסה שוב עם חיפוש ספציפי יותר.',
        suggestedAction: 'refine_query'
      };
      
    case 'NETWORK_ERROR':
      return {
        message: 'יש לנו בעיה זמנית בחיבור לשירות. נסה שוב בעוד רגע.',
        suggestedAction: 'retry'
      };
      
    case 'HTTP_ERROR':
      if (errorMsg.includes('403') || errorMsg.includes('401')) {
        return {
          message: 'יש לנו בעיה זמנית בגישה לשירות החיפוש. אנחנו עובדים על זה.',
          suggestedAction: null
        };
      }
      return {
        message: 'החיפוש נתקל בבעיה. אנא נסה שוב.',
        suggestedAction: 'retry'
      };
      
    default:
      return {
        message: 'משהו השתבש בחיפוש. אנא נסה שוב או שנה את החיפוש.',
        suggestedAction: 'retry'
      };
  }
}

/**
 * Default post-constraints (when extraction fails)
 */
export const DEFAULT_POST_CONSTRAINTS: PostConstraints = {
  openState: null,
  openAt: null,
  openBetween: null,
  priceLevel: null,
  isKosher: null,
  requirements: { accessible: null, parking: null }
};

/**
 * Default base filters (when extraction fails)
 */
export const DEFAULT_BASE_FILTERS: PreGoogleBaseFilters = {
  language: 'he',
  openState: null,
  openAt: null,
  openBetween: null,
  regionHint: null
};
