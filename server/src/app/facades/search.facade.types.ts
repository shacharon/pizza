/**
 * Search Facade Type Definitions
 * Shared types for search facade modules
 */

import type { SearchFilters } from '../domain/types/search.types';

/**
 * Sort key enum for search results
 */
export type SortKey = 'BEST_MATCH' | 'CLOSEST' | 'RATING_DESC' | 'PRICE_ASC';

/**
 * View mode for search results
 */
export type ViewMode = 'LIST' | 'MAP';

/**
 * Polling configuration
 */
export interface PollingConfig {
  delayMs: number;           // Delay before starting polling
  fastIntervalBase: number;  // Base fast poll interval
  fastJitter: number;        // +/- jitter for fast polling
  slowInterval: number;      // Slow poll interval after backoff
  backoffAt: number;         // Switch to slow polling after this duration
  maxDuration: number;       // Stop polling after this total duration
}

/**
 * Default polling configuration
 */
export const DEFAULT_POLLING_CONFIG: PollingConfig = {
  delayMs: 2500,
  fastIntervalBase: 1400,
  fastJitter: 200,
  slowInterval: 4000,
  backoffAt: 12000,
  maxDuration: 45000
};

/**
 * Helper: Map chip ID to sort key
 */
export function mapChipToSortKey(chipId: string): SortKey {
  switch (chipId) {
    case 'sort_best_match':
    case 'best_match':
      return 'BEST_MATCH';
    case 'sort_closest':
    case 'closest':
      return 'CLOSEST';
    case 'sort_rating':
    case 'toprated':
      return 'RATING_DESC';
    case 'sort_price':
      return 'PRICE_ASC';
    default:
      return 'BEST_MATCH';
  }
}
