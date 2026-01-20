import dotenv from 'dotenv';

dotenv.config();

export function getConfig() {
    const port = Number(process.env.PORT || 3000);

    const openaiApiKey = process.env.OPENAI_API_KEY;
    const googleApiKey = process.env.GOOGLE_API_KEY;

    // Redis configuration (shared by JobStore and Cache)
    const enableRedisJobStore = process.env.ENABLE_REDIS_JOBSTORE === 'true';
    const enableRedisCache = process.env.ENABLE_REDIS_CACHE === 'true';
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisCachePrefix = process.env.REDIS_CACHE_PREFIX || 'cache:';
    const enableGoogleCache = process.env.ENABLE_GOOGLE_CACHE !== 'false'; // Enabled by default

    /**
     * TTL Configuration Layer
     * All TTL values are normalized to SECONDS for consistency across the system.
     */

    // 1. Final result storage in Redis (Default: 24h)
    const redisJobTtlSeconds = Number(process.env.REDIS_JOB_TTL_SECONDS || 86400);

    // 2. Google Maps API Cache (Default: 15m as requested, override via ENV to 3600 if needed)
    const googleCacheTtlSeconds = Number(process.env.GOOGLE_CACHE_TTL_SECONDS || 900);

    // 3. Intent LLM Cache (Normalized to seconds)
    const cacheIntentEnabled = process.env.CACHE_INTENT === 'true';

    // Support both old MS env and new SECONDS env, prioritizing seconds
    const cacheIntentTtlSeconds = process.env.INTENT_CACHE_TTL_SECONDS
        ? Number(process.env.INTENT_CACHE_TTL_SECONDS)
        : Number(process.env.CACHE_INTENT_TTL || 600000) / 1000;

    if (!openaiApiKey) console.warn('[Config] OPENAI_API_KEY is missing');
    if (!googleApiKey) console.warn('[Config] GOOGLE_API_KEY is missing');

    return {
        port,
        openaiApiKey,
        googleApiKey,
        enableRedisJobStore,
        enableRedisCache,
        redisUrl,
        redisCachePrefix,
        enableGoogleCache,
        redisJobTtlSeconds,
        googleCacheTtlSeconds,
        cacheIntentEnabled,
        cacheIntentTtlSeconds // Now consistently in seconds
    };
}