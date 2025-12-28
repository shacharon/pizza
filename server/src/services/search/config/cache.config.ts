/**
 * Cache Configuration
 * Phase 8: TTL policies for different cache types
 * 
 * All values in milliseconds
 */

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
    enabled: process.env.CACHE_INTENT === 'true', // Disabled by default (sensitive)
    ttl: parseInt(process.env.CACHE_INTENT_TTL || '600000'), // 10 minutes
    maxSize: parseInt(process.env.CACHE_INTENT_SIZE || '200'),
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
 * Build cache key for intent parsing
 * Includes session context to distinguish queries with different implicit filters
 */
export function buildIntentCacheKey(
  query: string, 
  language: string,
  sessionContext?: { language?: string; lastIntent?: any }
): string {
  const normalizedQuery = query.toLowerCase().trim();
  
  // Include a hash of relevant session context that affects intent parsing
  // This prevents cache hits when context has changed (e.g., previous filters)
  let contextHash = '';
  if (sessionContext?.lastIntent) {
    const relevantContext = {
      openNow: sessionContext.lastIntent.filters?.openNow,
      dietary: sessionContext.lastIntent.filters?.dietary
    };
    // Only include if there are actual filters
    if (relevantContext.openNow || relevantContext.dietary?.length) {
      contextHash = `:${JSON.stringify(relevantContext)}`;
    }
  }
  
  return `intent:${normalizedQuery}:${language}${contextHash}`;
}




