/**
 * Cache Configuration
 * Phase 8: TTL policies for different cache types
 * Intent Performance Policy: Fast path + cache + LLM fallback
 * 
 * All values in milliseconds
 */

// Intent parsing mode flags
const DEV_INTENT_MODE = process.env.DEV_INTENT_MODE === 'true';
const INTENT_FAST_PATH_ENABLED = process.env.INTENT_FAST_PATH !== 'false'; // Enabled by default

// TTL based on mode
const getIntentTTL = () => {
  if (DEV_INTENT_MODE) {
    return parseInt(process.env.CACHE_INTENT_TTL_DEV_MS || '30000'); // 30s in dev
  }
  return parseInt(process.env.CACHE_INTENT_TTL || '600000'); // 10min in prod
};

// Intent cache enabled unless explicitly disabled in dev mode
const isIntentCacheEnabled = () => {
  if (DEV_INTENT_MODE && process.env.CACHE_INTENT_IN_DEV === 'false') {
    return false; // Dev mode can disable cache
  }
  return process.env.CACHE_INTENT !== 'false'; // Enabled by default now
};

export interface CacheConfigType {
  geocoding: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
  placesSearch: {
    enabled: boolean;
    ttlStatic: number;
    ttlLiveData: number;
    maxSize: number;
  };
  ranking: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
  intentParsing: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
    fastPathEnabled: boolean;
  };
  assistantNarration: {
    enabled: boolean;
    ttlNormal: number;
    ttlRecovery: number;
    maxSize: number;
  };
}

export const CacheConfig: CacheConfigType = {
  geocoding: {
    enabled: process.env.CACHE_GEOCODING !== 'false',
    ttl: parseInt(process.env.CACHE_GEOCODING_TTL || '86400000'), // 24 hours
    maxSize: parseInt(process.env.CACHE_GEOCODING_SIZE || '500'),
  },
  placesSearch: {
    enabled: process.env.CACHE_PLACES !== 'false',
    ttlStatic: parseInt(process.env.CACHE_PLACES_TTL_STATIC || '3600000'), // 1 hour
    ttlLiveData: parseInt(process.env.CACHE_PLACES_TTL_LIVE || '300000'), // 5 minutes
    maxSize: parseInt(process.env.CACHE_PLACES_SIZE || '1000'),
  },
  ranking: {
    enabled: process.env.CACHE_RANKING !== 'false',
    ttl: parseInt(process.env.CACHE_RANKING_TTL || '900000'), // 15 minutes
    maxSize: parseInt(process.env.CACHE_RANKING_SIZE || '500'),
  },
  intentParsing: {
    enabled: isIntentCacheEnabled(),
    ttl: getIntentTTL(),
    maxSize: parseInt(process.env.CACHE_INTENT_SIZE || '200'),
    fastPathEnabled: INTENT_FAST_PATH_ENABLED,
  },
  assistantNarration: {
    enabled: process.env.CACHE_ASSISTANT !== 'false',
    ttlNormal: parseInt(process.env.CACHE_ASSISTANT_TTL_NORMAL || '1800000'), // 30 min
    ttlRecovery: parseInt(process.env.CACHE_ASSISTANT_TTL_RECOVERY || '600000'), // 10 min
    maxSize: parseInt(process.env.CACHE_ASSISTANT_SIZE || '200'),
  },
};

/**
 * Get TTL for places search based on whether live data is requested
 */
export function getPlacesSearchTTL(requiresLiveData: boolean): number {
  if (!CacheConfig.placesSearch.enabled) {
    return 0;
  }
  
  return requiresLiveData
    ? CacheConfig.placesSearch.ttlLiveData
    : CacheConfig.placesSearch.ttlStatic;
}

/**
 * Build cache key for geocoding
 */
export function buildGeocodingCacheKey(location: string | { lat: number; lng: number }): string {
  if (typeof location === 'string') {
    return `geo:${location.toLowerCase().trim()}`;
  }
  return `geo:${location.lat.toFixed(4)},${location.lng.toFixed(4)}`;
}

/**
 * Build cache key for places search
 */
export function buildPlacesSearchCacheKey(
  query: string,
  location: { lat: number; lng: number },
  radius: number,
  language: string,
  liveDataRequested: boolean
): string {
  const normalizedQuery = query.toLowerCase().trim();
  const lat = location.lat.toFixed(4);
  const lng = location.lng.toFixed(4);
  
  return `places:${normalizedQuery}:${lat},${lng}:${radius}:${language}:${liveDataRequested}`;
}

/**
 * Build cache key for ranking
 */
export function buildRankingCacheKey(
  resultsHash: string,
  intentHash: string
): string {
  return `rank:${resultsHash}:${intentHash}`;
}

/**
 * Build cache key for intent parsing with robust normalization
 * v2: Adds punctuation removal, space collapse, geo bucket
 * Includes session context to distinguish queries with different implicit filters
 */
export function buildIntentCacheKey(
  query: string, 
  language: string,
  sessionContext?: { language?: string; lastIntent?: any; currentCity?: string }
): string {
  // Aggressive normalization
  let normalized = query.toLowerCase().trim();
  
  // Remove common punctuation
  normalized = normalized.replace(/[?.!,;:]/g, ' ');
  
  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Geo bucket (coarse location for cache stability)
  let geoBucket = 'unknown';
  if (sessionContext?.currentCity) {
    geoBucket = sessionContext.currentCity.toLowerCase().trim();
  } else if (sessionContext?.lastIntent?.location?.city) {
    geoBucket = sessionContext.lastIntent.location.city.toLowerCase().trim();
  }
  
  // Include session context hash only if relevant filters exist
  let contextHash = '';
  if (sessionContext?.lastIntent) {
    const relevantContext = {
      openNow: sessionContext.lastIntent.filters?.openNow,
      dietary: sessionContext.lastIntent.filters?.dietary
    };
    if (relevantContext.openNow || relevantContext.dietary?.length) {
      contextHash = `:ctx:${JSON.stringify(relevantContext)}`;
    }
  }
  
  return `intent:v2:${language}:${geoBucket}:${normalized}${contextHash}`;
}




