/**
 * Provider cache write guard.
 * Write to cache ONLY when status === FOUND (VERIFIED). NOT_FOUND and UNKNOWN/ERROR are not cached.
 */

export type ProviderCacheWriteStatus = 'FOUND' | 'NOT_FOUND' | 'UNKNOWN';

/**
 * Guard: returns true only for FOUND (verified link). NOT_FOUND and UNKNOWN are never written.
 * Used by ProviderWorker.writeCacheEntry.
 */
export function shouldWriteProviderCache(cacheStatus: ProviderCacheWriteStatus): boolean {
  return cacheStatus === 'FOUND';
}
