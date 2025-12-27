/**
 * Central configuration for the unified search BFF
 * All "magic numbers" and hardcoded values should live here
 */

export interface ConfidenceWeights {
  base: number;
  hasQuery: number;
  hasLocation: number;
  hasFilters: number;
  isVague: number;
  hasContext: number;
  vagueQueryLength: number;
}

export interface RankingConfig {
  weights: {
    rating: number;
    reviewCount: number;
    priceMatch: number;
    openNow: number;
    distance: number;  // Phase 3: Weight for distance-based scoring
  };
  thresholds: {
    highlyRated: number;
    highlyRatedBonus: number;
    popularReviews: number;
    weakMatch: number;  // Phase 3: Score below this = weak match
    minViableScore: number;  // Phase 3: Minimum score to show
  };
  scoring: {
    maxRawScore: number;  // Phase 3: Expected max before normalization
    distanceMaxKm: number;  // Phase 3: Distance beyond which score = 0
  };
}

export interface SessionConfig {
  ttlMs: number;
  cleanupIntervalMs: number;
  maxHistoryLength: number;
}

export interface PlacesConfig {
  defaultRadius: number;
  photoMaxWidth: number;
  defaultLanguage: string;
  pageSize: number;
}

export interface GeoConfig {
  defaultLanguage: string;
  fallbackCoords: {
    lat: number;
    lng: number;
  };
}

export interface StreetSearchConfig {
  exactRadius: number;
  nearbyRadius: number;
  minExactResults: number;
  minNearbyResults: number;
}

/**
 * Search Configuration
 * Can be overridden via environment variables or constructor injection
 */
export const SearchConfig = {
  /**
   * Confidence scoring weights for intent parsing
   * Used to determine when to show assist UI
   */
  confidence: {
    base: 0.5,              // Starting confidence
    hasQuery: 0.2,          // Boost if query has food type
    hasLocation: 0.2,       // Boost if location specified
    hasFilters: 0.1,        // Boost if additional filters present
    isVague: -0.2,          // Penalty for very short queries
    hasContext: 0.1,        // Boost if this is a refinement
    vagueQueryLength: 5,    // Threshold for "vague" query
  } as ConfidenceWeights,

  /**
   * Ranking algorithm configuration
   * Weights determine importance of each factor
   * Phase 3: Enhanced with distance scoring and weak match detection
   */
  ranking: {
    weights: {
      rating: 10,           // Weight for restaurant rating (0-5 stars)
      reviewCount: 5,       // Weight for number of reviews (logarithmic)
      priceMatch: 3,        // Penalty per price level difference
      openNow: 20,          // Boost/penalty for open status
      distance: 8,          // Phase 3: Weight for distance-based scoring
    },
    thresholds: {
      highlyRated: 4.5,     // Minimum rating for "highly rated" badge
      highlyRatedBonus: 5,  // Extra score for highly rated restaurants
      popularReviews: 100,  // Minimum reviews for "popular" badge
      weakMatch: 30,        // Phase 3: Score < 30 = weak match
      minViableScore: 10,   // Phase 3: Score < 10 = filter out
    },
    scoring: {
      maxRawScore: 100,     // Phase 3: Expected max before normalization
      distanceMaxKm: 5,     // Phase 3: Distance beyond which score = 0 (5km)
    },
  } as RankingConfig,

  /**
   * Session management configuration
   */
  session: {
    ttlMs: 30 * 60 * 1000,           // 30 minutes session lifetime
    cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes cleanup interval
    maxHistoryLength: 5,              // Keep last 5 queries in history
  } as SessionConfig,

  /**
   * Places provider configuration
   */
  places: {
    defaultRadius: 3000,    // 3km default search radius (tighter city searches)
    photoMaxWidth: 400,     // Photo width for thumbnails
    defaultLanguage: 'en',  // Fallback language
    pageSize: 10,           // Results per page
  } as PlacesConfig,

  /**
   * Geocoding configuration
   */
  geo: {
    defaultLanguage: 'en',  // Default language for geocoding
    fallbackCoords: {       // Fallback if geocoding fails
      lat: 0,
      lng: 0,
    },
  } as GeoConfig,

  /**
   * Street-specific search configuration
   * For queries targeting a specific street (e.g., "pizza on broadway")
   */
  streetSearch: {
    exactRadius: 200,        // 200m for "on street" results
    nearbyRadius: 400,       // 400m for "nearby" results
    minExactResults: 3,      // Min exact results before showing nearby
    minNearbyResults: 5,     // Min total results before expansion
  } as StreetSearchConfig,
};

/**
 * Create a custom config by merging with defaults
 * Useful for testing or environment-specific overrides
 */
export function createSearchConfig(overrides?: {
  confidence?: Partial<ConfidenceWeights>;
  ranking?: Partial<RankingConfig>;
  session?: Partial<SessionConfig>;
  places?: Partial<PlacesConfig>;
  geo?: Partial<GeoConfig>;
  streetSearch?: Partial<StreetSearchConfig>;
}): typeof SearchConfig {
  return {
    confidence: { ...SearchConfig.confidence, ...overrides?.confidence },
    ranking: {
      weights: { ...SearchConfig.ranking.weights, ...overrides?.ranking?.weights },
      thresholds: { ...SearchConfig.ranking.thresholds, ...overrides?.ranking?.thresholds },
    },
    session: { ...SearchConfig.session, ...overrides?.session },
    places: { ...SearchConfig.places, ...overrides?.places },
    geo: { ...SearchConfig.geo, ...overrides?.geo },
    streetSearch: { ...SearchConfig.streetSearch, ...overrides?.streetSearch },
  };
}

/**
 * Load config from environment variables (optional)
 */
export function loadSearchConfigFromEnv(): typeof SearchConfig {
  const config = { ...SearchConfig };

  // Example: Override from environment
  if (process.env.SEARCH_SESSION_TTL_MS) {
    config.session.ttlMs = parseInt(process.env.SEARCH_SESSION_TTL_MS, 10);
  }

  if (process.env.SEARCH_DEFAULT_RADIUS) {
    config.places.defaultRadius = parseInt(process.env.SEARCH_DEFAULT_RADIUS, 10);
  }

  return config;
}

