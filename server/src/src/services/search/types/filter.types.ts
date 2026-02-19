/**
 * Filter and Search Parameter Type Definitions
 * Search modes, filters, and parameter types
 */

import type { Coordinates } from './restaurant.types.js';

export type SearchMode = 'textsearch' | 'nearbysearch' | 'findplace';

export type SearchGranularity = 'CITY' | 'STREET' | 'LANDMARK' | 'AREA';

export type Occasion = 'date' | 'friends' | 'family' | 'business' | 'casual' | 'any';

/**
 * Search parameters for PlacesProvider
 */
export interface SearchParams {
  query: string;
  location: Coordinates;
  radius?: number;
  language: string;  // Google Places API language (he or en)
  region?: string;    // Country code for biasing results (e.g., 'fr', 'il', 'us')

  filters: {
    openNow?: boolean;
    priceLevel?: number;
    dietary?: string[];
    mustHave?: string[];
  };

  mode?: SearchMode;
  pageSize?: number;
}
