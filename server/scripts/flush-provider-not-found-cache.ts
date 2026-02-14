/**
 * Flush all NOT_FOUND provider cache entries
 * Run this after fixing Brave API key to clear poisoned cache
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function flushNotFoundCache() {
  console.log('[Flush] Connecting to Redis:', REDIS_URL.replace(/:[^:@]+@/, ':****@'));
  
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 2,
    connectTimeout: 5000,
    commandTimeout: 5000,
    enableOfflineQueue: false,
    ...(REDIS_URL.startsWith('rediss://') && {
      tls: {
        rejectUnauthorized: false
      }
    })
  });

  try {
    await redis.ping();
    console.log('[Flush] Connected to Redis');

    // Scan for all provider keys
    const providers = ['wolt', 'tenbis', 'mishloha'];
    let totalDeleted = 0;

    for (const providerId of providers) {
      console.log(`\n[Flush] Processing provider: ${providerId}`);
      
      let cursor = '0';
      let keysDeleted = 0;
      
      do {
        // Scan for keys matching pattern: provider:{providerId}:*
        const [nextCursor, keys] = await redis.scan(
          cursor,
          'MATCH',
          `provider:${providerId}:*`,
          'COUNT',
          100
        );
        
        cursor = nextCursor;

        // Check each key - delete if status is NOT_FOUND
        for (const key of keys) {
          const data = await redis.get(key);
          if (data) {
            try {
              const parsed = JSON.parse(data);
              if (parsed.status === 'NOT_FOUND') {
                await redis.del(key);
                keysDeleted++;
                console.log(`  Deleted: ${key}`);
              }
            } catch (err) {
              console.warn(`  Skip invalid JSON: ${key}`);
            }
          }
        }
      } while (cursor !== '0');

      console.log(`[Flush] ${providerId}: Deleted ${keysDeleted} NOT_FOUND entries`);
      totalDeleted += keysDeleted;
    }

    console.log(`\n[Flush] ✅ Total deleted: ${totalDeleted} NOT_FOUND cache entries`);
    
  } catch (error) {
    console.error('[Flush] ❌ Error:', error);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

flushNotFoundCache();
