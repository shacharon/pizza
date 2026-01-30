/**
 * Distance Origin Resolution
 * 
 * Deterministic logic for selecting distance anchor point in ranking.
 * 
 * Invariants:
 * 1. explicit_city_mentioned + cityText + cityCenter resolved → CITY_CENTER (always)
 * 2. No cityText but userLocation → USER_LOCATION
 * 3. Neither → NONE (distance ignored in ranking)
 */

import type { IntentResult, RouteLLMMapping } from '../types.js';

/**
 * Distance origin types (where distance is measured from)
 */
export type DistanceOrigin = 'CITY_CENTER' | 'USER_LOCATION' | 'NONE';

/**
 * Distance origin decision result
 */
export interface DistanceOriginDecision {
  origin: DistanceOrigin;
  refLatLng: { lat: number; lng: number } | null;
  cityText: string | null;
  hadUserLocation: boolean;
  /** Distance from userLocation to cityCenter (in km), if both available */
  userToCityDistanceKm?: number;
}


/**
 * Resolve distance origin deterministically
 * 
 * Rules:
 * 1. If intentReason=explicit_city_mentioned AND cityText exists AND cityCenter resolved:
 *    → CITY_CENTER (always use geocoded city center, ignore user location)
 * 
 * 2. Else if userLocation exists
 *    → USER_LOCATION (device GPS)
 * 
 * 3. Else
 *    → NONE (no distance anchor available)
 * 
 * @param intentDecision Intent result with reason and cityText
 * @param userLocation User's device location (optional)
 * @param mapping Route mapping (may contain cityCenter if geocoded)
 * @returns Distance origin decision
 */
export function resolveDistanceOrigin(
  intentDecision: IntentResult,
  userLocation: { lat: number; lng: number } | null | undefined,
  mapping?: RouteLLMMapping
): DistanceOriginDecision {
  // Check if explicit city was mentioned and cityCenter was geocoded
  const isExplicitCity = intentDecision.reason === 'explicit_city_mentioned';
  const hasCityText = !!intentDecision.cityText;
  const cityCenter = (mapping && 'cityCenter' in mapping) ? mapping.cityCenter : null;

  // Rule 1: Explicit city + cityText + cityCenter resolved → ALWAYS use CITY_CENTER
  if (isExplicitCity && hasCityText && cityCenter) {
    // Calculate distance for observability (logs), but don't use for decision
    const userToCityDistanceKm = userLocation
      ? haversineDistance(
          userLocation.lat,
          userLocation.lng,
          cityCenter.lat,
          cityCenter.lng
        )
      : undefined;

    return {
      origin: 'CITY_CENTER',
      refLatLng: cityCenter,
      cityText: intentDecision.cityText || null,
      hadUserLocation: !!userLocation,
      userToCityDistanceKm
    };
  }

  // Rule 2: userLocation exists (no explicit city) → USER_LOCATION
  if (userLocation) {
    return {
      origin: 'USER_LOCATION',
      refLatLng: userLocation,
      cityText: null,
      hadUserLocation: true
    };
  }

  // Rule 3: No anchor → NONE
  return {
    origin: 'NONE',
    refLatLng: null,
    cityText: null,
    hadUserLocation: false
  };
}

/**
 * Calculate Haversine distance between two lat/lng points (in km)
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
