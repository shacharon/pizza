/**
 * GOOGLE_MAPS Stage - ROUTE2 Pipeline
 * 
 * Executes Google Places API calls based on route-specific mapping
 * Dispatches to correct API method based on providerMethod discriminator
 */

import type { SearchRequest } from '../../types/search-request.dto.js';
import type { Route2Context, RouteLLMMapping, GoogleMapsResult } from '../types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

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
 * Execute Google Places Text Search
 */
async function executeTextSearch(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }>,
  ctx: Route2Context
): Promise<any[]> {
  const { requestId } = ctx;
  const startTime = Date.now();

  logger.info({
    requestId,
    provider: 'google_places',
    method: 'textSearch',
    textQuery: mapping.textQuery,
    region: mapping.region,
    language: mapping.language,
    hasBias: mapping.bias !== null
  }, '[GOOGLE] Calling Text Search API');

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    logger.error({
      requestId,
      provider: 'google_places',
      method: 'textSearch',
      error: 'GOOGLE_API_KEY not configured'
    }, '[GOOGLE] API key missing');
    return [];
  }

  try {
    const results: any[] = [];
    let nextPageToken: string | undefined;
    const maxResults = 20; // Limit total results across pages

    // Build initial request
    const params = buildTextSearchParams(mapping, apiKey);
    
    // Fetch first page
    const firstResponse = await callGoogleTextSearch(params, requestId);
    if (firstResponse.results) {
      results.push(...firstResponse.results.map((r: any) => mapGooglePlaceToResult(r)));
      nextPageToken = firstResponse.next_page_token;
    }

    // Fetch additional pages if needed (up to maxResults)
    while (nextPageToken && results.length < maxResults) {
      // Google requires ~2s delay before using next_page_token
      await new Promise(resolve => setTimeout(resolve, 2000));

      const pageParams = new URLSearchParams({
        key: apiKey,
        pagetoken: nextPageToken
      });

      const pageResponse = await callGoogleTextSearch(pageParams, requestId);
      if (pageResponse.results) {
        const remaining = maxResults - results.length;
        const newResults = pageResponse.results.slice(0, remaining);
        results.push(...newResults.map((r: any) => mapGooglePlaceToResult(r)));
        nextPageToken = pageResponse.next_page_token;
      } else {
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    logger.info({
      requestId,
      provider: 'google_places',
      method: 'textSearch',
      durationMs,
      resultCount: results.length,
      hadPagination: !!nextPageToken
    }, '[GOOGLE] Text Search completed');

    return results;

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'unknown';

    logger.error({
      requestId,
      provider: 'google_places',
      method: 'textSearch',
      durationMs,
      error: errorMsg
    }, '[GOOGLE] Text Search failed');

    return [];
  }
}

/**
 * Build Text Search API parameters
 */
function buildTextSearchParams(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }>,
  apiKey: string
): URLSearchParams {
  const params = new URLSearchParams({
    key: apiKey,
    query: mapping.textQuery,
    language: mapping.language === 'he' ? 'he' : 'en',
    type: 'restaurant'
  });

  // Add region bias
  if (mapping.region) {
    params.append('region', mapping.region.toLowerCase());
  }

  // Add location bias if present
  if (mapping.bias && mapping.bias.type === 'locationBias') {
    const { center, radiusMeters } = mapping.bias;
    params.append('location', `${center.lat},${center.lng}`);
    params.append('radius', radiusMeters.toString());
  }

  return params;
}

/**
 * Call Google Places Text Search API
 */
async function callGoogleTextSearch(
  params: URLSearchParams,
  requestId: string
): Promise<any> {
  return callGooglePlacesAPI('textsearch', params, requestId);
}

/**
 * Generalized Google Places API caller
 * Supports both textsearch and nearbysearch endpoints
 */
async function callGooglePlacesAPI(
  endpoint: 'textsearch' | 'nearbysearch',
  params: URLSearchParams,
  requestId: string
): Promise<any> {
  const url = `https://maps.googleapis.com/maps/api/place/${endpoint}/json?${params.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Google API HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    logger.warn({
      requestId,
      provider: 'google_places',
      endpoint,
      status: data.status,
      errorMessage: data.error_message
    }, `[GOOGLE] ${endpoint} non-OK status`);

    if (data.status === 'REQUEST_DENIED' || data.status === 'INVALID_REQUEST') {
      throw new Error(`Google API error: ${data.status} - ${data.error_message || 'no details'}`);
    }
  }

  return data;
}

/**
 * Build Nearby Search API parameters
 */
function buildNearbySearchParams(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'nearbySearch' }>,
  apiKey: string
): URLSearchParams {
  const params = new URLSearchParams({
    key: apiKey,
    location: `${mapping.location.lat},${mapping.location.lng}`,
    radius: mapping.radiusMeters.toString(),
    keyword: mapping.keyword,
    type: 'restaurant',
    language: mapping.language === 'he' ? 'he' : 'en'
  });

  // Add region if present
  if (mapping.region) {
    // Note: Nearby Search doesn't officially support 'region' param,
    // but it doesn't hurt to include it for consistency
    params.append('region', mapping.region.toLowerCase());
  }

  return params;
}

/**
 * Call Google Geocoding API to get coordinates for a location query
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
 * Map Google Place result to internal RestaurantResult shape
 */
function mapGooglePlaceToResult(place: any): any {
  return {
    id: place.place_id, // Use place_id as internal ID
    placeId: place.place_id,
    source: 'google_places' as const,
    name: place.name || 'Unknown',
    address: place.formatted_address || '',
    location: {
      lat: place.geometry?.location?.lat || 0,
      lng: place.geometry?.location?.lng || 0
    },
    rating: place.rating,
    userRatingsTotal: place.user_ratings_total,
    priceLevel: place.price_level,
    openNow: place.opening_hours?.open_now !== undefined
      ? place.opening_hours.open_now
      : 'UNKNOWN',
    photoUrl: place.photos?.[0]
      ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${place.photos[0].photo_reference}&key=${process.env.GOOGLE_API_KEY}`
      : undefined,
    photos: place.photos?.slice(0, 5).map((photo: any) =>
      `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photo.photo_reference}&key=${process.env.GOOGLE_API_KEY}`
    ),
    googleMapsUrl: place.url || `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
    tags: place.types || []
  };
}

/**
 * Execute Google Places Nearby Search
 */
async function executeNearbySearch(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'nearbySearch' }>,
  ctx: Route2Context
): Promise<any[]> {
  const { requestId } = ctx;
  const startTime = Date.now();

  logger.info({
    requestId,
    provider: 'google_places',
    method: 'nearbySearch',
    location: mapping.location,
    radiusMeters: mapping.radiusMeters,
    keyword: mapping.keyword,
    region: mapping.region,
    language: mapping.language
  }, '[GOOGLE] Calling Nearby Search API');

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    logger.error({
      requestId,
      provider: 'google_places',
      method: 'nearbySearch',
      error: 'GOOGLE_API_KEY not configured'
    }, '[GOOGLE] API key missing');
    return [];
  }

  try {
    const results: any[] = [];
    let nextPageToken: string | undefined;
    const maxResults = 20; // Limit total results across pages

    // Build initial request
    const params = buildNearbySearchParams(mapping, apiKey);
    
    // Fetch first page
    const firstResponse = await callGooglePlacesAPI(
      'nearbysearch',
      params,
      requestId
    );
    if (firstResponse.results) {
      results.push(...firstResponse.results.map((r: any) => mapGooglePlaceToResult(r)));
      nextPageToken = firstResponse.next_page_token;
    }

    // Fetch additional pages if needed (up to maxResults)
    while (nextPageToken && results.length < maxResults) {
      // Google requires ~2s delay before using next_page_token
      await new Promise(resolve => setTimeout(resolve, 2000));

      const pageParams = new URLSearchParams({
        key: apiKey,
        pagetoken: nextPageToken
      });

      const pageResponse = await callGooglePlacesAPI(
        'nearbysearch',
        pageParams,
        requestId
      );
      if (pageResponse.results) {
        const remaining = maxResults - results.length;
        const newResults = pageResponse.results.slice(0, remaining);
        results.push(...newResults.map((r: any) => mapGooglePlaceToResult(r)));
        nextPageToken = pageResponse.next_page_token;
      } else {
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    logger.info({
      requestId,
      provider: 'google_places',
      method: 'nearbySearch',
      durationMs,
      resultCount: results.length,
      hadPagination: !!nextPageToken
    }, '[GOOGLE] Nearby Search completed');

    return results;

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'unknown';

    logger.error({
      requestId,
      provider: 'google_places',
      method: 'nearbySearch',
      durationMs,
      error: errorMsg
    }, '[GOOGLE] Nearby Search failed');

    return [];
  }
}

/**
 * Execute Landmark Plan (two-phase search)
 * 1. Geocode the landmark
 * 2. Search nearby or with bias based on afterGeocode
 */
async function executeLandmarkPlan(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'landmarkPlan' }>,
  ctx: Route2Context
): Promise<any[]> {
  const { requestId } = ctx;
  const startTime = Date.now();

  logger.info({
    requestId,
    provider: 'google_places',
    method: 'landmarkPlan',
    geocodeQuery: mapping.geocodeQuery,
    afterGeocode: mapping.afterGeocode,
    radiusMeters: mapping.radiusMeters,
    keyword: mapping.keyword,
    region: mapping.region,
    language: mapping.language
  }, '[GOOGLE] Executing Landmark Plan (two-phase)');

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    logger.error({
      requestId,
      provider: 'google_places',
      method: 'landmarkPlan',
      error: 'GOOGLE_API_KEY not configured'
    }, '[GOOGLE] API key missing');
    return [];
  }

  try {
    // Phase 1: Geocode the landmark
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
        provider: 'google_places',
        method: 'landmarkPlan',
        geocodeQuery: mapping.geocodeQuery
      }, '[GOOGLE] Geocoding returned no results');
      return [];
    }

    const geocodeDurationMs = Date.now() - geocodeStartTime;
    logger.info({
      requestId,
      provider: 'google_places',
      method: 'landmarkPlan',
      phase: 'geocode',
      durationMs: geocodeDurationMs,
      location: geocodeResult
    }, '[GOOGLE] Landmark geocoded successfully');

    // Phase 2: Search based on afterGeocode strategy
    const searchStartTime = Date.now();
    let results: any[] = [];

    if (mapping.afterGeocode === 'nearbySearch') {
      // Use Nearby Search centered on geocoded location
      const params = new URLSearchParams({
        key: apiKey,
        location: `${geocodeResult.lat},${geocodeResult.lng}`,
        radius: mapping.radiusMeters.toString(),
        keyword: mapping.keyword,
        type: 'restaurant',
        language: mapping.language === 'he' ? 'he' : 'en'
      });

      const response = await callGooglePlacesAPI('nearbysearch', params, requestId);
      if (response.results) {
        results = response.results.map((r: any) => mapGooglePlaceToResult(r));
      }

    } else {
      // Use Text Search with location bias
      const params = new URLSearchParams({
        key: apiKey,
        query: mapping.keyword,
        location: `${geocodeResult.lat},${geocodeResult.lng}`,
        radius: mapping.radiusMeters.toString(),
        type: 'restaurant',
        language: mapping.language === 'he' ? 'he' : 'en'
      });

      if (mapping.region) {
        params.append('region', mapping.region.toLowerCase());
      }

      const response = await callGooglePlacesAPI('textsearch', params, requestId);
      if (response.results) {
        results = response.results.map((r: any) => mapGooglePlaceToResult(r));
      }
    }

    const searchDurationMs = Date.now() - searchStartTime;
    const totalDurationMs = Date.now() - startTime;

    logger.info({
      requestId,
      provider: 'google_places',
      method: 'landmarkPlan',
      phase: 'search',
      afterGeocode: mapping.afterGeocode,
      searchDurationMs,
      totalDurationMs,
      resultCount: results.length
    }, '[GOOGLE] Landmark Plan completed');

    return results;

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'unknown';

    logger.error({
      requestId,
      provider: 'google_places',
      method: 'landmarkPlan',
      durationMs,
      error: errorMsg
    }, '[GOOGLE] Landmark Plan failed');

    return [];
  }
}

