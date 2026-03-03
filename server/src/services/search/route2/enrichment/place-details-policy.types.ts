/**
 * Place Details enrichment policy – types and config (cost control).
 * Policy only: no Google Place Details calls here.
 */

/** Config for when and how many results to enrich with Place Details (vibe/dietary). */
export interface PlaceDetailsEnrichmentConfig {
  /** Enable Place Details enrichment when intent requires vibe/dietary. Default true. */
  enabled: boolean;
  /** Max number of results (by rank) to enrich. Default 5. */
  maxResultsToEnrich: number;
  /** Cache TTL for hints per placeId (ms). Skip Details if cached and within TTL. */
  cacheTtlMs: number;
  /** Cache key prefix for hints cache (e.g. "pd:hints"). */
  cacheKeyPrefix: string;
}

/** Input to decide if Details enrichment should run (intent + post-constraints). */
export interface PlaceDetailsEnrichmentIntentInput {
  /** Intent has explicit dietary preferences (e.g. preferences.dietary). */
  hasDietaryIntent: boolean;
  /** Intent or post-constraints require vibe signals (romantic, quiet, family, laptop). Future. */
  hasVibeIntent?: boolean;
  /** Post-constraint: user asked for kosher. */
  isKosherRequested?: boolean;
  /** Post-constraint: user asked for gluten-free. */
  isGlutenFreeRequested?: boolean;
}

/** Result of planning: which placeIds to call Details for, and counts for logging. */
export interface PlaceDetailsEnrichmentPlan {
  /** Whether enrichment is requested at all (intent requires vibe/dietary). */
  requested: boolean;
  /** Place IDs to enrich (top N, excluding cached). Never call Details for others. */
  placeIdsToEnrich: string[];
  /** Total candidates considered (top N by rank). */
  candidateCount: number;
  /** Skipped because hints cache hit (within TTL). */
  cacheHits: number;
  /** Candidates that had no cache entry (would need Details call). */
  cacheMisses: number;
  /** Skipped for other reasons (e.g. not requested, or beyond top N). */
  skippedReason: 'not_requested' | 'no_candidates' | null;
}
