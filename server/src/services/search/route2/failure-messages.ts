/**
 * Route2 Default Constants
 * Default values for filters when extraction fails
 * 
 * NOTE: Removed deterministic fallback message generators
 * All user-facing messages are now LLM-generated via assistant hooks
 */

import type { PreGoogleBaseFilters } from './shared/shared-filters.types.js';
import type { PostConstraints } from './shared/post-constraints.types.js';

/**
 * Default post-constraints (when extraction fails)
 */
export const DEFAULT_POST_CONSTRAINTS: PostConstraints = {
  openState: null,
  openAt: null,
  openBetween: null,
  priceLevel: null,
  isKosher: null,
  isGlutenFree: null,
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
