/**
 * GeoResolverService: Resolves location strings to coordinates
 * Uses GeocodeCache and GooglePlacesClient
 */

import type { IGeoResolverService, Coordinates, ResolvedLocation } from '../types/search.types.js';
import { GooglePlacesClient } from '../../places/client/google-places.client.js';
import { GeocodeCache } from '../../places/cache/geocode-cache.js';
import { SearchConfig, type GeoConfig } from '../config/search.config.js';

export class GeoResolverService implements IGeoResolverService {
  private googlePlacesClient: GooglePlacesClient;
  private geocodeCache: GeocodeCache;
  private config: GeoConfig;

  constructor(
    config?: Partial<GeoConfig>,
    googlePlacesClient?: GooglePlacesClient,
    geocodeCache?: GeocodeCache
  ) {
    this.googlePlacesClient = googlePlacesClient ?? new GooglePlacesClient();
    this.geocodeCache = geocodeCache ?? new GeocodeCache();
    this.config = {
      ...SearchConfig.geo,
      ...config,
    };
  }

  /**
   * Resolve a location (string or coords) to a ResolvedLocation
   */
  async resolve(location: string | Coordinates): Promise<ResolvedLocation> {
    // If already coordinates, return as-is
    if (this.isCoordinates(location)) {
      return {
        coords: location,
        displayName: `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`,
        source: 'user',
      };
    }

    // Location is a string (city or place name)
    const locationString = location.trim();

    // Check cache first
    const cached = this.geocodeCache.get(locationString);
    if (cached) {
      return {
        coords: cached,
        displayName: locationString,
        source: 'geocode',
      };
    }

    // Geocode the location
    const coords = await this.geocode(locationString);

    if (!coords) {
      // Fallback: return a default location (could throw error instead)
      console.warn(`[GeoResolverService] Failed to geocode "${locationString}", using fallback`);
      return {
        coords: this.config.fallbackCoords,
        displayName: locationString,
        source: 'geocode',
      };
    }

    // Cache the result
    this.geocodeCache.set(locationString, this.config.defaultLanguage, coords);

    return {
      coords,
      displayName: locationString,
      source: 'geocode',
    };
  }

  /**
   * Geocode a location string to coordinates using Google Places API
   */
  private async geocode(location: string, language?: string): Promise<Coordinates | null> {
    const lang = language ?? this.config.defaultLanguage;
    
    try {
      const result = await this.googlePlacesClient.geocodeAddress(location, lang as any);
      
      if (!result) {
        console.warn(`[GeoResolverService] No geocode result for "${location}"`);
        return null;
      }

      console.log(`[GeoResolverService] Geocoded "${location}" → ${result.lat}, ${result.lng}`);
      return result;
    } catch (error) {
      console.error(`[GeoResolverService] Geocoding error for "${location}":`, error);
      return null;
    }
  }

  /**
   * Type guard to check if location is already coordinates
   */
  private isCoordinates(location: string | Coordinates): location is Coordinates {
    return (
      typeof location === 'object' &&
      location !== null &&
      'lat' in location &&
      'lng' in location &&
      typeof location.lat === 'number' &&
      typeof location.lng === 'number'
    );
  }

  /**
   * Resolve multiple locations in parallel
   */
  async resolveMany(locations: Array<string | Coordinates>): Promise<ResolvedLocation[]> {
    const promises = locations.map(loc => this.resolve(loc));
    return Promise.all(promises);
  }

  /**
   * Check if a location string is likely a city vs a place/landmark
   */
  isLikelyCity(location: string): boolean {
    const cityPatterns = [
      /\b(city|town|village|municipality)\b/i,
      /^[A-Z][a-z]+(?: [A-Z][a-z]+)?$/,  // "Paris", "Tel Aviv"
    ];

    return cityPatterns.some(pattern => pattern.test(location));
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.geocodeCache.getStats();
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.geocodeCache.clearAll();
  }
}

