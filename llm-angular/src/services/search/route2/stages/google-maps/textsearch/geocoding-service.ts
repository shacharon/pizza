/**
 * Geocoding Service
 * Converts city/area names to coordinates using Google Geocoding API
 * 
 * Used to create location bias for Text Search when cityText is provided
 * but no explicit coordinates are given by the LLM.
 */

import { fetchWithTimeout } from '../../../../../../utils/fetch-with-timeout.js';
import { logger } from '../../../../../../lib/logger/structured-logger.js';

/**
 * Call Google Geocoding API to get coordinates for a location query
 * (Geocoding API remains unchanged - uses legacy endpoint)
 * 
 * @param address - City or area name to geocode
 * @param region - Optional region code for biasing (e.g., 'IL')
 * @param apiKey - Google API key
 * @param requestId - Request ID for logging
 * @returns Coordinates {lat, lng} or null if not found
 */
export async function geocodeCity(
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

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  }, {
    timeoutMs: 8000,
    requestId,
    stage: 'google_maps',
    provider: 'google_geocoding'
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
