import { z } from 'zod';

/**
 * Language codes supported by the translation service
 */
export type Language = 'he' | 'en' | 'fr' | 'es' | 'de' | 'it' | 'ru' | 'ja' | 'zh' | 'pt' | 'ar';

/**
 * Region/country codes (ISO 3166-1 alpha-2)
 */
export type RegionCode = string; // 'IL', 'US', 'FR', etc.

/**
 * Result of translation analysis
 * Contains all information needed for translation and search
 */
export interface TranslationResult {
    /**
     * Language the user typed in
     */
    inputLanguage: Language;

    /**
     * Target region/country for the search (e.g., 'IL', 'FR', 'US')
     */
    targetRegion: RegionCode;

    /**
     * Native language of the target region
     */
    regionLanguage: Language;

    /**
     * Query translated to region's native language
     * If skipTranslation is true, this equals the original text
     */
    translatedQuery: string;

    /**
     * True if translation was skipped (same language)
     */
    skipTranslation?: boolean;

    /**
     * True if LLM failed and fallback was used
     */
    fallback?: boolean;

    /**
     * Source of region detection in fallback mode
     */
    regionSource?: 'userLocation' | 'textCity' | 'browserLanguage' | 'default';

    /**
     * Optional note to include in response meta
     */
    note?: string;
}

/**
 * Zod schema for LLM structured output
 * Used with completeJSON to ensure type-safe responses
 */
export const TranslationAnalysisSchema = z.object({
    inputLanguage: z.string().describe('Language the user typed in (he, en, fr, es, etc.)'),
    targetRegion: z.string().describe('ISO country code for the search region (IL, FR, US, etc.)'),
    regionLanguage: z.string().describe('Native language of the target region'),
    translatedQuery: z.string().describe('Query translated to the region\'s native language'),
});

/**
 * Type inferred from the Zod schema
 */
export type TranslationAnalysis = z.infer<typeof TranslationAnalysisSchema>;

/**
 * Zod schema for batch translation of place names and addresses
 * Used with completeJSON to ensure type-safe responses
 */
export const BatchTranslationItemSchema = z.object({
    name: z.string().describe('Translated place name'),
    address: z.string().describe('Translated address'),
});

export const BatchTranslationSchema = z.array(BatchTranslationItemSchema);

/**
 * Type inferred from the batch translation schema
 */
export type BatchTranslation = z.infer<typeof BatchTranslationSchema>;

/**
 * Place item for result translation
 */
export interface PlaceItem {
    placeId: string;
    name: string;
    address: string;
    rating?: number;
    userRatingsTotal?: number;
    priceLevel?: number;
    photoUrl?: string;
    website?: string;
    openNow?: true | false | 'UNKNOWN';  // VerifiableBoolean
    location?: { lat: number; lng: number };
}

