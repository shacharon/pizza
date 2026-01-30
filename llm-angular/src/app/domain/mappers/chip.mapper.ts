/**
 * Chip Mapper
 * Pure functions for mapping UI chips to search filters and sort keys
 * 
 * All functions are:
 * - Pure (no side effects)
 * - Deterministic (same input = same output)
 * - Easily testable
 */

import type { SearchFilters, RefinementChip } from '../types/search.types';

/**
 * Sort key enum for search results
 */
export type SortKey = 'BEST_MATCH' | 'CLOSEST' | 'RATING_DESC' | 'PRICE_ASC';

/**
 * Map chip ID to sort key
 * 
 * @param chipId - Chip identifier from UI
 * @returns Sort key for API
 * 
 * @example
 * mapChipToSortKey('sort_rating') // => 'RATING_DESC'
 * mapChipToSortKey('toprated') // => 'RATING_DESC'
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

/**
 * Build SearchFilters from active filter chip IDs
 * Parses chip.filter strings like "price<=2", "opennow", "delivery"
 * 
 * @param activeFilterIds - Set of active chip IDs
 * @param allChips - All available chips
 * @returns SearchFilters object for API
 * 
 * @example
 * buildSearchFilters(
 *   new Set(['opennow', 'price_2']),
 *   [
 *     { id: 'opennow', action: 'filter', filter: 'opennow' },
 *     { id: 'price_2', action: 'filter', filter: 'price<=2' }
 *   ]
 * )
 * // => { openNow: true, priceLevel: 2 }
 */
export function buildSearchFilters(
  activeFilterIds: Set<string>,
  allChips: RefinementChip[]
): SearchFilters {
  const filters: SearchFilters = {};

  for (const chipId of activeFilterIds) {
    const chip = allChips.find(c => c.id === chipId);
    if (!chip || chip.action !== 'filter') continue;

    const filterStr = chip.filter || '';

    // Parse filter string
    if (filterStr === 'opennow') {
      filters.openNow = true;
    } else if (filterStr === 'closednow') {
      filters.openNow = false;
    } else if (filterStr.startsWith('price<=')) {
      // Parse "price<=2" → priceLevel: 2
      const maxPrice = parseInt(filterStr.replace('price<=', ''), 10);
      if (!isNaN(maxPrice) && maxPrice >= 1 && maxPrice <= 4) {
        filters.priceLevel = maxPrice;
      }
    } else if (filterStr === 'delivery') {
      // Delivery is a mustHave constraint
      filters.mustHave = filters.mustHave || [];
      filters.mustHave.push('delivery');
    } else if (filterStr === 'kosher' || filterStr === 'vegan' || filterStr === 'glutenfree') {
      // Dietary constraints
      filters.dietary = filters.dietary || [];
      filters.dietary.push(filterStr);
    }
  }

  return filters;
}

/**
 * Parse a single filter string to its components
 * Helper for testing and debugging
 * 
 * @param filterStr - Filter string like "price<=2" or "opennow"
 * @returns Parsed filter components
 * 
 * @example
 * parseFilterString('price<=2') // => { type: 'price', operator: '<=', value: '2' }
 * parseFilterString('opennow') // => { type: 'opennow' }
 */
export function parseFilterString(filterStr: string): {
  type: string;
  operator?: string;
  value?: string;
} {
  if (filterStr.startsWith('price<=')) {
    return {
      type: 'price',
      operator: '<=',
      value: filterStr.replace('price<=', '')
    };
  }

  return { type: filterStr };
}
