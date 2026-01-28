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

/**
 * P0 Security: Validate JWT_SECRET in production
 * FAIL-SAFE: Logs error but returns placeholder to allow health endpoints to work
 */
function validateJwtSecret(): string {
    const jwtSecret = process.env.JWT_SECRET;
    const LEGACY_DEV_DEFAULT = 'dev-secret-change-in-production';
    
    // Always require JWT_SECRET to be set and >= 32 chars
    if (!jwtSecret || jwtSecret.trim() === '' || jwtSecret.length < 32) {
        console.error('[P0 Security] ⚠️  JWT_SECRET must be set and at least 32 characters - protected routes will fail');
        // Return placeholder that will fail auth but allow server to start
        return '__JWT_SECRET_MISSING_PROTECTED_ROUTES_DISABLED__';
    }
    
    // In production, disallow the old legacy dev default
    if (isProd() && jwtSecret === LEGACY_DEV_DEFAULT) {
        console.error('[P0 Security] ⚠️  JWT_SECRET cannot be the legacy dev default in production - protected routes will fail');
        return '__JWT_SECRET_INVALID_PROTECTED_ROUTES_DISABLED__';
    }
    
    return jwtSecret;
}

function validateRedisUrl(redisUrl: string, enabled: boolean): boolean {
    if (!enabled) return true;

    if (isProd() && !isRunningOnEcs()) {
        console.warn('[Config] ENV=production but ECS runtime not detected (AWS_EXECUTION_ENV / ECS metadata missing)');
    }

    if (!redisUrl) {
        console.error('[Config] ⚠️  Redis enabled but REDIS_URL is missing - Redis features disabled');
        return false;
    }

    if (isProd() && /localhost|127\.0\.0\.1/i.test(redisUrl)) {
        console.error('[Config] ⚠️  REDIS_URL must not point to localhost when ENV=production - Redis features disabled');
        return false;
    }

    try {
        new URL(redisUrl);
        return true;
    } catch {
        console.error(`[Config] ⚠️  Invalid REDIS_URL format: ${redisUrl} - Redis features disabled`);
        return false;
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
     * API Keys (fail-safe: allow server to start even if missing)
     */
    const openaiApiKey = process.env.OPENAI_API_KEY || '';
    const googleApiKey = process.env.GOOGLE_API_KEY || '';
    
    if (!openaiApiKey) {
        console.error('[Config] ⚠️  OPENAI_API_KEY missing - AI features disabled');
    }
    if (!googleApiKey) {
        console.error('[Config] ⚠️  GOOGLE_API_KEY missing - search features disabled');
    }
    
    /**
     * P0 Security: JWT Secret (fail-fast in production)
     */
    const jwtSecret = validateJwtSecret();

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
     * Redis safety gate (NODE_ENV / ENV aware) - FAIL-SAFE
     */
    const redisValid = validateRedisUrl(redisUrl, enableRedisJobStore || enableRedisCache);
    const redisActuallyEnabled = redisValid && (enableRedisJobStore || enableRedisCache);

    /**
     * Frontend Origins (unified for CORS + WebSocket) - FAIL-SAFE
     */
    const frontendOrigins = parseFrontendOrigins();
    const corsAllowNoOrigin = process.env.CORS_ALLOW_NO_ORIGIN !== 'false'; // default true
    
    /**
     * Security: Forbid wildcard (*) when credentials enabled - FAIL-SAFE
     */
    if (isProd() && frontendOrigins?.includes('*')) {
        console.error('[Config] ⚠️  FRONTEND_ORIGINS cannot include "*" in production - CORS will reject all origins');
        // Return empty array to force CORS rejection
        return {
            ...baseConfig(),
            frontendOrigins: [],
            corsAllowNoOrigin,
            redisActuallyEnabled
        } as any;
    }
    
    if (isProd() && (!frontendOrigins || frontendOrigins.length === 0)) {
        console.error('[Config] ⚠️  FRONTEND_ORIGINS missing in production - CORS will reject all origins');
    }

function baseConfig() {
    return {
        env: CURRENT_ENV,
        port,
        openaiApiKey,
        googleApiKey,
        jwtSecret,
        enableRedisJobStore,
        enableRedisCache,
        redisUrl,
        redisCachePrefix,
        redisJobTtlSeconds,
        googleCacheTtlSeconds,
        cacheIntentEnabled,
        cacheIntentTtlSeconds
    };
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

    // Safe frontend origins summary for logging
    const frontendOriginsSummary = (() => {
        if (!frontendOrigins || frontendOrigins.length === 0) return '(none)';
        if (frontendOrigins.includes('*')) return '* (wildcard)';
        if (frontendOrigins.length > 5) return `${frontendOrigins.length} origins`;
        return frontendOrigins.join(', ');
    })();

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
        frontendOriginsCount: frontendOrigins?.length ?? 0,
        frontendOrigins: frontendOriginsSummary
    });

    return {
        ...baseConfig(),
        // Frontend Origins (unified CORS + WebSocket)
        frontendOrigins,
        corsAllowNoOrigin,
        // Redis actual state (after validation)
        redisActuallyEnabled
    };
}
