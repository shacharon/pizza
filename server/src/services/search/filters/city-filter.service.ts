/**
 * City Filter Service
 * Lightweight post-filter for city-accurate results
 * 
 * Uses coordinate-based filtering (distance calculation)
 * - Within 10km: Definitely in the city
 * - 10-20km: Possibly suburbs/nearby (marked UNKNOWN)
 * - >20km: Different city (dropped)
 * 
 * Scales to any city in the world without maintenance.
 */

import type { RestaurantResult } from '../types/search.types.js';
import { logger } from '../../../lib/logger/structured-logger.js';

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
  cityMatchReason: 'WITHIN_CITY' | 'NEARBY_SUBURBS' | 'TOO_FAR' | 'UNKNOWN';
  distanceKm?: number;
  isNearbyFallback?: boolean;
}

export class CityFilterService {
  private readonly MIN_CITY_RESULTS: number;
  private readonly CITY_RADIUS_KM = 10;      // Definitely in city
  private readonly SUBURBS_RADIUS_KM = 20;   // Possibly suburbs

  constructor(minResults: number = 5) {
    this.MIN_CITY_RESULTS = minResults;
  }

  /**
   * Filter results by target city coordinates
   * Returns city-matched results, with fallback if too few
   * 
   * @param results - Raw restaurant results from provider
   * @param targetCity - Target city name (for logging only)
   * @param targetCoords - Target city center coordinates
   * @param strictMode - If true, only keep WITHIN_CITY results (no suburbs). Default false for backward compatibility.
   * @returns Filtered results with statistics
   */
  filter(
    results: RestaurantResult[],
    targetCity: string | undefined,
    targetCoords?: { lat: number; lng: number },
    strictMode: boolean = false
  ): CityFilterResult {
    // If no target coordinates specified, return all results (no filtering)
    if (!targetCoords) {
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

    // Apply coordinate-based city matching to each result
    for (const result of results) {
      const matchInfo = this.checkCityMatch(result, targetCoords);
      
      // Enrich result with match info (mutate in place)
      (result as any).cityMatch = matchInfo.cityMatch;
      (result as any).cityMatchReason = matchInfo.cityMatchReason;
      (result as any).distanceKm = matchInfo.distanceKm;

      // Keep results that are:
      // - Within city radius (definitely in city)
      // - In suburbs/nearby (benefit of the doubt) - ONLY if not in strict mode
      // In strict mode: drop all results outside city radius (used for explicit city queries)
      if (
        matchInfo.cityMatch ||
        (!strictMode && matchInfo.cityMatchReason === 'NEARBY_SUBURBS')
      ) {
        kept.push(result);
      } else {
        dropped.push(result);
        const reason = matchInfo.cityMatchReason;
        dropReasons[reason] = (dropReasons[reason] || 0) + 1;
      }
    }

    // Fallback: if too few kept, add some dropped marked as nearby
    // Skip fallback in strict mode (user explicitly wants ONLY this city)
    if (!strictMode && kept.length < this.MIN_CITY_RESULTS && dropped.length > 0) {
      const neededCount = Math.min(
        this.MIN_CITY_RESULTS - kept.length,
        dropped.length
      );
      
      logger.warn({ neededCount, targetCity }, '[CityFilterService] Fallback triggered - adding nearby results');
      
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
   * Check if a result is within the target city using coordinates
   * 
   * @param result - Restaurant result to check
   * @param targetCoords - Target city center coordinates
   * @returns Match information with distance
   */
  private checkCityMatch(
    result: RestaurantResult,
    targetCoords: { lat: number; lng: number }
  ): CityMatchInfo {
    // If result doesn't have coordinates, we can't verify
    if (!result.location || !result.location.lat || !result.location.lng) {
      return {
        cityMatch: false,
        cityMatchReason: 'UNKNOWN',
      };
    }

    // Calculate distance from city center to result
    const distanceKm = this.calculateDistance(
      targetCoords,
      result.location
    );

    // Within city radius (10km) - definitely in the city
    if (distanceKm <= this.CITY_RADIUS_KM) {
      return {
        cityMatch: true,
        cityMatchReason: 'WITHIN_CITY',
        distanceKm,
      };
    }

    // Within suburbs radius (10-20km) - possibly suburbs/nearby
    if (distanceKm <= this.SUBURBS_RADIUS_KM) {
      return {
        cityMatch: false,
        cityMatchReason: 'NEARBY_SUBURBS',
        distanceKm,
      };
    }

    // Too far away (>20km) - different city
    return {
      cityMatch: false,
      cityMatchReason: 'TOO_FAR',
      distanceKm,
    };
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * 
   * @param coord1 - First coordinate
   * @param coord2 - Second coordinate
   * @returns Distance in kilometers
   */
  private calculateDistance(
    coord1: { lat: number; lng: number },
    coord2: { lat: number; lng: number }
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRad(coord2.lat - coord1.lat);
    const dLng = this.toRad(coord2.lng - coord1.lng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(coord1.lat)) *
        Math.cos(this.toRad(coord2.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 10) / 10; // Round to 1 decimal place
  }

  /**
   * Convert degrees to radians
   */
  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Get filter statistics for logging
   */
  getStats(filterResult: CityFilterResult): string {
    const { stats } = filterResult;
    return `${stats.keptCount}/${stats.totalInput} kept (${stats.droppedCount} dropped)`;
  }
}

