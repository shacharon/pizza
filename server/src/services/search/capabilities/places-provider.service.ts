/**
 * PlacesProviderService: Searches for restaurants via external APIs
 * Wraps GooglePlacesClient and normalizes results to RestaurantResult format
 * 
 * Phase 8: Enhanced with caching
 */

import type {
  IPlacesProviderService,
  SearchParams,
  RestaurantResult,
  RestaurantSource,
} from '../types/search.types.js';
import { GooglePlacesClient } from '../../places/client/google-places.client.js';
import type {
  TextSearchParams,
  NearbySearchParams,
  GoogleRawResponse,
} from '../../places/client/google-places.client.js';
import { SearchConfig, type PlacesConfig } from '../config/search.config.js';
import { caches } from '../../../lib/cache/cache-manager.js';
import { CacheConfig, buildPlacesSearchCacheKey, getPlacesSearchTTL } from '../config/cache.config.js';
import { getRankingPoolConfig } from '../config/ranking.config.js';

export class PlacesProviderService implements IPlacesProviderService {
  private googlePlacesClient: GooglePlacesClient;
  private source: RestaurantSource = 'google_places';
  private config: PlacesConfig;
  private poolConfig = getRankingPoolConfig();

  constructor(config?: Partial<PlacesConfig>, googlePlacesClient?: GooglePlacesClient) {
    this.googlePlacesClient = googlePlacesClient ?? new GooglePlacesClient();
    this.config = {
      ...SearchConfig.places,
      ...config,
    };
  }

  /**
   * Search for restaurants using the appropriate Google Places API mode
   * Phase 8: With caching support
   */
  async search(params: SearchParams): Promise<RestaurantResult[]> {
    const searchStart = Date.now();
    
    // Phase 8: Check cache first
    if (CacheConfig.placesSearch.enabled && params.location) {
      const cacheKey = buildPlacesSearchCacheKey(
        params.query,
        params.location,
        params.radius ?? 5000,
        params.language ?? 'en',
        params.filters.openNow ?? false
      );
      
      const cached = caches.placesSearch.get(cacheKey);
      if (cached) {
        const cacheTime = Date.now() - searchStart;
        console.log(`[PlacesProviderService] ✅ CACHE HIT for "${params.query}" (${cacheTime}ms, ${cached.length} results)`);
        console.log(`[PlacesProviderService] 🔑 Cache key: ${cacheKey.substring(0, 80)}...`);
        return cached;
      }
      console.log(`[PlacesProviderService] ❌ CACHE MISS for "${params.query}"`);
      console.log(`[PlacesProviderService] 🔑 Cache key: ${cacheKey.substring(0, 80)}...`);
    }

    const mode = params.mode ?? 'textsearch';
    const targetSize = this.poolConfig.candidatePoolSize;

    console.log(`[PlacesProviderService] Searching with mode: ${mode}, target: ${targetSize} results`);

    // Multi-page fetching
    const allResults: RestaurantResult[] = [];
    let nextPageToken: string | null = null;
    let pageCount = 0;
    const maxPages = 3; // Limit to 3 pages (60 results max)

    // Page 1
    let response: GoogleRawResponse;
    switch (mode) {
      case 'textsearch':
        response = await this.textSearch(params);
        break;
      case 'nearbysearch':
        response = await this.nearbySearch(params);
        break;
      case 'findplace':
        response = await this.textSearch(params);
        break;
      default:
        response = await this.textSearch(params);
    }

    const firstPageResults = this.normalizeResults(response, 20);
    allResults.push(...firstPageResults);
    nextPageToken = response.next_page_token ?? null;
    pageCount++;

    console.log(`[PlacesProviderService] 📄 Page ${pageCount}: ${firstPageResults.length} results`);

    // Fetch additional pages if needed
    while (allResults.length < targetSize && nextPageToken && pageCount < maxPages) {
      // Google requires 2-second delay before using next_page_token
      console.log(`[PlacesProviderService] ⏳ Waiting 2s for next page...`);
      await this.delay(2000);

      try {
        // Use pageToken to fetch next page (only works with textsearch)
        const nextPageResponse = await this.textSearch({ 
          ...params, 
          pageToken: nextPageToken 
        } as SearchParams);
        
        const nextPageResults = this.normalizeResults(nextPageResponse, 20);
        allResults.push(...nextPageResults);
        nextPageToken = nextPageResponse.next_page_token ?? null;
        pageCount++;
        
        console.log(`[PlacesProviderService] 📄 Page ${pageCount}: ${nextPageResults.length} results (total: ${allResults.length})`);
      } catch (error) {
        console.error(`[PlacesProviderService] ⚠️ Failed to fetch page ${pageCount + 1}:`, error);
        break; // Stop fetching on error
      }
    }

    // Slice to exact target size
    const results = allResults.slice(0, targetSize);
    
    const totalTime = Date.now() - searchStart;
    console.log(`[PlacesProviderService] ✅ Found ${results.length} results across ${pageCount} pages (${totalTime}ms total)`);

    // Phase 8: Cache the results
    if (CacheConfig.placesSearch.enabled && params.location) {
      const cacheKey = buildPlacesSearchCacheKey(
        params.query,
        params.location,
        params.radius ?? 5000,
        params.language ?? 'en',
        params.filters.openNow ?? false
      );
      
      const ttl = getPlacesSearchTTL(params.filters.openNow ?? false);
      caches.placesSearch.set(cacheKey, results, ttl);
      console.log(`[PlacesProviderService] 💾 Cached ${results.length} results (TTL: ${ttl / 1000}s)`);
    }

    return results;
  }

  /**
   * Get provider name
   */
  getName(): RestaurantSource {
    return this.source;
  }

  /**
   * Get cache statistics (Phase 8)
   */
  getCacheStats() {
    return caches.placesSearch.getStats();
  }

  /**
   * Execute text search
   */
  private async textSearch(params: SearchParams): Promise<GoogleRawResponse> {
    const searchParams: TextSearchParams = {
      query: params.query,
      language: params.language as any,
      location: params.location,
    };

    // Only add optional params if they exist
    if (params.radius !== undefined) searchParams.radius = params.radius;
    if (params.filters.openNow !== undefined) searchParams.openNow = params.filters.openNow;
    if (params.filters.priceLevel !== undefined) {
      searchParams.priceMin = params.filters.priceLevel;
      searchParams.priceMax = params.filters.priceLevel;
    }

    return await this.googlePlacesClient.textSearch(searchParams);
  }

  /**
   * Execute nearby search
   */
  private async nearbySearch(params: SearchParams): Promise<GoogleRawResponse> {
    const searchParams: NearbySearchParams = {
      location: params.location,
      keyword: params.query,
      language: params.language as any,
    };

    // Only add optional params if they exist
    if (params.radius !== undefined) searchParams.radius = params.radius;
    if (params.filters.openNow !== undefined) searchParams.openNow = params.filters.openNow;
    if (params.filters.priceLevel !== undefined) {
      searchParams.priceMin = params.filters.priceLevel;
      searchParams.priceMax = params.filters.priceLevel;
    }

    return await this.googlePlacesClient.nearbySearch(searchParams);
  }

  /**
   * Normalize Google Places API response to RestaurantResult[]
   */
  private normalizeResults(response: GoogleRawResponse, pageSize?: number): RestaurantResult[] {
    const places = response.results || [];
    const limit = pageSize ?? this.config.pageSize;
    
    return places
      .slice(0, limit)
      .map((place: any) => this.normalizePlace(place))
      .filter((result): result is RestaurantResult => result !== null);
  }

  /**
   * Normalize a single Google Place to RestaurantResult
   */
  private normalizePlace(place: any): RestaurantResult | null {
    // Required fields
    if (!place.place_id || !place.name) {
      return null;
    }

    const location = place.geometry?.location;
    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
      return null;
    }

    // Build result
    const result: RestaurantResult = {
      id: `google_${place.place_id}`,
      placeId: place.place_id,
      source: 'google_places',
      name: place.name,
      address: place.formatted_address || place.vicinity || '',
      location: {
        lat: location.lat,
        lng: location.lng,
      },
      googleMapsUrl: place.url || `https://maps.google.com/?q=place_id:${place.place_id}`,
      tags: this.extractTags(place),
    };

    // Only add optional properties if they exist
    if (place.rating !== undefined) result.rating = place.rating;
    if (place.user_ratings_total !== undefined) result.userRatingsTotal = place.user_ratings_total;
    if (place.price_level !== undefined) result.priceLevel = place.price_level;
    if (place.opening_hours?.open_now !== undefined) result.openNow = place.opening_hours.open_now;
    if (place.formatted_phone_number || place.international_phone_number) {
      result.phoneNumber = place.formatted_phone_number || place.international_phone_number;
    }
    if (place.website) result.website = place.website;
    
    const photoUrl = this.getPhotoUrl(place.photos?.[0]);
    if (photoUrl) result.photoUrl = photoUrl;
    
    if (place.photos) {
      const photos = place.photos.map((photo: any) => this.getPhotoUrl(photo)).filter(Boolean);
      if (photos.length > 0) result.photos = photos as string[];
    }

    if (result.metadata === undefined) {
      result.metadata = { lastUpdated: new Date() };
    }

    return result;
  }

  /**
   * Get photo URL from Google Places photo reference
   */
  private getPhotoUrl(photo: any): string | undefined {
    if (!photo?.photo_reference) {
      return undefined;
    }

    // Construct Google Places Photo API URL
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
    const maxWidth = this.config.photoMaxWidth;
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${photo.photo_reference}&key=${apiKey}`;
  }

  /**
   * Extract tags from place data
   */
  private extractTags(place: any): string[] {
    const tags: string[] = [];

    // Add types as tags
    if (Array.isArray(place.types)) {
      tags.push(...place.types.map((t: string) => t.replace(/_/g, ' ')));
    }

    // Add price level as tag
    if (place.price_level) {
      tags.push(`price_${place.price_level}`);
    }

    // Add rating tier as tag
    if (place.rating) {
      if (place.rating >= 4.5) tags.push('highly_rated');
      else if (place.rating >= 4.0) tags.push('well_rated');
    }

    return tags;
  }

  /**
   * Search multiple providers in parallel (future: TripAdvisor, etc.)
   */
  async searchMultipleProviders(params: SearchParams): Promise<RestaurantResult[]> {
    // For now, just Google Places
    // Future: Promise.all([googleResults, tripAdvisorResults, ...])
    return await this.search(params);
  }

  /**
   * Helper: Delay for specified milliseconds
   * Used for Google Places next_page_token (requires 2s delay)
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

