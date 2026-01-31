/**
 * Deterministic Ranking Profile Selector
 * 
 * LANGUAGE-INDEPENDENT: Profile selection based ONLY on:
 * - Route type (NEARBY, TEXTSEARCH, LANDMARK)
 * - User location availability
 * - Query intent reason (explicit_city_mentioned, etc.)
 * 
 * NEVER uses query text analysis or LLM interpretation.
 * 
 * INVARIANTS:
 * 1. Same route + hasUserLocation + intentReason → same profile + weights
 * 2. assistantLanguage/queryLanguage have ZERO effect on profile selection
 * 3. All weights sum to exactly 1.0
 */

import type { MappingRoute } from '../types.js';
import type { RankingSelection } from './ranking-profile.schema.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Context for deterministic profile selection
 * LANGUAGE-INDEPENDENT: No query text, only structured intent
 */
export interface DeterministicRankingContext {
  /** Route type from intent stage */
  route: MappingRoute;

  /** User location availability (from GPS/IP) */
  hasUserLocation: boolean;

  /** Intent reason (for proximity detection) */
  intentReason?: string;

  /** Cuisine key from TEXTSEARCH mapping (if cuisine detected) */
  cuisineKey?: string | null;

  /** For logging only */
  requestId?: string;
}

/**
 * Profile weights configurations
 * Each profile has fixed, normalized weights (sum = 1.0)
 * cuisineMatch weight added for score-only cuisine filtering
 */
const PROFILE_WEIGHTS = {
  /**
   * DISTANCE_HEAVY: For proximity searches
   * Used when: route=NEARBY or intentReason indicates proximity
   */
  DISTANCE_HEAVY: {
    rating: 0.15,
    reviews: 0.08,
    distance: 0.62,
    openBoost: 0.10,
    cuisineMatch: 0.05  // Small weight - distance is primary
  },

  /**
   * BALANCED: Default profile
   * Used when: No strong proximity signal
   */
  BALANCED: {
    rating: 0.25,
    reviews: 0.20,
    distance: 0.30,
    openBoost: 0.10,
    cuisineMatch: 0.15  // Moderate weight for balanced queries
  },

  /**
   * CUISINE_FOCUSED: For specific cuisine searches
   * Used when: cuisineKey is present (e.g., Italian, Japanese, etc.)
   * Higher cuisineMatch weight for explicit cuisine queries
   */
  CUISINE_FOCUSED: {
    rating: 0.30,
    reviews: 0.25,
    distance: 0.20,
    openBoost: 0.05,
    cuisineMatch: 0.20  // Higher weight for cuisine-specific queries
  },

  /**
   * QUALITY_FOCUSED: For fine dining, romantic, or special occasion queries
   * Used when: cuisineKey indicates quality intent (fine_dining, etc.)
   * Highest rating/reviews weight to prioritize best experiences
   */
  QUALITY_FOCUSED: {
    rating: 0.35,
    reviews: 0.30,
    distance: 0.15,
    openBoost: 0.05,
    cuisineMatch: 0.15  // Moderate weight - quality is primary
  },

  /**
   * NO_LOCATION: When user has no location
   * Distance weight = 0 (no distance available)
   */
  NO_LOCATION: {
    rating: 0.40,
    reviews: 0.35,
    distance: 0.00,
    openBoost: 0.10,
    cuisineMatch: 0.15  // Moderate weight
  }
} as const;

/**
 * Intent reasons that indicate proximity search
 * These are language-independent signals from intent stage
 */
const PROXIMITY_INTENT_REASONS = [
  'nearby_intent',           // Explicit "near me" detected
  'proximity_keywords',      // "close", "around", etc.
  'small_radius_detected',   // User specified small radius
  'user_location_primary'    // Location is primary search anchor
];

/**
 * Cuisine keys that indicate quality/occasion intent
 * These cuisines typically imply user wants high-quality experience
 */
const QUALITY_CUISINE_KEYS = [
  'fine_dining',
  'french',
  'mediterranean'
];

/**
 * Check if cuisineKey indicates quality/occasion intent
 */
function isQualityCuisine(cuisineKey: string | null | undefined): boolean {
  if (!cuisineKey) return false;
  return QUALITY_CUISINE_KEYS.includes(cuisineKey);
}

/**
 * Select ranking profile deterministically
 * 
 * Rules (in order of priority):
 * 1. No user location → NO_LOCATION profile (distance weight = 0)
 * 2. route = NEARBY → DISTANCE_HEAVY profile
 * 3. intentReason indicates proximity → DISTANCE_HEAVY profile
 * 4. cuisineKey indicates quality intent → QUALITY_FOCUSED profile
 * 5. cuisineKey present → CUISINE_FOCUSED profile
 * 6. Default → BALANCED profile
 * 
 * INVARIANT: Same inputs → identical outputs (no LLM, no query text analysis)
 */
export function selectRankingProfileDeterministic(
  ctx: DeterministicRankingContext
): RankingSelection {
  const { route, hasUserLocation, intentReason, cuisineKey, requestId } = ctx;

  // Rule 1: No user location → can't use distance
  if (!hasUserLocation) {
    if (requestId) {
      logger.info({
        requestId,
        event: 'ranking_profile_selected',
        profile: 'NO_LOCATION',
        weights: PROFILE_WEIGHTS.NO_LOCATION,
        reason: 'no_user_location',
        cuisineKey: cuisineKey ?? null,
        route,
        source: 'deterministic'
      }, '[RANKING] No user location - using NO_LOCATION profile (distance weight = 0)');
    }

    return {
      profile: 'BALANCED',  // Use BALANCED as profile name (for compatibility)
      weights: PROFILE_WEIGHTS.NO_LOCATION
    };
  }

  // Rule 2: route = NEARBY → distance-heavy
  if (route === 'NEARBY') {
    if (requestId) {
      logger.info({
        requestId,
        event: 'ranking_profile_selected',
        profile: 'NEARBY',
        weights: PROFILE_WEIGHTS.DISTANCE_HEAVY,
        reason: 'route_nearby',
        cuisineKey: cuisineKey ?? null,
        route,
        source: 'deterministic'
      }, '[RANKING] Route is NEARBY - using DISTANCE_HEAVY profile');
    }

    return {
      profile: 'NEARBY',
      weights: PROFILE_WEIGHTS.DISTANCE_HEAVY
    };
  }

  // Rule 3: Proximity intent detected → distance-heavy
  if (intentReason && PROXIMITY_INTENT_REASONS.includes(intentReason)) {
    if (requestId) {
      logger.info({
        requestId,
        event: 'ranking_profile_selected',
        profile: 'NEARBY',
        weights: PROFILE_WEIGHTS.DISTANCE_HEAVY,
        reason: 'proximity_intent',
        intentReason,
        cuisineKey: cuisineKey ?? null,
        route,
        source: 'deterministic'
      }, '[RANKING] Proximity intent detected - using DISTANCE_HEAVY profile');
    }

    return {
      profile: 'NEARBY',
      weights: PROFILE_WEIGHTS.DISTANCE_HEAVY
    };
  }

  // Rule 4: Quality cuisine detected → quality-focused
  if (isQualityCuisine(cuisineKey)) {
    if (requestId) {
      logger.info({
        requestId,
        event: 'ranking_profile_selected',
        profile: 'QUALITY',
        weights: PROFILE_WEIGHTS.QUALITY_FOCUSED,
        reason: 'quality_cuisine',
        cuisineKey: cuisineKey ?? null,
        route,
        source: 'deterministic'
      }, '[RANKING] Quality cuisine detected - using QUALITY_FOCUSED profile');
    }

    return {
      profile: 'QUALITY',
      weights: PROFILE_WEIGHTS.QUALITY_FOCUSED
    };
  }

  // Rule 5: Cuisine key present → cuisine-focused
  if (cuisineKey) {
    if (requestId) {
      logger.info({
        requestId,
        event: 'ranking_profile_selected',
        profile: 'CUISINE',
        weights: PROFILE_WEIGHTS.CUISINE_FOCUSED,
        reason: 'cuisine_detected',
        cuisineKey,
        route,
        source: 'deterministic'
      }, '[RANKING] Cuisine detected - using CUISINE_FOCUSED profile');
    }

    return {
      profile: 'CUISINE',
      weights: PROFILE_WEIGHTS.CUISINE_FOCUSED
    };
  }

  // Rule 6: Default → balanced
  if (requestId) {
    logger.info({
      requestId,
      event: 'ranking_profile_selected',
      profile: 'BALANCED',
      weights: PROFILE_WEIGHTS.BALANCED,
      reason: 'default',
      cuisineKey: null,
      route,
      intentReason: intentReason ?? null,
      source: 'deterministic'
    }, '[RANKING] No strong signals - using BALANCED profile');
  }

  return {
    profile: 'BALANCED',
    weights: PROFILE_WEIGHTS.BALANCED
  };
}

/**
 * Validate that weights sum to 1.0 (within rounding tolerance)
 * Throws if invalid
 */
export function validateWeights(weights: {
  rating: number;
  reviews: number;
  distance: number;
  openBoost: number;
  cuisineMatch?: number;
}): void {
  const sum = weights.rating + weights.reviews + weights.distance + weights.openBoost + (weights.cuisineMatch || 0);
  const tolerance = 0.001;

  if (Math.abs(sum - 1.0) > tolerance) {
    throw new Error(`Weights must sum to 1.0 (got ${sum.toFixed(4)})`);
  }

  // Validate each weight is in [0, 1]
  const allWeights = [weights.rating, weights.reviews, weights.distance, weights.openBoost, weights.cuisineMatch || 0];
  for (const w of allWeights) {
    if (w < 0 || w > 1) {
      throw new Error(`Weight must be in [0, 1] (got ${w})`);
    }
  }
}

/**
 * Get all profile weights (for testing/validation)
 */
export function getAllProfileWeights() {
  return PROFILE_WEIGHTS;
}

/**
 * Validate all predefined profile weights
 * Call this at startup to ensure integrity
 */
export function validateAllProfiles(): void {
  for (const [profileName, weights] of Object.entries(PROFILE_WEIGHTS)) {
    try {
      validateWeights(weights);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Profile ${profileName} has invalid weights: ${msg}`);
    }
  }
}

// Validate profiles on module load (fail fast)
validateAllProfiles();
