import type { LLMProvider, Message } from '../../../llm/types.js';
import { createLLMProvider } from '../../../llm/factory.js';
import { TranslationAnalysisSchema, BatchTranslationSchema, type TranslationResult, type TranslationAnalysis, type PlaceItem, type Language } from './translation.types.js';
import { GooglePlacesClient } from '../client/google-places.client.js';

/**
 * TranslationService
 * Handles multi-language translation for Places search
 * 
 * ⚠️ DEPRECATED (Phase 4): NOT part of default search flow.
 * 
 * This service performs implicit LLM translation, which violates
 * the multilingual correctness principle (output language must equal input).
 * 
 * Policy:
 * - User's language = response language (no silent translation)
 * - SearchOrchestrator does NOT call this service
 * - Kept for backward compatibility and explicit fallback scenarios only
 * 
 * Migration:
 * - Default flow: Use user's language directly, no translation
 * - Future: May be used for explicit user-requested translation only
 * 
 * Flow (when explicitly used):
 * 1. Detect input language and target region
 * 2. Translate query to region's native language for better Google results
 * 3. Translate results back to user's input language
 * 
 * Uses LLM-first approach with privacy-aware fallbacks
 */
export class TranslationService {
    private readonly llm: LLMProvider | null;
    private readonly geocodingClient: GooglePlacesClient;

    /**
     * Fallback region-to-language mapping
     * Only used when LLM fails (10-15 main regions for MVP)
     */
    private readonly FALLBACK_REGION_LANGUAGE: Record<string, Language> = {
        'IL': 'he',   // Israel
        'US': 'en',   // United States
        'GB': 'en',   // United Kingdom
        'FR': 'fr',   // France
        'ES': 'es',   // Spain
        'DE': 'de',   // Germany
        'IT': 'it',   // Italy
        'RU': 'ru',   // Russia
        'JP': 'ja',   // Japan
        'CN': 'zh',   // China
        'BR': 'pt',   // Brazil
        'MX': 'es',   // Mexico
        'CA': 'en',   // Canada
        'AU': 'en',   // Australia
        'IN': 'en'    // India
    };

    constructor() {
        this.llm = createLLMProvider();
        this.geocodingClient = new GooglePlacesClient();
    }

    /**
     * Main method: Analyze text and translate if needed
     * Uses LLM to detect language, region, and translate in one structured call
     * Falls back to heuristics if LLM fails
     * 
     * @param text - User's search query
     * @param nearMe - Whether user checked "near me" checkbox
     * @param userLocation - User's coordinates (only used if nearMe=true)
     * @param browserLanguage - Browser language setting (e.g., 'he-IL', 'en-US')
     */
    async analyzeAndTranslate(
        text: string,
        nearMe: boolean = false,
        userLocation?: { lat: number; lng: number },
        browserLanguage?: string
    ): Promise<TranslationResult> {
        if (!text || !text.trim()) {
            return this.createDefaultResult(text);
        }

        // Try LLM-first approach
        if (this.llm) {
            try {
                const analysis = await this.llmAnalyzeAndTranslate(text);

                // Check if translation can be skipped (same language)
                if (analysis.inputLanguage === analysis.regionLanguage) {
                    return {
                        inputLanguage: analysis.inputLanguage as Language,
                        targetRegion: analysis.targetRegion,
                        regionLanguage: analysis.regionLanguage as Language,
                        translatedQuery: text, // Original text
                        skipTranslation: true
                    };
                }

                return {
                    inputLanguage: analysis.inputLanguage as Language,
                    targetRegion: analysis.targetRegion,
                    regionLanguage: analysis.regionLanguage as Language,
                    translatedQuery: analysis.translatedQuery,
                    skipTranslation: false
                };
            } catch (error) {
                console.warn('[TranslationService] LLM failed, using fallback', (error as Error)?.message);
            }
        }

        // Fallback: Use heuristics
        return this.fallbackAnalysis(text, nearMe, userLocation, browserLanguage);
    }

    /**
     * LLM-based analysis and translation
     * Returns structured JSON with all translation info in one call
     */
    private async llmAnalyzeAndTranslate(text: string): Promise<TranslationAnalysis> {
        if (!this.llm) {
            throw new Error('LLM provider not available');
        }

        const system = `You are a translation analyzer for restaurant search queries.
Your job is to:
1. Detect what language the user typed in
2. Identify what region/country they're searching in
3. Determine the native language of that region
4. Translate the query to the region's native language for better search results

Return STRICT JSON matching this schema:
{
  "inputLanguage": string,    // Language user typed (he, en, fr, es, etc.)
  "targetRegion": string,     // ISO country code (IL, FR, US, etc.)
  "regionLanguage": string,   // Native language of region (he, fr, en, etc.)
  "translatedQuery": string   // Query translated to region's language
}

Rules:
- Extract city/country from text to determine targetRegion
- If no location in text, assume user's current region
- Translate ONLY the food category and modifiers (e.g., "pizza" → "פיצה", "gluten free" → "ללא גלוטן")
- Keep city/place names in their ORIGINAL language (proper nouns should NOT be translated!)
- If inputLanguage === regionLanguage, still return translatedQuery (no translation needed)

Examples:
1. Input: "pizza gluten free in gedera"
   → { "inputLanguage": "en", "targetRegion": "IL", "regionLanguage": "he", "translatedQuery": "פיצה ללא גלוטן in gedera" }

2. Input: "פיצה בפריז"
   → { "inputLanguage": "he", "targetRegion": "FR", "regionLanguage": "fr", "translatedQuery": "pizza בפריז" }

3. Input: "pizza in New York"
   → { "inputLanguage": "en", "targetRegion": "US", "regionLanguage": "en", "translatedQuery": "pizza in New York" }

4. Input: "פיצה ללא גלוטן בתל אביב"
   → { "inputLanguage": "he", "targetRegion": "IL", "regionLanguage": "he", "translatedQuery": "פיצה ללא גלוטן בתל אביב" }

5. Input: "بيتزا في أشكلون"
   → { "inputLanguage": "ar", "targetRegion": "IL", "regionLanguage": "he", "translatedQuery": "פיצה في أشكلون" }`;

        const user = `Analyze and translate this search query:\n"${text}"\n\nReturn only the JSON.`;

        const messages: Message[] = [
            { role: 'system', content: system },
            { role: 'user', content: user }
        ];

        const result = await this.llm.completeJSON(messages, TranslationAnalysisSchema, { temperature: 0 });
        return result as TranslationAnalysis;
    }

    /**
     * Fallback analysis when LLM fails
     * Uses heuristics and existing geocoding logic
     * Privacy-aware: only uses userLocation if nearMe=true
     */
    private async fallbackAnalysis(
        text: string,
        nearMe: boolean,
        userLocation?: { lat: number; lng: number },
        browserLanguage?: string
    ): Promise<TranslationResult> {
        // Step 1: Detect input language (simple heuristic)
        const inputLanguage = this.detectLanguageHeuristic(text);

        // Step 2: Determine target region (privacy-aware cascade)
        let targetRegion = 'IL'; // Default
        let regionSource: 'userLocation' | 'textCity' | 'browserLanguage' | 'default' = 'default';

        if (nearMe && userLocation) {
            // User asked for "near me" AND granted location permission
            targetRegion = this.getRegionFromCoords(userLocation);
            regionSource = 'userLocation';
        } else {
            // Extract city from text (reuse existing logic if available)
            const cityMatch = this.extractCityFromText(text);
            if (cityMatch) {
                try {
                    // Use existing geocoding
                    const coords = await this.geocodingClient.geocodeAddress(
                        cityMatch,
                        inputLanguage === 'he' || inputLanguage === 'en' ? inputLanguage : undefined
                    );
                    if (coords) {
                        targetRegion = this.getRegionFromCoords(coords);
                        regionSource = 'textCity';
                    }
                } catch (error) {
                    console.warn('[TranslationService] Geocoding failed for city:', cityMatch, (error as Error)?.message);
                }
            }

            // If still no region, try browserLanguage
            if (targetRegion === 'IL' && browserLanguage) {
                const parts = browserLanguage.split('-');
                if (parts.length > 1 && parts[1]) {
                    targetRegion = parts[1].toUpperCase();
                    regionSource = 'browserLanguage';
                }
            }
        }

        // Step 3: Map region to language
        const regionLanguage = this.getRegionLanguage(targetRegion);

        // Step 4: No translation in fallback (too risky without LLM)
        const skipTranslation = inputLanguage === regionLanguage;

        return {
            inputLanguage,
            targetRegion,
            regionLanguage,
            translatedQuery: text, // Original text, no translation in fallback
            skipTranslation,
            fallback: true,
            regionSource,
            note: `Translation service unavailable; region detected from ${regionSource}`
        };
    }

    /**
     * Translate a single category word (e.g., "pizza" → "פיצה")
     * Fast, simple translation for the hybrid approach
     * 
     * @param category - Single word or short phrase (e.g., "pizza", "italian restaurant")
     * @param fromLang - Source language
     * @param toLang - Target language
     */
    async translateCategory(
        category: string,
        fromLang: Language,
        toLang: Language
    ): Promise<string> {
        // Skip if same language
        if (fromLang === toLang) {
            return category;
        }

        // Skip if no LLM
        if (!this.llm) {
            console.warn('[TranslationService] LLM not available for category translation');
            return category;
        }

        try {
            const system = `You are a translator. Translate the food category from ${fromLang} to ${toLang}.
Return ONLY the translated word, nothing else. Keep it simple and natural.

Examples:
- "pizza" (en→he) → "פיצה"
- "burger" (en→he) → "המבורגר"
- "italian restaurant" (en→he) → "מסעדה איטלקית"
- "פלאפל" (he→en) → "falafel"`;

            const user = `Translate: "${category}"`;

            const response = await this.llm.complete([
                { role: 'system', content: system },
                { role: 'user', content: user }
            ]);

            const translated = response.trim();
            console.log(`[TranslationService] Category: "${category}" → "${translated}" (${fromLang}→${toLang})`);
            return translated;
        } catch (error) {
            console.warn('[TranslationService] Category translation failed:', (error as Error)?.message);
            return category; // Fallback to original
        }
    }

    /**
     * Translate result fields back to user's input language
     * Only translates name and address (MVP scope)
     * Uses batching to prevent timeouts on large result sets
     * 
     * @param places - Array of place items from Google
     * @param fromLang - Language results are in (region language)
     * @param toLang - Language to translate to (user's input language)
     */
    async translateResults(
        places: PlaceItem[],
        fromLang: Language,
        toLang: Language
    ): Promise<PlaceItem[]> {
        // Skip if same language
        if (fromLang === toLang) {
            return places;
        }

        // Skip if no LLM
        if (!this.llm) {
            console.warn('[TranslationService] LLM not available for result translation');
            return places;
        }

        // Skip if no places
        if (places.length === 0) {
            return places;
        }

        try {
            // Batch size limit to avoid timeouts (10 places per batch)
            const BATCH_SIZE = 10;
            const batches: PlaceItem[][] = [];

            for (let i = 0; i < places.length; i += BATCH_SIZE) {
                batches.push(places.slice(i, i + BATCH_SIZE));
            }

            console.log(`[TranslationService] Translating ${places.length} places in ${batches.length} batch(es)`);

            // Translate all batches in parallel
            const translatedBatches = await Promise.all(
                batches.map(batch => this.batchTranslateFields(batch, fromLang, toLang))
            );

            // Flatten results
            const allTranslations = translatedBatches.flat();

            // Map translations back to places
            return places.map((place, index) => ({
                ...place,
                name: allTranslations[index]?.name || place.name,
                address: allTranslations[index]?.address || place.address
            }));
        } catch (error) {
            console.warn('[TranslationService] Result translation failed', (error as Error)?.message);
            // Return original results if translation fails
            return places;
        }
    }

    /**
     * Batch translate place names and addresses
     * Uses completeJSON with Zod schema for reliable structured output
     */
    private async batchTranslateFields(
        places: PlaceItem[],
        fromLang: Language,
        toLang: Language
    ): Promise<Array<{ name: string; address: string }>> {
        if (!this.llm) {
            throw new Error('LLM not available');
        }

        // Build translation request
        const items = places.map(p => ({ name: p.name, address: p.address }));
        const itemsJson = JSON.stringify(items, null, 2);

        const system = `You are a professional translator specializing in place names and addresses.
Translate each place's "name" and "address" from ${fromLang} to ${toLang}.
Return a JSON array with the same number of items, in the same order.
Keep proper nouns, numbers, and place IDs recognizable.
For addresses, translate street types (Street, Avenue, Road) but keep street names mostly intact.

CRITICAL: Return ONLY valid JSON array matching the schema, no markdown, no explanations.`;

        const user = `Translate these ${places.length} places from ${fromLang} to ${toLang}:

${itemsJson}

Return a JSON array of objects with "name" and "address" fields.`;

        const messages: Message[] = [
            { role: 'system', content: system },
            { role: 'user', content: user }
        ];

        try {
            // Use completeJSON with schema for structured output
            const result = await this.llm.completeJSON(messages, BatchTranslationSchema, {
                temperature: 0
            });

            const parsed = BatchTranslationSchema.parse(result);

            // Validate we got the same number of items
            if (parsed.length !== items.length) {
                console.warn(`[TranslationService] Expected ${items.length} translations, got ${parsed.length}`);
                return items; // Return originals if count mismatch
            }

            return parsed;
        } catch (error) {
            console.warn('[TranslationService] Batch translation failed:', (error as Error)?.message);
            // Fallback: return original items
            return items;
        }
    }

    /**
     * Detect language using simple heuristic
     * Checks for Hebrew, French, and other Unicode ranges
     */
    private detectLanguageHeuristic(text: string): Language {
        const hasHebrew = /[\u0590-\u05FF]/.test(text);
        if (hasHebrew) return 'he';

        const hasFrench = /[àâäéèêëïîôùûüÿç]/i.test(text);
        if (hasFrench) return 'fr';

        const hasCyrillic = /[\u0400-\u04FF]/.test(text);
        if (hasCyrillic) return 'ru';

        const hasArabic = /[\u0600-\u06FF]/.test(text);
        if (hasArabic) return 'ar';

        // Default to English
        return 'en';
    }

    /**
     * Extract city name from text using simple heuristics
     * Looks for common patterns like "in [City]", "at [City]", etc.
     */
    private extractCityFromText(text: string): string | null {
        // Common patterns in English and Hebrew
        const patterns = [
            /\b(?:in|at|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i, // "in Tel Aviv"
            /\b(?:ב|בתל|ליד)\s*([א-ת\s]+)/,  // Hebrew: "בתל אביב"
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                return match[1].trim();
            }
        }

        // Try to find capitalized words (likely city names in English)
        const capitalizedMatch = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
        if (capitalizedMatch && capitalizedMatch[1]) {
            const word = capitalizedMatch[1];
            // Filter out common food words
            const foodWords = ['Pizza', 'Burger', 'Sushi', 'Pasta', 'Salad'];
            if (!foodWords.includes(word)) {
                return word;
            }
        }

        return null;
    }

    /**
     * Get region code from coordinates
     * Simple implementation for MVP (can be enhanced with reverse geocoding)
     */
    private getRegionFromCoords(coords: { lat: number; lng: number }): string {
        const { lat, lng } = coords;

        // Israel
        if (lat >= 29.5 && lat <= 33.3 && lng >= 34.2 && lng <= 35.9) {
            return 'IL';
        }

        // France (approximate)
        if (lat >= 42 && lat <= 51 && lng >= -5 && lng <= 8) {
            return 'FR';
        }

        // US (approximate)
        if (lat >= 25 && lat <= 49 && lng >= -125 && lng <= -66) {
            return 'US';
        }

        // UK (approximate)
        if (lat >= 50 && lat <= 59 && lng >= -8 && lng <= 2) {
            return 'GB';
        }

        // Default to IL
        return 'IL';
    }

    /**
     * Get region's native language from fallback map
     */
    private getRegionLanguage(region: string): Language {
        return this.FALLBACK_REGION_LANGUAGE[region] || 'en';
    }

    /**
     * Create default result (empty text or error case)
     */
    private createDefaultResult(text: string): TranslationResult {
        return {
            inputLanguage: 'en',
            targetRegion: 'IL',
            regionLanguage: 'he',
            translatedQuery: text,
            skipTranslation: true,
            note: 'Empty query'
        };
    }
}

