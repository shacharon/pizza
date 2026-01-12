/**
 * Center Resolver
 * 
 * Determines the search center coordinates for executing the search.
 * This is a deterministic function that never invents coordinates.
 * 
 * References:
 * - docs/SEARCH_TRUTH_MODEL.md (Section 2: Separation of Responsibilities)
 * - docs/SEARCH_INTENT_CONTRACT.md (Forbidden Zone 2: Search Center Coordinates)
 */

import { SearchIntent } from '../types/intent.dto.js';

/**
 * Coordinates type
 */
export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Source of the center coordinates
 */
export type CenterSource =
  | 'explicit'   // User provided explicit location, geocoded successfully
  | 'gps'        // GPS coordinates from device
  | 'geocoded'   // Geocoded from user's location text
  | 'unknown';   // Unable to resolve center

/**
 * Context required for center resolution
 */
export interface CenterResolverContext {
  /**
   * GPS coordinates from device (if available)
   */
  gpsCoords?: Coordinates;
  
  /**
   * Geocoding function to convert location text to coordinates
   * Returns null if geocoding fails
   */
  geocode: (text: string) => Promise<Coordinates | null>;
}

/**
 * Result of center resolution
 */
export interface CenterResult {
  /**
   * Resolved center coordinates (null if unable to resolve)
   */
  center: Coordinates | null;
  
  /**
   * Source of the center
   */
  source: CenterSource;
  
  /**
   * Location text used (for transparency)
   */
  locationText: string;
  
  /**
   * Human-readable explanation (for logging/debugging)
   */
  explanation: string;
}

/**
 * Resolve search center coordinates based on intent and context
 * 
 * Decision Logic:
 * 
 * 1. IF nearMe AND GPS available → Use GPS coords
 * 2. IF explicit location text → Geocode it
 * 3. OTHERWISE → Unable to resolve (null)
 * 
 * CRITICAL: This function NEVER invents or defaults coordinates.
 * If unable to resolve, it returns null and lets the caller handle it.
 * 
 * @param intent - Validated search intent from LLM
 * @param context - Execution context (GPS coords, geocoding function)
 * @returns Center result with coordinates (or null) and source
 */
export async function resolveCenter(
  intent: SearchIntent,
  context: CenterResolverContext
): Promise<CenterResult> {
  
  // Rule 1: Near me → GPS coords
  if (intent.nearMe && context.gpsCoords) {
    return {
      center: context.gpsCoords,
      source: 'gps',
      locationText: 'near me',
      explanation: 'Using GPS coordinates from device'
    };
  }
  
  // Rule 2: Explicit location → Geocode
  if (intent.locationAnchor.present && intent.locationAnchor.text) {
    try {
      const coords = await context.geocode(intent.locationAnchor.text);
      
      if (coords) {
        return {
          center: coords,
          source: 'geocoded',
          locationText: intent.locationAnchor.text,
          explanation: `Geocoded location: ${intent.locationAnchor.text}`
        };
      }
      
      // Geocoding failed
      return {
        center: null,
        source: 'unknown',
        locationText: intent.locationAnchor.text,
        explanation: `Failed to geocode location: ${intent.locationAnchor.text}`
      };
      
    } catch (error) {
      // Geocoding error
      return {
        center: null,
        source: 'unknown',
        locationText: intent.locationAnchor.text,
        explanation: `Geocoding error for: ${intent.locationAnchor.text}`
      };
    }
  }
  
  // Rule 3: Unable to resolve
  return {
    center: null,
    source: 'unknown',
    locationText: '',
    explanation: 'No location anchor or GPS coordinates available'
  };
}

/**
 * Helper: Check if center was successfully resolved
 */
export function hasCenterCoordinates(result: CenterResult): boolean {
  return result.center !== null;
}

/**
 * Helper: Check if center is from GPS
 */
export function isGPSCenter(result: CenterResult): boolean {
  return result.source === 'gps';
}

/**
 * Helper: Check if center is from geocoding
 */
export function isGeocodedCenter(result: CenterResult): boolean {
  return result.source === 'geocoded';
}

/**
 * Helper: Get center or throw error
 * Useful when center is required and we want to fail fast
 */
export function getCenterOrThrow(result: CenterResult): Coordinates {
  if (!result.center) {
    throw new Error(`Unable to resolve center: ${result.explanation}`);
  }
  return result.center;
}
