/**
 * PlacesProviderService: Searches for restaurants via external APIs
 * Wraps GooglePlacesClient and normalizes results to RestaurantResult format
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

export class PlacesProviderService implements IPlacesProviderService {
  private googlePlacesClient: GooglePlacesClient;
  private source: RestaurantSource = 'google_places';
  private config: PlacesConfig;

  constructor(config?: Partial<PlacesConfig>, googlePlacesClient?: GooglePlacesClient) {
    this.googlePlacesClient = googlePlacesClient ?? new GooglePlacesClient();
    this.config = {
      ...SearchConfig.places,
      ...config,
    };
  }

  /**
   * Search for restaurants using the appropriate Google Places API mode
   */
  async search(params: SearchParams): Promise<RestaurantResult[]> {
    const mode = params.mode ?? 'textsearch';

    console.log(`[PlacesProviderService] Searching with mode: ${mode}`);

    let response: GoogleRawResponse;

    switch (mode) {
      case 'textsearch':
        response = await this.textSearch(params);
        break;
      case 'nearbysearch':
        response = await this.nearbySearch(params);
        break;
      case 'findplace':
        // For findplace, we still use textsearch (as per current implementation)
        response = await this.textSearch(params);
        break;
      default:
        response = await this.textSearch(params);
    }

    // Normalize results
    const results = this.normalizeResults(response, params.pageSize ?? 10);

    console.log(`[PlacesProviderService] Found ${results.length} results`);

    return results;
  }

  /**
   * Get provider name
   */
  getName(): RestaurantSource {
    return this.source;
  }

  /**
   * Execute text search
   */
  private async textSearch(params: SearchParams): Promise<GoogleRawResponse> {
    const searchParams: TextSearchParams = {
      query: params.query,
      language: params.language as any,
      location: params.location,
      radius: params.radius,
      openNow: params.filters.openNow,
      priceMin: params.filters.priceLevel ? params.filters.priceLevel : undefined,
      priceMax: params.filters.priceLevel ? params.filters.priceLevel : undefined,
    };

    return await this.googlePlacesClient.textSearch(searchParams);
  }

  /**
   * Execute nearby search
   */
  private async nearbySearch(params: SearchParams): Promise<GoogleRawResponse> {
    const searchParams: NearbySearchParams = {
      location: params.location,
      keyword: params.query,
      radius: params.radius,
      language: params.language as any,
      openNow: params.filters.openNow,
      priceMin: params.filters.priceLevel ? params.filters.priceLevel : undefined,
      priceMax: params.filters.priceLevel ? params.filters.priceLevel : undefined,
    };

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
      rating: place.rating,
      userRatingsTotal: place.user_ratings_total,
      priceLevel: place.price_level,
      openNow: place.opening_hours?.open_now,
      googleMapsUrl: place.url || `https://maps.google.com/?q=place_id:${place.place_id}`,
      phoneNumber: place.formatted_phone_number || place.international_phone_number,
      website: place.website,
      photoUrl: this.getPhotoUrl(place.photos?.[0]),
      photos: place.photos?.map((photo: any) => this.getPhotoUrl(photo)).filter(Boolean),
      tags: this.extractTags(place),
      metadata: {
        lastUpdated: new Date(),
      },
    };

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
}

