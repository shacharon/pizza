import { z } from 'zod';

const EnvSchema = z.object({
    GOOGLE_API_KEY: z.string().min(1, 'GOOGLE_API_KEY is required'),
    DEFAULT_REGION: z.string().default('il'),
    PLACES_TEXTSEARCH_TIMEOUT_MS: z.coerce.number().int().positive().default(6000),
    PLACES_NEARBY_TIMEOUT_MS: z.coerce.number().int().positive().default(6000),
    PLACES_FINDPLACE_TIMEOUT_MS: z.coerce.number().int().positive().default(4000),
    PLACES_RETRY_ATTEMPTS: z.coerce.number().int().min(0).max(5).default(2),
    PLACES_RETRY_BACKOFF_MS: z
        .string()
        .default('0,300')
        .transform((s) => s.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n)))
        .refine((arr) => arr.length > 0, { message: 'PLACES_RETRY_BACKOFF_MS must have at least one number' }),
    PLACES_DEFAULT_RADIUS_METERS: z.coerce.number().int().min(1).max(30000).default(2000),
    PLACES_DEFAULT_CITY_RADIUS_METERS: z.coerce.number().int().min(1).max(30000).default(10000),
    PLACES_MAX_RADIUS_METERS: z.coerce.number().int().min(1).max(50000).default(30000),
    PLACES_PAGE_SIZE: z.coerce.number().int().min(1).max(50).default(20),
    ALLOWED_TYPES: z.string().default('restaurant,cafe,bar'),
    ALLOWED_LANGUAGES: z.string().default('he,en'),
});

const parsed = EnvSchema.safeParse({
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    DEFAULT_REGION: process.env.DEFAULT_REGION,
    PLACES_TEXTSEARCH_TIMEOUT_MS: process.env.PLACES_TEXTSEARCH_TIMEOUT_MS,
    PLACES_NEARBY_TIMEOUT_MS: process.env.PLACES_NEARBY_TIMEOUT_MS,
    PLACES_FINDPLACE_TIMEOUT_MS: process.env.PLACES_FINDPLACE_TIMEOUT_MS,
    PLACES_RETRY_ATTEMPTS: process.env.PLACES_RETRY_ATTEMPTS,
    PLACES_RETRY_BACKOFF_MS: process.env.PLACES_RETRY_BACKOFF_MS,
    PLACES_DEFAULT_RADIUS_METERS: process.env.PLACES_DEFAULT_RADIUS_METERS,
    PLACES_DEFAULT_CITY_RADIUS_METERS: process.env.PLACES_DEFAULT_CITY_RADIUS_METERS,
    PLACES_MAX_RADIUS_METERS: process.env.PLACES_MAX_RADIUS_METERS,
    PLACES_PAGE_SIZE: process.env.PLACES_PAGE_SIZE,
    ALLOWED_TYPES: process.env.ALLOWED_TYPES,
    ALLOWED_LANGUAGES: process.env.ALLOWED_LANGUAGES,
});

if (!parsed.success) {
    const issues = parsed.error.flatten().fieldErrors;
    const message = `Invalid Places config: ${JSON.stringify(issues)}`;
    throw new Error(message);
}

const allowedTypes = new Set(
    parsed.data.ALLOWED_TYPES.split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
);

const allowedLanguages = new Set(
    parsed.data.ALLOWED_LANGUAGES.split(',')
        .map((s) => s.trim()) as Array<'he' | 'en'>
);

export const PlacesConfig = {
    apiKey: parsed.data.GOOGLE_API_KEY,
    defaultRegion: parsed.data.DEFAULT_REGION,
    timeouts: {
        textsearchMs: parsed.data.PLACES_TEXTSEARCH_TIMEOUT_MS,
        nearbyMs: parsed.data.PLACES_NEARBY_TIMEOUT_MS,
        findplaceMs: parsed.data.PLACES_FINDPLACE_TIMEOUT_MS,
    },
    retry: {
        attempts: parsed.data.PLACES_RETRY_ATTEMPTS,
        backoffMs: parsed.data.PLACES_RETRY_BACKOFF_MS as number[],
    },
    radius: {
        defaultMeters: parsed.data.PLACES_DEFAULT_RADIUS_METERS,
        cityDefaultMeters: parsed.data.PLACES_DEFAULT_CITY_RADIUS_METERS,
        maxMeters: parsed.data.PLACES_MAX_RADIUS_METERS,
    },
    pageSize: parsed.data.PLACES_PAGE_SIZE,
    allowedTypes,
    allowedLanguages,
} as const;

export type AllowedLanguage = 'he' | 'en';


