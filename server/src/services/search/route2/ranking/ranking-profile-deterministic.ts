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
  
  /** For logging only */
  requestId?: string;
}

/**
 * Profile weights configurations
 * Each profile has fixed, normalized weights (sum = 1.0)
 */
const PROFILE_WEIGHTS = {
  /**
   * DISTANCE_HEAVY: For proximity searches
   * Used when: route=NEARBY or intentReason indicates proximity
   */
  DISTANCE_HEAVY: {
    rating: 0.15,
    reviews: 0.10,
    distance: 0.65,
    openBoost: 0.10
  },
  
  /**
   * BALANCED: Default profile
   * Used when: No strong proximity signal
   */
  BALANCED: {
    rating: 0.30,
    reviews: 0.25,
    distance: 0.35,
    openBoost: 0.10
  },
  
  /**
   * NO_LOCATION: When user has no location
   * Distance weight = 0 (no distance available)
   */
  NO_LOCATION: {
    rating: 0.45,
    reviews: 0.45,
    distance: 0.00,
    openBoost: 0.10
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
 * Select ranking profile deterministically
 * 
 * Rules (in order of priority):
 * 1. No user location → NO_LOCATION profile (distance weight = 0)
 * 2. route = NEARBY → DISTANCE_HEAVY profile
 * 3. intentReason indicates proximity → DISTANCE_HEAVY profile
 * 4. Default → BALANCED profile
 * 
 * INVARIANT: Same inputs → identical outputs (no LLM, no query text analysis)
 */
export function selectRankingProfileDeterministic(
  ctx: DeterministicRankingContext
): RankingSelection {
  const { route, hasUserLocation, intentReason, requestId } = ctx;
  
  // Rule 1: No user location → can't use distance
  if (!hasUserLocation) {
    if (requestId) {
      logger.info({
        requestId,
        event: 'ranking_profile_selected',
        profile: 'NO_LOCATION',
        weights: PROFILE_WEIGHTS.NO_LOCATION,
        reason: 'no_user_location',
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
        route,
        source: 'deterministic'
      }, '[RANKING] Proximity intent detected - using DISTANCE_HEAVY profile');
    }
    
    return {
      profile: 'NEARBY',
      weights: PROFILE_WEIGHTS.DISTANCE_HEAVY
    };
  }
  
  // Rule 4: Default → balanced
  if (requestId) {
    logger.info({
      requestId,
      event: 'ranking_profile_selected',
      profile: 'BALANCED',
      weights: PROFILE_WEIGHTS.BALANCED,
      reason: 'default',
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
}): void {
  const sum = weights.rating + weights.reviews + weights.distance + weights.openBoost;
  const tolerance = 0.001;
  
  if (Math.abs(sum - 1.0) > tolerance) {
    throw new Error(`Weights must sum to 1.0 (got ${sum.toFixed(4)})`);
  }
  
  // Validate each weight is in [0, 1]
  const allWeights = [weights.rating, weights.reviews, weights.distance, weights.openBoost];
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
