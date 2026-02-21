/**
 * Provider Enrichment - Data Contracts & Types
 * 
 * Generic provider enrichment system supporting multiple delivery providers:
 * - wolt
 * - tenbis (10bis)
 * - mishloha
 * 
 * Design: Redis-cached, non-blocking enrichment with WebSocket patch events
 * - Initial response: restaurants with providers.{provider}.status='PENDING' if cache miss
 * - Background job: matches restaurant → provider link, stores in Redis
 * - WS event: RESULT_PATCH updates specific restaurant by placeId
 * 
 * No DB. TTL-based cache only.
 */

// ============================================================================
// 1. Provider Types
// ============================================================================

/**
 * Supported delivery provider IDs
 */
export type ProviderId = 'wolt' | 'tenbis' | 'mishloha';

/**
 * Provider enrichment status for a single restaurant
 * 
 * Lifecycle:
 * - PENDING: Enrichment in progress (cache miss, job triggered)
 * - FOUND: Provider link found and cached
 * - NOT_FOUND: No provider link exists (cached negative result)
 */
export type ProviderEnrichmentStatus = 'FOUND' | 'NOT_FOUND' | 'PENDING';

/**
 * Provider enrichment data attached to RestaurantResult
 */
export interface ProviderEnrichment {
  /**
   * Enrichment status
   * - PENDING: Background job running, check WS for updates
   * - FOUND: url field contains valid provider link
   * - NOT_FOUND: No provider presence for this restaurant
   */
  status: ProviderEnrichmentStatus;

  /**
   * Provider restaurant page URL
   * - null if status='NOT_FOUND' or status='PENDING'
   * - Valid URL string if status='FOUND'
   */
  url: string | null;
}

// ============================================================================
// 2. Redis Storage Schema
// ============================================================================

/**
 * Generic Redis key patterns for provider enrichment cache
 * 
 * Namespace: provider:{providerId}:* (provider enrichment namespace)
 */
export const PROVIDER_REDIS_KEYS = {
  /**
   * Cache key for provider link by placeId
   * 
   * Pattern: provider:{providerId}:{placeId}
   * Example: provider:wolt:ChIJ7cv00DxMHRURm-NuI6SVf8k
   */
  place: (providerId: ProviderId, placeId: string): string => 
    `provider:${providerId}:${placeId}`,

  /**
   * Anti-thrash lock to prevent duplicate parallel enrichment jobs
   * 
   * Pattern: provider:{providerId}:lock:{placeId}
   * Value: '1' (simple flag)
   * TTL: 60s (job should complete or fail within this window)
   */
  lock: (providerId: ProviderId, placeId: string): string => 
    `provider:${providerId}:lock:${placeId}`,
} as const;

/**
 * TTL constants for provider enrichment cache
 * 
 * Design rationale:
 * - FOUND: 14 days (provider links stable, but allow periodic refresh)
 * - NOT_FOUND: 7 days (new restaurants may join providers)
 * - LOCK: 60 seconds (enrichment job timeout, prevents thrashing)
 */
export const PROVIDER_CACHE_TTL_SECONDS = {
  /**
   * TTL for successful provider link match
   * 14 days = 1,209,600 seconds
   */
  FOUND: 14 * 24 * 60 * 60, // 14 days

  /**
   * TTL for negative result (restaurant not on provider)
   * 7 days = 604,800 seconds
   */
  NOT_FOUND: 7 * 24 * 60 * 60, // 7 days

  /**
   * TTL for anti-thrash lock
   * 60 seconds (job execution window)
   */
  LOCK: 60, // 60 seconds
} as const;

/**
 * Timeout and retry configuration for provider enrichment
 */
export const PROVIDER_JOB_CONFIG = {
  /**
   * Overall job timeout (search + match + cache write)
   * 30 seconds total
   */
  JOB_TIMEOUT_MS: 30000,

  /**
   * Web search timeout (for adapter)
   * 20 seconds for search provider
   */
  SEARCH_TIMEOUT_MS: 20000,

  /**
   * Number of retry attempts on transient failures
   * 2 retries = 3 total attempts (initial + 2 retries)
   */
  MAX_RETRIES: 2,

  /**
   * Initial retry delay in milliseconds
   * Exponential backoff: 1s → 2s → 4s
   */
  RETRY_DELAY_MS: 1000,
} as const;

/**
 * Cached provider enrichment data (Redis value object)
 * 
 * Stored as JSON string in Redis
 */
export interface ProviderCacheEntry {
  /**
   * Provider restaurant URL (null if not found)
   */
  url: string | null;

  /**
   * Cache status (determines TTL on write)
   */
  status: 'FOUND' | 'NOT_FOUND';

  /**
   * ISO timestamp of last cache update
   * For observability and manual cache invalidation
   */
  updatedAt: string;

  /**
   * Optional resolution metadata
   */
  meta?: {
    layerUsed: 1 | 2 | 3;
    source: 'cse' | 'internal';
  };
}

// ============================================================================
// 3. Job Types
// ============================================================================

/**
 * Provider enrichment job
 */
export interface ProviderEnrichmentJob {
  /**
   * Provider ID
   */
  providerId: ProviderId;

  /**
   * Search request ID (for WS patch event)
   */
  requestId: string;

  /**
   * Google Place ID (cache key)
   */
  placeId: string;

  /**
   * Restaurant name
   */
  name: string;

  /**
   * City name (optional, from intent stage)
   */
  cityText?: string | null;

  /**
   * Address text (optional, for future use)
   */
  addressText?: string | null;

  /**
   * Optional request-scoped abort signal (cancels HTTP when request aborts)
   */
  abortSignal?: AbortSignal;
}

/**
 * Job processing result
 */
export interface JobResult {
  /**
   * Job succeeded
   */
  success: boolean;

  /**
   * Provider URL (if found)
   */
  url: string | null;

  /**
   * Status
   */
  status: 'FOUND' | 'NOT_FOUND';

  /**
   * Timestamp when result was determined
   */
  updatedAt: string;

  /**
   * Resolution metadata
   */
  meta?: {
    layerUsed: 1 | 2 | 3;
    source: 'cse' | 'internal';
  };

  /**
   * Error message (if failed)
   */
  error?: string;

  /**
   * Number of retry attempts made
   */
  retries?: number;
}

// ============================================================================
// 4. Helper Functions
// ============================================================================

/**
 * Get environment variable key for provider enable flag
 * 
 * @param providerId - Provider ID
 * @returns Environment variable key
 */
export function getProviderEnableEnvKey(providerId: ProviderId): string {
  const upperProvider = providerId.toUpperCase();
  return `ENABLE_${upperProvider}_ENRICHMENT`;
}

/**
 * Check if provider enrichment is enabled
 * 
 * @param providerId - Provider ID
 * @returns True if enabled
 */
export function isProviderEnrichmentEnabled(providerId: ProviderId): boolean {
  const envKey = getProviderEnableEnvKey(providerId);
  return process.env[envKey] === 'true';
}

/**
 * Get provider display name
 * 
 * @param providerId - Provider ID
 * @returns Display name
 */
export function getProviderDisplayName(providerId: ProviderId): string {
  const displayNames: Record<ProviderId, string> = {
    wolt: 'Wolt',
    tenbis: '10bis',
    mishloha: 'Mishloha',
  };
  return displayNames[providerId];
}
