/**
 * City Filter Service
 * Lightweight post-filter for city-accurate results
 * 
 * Implements a 3-tier matching strategy:
 * 1. Formatted address substring match (primary)
 * 2. Address components locality match (if available)
 * 3. Fallback mode if too few results
 */

import type { RestaurantResult } from '../types/search.types.js';

export interface CityFilterResult {
  kept: RestaurantResult[];
  dropped: RestaurantResult[];
  stats: {
    totalInput: number;
    keptCount: number;
    droppedCount: number;
    dropReasons: Record<string, number>;
  };
}

export interface CityMatchInfo {
  cityMatch: boolean;
  cityMatchReason: 'LOCALITY' | 'FORMATTED_ADDRESS' | 'UNKNOWN';
  isNearbyFallback?: boolean;
}

export class CityFilterService {
  private readonly MIN_CITY_RESULTS: number;

  constructor(minResults: number = 5) {
    this.MIN_CITY_RESULTS = minResults;
  }

  /**
   * Filter results by target city
   * Returns city-matched results, with fallback if too few
   * 
   * @param results - Raw restaurant results from provider
   * @param targetCity - Target city name (any language)
   * @returns Filtered results with statistics
   */
  filter(
    results: RestaurantResult[],
    targetCity: string | undefined
  ): CityFilterResult {
    // If no target city specified, return all results
    if (!targetCity) {
      return {
        kept: results,
        dropped: [],
        stats: {
          totalInput: results.length,
          keptCount: results.length,
          droppedCount: 0,
          dropReasons: {},
        },
      };
    }

    const kept: RestaurantResult[] = [];
    const dropped: RestaurantResult[] = [];
    const dropReasons: Record<string, number> = {};

    // Normalize target city for matching
    const normalizedTarget = this.normalizeCity(targetCity);

    // Apply city matching to each result
    for (const result of results) {
      const matchInfo = this.checkCityMatch(result, normalizedTarget);
      
      // Enrich result with match info (mutate in place)
      (result as any).cityMatch = matchInfo.cityMatch;
      (result as any).cityMatchReason = matchInfo.cityMatchReason;

      if (matchInfo.cityMatch) {
        kept.push(result);
      } else {
        dropped.push(result);
        const reason = matchInfo.cityMatchReason;
        dropReasons[reason] = (dropReasons[reason] || 0) + 1;
      }
    }

    // Fallback: if too few kept, add some dropped marked as nearby
    if (kept.length < this.MIN_CITY_RESULTS && dropped.length > 0) {
      const neededCount = Math.min(
        this.MIN_CITY_RESULTS - kept.length,
        dropped.length
      );
      
      console.log(`[CityFilterService] ⚠️ Fallback triggered: adding ${neededCount} nearby results`);
      
      for (let i = 0; i < neededCount; i++) {
        const fallbackResult = dropped[i];
        if (fallbackResult) {
          (fallbackResult as any).isNearbyFallback = true;
          (fallbackResult as any).cityMatch = true; // Mark as matched for UX
          kept.push(fallbackResult);
        }
      }
    }

    return {
      kept,
      dropped: dropped.slice(kept.length - (results.length - dropped.length)), // Only truly dropped ones
      stats: {
        totalInput: results.length,
        keptCount: kept.length,
        droppedCount: results.length - kept.length,
        dropReasons,
      },
    };
  }

  /**
   * Check if a result matches the target city
   * Uses formatted address as primary matching mechanism
   * 
   * @param result - Restaurant result to check
   * @param normalizedTarget - Normalized target city name
   * @returns Match information
   */
  private checkCityMatch(
    result: RestaurantResult,
    normalizedTarget: string
  ): CityMatchInfo {
    const address = result.address?.toLowerCase() || '';

    // Strategy 1: Check formatted address (simple substring)
    if (address.includes(normalizedTarget)) {
      return {
        cityMatch: true,
        cityMatchReason: 'FORMATTED_ADDRESS',
      };
    }

    // Strategy 2: TODO - Check address_components if available
    // For Phase 1, we rely on formatted_address only
    // Future enhancement: parse address_components for locality field

    // No match found
    return {
      cityMatch: false,
      cityMatchReason: 'UNKNOWN',
    };
  }

  /**
   * Normalize city name for matching
   * - Lowercase for case-insensitive comparison
   * - Trim whitespace
   * - Future: Handle common transliterations
   */
  private normalizeCity(city: string): string {
    return city.toLowerCase().trim();
  }

  /**
   * Get filter statistics for logging
   */
  getStats(filterResult: CityFilterResult): string {
    const { stats } = filterResult;
    return `${stats.keptCount}/${stats.totalInput} kept (${stats.droppedCount} dropped)`;
  }
}

