/**
 * Geocoding Service
 * Validates city names and addresses using Google Geocoding API
 * Implements two-step validation: LLM extracts candidate → Geocoding verifies
 */

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

interface CacheEntry {
  result: GeocodingResult;
  timestamp: number;
}

/**
 * GeocodingService
 * Validates city names using external geocoding APIs with caching
 */
export class GeocodingService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly apiKey: string;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/geocode/json';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    
    // Cleanup expired cache entries every hour
    setInterval(() => this.cleanupCache(), 60 * 60 * 1000);
  }

  /**
   * Validate a city name
   * Returns VERIFIED if found, FAILED if not found, AMBIGUOUS if multiple matches
   */
  async validateCity(
    cityCandidate: string,
    countryHint?: string
  ): Promise<GeocodingResult> {
    const cacheKey = this.getCacheKey(cityCandidate, countryHint);
    
    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      console.log(`[GeocodingService] Cache hit for "${cityCandidate}"`);
      return { ...cached, cacheHit: true };
    }

    console.log(`[GeocodingService] Validating city: "${cityCandidate}" (country: ${countryHint || 'any'})`);

    try {
      const result = await this.geocodeCity(cityCandidate, countryHint);
      
      // Cache successful results
      this.cache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });

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
   */
  async geocode(address: string): Promise<GeocodingResult> {
    const cacheKey = `geocode:${address.toLowerCase()}`;
    
    // Check cache
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return { ...cached, cacheHit: true };
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

      // Cache
      this.cache.set(cacheKey, { result, timestamp: Date.now() });

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
   * Get from cache if not expired
   */
  private getFromCache(key: string): GeocodingResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  /**
   * Generate cache key
   */
  private getCacheKey(city: string, country?: string): string {
    const normalized = city.toLowerCase().trim();
    return country ? `${normalized}:${country}` : normalized;
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL_MS) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[GeocodingService] Cleaned ${cleaned} expired cache entries`);
    }
  }

  /**
   * Clear all cache (for testing)
   */
  clearCache(): void {
    this.cache.clear();
    console.log(`[GeocodingService] Cache cleared`);
  }

  /**
   * Get cache stats (for monitoring)
   */
  getCacheStats(): { size: number; entries: number } {
    return {
      size: this.cache.size,
      entries: this.cache.size
    };
  }
}

