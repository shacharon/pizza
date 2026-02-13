// config.ts
// NOTE: Environment variables are loaded in server.ts BEFORE this module imports
// This ensures JWT_SECRET is available before any auth middleware loads

/**
 * Environment helpers
 */
function getEnv(): 'production' | 'staging' | 'development' | 'test' {
    const env =
        process.env.NODE_ENV ||
        process.env.ENV ||
        'development';

    if (env === 'production' || env === 'prod') return 'production';
    if (env === 'staging' || env === 'stage') return 'staging';
    if (env === 'test') return 'test';
    return 'development';
}

const CURRENT_ENV = getEnv();

function isProd(): boolean {
    return CURRENT_ENV === 'production';
}

/**
 * PROD Hardening: Treat staging same as production for security
 */
function isProdOrStaging(): boolean {
    return CURRENT_ENV === 'production' || CURRENT_ENV === 'staging';
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
 * P0 Security: Validate JWT_SECRET in production/staging
 * FAIL-FAST: Throws error on boot if JWT_SECRET is invalid in production/staging
 * 
 * NOTE: JWT_SECRET is logged in server.ts at boot time (dev only)
 */
function validateJwtSecret(): string {
    const jwtSecret = process.env.JWT_SECRET;
    const LEGACY_DEV_DEFAULT = 'dev-secret-change-in-production';

    // Always require JWT_SECRET to be set and >= 32 chars
    if (!jwtSecret || jwtSecret.trim() === '' || jwtSecret.length < 32) {
        const errorMsg = '[P0 Security] JWT_SECRET must be set and at least 32 characters';

        // FAIL-FAST in production/staging
        if (isProdOrStaging()) {
            throw new Error(`${errorMsg} (${CURRENT_ENV} boot blocked)`);
        }

        // In dev/test, log error but allow (will fail auth)
        console.error(`${errorMsg} - protected routes will fail`);

        return '__JWT_SECRET_MISSING_PROTECTED_ROUTES_DISABLED__';
    }

    // In production/staging, disallow the old legacy dev default
    if (isProdOrStaging() && jwtSecret === LEGACY_DEV_DEFAULT) {
        throw new Error(`[P0 Security] JWT_SECRET cannot be the legacy dev default in ${CURRENT_ENV} (boot blocked)`);
    }

    return jwtSecret;
}

/**
 * P0 Security: Validate SESSION_COOKIE_SECRET in production/staging
 * FAIL-FAST: Throws error on boot if SESSION_COOKIE_SECRET is invalid in production/staging
 * MUST be different from JWT_SECRET
 */
function validateSessionCookieSecret(jwtSecret: string): string {
    const sessionSecret = process.env.SESSION_COOKIE_SECRET;

    // Always require SESSION_COOKIE_SECRET to be set and >= 32 chars
    if (!sessionSecret || sessionSecret.trim() === '' || sessionSecret.length < 32) {
        const errorMsg = '[P0 Security] SESSION_COOKIE_SECRET must be set and at least 32 characters';

        // FAIL-FAST in production/staging
        if (isProdOrStaging()) {
            throw new Error(`${errorMsg} (${CURRENT_ENV} boot blocked)`);
        }

        // In dev/test, log error but allow (will fail session cookie auth)
        console.error(`${errorMsg} - session cookie auth will fail`);

        return '__SESSION_COOKIE_SECRET_MISSING__';
    }

    // MUST be different from JWT_SECRET
    if (sessionSecret === jwtSecret) {
        const errorMsg = '[P0 Security] SESSION_COOKIE_SECRET must be different from JWT_SECRET';

        // FAIL-FAST in production/staging
        if (isProdOrStaging()) {
            throw new Error(`${errorMsg} (${CURRENT_ENV} boot blocked)`);
        }

        console.error(`${errorMsg} - session cookies will use same secret as JWT (insecure)`);
    }

    return sessionSecret;
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
     * API Keys with feature flag validation
     * PROD Hardening: Fail-fast if feature enabled but key missing
     */
    const enableAiFeatures = process.env.ENABLE_AI_FEATURES !== 'false'; // default true
    const enableGoogleSearch = process.env.ENABLE_GOOGLE_SEARCH !== 'false'; // default true

    const openaiApiKey = process.env.OPENAI_API_KEY || '';
    const googleApiKey = process.env.GOOGLE_API_KEY || '';

    // PROD Hardening: Boot-time validation
    if (enableAiFeatures && !openaiApiKey) {
        const msg = '[Config] OPENAI_API_KEY required when ENABLE_AI_FEATURES=true';
        if (isProdOrStaging()) {
            throw new Error(`${msg} (${CURRENT_ENV} boot blocked)`);
        }
        console.error(`${msg} - AI features disabled`);
    }

    if (enableGoogleSearch && !googleApiKey) {
        const msg = '[Config] GOOGLE_API_KEY required when ENABLE_GOOGLE_SEARCH=true';
        if (isProdOrStaging()) {
            throw new Error(`${msg} (${CURRENT_ENV} boot blocked)`);
        }
        console.error(`${msg} - Search features disabled`);
    }

    // Log presence/absence (not values)
    console.info('[Config] API Keys:', {
        openai: openaiApiKey ? 'present' : 'absent',
        google: googleApiKey ? 'present' : 'absent'
    });

    /**
     * P0 Security: JWT Secret (fail-fast in production)
     */
    const jwtSecret = validateJwtSecret();

    /**
     * P0 Security: Session Cookie Secret (fail-fast in production)
     */
    const sessionCookieSecret = validateSessionCookieSecret(jwtSecret);
    const sessionCookieTtlSeconds = mustNumber('SESSION_COOKIE_TTL_SECONDS', 3600); // default 1 hour

    /**
     * Cookie Configuration
     */
    const cookieDomain = process.env.COOKIE_DOMAIN || ''; // Empty = host-only cookie
    const cookieSameSite = (process.env.COOKIE_SAMESITE || 'Lax') as 'Strict' | 'Lax' | 'None';

    // Validate SameSite value
    if (!['Strict', 'Lax', 'None'].includes(cookieSameSite)) {
        console.error(`[Config] Invalid COOKIE_SAMESITE value: ${cookieSameSite}, defaulting to Lax`);
    }

    // Warn if SameSite=None without Secure in production
    if (isProd() && cookieSameSite === 'None') {
        console.warn('[Config] COOKIE_SAMESITE=None requires Secure flag in production (cross-site cookies)');
    }

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
            sessionCookieSecret,
            sessionCookieTtlSeconds,
            cookieDomain,
            cookieSameSite,
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
        sessionCookieTtlSeconds,
        cookieDomain: cookieDomain || '(host-only)',
        cookieSameSite,
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
