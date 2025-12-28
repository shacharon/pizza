/**
 * Geocoding Service
 * Validates city names and addresses using Google Geocoding API
 * Implements two-step validation: LLM extracts candidate → Geocoding verifies
 * 
 * Phase 8: Enhanced with centralized cache manager
 */

import { caches } from '../../../lib/cache/cache-manager.js';
import { CacheConfig, buildGeocodingCacheKey } from '../config/cache.config.js';

export interface Coordinates {
  lat: number;
  lng: number;
}

export type GeocodingStatus = 'VERIFIED' | 'FAILED' | 'AMBIGUOUS';

export interface GeocodingCandidate {
  name: string;
  displayName: string;
  coordinates: Coordinates;
  countryCode?: string;
  confidence: number;
}

export interface GeocodingResult {
  status: GeocodingStatus;
  coordinates?: Coordinates;
  displayName?: string;
  countryCode?: string;
  confidence: number;
  candidates?: GeocodingCandidate[];
  cacheHit?: boolean;
}

/**
 * GeocodingService
 * Validates city names using external geocoding APIs with caching
 * Phase 8: Migrated to centralized cache manager
 */
export class GeocodingService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/geocode/json';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Validate a city name
   * Returns VERIFIED if found, FAILED if not found, AMBIGUOUS if multiple matches
   * Phase 8: Using centralized cache manager
   */
  async validateCity(
    cityCandidate: string,
    countryHint?: string
  ): Promise<GeocodingResult> {
    // Phase 8: Use centralized cache key builder
    const cacheKey = buildGeocodingCacheKey(
      countryHint ? `${cityCandidate}|${countryHint}` : cityCandidate
    );
    
    // Check cache first (Phase 8: centralized cache)
    if (CacheConfig.geocoding.enabled) {
      const cached = caches.geocoding.get(cacheKey);
      if (cached) {
        console.log(`[GeocodingService] Cache hit for "${cityCandidate}"`);
        return { ...cached, cacheHit: true };
      }
    }

    console.log(`[GeocodingService] Validating city: "${cityCandidate}" (country: ${countryHint || 'any'})`);

    try {
      const result = await this.geocodeCity(cityCandidate, countryHint);
      
      // Cache successful results (Phase 8: centralized cache)
      if (CacheConfig.geocoding.enabled) {
        caches.geocoding.set(cacheKey, result, CacheConfig.geocoding.ttl);
      }

      return result;
    } catch (error) {
      console.error(`[GeocodingService] Validation failed:`, error);
      
      // Don't cache API errors (REQUEST_DENIED, OVER_QUERY_LIMIT, etc.)
      // This allows the system to retry when the API becomes available
      // Just throw the error so caller can handle it gracefully
      throw error;
    }
  }

  /**
   * Geocode a city using Google Geocoding API
   */
  private async geocodeCity(
    cityCandidate: string,
    countryHint?: string
  ): Promise<GeocodingResult> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('address', cityCandidate);
    url.searchParams.set('key', this.apiKey);
    
    // Add country bias if provided
    if (countryHint) {
      url.searchParams.set('components', `country:${countryHint}`);
    }
    
    // Type filter: only cities/localities
    url.searchParams.set('result_type', 'locality|administrative_area_level_1|administrative_area_level_2');

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status === 'ZERO_RESULTS') {
      return {
        status: 'FAILED',
        confidence: 0
      };
    }

      // Handle API errors gracefully
      if (data.status === 'REQUEST_DENIED') {
        console.warn(`[GeocodingService] ⚠️ Geocoding API key invalid or missing`);
        throw new Error('Geocoding API key invalid - proceeding without validation');
      }

      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        return {
          status: 'FAILED',
          confidence: 0
        };
      }

    const results = data.results;

    // Single match = VERIFIED
    if (results.length === 1) {
      const location = results[0].geometry.location;
      const addressComponents = results[0].address_components || [];
      const countryComponent = addressComponents.find((c: any) => c.types.includes('country'));

      return {
        status: 'VERIFIED',
        coordinates: {
          lat: location.lat,
          lng: location.lng
        },
        displayName: results[0].formatted_address,
        countryCode: countryComponent?.short_name,
        confidence: 1.0
      };
    }

    // Multiple matches = AMBIGUOUS (need clarification)
    const candidates: GeocodingCandidate[] = results.slice(0, 5).map((r: any) => {
      const location = r.geometry.location;
      const addressComponents = r.address_components || [];
      const countryComponent = addressComponents.find((c: any) => c.types.includes('country'));
      
      return {
        name: cityCandidate,
        displayName: r.formatted_address,
        coordinates: { lat: location.lat, lng: location.lng },
        countryCode: countryComponent?.short_name,
        confidence: 0.8 // High but not certain
      };
    });

    return {
      status: 'AMBIGUOUS',
      confidence: 0.5,
      candidates
    };
  }

  /**
   * General geocoding (for addresses, landmarks, etc.)
   * Phase 8: Using centralized cache manager
   */
  async geocode(address: string): Promise<GeocodingResult> {
    const cacheKey = buildGeocodingCacheKey(address);
    
    // Check cache (Phase 8)
    if (CacheConfig.geocoding.enabled) {
      const cached = caches.geocoding.get(cacheKey);
      if (cached) {
        console.log(`[GeocodingService] Cache hit for address: "${address}"`);
        return { ...cached, cacheHit: true };
      }
    }

    console.log(`[GeocodingService] Geocoding address: "${address}"`);

    try {
      const url = new URL(this.baseUrl);
      url.searchParams.set('address', address);
      url.searchParams.set('key', this.apiKey);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        return {
          status: 'FAILED',
          confidence: 0
        };
      }

      const location = data.results[0].geometry.location;
      const result: GeocodingResult = {
        status: 'VERIFIED',
        coordinates: {
          lat: location.lat,
          lng: location.lng
        },
        displayName: data.results[0].formatted_address,
        confidence: 1.0
      };

      // Cache result (Phase 8)
      if (CacheConfig.geocoding.enabled) {
        caches.geocoding.set(cacheKey, result, CacheConfig.geocoding.ttl);
      }

      return result;
    } catch (error) {
      console.error(`[GeocodingService] Geocoding failed:`, error);
      return {
        status: 'FAILED',
        confidence: 0
      };
    }
  }

  /**
   * Get cache statistics (Phase 8)
   */
  getCacheStats() {
    return caches.geocoding.getStats();
  }

  /**
   * Clear all cache (for testing) - Phase 8
   */
  clearCache(): void {
    caches.geocoding.cleanup();
    console.log(`[GeocodingService] Cache cleared`);
  }
}

