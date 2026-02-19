/**
 * Opening Hours Summary Utility
 * Calculate open/closed/unknown statistics from restaurant results
 */

import type { RestaurantResult } from '../types/search.types.js';

export interface OpenNowSummary {
  open: number;
  closed: number;
  unknown: number;
  total: number;
}

/**
 * Calculate summary of opening hours status across all results
 * MUST be called BEFORE any filtering to get accurate counts
 * 
 * @param results - Array of restaurant results
 * @returns Summary with open/closed/unknown counts
 */
export function calculateOpenNowSummary(results: RestaurantResult[]): OpenNowSummary {
  const summary: OpenNowSummary = {
    open: 0,
    closed: 0,
    unknown: 0,
    total: results.length
  };
  
  results.forEach(restaurant => {
    if (restaurant.openNow === true) {
      summary.open++;
    } else if (restaurant.openNow === false) {
      summary.closed++;
    } else {
      // undefined or null means unknown
      summary.unknown++;
    }
  });
  
  return summary;
}

