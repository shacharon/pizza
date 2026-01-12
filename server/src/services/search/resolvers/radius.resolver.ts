/**
 * Radius Resolver
 * 
 * Determines the search radius (hard filter) based on user intent.
 * Radius is a HARD FILTER - results outside radius are ELIMINATED.
 * 
 * Precedence:
 * 1. Explicit user distance (highest priority)
 * 2. Location type defaults (from SEARCH_TRUTH_MODEL v1 rules)
 * 
 * References:
 * - docs/SEARCH_TRUTH_MODEL.md (Section 4.2: Distance & Radius)
 * - docs/SEARCH_INTENT_CONTRACT.md (Section 3.3: explicitDistance)
 */

import { SearchIntent } from '../types/intent.dto.js';

/**
 * Source of the radius value
 */
export type RadiusSource =
  | 'explicit'           // User explicitly stated distance
  | 'default_near_me'    // Default for near-me queries
  | 'default_city'       // Default for city-level queries
  | 'default_street'     // Default for street-level queries
  | 'default_poi'        // Default for POI/landmark queries
  | 'fallback';          // Fallback when type unclear

/**
 * Result of radius resolution
 */
export interface RadiusResult {
  /**
   * Radius in meters (hard filter)
   * Results outside this radius will be ELIMINATED
   */
  radiusMeters: number;
  
  /**
   * Source of the radius value
   */
  source: RadiusSource;
  
  /**
   * Original text if explicit, empty otherwise
   */
  originalText: string;
  
  /**
   * Human-readable explanation (for logging/debugging)
   */
  explanation: string;
}

/**
 * Default radius values (from SEARCH_TRUTH_MODEL v1 rules)
 */
export const DEFAULT_RADIUS = {
  NEAR_ME: 1000,    // 500-1000m range, using 1000m
  CITY: 2000,       // 2km for city searches
  STREET: 200,      // 200m for street searches
  POI: 1000,        // 1km for POI/landmark searches
  FALLBACK: 1000    // Default fallback
} as const;

/**
 * Resolve search radius based on intent
 * 
 * Precedence Rules (from SEARCH_TRUTH_MODEL):
 * 
 * 1. EXPLICIT DISTANCE (highest priority)
 *    - User stated "within 500m", "up to 3km", etc.
 *    - Overrides all defaults
 * 
 * 2. LOCATION TYPE DEFAULTS (v1 rules)
 *    - Near-me: 500-1000 meters (using 1000m)
 *    - City: 2000 meters
 *    - Street: 200 meters
 *    - POI/Landmark: 1000 meters
 * 
 * CRITICAL: Radius is a HARD FILTER.
 * Results outside radius are ELIMINATED, not just ranked lower.
 * 
 * @param intent - Validated search intent from LLM
 * @returns Radius result with meters and source
 */
export function resolveRadiusMeters(intent: SearchIntent): RadiusResult {
  
  // Priority 1: Explicit user distance
  if (intent.explicitDistance.meters !== null) {
    return {
      radiusMeters: intent.explicitDistance.meters,
      source: 'explicit',
      originalText: intent.explicitDistance.originalText || '',
      explanation: `User explicitly stated: ${intent.explicitDistance.originalText}`
    };
  }
  
  // Priority 2: Near-me default
  if (intent.nearMe) {
    return {
      radiusMeters: DEFAULT_RADIUS.NEAR_ME,
      source: 'default_near_me',
      originalText: '',
      explanation: 'Default radius for near-me queries (1000m)'
    };
  }
  
  // Priority 3: Location type defaults
  switch (intent.locationAnchor.type) {
    case 'city':
      return {
        radiusMeters: DEFAULT_RADIUS.CITY,
        source: 'default_city',
        originalText: '',
        explanation: 'Default radius for city searches (2000m)'
      };
      
    case 'street':
      return {
        radiusMeters: DEFAULT_RADIUS.STREET,
        source: 'default_street',
        originalText: '',
        explanation: 'Default radius for street searches (200m)'
      };
      
    case 'poi':
      return {
        radiusMeters: DEFAULT_RADIUS.POI,
        source: 'default_poi',
        originalText: '',
        explanation: 'Default radius for POI/landmark searches (1000m)'
      };
      
    case 'gps':
      // GPS type but not nearMe (edge case)
      return {
        radiusMeters: DEFAULT_RADIUS.NEAR_ME,
        source: 'default_near_me',
        originalText: '',
        explanation: 'Default radius for GPS-based searches (1000m)'
      };
      
    default:
      // Fallback for unknown or empty type
      return {
        radiusMeters: DEFAULT_RADIUS.FALLBACK,
        source: 'fallback',
        originalText: '',
        explanation: 'Fallback radius when location type unclear (1000m)'
      };
  }
}

/**
 * Helper: Check if radius is from explicit user input
 */
export function isExplicitRadius(result: RadiusResult): boolean {
  return result.source === 'explicit';
}

/**
 * Helper: Check if radius is a default value
 */
export function isDefaultRadius(result: RadiusResult): boolean {
  return result.source !== 'explicit';
}

/**
 * Helper: Get radius in kilometers (for display)
 */
export function getRadiusKm(result: RadiusResult): number {
  return result.radiusMeters / 1000;
}

/**
 * Helper: Format radius for display
 * Returns "500m" or "2km" depending on size
 */
export function formatRadius(result: RadiusResult): string {
  if (result.radiusMeters < 1000) {
    return `${result.radiusMeters}m`;
  }
  return `${getRadiusKm(result)}km`;
}
