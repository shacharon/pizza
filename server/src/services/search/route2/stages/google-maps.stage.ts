/**
 * GOOGLE_MAPS Stage - ROUTE2 Pipeline
 * 
 * Executes Google Places API (New) calls based on route-specific mapping
 * Dispatches to correct API method based on providerMethod discriminator
 * 
 * API Version: Places API (New) - v1
 * Endpoints:
 * - POST https://places.googleapis.com/v1/places:searchText
 * - POST https://places.googleapis.com/v1/places:searchNearby
 */

import type { SearchRequest } from '../../types/search-request.dto.js';
import type { Route2Context, RouteLLMMapping, GoogleMapsResult } from '../types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

// Field mask for Google Places API (New) - minimal fields to preserve current DTOs
const PLACES_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.photos,places.types,places.googleMapsUri';

/**
 * Execute GOOGLE_MAPS stage
 * 
 * @param mapping Route-specific mapping from RouteLLM (discriminated union)
 * @param request Search request
 * @param ctx Pipeline context
 * @returns Google Maps results
 */
export async function executeGoogleMapsStage(
  mapping: RouteLLMMapping,
  request: SearchRequest,
  ctx: Route2Context
): Promise<GoogleMapsResult> {
  const { requestId } = ctx;
  const startTime = Date.now();

  // Log stage start
  logger.info({
    requestId,
    pipelineVersion: 'route2',
    stage: 'google_maps',
    event: 'stage_started',
    providerMethod: mapping.providerMethod,
    region: mapping.region,
    language: mapping.language
  }, '[ROUTE2] google_maps started');

  try {
    let results: any[] = [];

    // Dispatch to correct Google API based on providerMethod
    switch (mapping.providerMethod) {
      case 'textSearch':
        results = await executeTextSearch(mapping, ctx);
        break;

      case 'nearbySearch':
        results = await executeNearbySearch(mapping, ctx);
        break;

      case 'landmarkPlan':
        results = await executeLandmarkPlan(mapping, ctx);
        break;

      default:
        // Exhaustiveness check
        const _exhaustive: never = mapping;
        throw new Error(`Unknown providerMethod: ${(_exhaustive as any).providerMethod}`);
    }

    const durationMs = Date.now() - startTime;

    // Log stage completion
    logger.info({
      requestId,
      pipelineVersion: 'route2',
      stage: 'google_maps',
      event: 'stage_completed',
      durationMs,
      providerMethod: mapping.providerMethod,
      resultCount: results.length,
      region: mapping.region,
      language: mapping.language
    }, '[ROUTE2] google_maps completed');

    return {
      results,
      providerMethod: mapping.providerMethod,
      durationMs
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error({
      requestId,
      pipelineVersion: 'route2',
      stage: 'google_maps',
      event: 'stage_failed',
      durationMs,
      providerMethod: mapping.providerMethod,
      error: error instanceof Error ? error.message : 'unknown'
    }, '[ROUTE2] google_maps failed');

    throw error;
  }
}

/**
 * Execute Google Places Text Search (New API)
 */
async function executeTextSearch(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }>,
  ctx: Route2Context
): Promise<any[]> {
  const { requestId } = ctx;
  const startTime = Date.now();

  logger.info({
    requestId,
    provider: 'google_places_new',
    method: 'searchText',
    textQuery: mapping.textQuery,
    region: mapping.region,
    language: mapping.language,
    hasBias: mapping.bias !== null
  }, '[GOOGLE] Calling Text Search API (New)');

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    logger.error({
      requestId,
      provider: 'google_places_new',
      method: 'searchText',
      error: 'GOOGLE_API_KEY not configured'
    }, '[GOOGLE] API key missing');
    return [];
  }

  try {
    const results: any[] = [];
    let nextPageToken: string | undefined;
    const maxResults = 20; // Limit total results across pages

    // Build initial request body
    const requestBody = buildTextSearchBody(mapping);

    // Fetch first page
    const firstResponse = await callGooglePlacesSearchText(requestBody, apiKey, requestId);
    if (firstResponse.places) {
      results.push(...firstResponse.places.map((r: any) => mapGooglePlaceToResult(r)));
      nextPageToken = firstResponse.nextPageToken;
    }

    // Fetch additional pages if needed (up to maxResults)
    while (nextPageToken && results.length < maxResults) {
      // New API: no delay needed for pagination
      const pageBody = { ...requestBody, pageToken: nextPageToken };
      const pageResponse = await callGooglePlacesSearchText(pageBody, apiKey, requestId);

      if (pageResponse.places) {
        const remaining = maxResults - results.length;
        const newResults = pageResponse.places.slice(0, remaining);
        results.push(...newResults.map((r: any) => mapGooglePlaceToResult(r)));
        nextPageToken = pageResponse.nextPageToken;
      } else {
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    logger.info({
      requestId,
      provider: 'google_places_new',
      method: 'searchText',
      durationMs,
      resultCount: results.length,
      hadPagination: !!nextPageToken,
      fieldMaskUsed: PLACES_FIELD_MASK
    }, '[GOOGLE] Text Search completed');

    return results;

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'unknown';

    logger.error({
      requestId,
      provider: 'google_places_new',
      method: 'searchText',
      durationMs,
      error: errorMsg
    }, '[GOOGLE] Text Search failed');

    // IMPORTANT: Throw error to propagate to pipeline
    // Do NOT return [] - that would be treated as "success with 0 results"
    throw error;
  }
}

/**
 * Build Text Search API request body (New API)
 * 
 * NOTE: Text Search does NOT support includedTypes field!
 * Use textQuery like "מסעדה בשרית אשקלון" or "pizza restaurant" instead.
 * The LLM mappers already include the place type in the textQuery.
 */
function buildTextSearchBody(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }>
): any {
  const body: any = {
    textQuery: mapping.textQuery,
    languageCode: mapping.language === 'he' ? 'he' : 'en'
    // NOTE: Do NOT include includedTypes - not supported by searchText endpoint
    // Rely on textQuery containing place type (e.g., "מסעדה", "restaurant")
  };

  // Add region code
  if (mapping.region) {
    body.regionCode = mapping.region;
  }

  // Add location bias if present
  if (mapping.bias && mapping.bias.type === 'locationBias') {
    const { center, radiusMeters } = mapping.bias;
    body.locationBias = {
      circle: {
        center: {
          latitude: center.lat,
          longitude: center.lng
        },
        radius: radiusMeters
      }
    };
  }

  // Log that we're relying on textQuery for type filtering
  logger.debug({
    textQuery: mapping.textQuery,
    note: 'Text Search relies on textQuery for place type filtering (no includedTypes support)'
  }, '[GOOGLE] Building Text Search request without includedTypes');

  return body;
}

/**
 * Call Google Places Search Text API (New API)
 */
async function callGooglePlacesSearchText(
  body: any,
  apiKey: string,
  requestId: string
): Promise<any> {
  const url = 'https://places.googleapis.com/v1/places:searchText';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': PLACES_FIELD_MASK
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();

    // Log error details for debugging
    logger.error({
      requestId,
      provider: 'google_places_new',
      endpoint: 'searchText',
      status: response.status,
      errorBody: errorText,
      requestBody: body
    }, '[GOOGLE] Text Search API error');

    throw new Error(`Google Places API (New) searchText failed: HTTP ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Build Nearby Search API request body (New API)
 */
function buildNearbySearchBody(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'nearbySearch' }>
): any {
  const body: any = {
    locationRestriction: {
      circle: {
        center: {
          latitude: mapping.location.lat,
          longitude: mapping.location.lng
        },
        radius: mapping.radiusMeters
      }
    },
    languageCode: mapping.language === 'he' ? 'he' : 'en',
    includedTypes: ['restaurant'],
    rankPreference: 'DISTANCE'
  };

  // Add region code
  if (mapping.region) {
    body.regionCode = mapping.region;
  }

  return body;
}

/**
 * Call Google Places Search Nearby API (New API)
 */
async function callGooglePlacesSearchNearby(
  body: any,
  apiKey: string,
  requestId: string
): Promise<any> {
  const url = 'https://places.googleapis.com/v1/places:searchNearby';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': PLACES_FIELD_MASK
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();

    // Log error details for debugging
    logger.error({
      requestId,
      provider: 'google_places_new',
      endpoint: 'searchNearby',
      status: response.status,
      errorBody: errorText,
      requestBody: body
    }, '[GOOGLE] Nearby Search API error');

    throw new Error(`Google Places API (New) searchNearby failed: HTTP ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Call Google Geocoding API to get coordinates for a location query
 * (Geocoding API remains unchanged - uses legacy endpoint)
 */
async function callGoogleGeocodingAPI(
  address: string,
  region: string | null,
  apiKey: string,
  requestId: string
): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({
    key: apiKey,
    address: address
  });

  if (region) {
    params.append('region', region.toLowerCase());
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Google Geocoding API HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    logger.warn({
      requestId,
      provider: 'google_geocoding',
      status: data.status,
      errorMessage: data.error_message
    }, '[GOOGLE] Geocoding non-OK status');

    if (data.status === 'REQUEST_DENIED' || data.status === 'INVALID_REQUEST') {
      throw new Error(`Google Geocoding API error: ${data.status} - ${data.error_message || 'no details'}`);
    }
  }

  if (data.status === 'ZERO_RESULTS' || !data.results || data.results.length === 0) {
    return null;
  }

  // Return the first result's location
  const location = data.results[0].geometry.location;
  return {
    lat: location.lat,
    lng: location.lng
  };
}

/**
 * Map Google Place result (New API) to internal RestaurantResult shape
 * 
 * New API response structure:
 * {
 *   id: "places/ChIJ...",
 *   displayName: { text: "...", languageCode: "..." },
 *   formattedAddress: "...",
 *   location: { latitude: ..., longitude: ... },
 *   rating: ...,
 *   userRatingCount: ...,
 *   priceLevel: "PRICE_LEVEL_...",
 *   currentOpeningHours: { openNow: true/false },
 *   photos: [{ name: "places/.../photos/..." }],
 *   types: [...],
 *   googleMapsUri: "..."
 * }
 */
function mapGooglePlaceToResult(place: any): any {
  // Extract place ID from resource name (places/ChIJxxx -> ChIJxxx)
  const placeId = place.id ? place.id.split('/').pop() || place.id : 'unknown';

  return {
    id: placeId, // Use place_id as internal ID
    placeId: placeId,
    source: 'google_places' as const,
    name: place.displayName?.text || 'Unknown',
    address: place.formattedAddress || '',
    location: {
      lat: place.location?.latitude || 0,
      lng: place.location?.longitude || 0
    },
    rating: place.rating,
    userRatingsTotal: place.userRatingCount,
    priceLevel: parsePriceLevel(place.priceLevel),
    openNow: place.currentOpeningHours?.openNow !== undefined
      ? place.currentOpeningHours.openNow
      : 'UNKNOWN',
    photoUrl: place.photos?.[0]
      ? buildPhotoUrl(place.photos[0].name)
      : undefined,
    photos: place.photos?.slice(0, 5).map((photo: any) =>
      buildPhotoUrl(photo.name)
    ),
    googleMapsUrl: place.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
    tags: place.types || []
  };
}

/**
 * Build photo URL for New Places API
 * Uses resource name format: places/ChIJ.../photos/...
 */
function buildPhotoUrl(photoName: string): string {
  const apiKey = process.env.GOOGLE_API_KEY;
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&key=${apiKey}`;
}

/**
 * Parse price level from New API format
 * New API uses enum: "PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"
 * Legacy API uses numbers: 0, 1, 2, 3, 4
 */
function parsePriceLevel(priceLevel: string | undefined): number | undefined {
  if (!priceLevel) return undefined;

  const priceLevelMap: Record<string, number> = {
    'PRICE_LEVEL_FREE': 0,
    'PRICE_LEVEL_INEXPENSIVE': 1,
    'PRICE_LEVEL_MODERATE': 2,
    'PRICE_LEVEL_EXPENSIVE': 3,
    'PRICE_LEVEL_VERY_EXPENSIVE': 4
  };

  return priceLevelMap[priceLevel];
}

/**
 * Execute Google Places Nearby Search (New API)
 */
async function executeNearbySearch(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'nearbySearch' }>,
  ctx: Route2Context
): Promise<any[]> {
  const { requestId } = ctx;
  const startTime = Date.now();

  logger.info({
    requestId,
    provider: 'google_places_new',
    method: 'searchNearby',
    location: mapping.location,
    radiusMeters: mapping.radiusMeters,
    keyword: mapping.keyword,
    region: mapping.region,
    language: mapping.language,
    anchorSource: 'USER_LOCATION'
  }, '[GOOGLE] Calling Nearby Search API (New) - anchor: user location');

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    logger.error({
      requestId,
      provider: 'google_places_new',
      method: 'searchNearby',
      error: 'GOOGLE_API_KEY not configured'
    }, '[GOOGLE] API key missing');
    return [];
  }

  try {
    const results: any[] = [];
    let nextPageToken: string | undefined;
    const maxResults = 20; // Limit total results across pages

    // Build initial request body
    const requestBody = buildNearbySearchBody(mapping);

    // Fetch first page
    const firstResponse = await callGooglePlacesSearchNearby(requestBody, apiKey, requestId);
    if (firstResponse.places) {
      results.push(...firstResponse.places.map((r: any) => mapGooglePlaceToResult(r)));
      nextPageToken = firstResponse.nextPageToken;
    }

    // Fetch additional pages if needed (up to maxResults)
    while (nextPageToken && results.length < maxResults) {
      // New API: no delay needed for pagination
      const pageBody = { ...requestBody, pageToken: nextPageToken };
      const pageResponse = await callGooglePlacesSearchNearby(pageBody, apiKey, requestId);

      if (pageResponse.places) {
        const remaining = maxResults - results.length;
        const newResults = pageResponse.places.slice(0, remaining);
        results.push(...newResults.map((r: any) => mapGooglePlaceToResult(r)));
        nextPageToken = pageResponse.nextPageToken;
      } else {
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    logger.info({
      requestId,
      provider: 'google_places_new',
      method: 'searchNearby',
      durationMs,
      resultCount: results.length,
      hadPagination: !!nextPageToken,
      fieldMaskUsed: PLACES_FIELD_MASK
    }, '[GOOGLE] Nearby Search completed');

    return results;

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'unknown';

    logger.error({
      requestId,
      provider: 'google_places_new',
      method: 'searchNearby',
      durationMs,
      error: errorMsg
    }, '[GOOGLE] Nearby Search failed');

    // IMPORTANT: Throw error to propagate to pipeline
    // Do NOT return [] - that would be treated as "success with 0 results"
    throw error;
  }
}

/**
 * Execute Landmark Plan (two-phase search)
 * 1. Geocode the landmark (using legacy Geocoding API)
 * 2. Search nearby or with bias based on afterGeocode (using New Places API)
 */
async function executeLandmarkPlan(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'landmarkPlan' }>,
  ctx: Route2Context
): Promise<any[]> {
  const { requestId } = ctx;
  const startTime = Date.now();

  logger.info({
    requestId,
    provider: 'google_places_new',
    method: 'landmarkPlan',
    geocodeQuery: mapping.geocodeQuery,
    afterGeocode: mapping.afterGeocode,
    radiusMeters: mapping.radiusMeters,
    keyword: mapping.keyword,
    region: mapping.region,
    language: mapping.language,
    anchorSource: 'GEOCODE_ANCHOR',
    anchorText: mapping.geocodeQuery
  }, '[GOOGLE] Executing Landmark Plan (two-phase) - anchor: geocoded landmark');

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    logger.error({
      requestId,
      provider: 'google_places_new',
      method: 'landmarkPlan',
      error: 'GOOGLE_API_KEY not configured'
    }, '[GOOGLE] API key missing');
    return [];
  }

  try {
    // Phase 1: Geocode the landmark (uses legacy Geocoding API)
    const geocodeStartTime = Date.now();
    const geocodeResult = await callGoogleGeocodingAPI(
      mapping.geocodeQuery,
      mapping.region,
      apiKey,
      requestId
    );

    if (!geocodeResult) {
      logger.warn({
        requestId,
        provider: 'google_places_new',
        method: 'landmarkPlan',
        geocodeQuery: mapping.geocodeQuery
      }, '[GOOGLE] Geocoding returned no results');
      return [];
    }

    const geocodeDurationMs = Date.now() - geocodeStartTime;
    logger.info({
      requestId,
      provider: 'google_places_new',
      method: 'landmarkPlan',
      phase: 'geocode',
      durationMs: geocodeDurationMs,
      location: geocodeResult
    }, '[GOOGLE] Landmark geocoded successfully');

    // Phase 2: Search based on afterGeocode strategy (using New Places API)
    const searchStartTime = Date.now();
    let results: any[] = [];

    if (mapping.afterGeocode === 'nearbySearch') {
      // Use Nearby Search centered on geocoded location
      const requestBody = {
        locationRestriction: {
          circle: {
            center: {
              latitude: geocodeResult.lat,
              longitude: geocodeResult.lng
            },
            radius: mapping.radiusMeters
          }
        },
        languageCode: mapping.language === 'he' ? 'he' : 'en',
        includedTypes: ['restaurant'],
        rankPreference: 'DISTANCE'
      };

      if (mapping.region) {
        (requestBody as any).regionCode = mapping.region;
      }

      const response = await callGooglePlacesSearchNearby(requestBody, apiKey, requestId);
      if (response.places) {
        results = response.places.map((r: any) => mapGooglePlaceToResult(r));
      }

    } else {
      // Use Text Search with location bias
      // NOTE: Text Search does NOT support includedTypes
      const requestBody: any = {
        textQuery: mapping.keyword,
        languageCode: mapping.language === 'he' ? 'he' : 'en',
        // Do NOT include includedTypes - not supported by searchText
        locationBias: {
          circle: {
            center: {
              latitude: geocodeResult.lat,
              longitude: geocodeResult.lng
            },
            radius: mapping.radiusMeters
          }
        }
      };

      if (mapping.region) {
        requestBody.regionCode = mapping.region;
      }

      const response = await callGooglePlacesSearchText(requestBody, apiKey, requestId);
      if (response.places) {
        results = response.places.map((r: any) => mapGooglePlaceToResult(r));
      }
    }

    const searchDurationMs = Date.now() - searchStartTime;
    const totalDurationMs = Date.now() - startTime;

    logger.info({
      requestId,
      provider: 'google_places_new',
      method: 'landmarkPlan',
      phase: 'search',
      afterGeocode: mapping.afterGeocode,
      searchDurationMs,
      totalDurationMs,
      resultCount: results.length,
      fieldMaskUsed: PLACES_FIELD_MASK
    }, '[GOOGLE] Landmark Plan completed');

    return results;

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'unknown';

    logger.error({
      requestId,
      provider: 'google_places_new',
      method: 'landmarkPlan',
      durationMs,
      error: errorMsg
    }, '[GOOGLE] Landmark Plan failed');

    // IMPORTANT: Throw error to propagate to pipeline
    // Do NOT return [] - that would be treated as "success with 0 results"
    throw error;
  }
}
