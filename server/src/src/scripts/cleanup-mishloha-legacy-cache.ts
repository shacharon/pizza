/**
 * Maintenance Script: Clean Legacy Mishloha Cache Entries
 * 
 * Removes ALL NOT_FOUND entries that have a URL (any fallback shape).
 * Enforces "verified deep-links only" policy - only FOUND entries with
 * real restaurant pages should have URLs.
 * 
 * Safe to run multiple times (idempotent).
 */

import 'dotenv/config'; // Load .env file
import { getRedisClient } from '../lib/redis/redis-client.js';
import { logger } from '../lib/logger/structured-logger.js';

interface ProviderCacheEntry {
  status: 'FOUND' | 'NOT_FOUND';
  url: string | null;
  updatedAt: string;
  meta?: {
    layerUsed?: 1 | 2 | 3;
    source?: string;
  };
}

/**
 * Clean legacy Mishloha cache entries with fallback URLs
 */
async function cleanupLegacyMishlohaCache(): Promise<void> {
  const startTime = Date.now();
  
  logger.info(
    { event: 'provider_cache_cleanup_started', provider: 'mishloha' },
    '[Cleanup] Starting Mishloha legacy cache cleanup'
  );

  // Get Redis client
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.error(
      { event: 'provider_cache_cleanup_failed', reason: 'no_redis_url' },
      '[Cleanup] REDIS_URL not configured'
    );
    return;
  }

  const redis = await getRedisClient({
    url: redisUrl,
    maxRetriesPerRequest: 2,
    connectTimeout: 5000,
    commandTimeout: 5000,
  });

  if (!redis) {
    logger.error(
      { event: 'provider_cache_cleanup_failed', reason: 'redis_unavailable' },
      '[Cleanup] Redis client unavailable'
    );
    return;
  }

  try {
    // Scan for all mishloha keys
    const pattern = 'provider:mishloha:*';
    const keys: string[] = [];
    
    let cursor = '0';
    do {
      const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    logger.info(
      { event: 'provider_cache_cleanup_scan_complete', totalKeys: keys.length },
      `[Cleanup] Found ${keys.length} mishloha cache keys`
    );

    // Check each key and delete if it's a legacy fallback
    let deletedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const key of keys) {
      try {
        const raw = await redis.get(key);
        if (!raw) {
          skippedCount++;
          continue;
        }

        const entry: ProviderCacheEntry = JSON.parse(raw);

        // Delete ANY NOT_FOUND entry with a url (enforces "verified deep-links only")
        if (entry.status === 'NOT_FOUND' && entry.url) {
          await redis.del(key);
          deletedCount++;
          
          const isFallbackSearch = entry.url.includes('/search?q=');
          
          logger.info(
            {
              event: 'provider_cache_cleanup_legacy_search_url',
              key,
              url: entry.url,
              isFallbackSearch,
              updatedAt: entry.updatedAt,
              meta: entry.meta,
              reason: 'not_found_with_url'
            },
            `[Cleanup] Deleted legacy NOT_FOUND entry with URL: ${key}`
          );
        } else {
          skippedCount++;
        }
      } catch (err) {
        errorCount++;
        logger.warn(
          {
            event: 'provider_cache_cleanup_error',
            key,
            error: err instanceof Error ? err.message : String(err)
          },
          `[Cleanup] Error processing key: ${key}`
        );
      }
    }

    const durationMs = Date.now() - startTime;
    
    logger.info(
      {
        event: 'provider_cache_cleanup_completed',
        provider: 'mishloha',
        totalKeys: keys.length,
        deletedCount,
        skippedCount,
        errorCount,
        durationMs
      },
      `[Cleanup] Completed: ${deletedCount} deleted, ${skippedCount} skipped, ${errorCount} errors`
    );

    console.log('\n✅ Cleanup completed successfully!');
    console.log(`   Total keys scanned: ${keys.length}`);
    console.log(`   Deleted (NOT_FOUND with any URL): ${deletedCount}`);
    console.log(`   Skipped (FOUND or NOT_FOUND without URL): ${skippedCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log(`   Duration: ${durationMs}ms\n`);

  } catch (err) {
    logger.error(
      {
        event: 'provider_cache_cleanup_failed',
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      },
      '[Cleanup] Fatal error during cleanup'
    );
    throw err;
  } finally {
    // Close Redis connection
    await redis.quit();
  }
}

// Run cleanup
cleanupLegacyMishlohaCache()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
  });
