import dotenv from 'dotenv';

dotenv.config();

export function getConfig() {
    const port = Number(process.env.PORT || 3000);

    const openaiApiKey = process.env.OPENAI_API_KEY;
    const googleApiKey = process.env.GOOGLE_API_KEY;

    // Redis job store configuration
    const enableRedisJobStore = process.env.ENABLE_REDIS_JOBSTORE === 'true';
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisJobTtlSeconds = Number(process.env.REDIS_JOB_TTL_SECONDS || 86400); // 24 hours

    if (!openaiApiKey) {
        console.warn('[Config] OPENAI_API_KEY is missing');
    }
    if (!googleApiKey) {
        console.warn('[Config] GOOGLE_API_KEY is missing');
    }

    return {
        port,
        openaiApiKey,
        googleApiKey,
        enableRedisJobStore,
        redisUrl,
        redisJobTtlSeconds
    };
}
