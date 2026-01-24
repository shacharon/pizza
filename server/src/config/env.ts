// config.ts
import dotenv from 'dotenv';

dotenv.config();

/**
 * Environment helpers
 */
function getEnv(): 'production' | 'development' | 'test' {
    const env =
        process.env.NODE_ENV ||
        process.env.ENV ||
        'development';

    if (env === 'production' || env === 'prod') return 'production';
    if (env === 'test') return 'test';
    return 'development';
}

const CURRENT_ENV = getEnv();

function isProd(): boolean {
    return CURRENT_ENV === 'production';
}


// config.ts (top, near other helpers)
function isRunningOnEcs(): boolean {
    return Boolean(
        process.env.AWS_EXECUTION_ENV ||
        process.env.ECS_CONTAINER_METADATA_URI_V4 ||
        process.env.ECS_CONTAINER_METADATA_URI
    );
}


function mustNumber(name: string, fallback?: number): number {
    const raw = process.env[name];
    const value =
        raw === undefined || raw === ''
            ? fallback
            : Number(raw);

    if (!Number.isFinite(value) || value! <= 0) {
        throw new Error(`[Config] Invalid numeric env ${name}: ${raw}`);
    }

    return value!;
}
/**
 * Parse frontend origins from env (unified for CORS + WebSocket)
 * Priority: FRONTEND_ORIGINS > CORS_ALLOWED_ORIGINS (backward compat)
 */
function parseFrontendOrigins(): string[] | null {
    const raw = (process.env.FRONTEND_ORIGINS || process.env.CORS_ALLOWED_ORIGINS)?.trim();
    if (!raw) return null;
    const items = raw.split(',').map(s => s.trim()).filter(Boolean);
    return items.length ? items : null;
}

function mustString(name: string): string {
    const value = process.env[name];
    if (!value || value.trim() === '') {
        throw new Error(`[Config] Missing required env ${name}`);
    }
    return value;
}

function validateRedisUrl(redisUrl: string, enabled: boolean) {
    if (!enabled) return;

    if (isProd() && !isRunningOnEcs()) {
        console.warn('[Config] ENV=production but ECS runtime not detected (AWS_EXECUTION_ENV / ECS metadata missing)');
    }

    if (!redisUrl) {
        throw new Error('[Config] Redis enabled but REDIS_URL is missing');
    }

    if (isProd() && /localhost|127\.0\.0\.1/i.test(redisUrl)) {
        throw new Error(
            '[Config] REDIS_URL must not point to localhost when ENV=production'
        );
    }

    try {
        new URL(redisUrl);
    } catch {
        throw new Error(`[Config] Invalid REDIS_URL format: ${redisUrl}`);
    }
}

/**
 * Main config loader
 */
export function getConfig() {
    /**
     * Server
     */
    const port = mustNumber('PORT', 3000);

    /**
     * API Keys (always required)
     */
    const openaiApiKey = mustString('OPENAI_API_KEY');
    const googleApiKey = mustString('GOOGLE_API_KEY');

    /**
     * Redis
     */
    const enableRedisJobStore = process.env.ENABLE_REDIS_JOBSTORE === 'true';
    const enableRedisCache = process.env.ENABLE_REDIS_CACHE === 'true';

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisCachePrefix = process.env.REDIS_CACHE_PREFIX || 'cache:';

    /**
     * TTLs (seconds)
     */
    const redisJobTtlSeconds = mustNumber('REDIS_JOB_TTL_SECONDS', 86400);
    const googleCacheTtlSeconds = mustNumber('GOOGLE_CACHE_TTL_SECONDS', 900);

    /**
     * Intent cache
     */
    const cacheIntentEnabled = process.env.CACHE_INTENT === 'true';
    const cacheIntentTtlSeconds = process.env.INTENT_CACHE_TTL_SECONDS
        ? mustNumber('INTENT_CACHE_TTL_SECONDS')
        : mustNumber('CACHE_INTENT_TTL', 600000) / 1000;

    /**
     * Redis safety gate (NODE_ENV / ENV aware)
     */
    validateRedisUrl(redisUrl, enableRedisJobStore || enableRedisCache);

    /**
     * Frontend Origins (unified for CORS + WebSocket)
     */
    const frontendOrigins = parseFrontendOrigins();
    const corsAllowNoOrigin = process.env.CORS_ALLOW_NO_ORIGIN !== 'false'; // default true
    
    /**
     * Security: Forbid wildcard (*) when credentials enabled
     */
    if (isProd() && frontendOrigins?.includes('*')) {
        throw new Error('[Config] FRONTEND_ORIGINS cannot include "*" in production (credentials enabled)');
    }

    /**
     * Boot log (safe)
     */
    const redisHost =
        enableRedisJobStore || enableRedisCache
            ? (() => {
                try {
                    return new URL(redisUrl).host;
                } catch {
                    return 'invalid';
                }
            })()
            : 'disabled';

    console.info('[Config] Loaded', {
        env: CURRENT_ENV,
        port,
        enableRedisJobStore,
        enableRedisCache,
        redisHost,
        redisJobTtlSeconds,
        googleCacheTtlSeconds,
        cacheIntentEnabled,
        cacheIntentTtlSeconds,
        frontendOriginsCount: frontendOrigins?.length ?? 0
    });

    return {
        // Env
        env: CURRENT_ENV,

        // Server
        port,

        // API
        openaiApiKey,
        googleApiKey,

        // Redis
        enableRedisJobStore,
        enableRedisCache,
        redisUrl,
        redisCachePrefix,

        // TTLs
        redisJobTtlSeconds,
        googleCacheTtlSeconds,

        // Intent cache
        cacheIntentEnabled,
        cacheIntentTtlSeconds,
        
        // Frontend Origins (unified CORS + WebSocket)
        frontendOrigins,
        corsAllowNoOrigin,
    };
}
