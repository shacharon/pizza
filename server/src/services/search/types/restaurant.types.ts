/**
 * Restaurant Type Definitions
 * Core restaurant, location, and provider state types
 */

export type RestaurantSource = 'google_places' | 'tripadvisor' | 'internal';

/**
 * Verifiable Boolean - Tri-state type for data quality
 * - true: Verified and confirmed
 * - false: Verified and confirmed false
 * - 'UNKNOWN': Not verified or data not available
 * 
 * This enables the assistant to explicitly communicate uncertainty
 * instead of making assumptions about missing data.
 */
export type VerifiableBoolean = true | false | 'UNKNOWN';

/**
 * Provider enrichment state - Generic state for external provider data
 * Status tri-state matches enrichment lifecycle:
 * - 'PENDING': Enrichment in progress
 * - 'FOUND': Provider has data for this restaurant
 * - 'NOT_FOUND': Provider has no data for this restaurant
 */
export interface ProviderState {
  status: 'PENDING' | 'FOUND' | 'NOT_FOUND';
  url: string | null;
  updatedAt?: string; // ISO timestamp of last update (optional, only in patches)
  meta?: {
    layerUsed?: 1 | 2 | 3; // Resolution layer: 1=CSE+city, 2=CSE, 3=internal search
    source?: 'cse' | 'internal'; // Resolution source
  };
}

/**
 * Geographic coordinates
 */
export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Resolved location with metadata
 */
export interface ResolvedLocation {
  coords: Coordinates;
  displayName: string;
  source: 'user' | 'geocode' | 'city';
  region?: string;  // NEW: Country code from geocoding (e.g., 'fr', 'il', 'us')
}

/**
 * Restaurant search result
 */
export interface RestaurantResult {
  // Identity
  id: string;  // Internal ID
  placeId: string;  // Provider's place ID
  source: RestaurantSource;

  // Basic info
  name: string;
  address: string;
  location: Coordinates;

  // Ratings & reviews
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;  // 1-4

  // Status (using VerifiableBoolean for data quality)
  openNow?: VerifiableBoolean;  // true | false | 'UNKNOWN'

  // Contact
  phoneNumber?: string;
  website?: string;
  googleMapsUrl?: string;

  // Media (P0 Security: Use photo references, not URLs with API keys)
  photoReference?: string;      // Photo reference (not URL) - fetch via /api/v1/photos/{ref}
  photoReferences?: string[];   // Array of photo references

  // DEPRECATED: Use photoReference instead
  photoUrl?: string;            // Legacy: Direct URL (may contain API key)
  photos?: string[];            // Legacy: Array of URLs (may contain API keys)

  // Enrichment
  tags?: string[];  // ['pizza', 'romantic', 'fast-food']
  matchReasons?: string[];  // Why this matches the query (REQUIRED after ranking)

  // External enrichments (async, non-blocking) - NEW structured format
  providers?: {
    wolt?: ProviderState;
    tenbis?: ProviderState;
    // Future: tripadvisor?: ProviderState, etc.
  };

  // DEPRECATED: Legacy wolt field (kept for backward compatibility)
  wolt?: {
    status: 'FOUND' | 'NOT_FOUND' | 'PENDING';
    url: string | null;
  };

  // Scoring (added by RankingService)
  score?: number;  // 0-100 (REQUIRED after ranking)
  rank?: number;  // Phase 1: 1-based ranking position (1 = best)
  isWeakMatch?: boolean;  // Phase 3: True if score < weakMatchThreshold
  distanceScore?: number;  // Phase 3: 0-100 based on distance from center

  // City matching (added by CityFilterService)
  cityMatch?: boolean;  // Does this result match the target city?
  cityMatchReason?: 'LOCALITY' | 'FORMATTED_ADDRESS' | 'UNKNOWN';
  isNearbyFallback?: boolean;  // Was this added as a fallback result?

  // Grouping metadata (added by SearchOrchestrator)
  groupKind?: 'EXACT' | 'NEARBY';  // Which group this result belongs to
  distanceMeters?: number;  // Distance from search point

  // Metadata
  metadata?: {
    lastUpdated?: Date;
    cacheAge?: number;
  };
}
