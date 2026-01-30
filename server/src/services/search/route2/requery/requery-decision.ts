/**
 * Requery Decision Logic - Route2
 * 
 * Pure deterministic function to decide if Google needs to be called again
 * when a user modifies their search request (e.g., changing filters).
 * 
 * Hard Filters (require Google requery):
 * - query text change
 * - route change (TEXTSEARCH ↔ NEARBY)
 * - location anchor change (city, region, userLocation)
 * - significant radius change (>50% increase)
 * - pool exhausted (not enough candidates after filtering)
 * 
 * Soft Filters (can reuse candidate pool):
 * - openNow / openAt / openBetween
 * - minRatingBucket
 * - minReviewCountBucket
 * - priceIntent / priceLevel
 * - dietary preferences (kosher, gluten-free)
 * - accessibility requirements
 */

import type { SearchRequest } from '../../types/search-request.dto.js';

export interface SearchContext {
  // Core query parameters
  query: string;
  route: 'NEARBY' | 'TEXTSEARCH';

  // Location anchors
  userLocation: { lat: number; lng: number } | null;
  cityText?: string;
  regionCode?: string;
  radiusMeters?: number;

  // Soft filters (can be applied post-fetch)
  openNow?: boolean;
  openAt?: { day: number; timeHHmm: string };
  openBetween?: { day: number; startHHmm: string; endHHmm: string };
  priceIntent?: string | null;
  priceLevel?: number | null;
  minRatingBucket?: string | null;
  minReviewCountBucket?: string | null;
  isKosher?: boolean | null;
  isGlutenFree?: boolean | null;
  dietary?: string[];
  accessible?: boolean | null;
  parking?: boolean | null;
}

export interface PoolStats {
  totalCandidates: number;
  afterSoftFilters: number;
  requestedLimit: number;
}

export interface RequeryDecision {
  doGoogle: boolean;
  reason: string;
  changeset?: {
    query?: boolean;
    route?: boolean;
    location?: boolean;
    radius?: boolean;
    softFilters?: string[];
  };
}

/**
 * Determine if Google needs to be called or if we can reuse candidate pool
 * 
 * @param prev Previous search context (null if first request)
 * @param next New search context
 * @param poolStats Stats about current candidate pool (null if no pool exists)
 * @returns Decision object with reasoning
 */
export function shouldRequeryGoogle(
  prev: SearchContext | null,
  next: SearchContext,
  poolStats: PoolStats | null
): RequeryDecision {
  // First request: always call Google
  if (!prev) {
    return {
      doGoogle: true,
      reason: 'first_request'
    };
  }

  // No candidate pool available: must call Google
  if (!poolStats || poolStats.totalCandidates === 0) {
    return {
      doGoogle: true,
      reason: 'no_candidate_pool'
    };
  }

  const changeset: NonNullable<RequeryDecision['changeset']> = {};

  // Check HARD filters (require Google requery)

  // 1. Query text changed
  if (prev.query !== next.query) {
    changeset.query = true;
    return {
      doGoogle: true,
      reason: 'query_changed',
      changeset
    };
  }

  // 2. Route changed (TEXTSEARCH ↔ NEARBY)
  if (prev.route !== next.route) {
    changeset.route = true;
    return {
      doGoogle: true,
      reason: 'route_changed',
      changeset
    };
  }

  // 3. Location anchor changed
  const locationChanged = hasLocationAnchorChanged(prev, next);
  if (locationChanged) {
    changeset.location = true;
    return {
      doGoogle: true,
      reason: 'location_anchor_changed',
      changeset
    };
  }

  // 4. Significant radius change (>50% increase)
  const radiusChanged = hasSignificantRadiusChange(prev, next);
  if (radiusChanged) {
    changeset.radius = true;
    return {
      doGoogle: true,
      reason: 'radius_changed_significantly',
      changeset
    };
  }

  // 5. Pool exhausted after soft filters
  const poolExhausted = isPoolExhausted(poolStats);
  if (poolExhausted) {
    return {
      doGoogle: true,
      reason: 'pool_exhausted_after_filters'
    };
  }

  // Check SOFT filters (can reuse pool)
  const softFiltersChanged = detectSoftFilterChanges(prev, next);

  if (softFiltersChanged.length > 0) {
    changeset.softFilters = softFiltersChanged;
    return {
      doGoogle: false,
      reason: 'soft_filters_only',
      changeset
    };
  }

  // No meaningful changes detected
  return {
    doGoogle: false,
    reason: 'no_changes_detected'
  };
}

/**
 * Check if location anchor changed significantly
 */
function hasLocationAnchorChanged(prev: SearchContext, next: SearchContext): boolean {
  // User location change
  const prevLoc = prev.userLocation;
  const nextLoc = next.userLocation;

  if (!!prevLoc !== !!nextLoc) {
    return true; // Presence changed
  }

  if (prevLoc && nextLoc) {
    const distance = haversineDistance(
      prevLoc.lat, prevLoc.lng,
      nextLoc.lat, nextLoc.lng
    );
    // Consider >500m as significant location change
    if (distance > 500) {
      return true;
    }
  }

  // City text change
  if (prev.cityText !== next.cityText) {
    return true;
  }

  // Region code change
  if (prev.regionCode !== next.regionCode) {
    return true;
  }

  return false;
}

/**
 * Check if radius changed significantly (>50% increase)
 */
function hasSignificantRadiusChange(prev: SearchContext, next: SearchContext): boolean {
  const prevRadius = prev.radiusMeters ?? 5000; // Default 5km
  const nextRadius = next.radiusMeters ?? 5000;

  const increase = nextRadius - prevRadius;
  const percentIncrease = (increase / prevRadius) * 100;

  return percentIncrease > 50;
}

/**
 * Check if pool is exhausted (not enough candidates after filtering)
 */
function isPoolExhausted(poolStats: PoolStats): boolean {
  // If we have fewer candidates after filtering than requested limit,
  // and we have very few candidates (< 5), consider pool exhausted
  if (poolStats.afterSoftFilters < poolStats.requestedLimit && poolStats.afterSoftFilters < 5) {
    return true;
  }

  // If we filtered down to 0 results, pool is exhausted
  if (poolStats.afterSoftFilters === 0) {
    return true;
  }

  return false;
}

/**
 * Detect which soft filters changed
 */
function detectSoftFilterChanges(prev: SearchContext, next: SearchContext): string[] {
  const changes: string[] = [];

  // Opening hours filters
  if (prev.openNow !== next.openNow) {
    changes.push('openNow');
  }
  if (JSON.stringify(prev.openAt) !== JSON.stringify(next.openAt)) {
    changes.push('openAt');
  }
  if (JSON.stringify(prev.openBetween) !== JSON.stringify(next.openBetween)) {
    changes.push('openBetween');
  }

  // Price filters
  if (prev.priceIntent !== next.priceIntent) {
    changes.push('priceIntent');
  }
  if (prev.priceLevel !== next.priceLevel) {
    changes.push('priceLevel');
  }

  // Rating filters
  if (prev.minRatingBucket !== next.minRatingBucket) {
    changes.push('minRatingBucket');
  }
  if (prev.minReviewCountBucket !== next.minReviewCountBucket) {
    changes.push('minReviewCountBucket');
  }

  // Dietary filters
  if (prev.isKosher !== next.isKosher) {
    changes.push('isKosher');
  }
  if (prev.isGlutenFree !== next.isGlutenFree) {
    changes.push('isGlutenFree');
  }
  if (JSON.stringify(prev.dietary) !== JSON.stringify(next.dietary)) {
    changes.push('dietary');
  }

  // Accessibility filters
  if (prev.accessible !== next.accessible) {
    changes.push('accessible');
  }
  if (prev.parking !== next.parking) {
    changes.push('parking');
  }

  return changes;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
