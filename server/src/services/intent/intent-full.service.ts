import { createHash } from 'crypto';
import type { LLMProvider, Message } from '../../llm/types.js';
import { IntentFullSchema, type IntentFullResult } from './intent-full.types.js';
import { INTENT_FULL_TIMEOUT_MS } from '../../config/intent-flags.js';
import { logger } from '../../lib/logger/structured-logger.js';
import { applyFoodTypeFallback } from './food-type-fallback.js';

/**
 * Static JSON Schema for Full Intent
 * Used directly with OpenAI Structured Outputs instead of converting from Zod
 * This ensures we always have a valid root type "object"
 */
const INTENT_FULL_JSON_SCHEMA = {
    type: "object",
    properties: {
        language: {
            type: "string",
            enum: ["he", "en", "ru", "ar", "fr", "es", "other"]
        },
        canonicalCategory: { type: ["string", "null"] },
        locationText: { type: ["string", "null"] },
        isRelativeLocation: { type: "boolean" },
        requiresUserLocation: { type: "boolean" },
        modifiers: {
            type: "object",
            properties: {
                openNow: { type: "boolean" },
                cheap: { type: "boolean" },
                glutenFree: { type: "boolean" },
                vegetarian: { type: "boolean" },
                vegan: { type: "boolean" },
                kosher: { type: "boolean" },
                delivery: { type: "boolean" },
                takeaway: { type: "boolean" },
                exclude: {
                    type: "array",
                    items: { type: "string" }
                }
            },
            required: ["openNow", "cheap", "glutenFree", "vegetarian", "vegan", "kosher", "delivery", "takeaway", "exclude"],
            additionalProperties: false
        },
        confidence: {
            type: "number",
            minimum: 0,
            maximum: 1
        },
        explanation: { type: "string" }
    },
    required: ["language", "canonicalCategory", "locationText", "isRelativeLocation", "requiresUserLocation", "modifiers", "confidence", "explanation"],
    additionalProperties: false
} as const;

/**
 * Full Intent Service - Complete extraction with modifiers
 * 
 * Purpose: Deep analysis when Gate routes to FULL_LLM
 * - Extract canonical category (English)
 * - Extract location (original language)
 * - Detect all modifiers (dietary, price, delivery, etc.)
 * - Provide explanation for routing
 * 
 * Performance: ~200 tokens input, ~150 tokens output, ~2500ms
 */

const FULL_INTENT_VERSION = "full_v1";
const FULL_INTENT_SYSTEM_PROMPT = `You are a comprehensive intent extractor for food search.

Extract complete intent from the query and return ONLY JSON (no markdown, no code fences).

Your job:
1. Extract canonical food category (MUST be English: "pizza", "sushi", "italian restaurant")
2. Extract location text (MUST keep original language: "תל אביב", "Paris", "Гедере")
3. Detect if location is relative ("near me", "closest")
4. Detect ALL modifiers:
   - openNow: "open now", "פתוח עכשיו", "ouvert maintenant"
   - cheap: "זול", "cheap", "budget", "pas cher"
   - glutenFree: "ללא גלוטן", "gluten free", "sans gluten"
   - vegetarian: "צמחוני", "vegetarian", "végétarien"
   - vegan: "טבעוני", "vegan", "végétalien"
   - kosher: "כשר", "kosher"
   - delivery: "משלוח", "delivery", "livraison"
   - takeaway: "טייק אווי", "takeaway", "à emporter"
   - exclude: list of items to exclude

Canonical food mapping (multi-language):
- Meat: he="בשרים"/"מסעדת בשרים"/"סטייק", en="meat restaurant"/"steakhouse"/"grill", ru="мясной ресторан" → canonicalCategory="meat restaurant"
- Dairy: he="חלבי"/"מסעדה חלבית", en="dairy restaurant", ru="молочный ресторан" → canonicalCategory="dairy restaurant"
- Hummus: he="חומוס"/"חומוסיה", en="hummus"/"hummus place", ru="хумус"/"хумусия" → canonicalCategory="hummus restaurant"
- Vegetarian: he="צמחוני", en="vegetarian restaurant", ru="вегетарианский" → canonicalCategory="vegetarian restaurant"

Special cases:
- Query only contains "חלבי" without explicit food → canonicalCategory="dairy restaurant"
- Query only contains "בשרים" → canonicalCategory="meat restaurant"
- Query only contains "חומוסיה" → canonicalCategory="hummus restaurant"

Rules:
- canonicalCategory MUST be English only
- locationText MUST keep original language
- isRelativeLocation = true for "near me", "closest", "around me"
- requiresUserLocation = true if no specific location OR relative location
- Be conservative: if no location mentioned, set locationText = null and requiresUserLocation = true
- Never hallucinate food or location
- glutenFree is a MODIFIER (modifiers.glutenFree=true), not a category
- luxury/upscale is a MODIFIER (modifiers.cheap=false or note in explanation), not a category
- meat/dairy/hummus/vegetarian are CATEGORIES, not modifiers
- Provide brief explanation of your extraction`;

const FULL_INTENT_PROMPT_HASH = createHash('sha256')
    .update(FULL_INTENT_SYSTEM_PROMPT, 'utf8')
    .digest('hex');

export class IntentFullService {
    constructor(private readonly llm: LLMProvider | null) {}

    /**
     * Extract full intent with modifiers
     * 
     * @param query User query text
     * @param sessionContext Session context for continuity
     * @param opts Optional context (requestId, traceId, sessionId)
     * @returns Full intent result
     */
    async extract(
        query: string, 
        sessionContext?: any,
        opts?: { requestId?: string; traceId?: string; sessionId?: string } | string
    ): Promise<IntentFullResult> {
        // Support legacy string parameter for backwards compatibility
        const requestId = typeof opts === 'string' ? opts : opts?.requestId;
        const traceId = typeof opts === 'object' ? opts?.traceId : undefined;
        const sessionId = typeof opts === 'object' ? opts?.sessionId : undefined;
        
        const startTime = Date.now();
        
        if (!this.llm) {
            logger.error({ requestId, query }, '[IntentFullService] No LLM available');
            throw new Error('Full intent extraction requires LLM');
        }

        try {
            const userPrompt = `Query: "${query}"

${sessionContext ? `Context: ${JSON.stringify(sessionContext)}` : ''}

Return JSON with complete intent extraction.`;

            const messages: Message[] = [
                { role: 'system', content: FULL_INTENT_SYSTEM_PROMPT },
                { role: 'user', content: userPrompt }
            ];
            
            // Use static JSON Schema instead of converting from Zod
            // This ensures we always have a valid root type "object"
            const result = await this.llm.completeJSON(
                messages, 
                IntentFullSchema, 
                {
                    temperature: 0,
                    timeout: INTENT_FULL_TIMEOUT_MS,
                    promptVersion: FULL_INTENT_VERSION,
                    promptHash: FULL_INTENT_PROMPT_HASH,
                    promptLength: FULL_INTENT_SYSTEM_PROMPT.length,
                    // Pass real context IDs (do not overwrite with requestId)
                    ...(traceId && { traceId }),
                    ...(sessionId && { sessionId }),
                    ...(requestId && { requestId }),  // For timing correlation
                    stage: 'intent_full'  // Identify this call stage
                },
                INTENT_FULL_JSON_SCHEMA // Pass static schema
            );

            const durationMs = Date.now() - startTime;

            // Apply deterministic fallback for common food types
            result.canonicalCategory = applyFoodTypeFallback(
                query,
                result.canonicalCategory,
                result.confidence,
                0.7
            );

            logger.debug({ 
                requestId, 
                confidence: result.confidence,
                hasModifiers: Object.values(result.modifiers).some(v => v === true || (Array.isArray(v) && v.length > 0)),
                durationMs 
            }, '[IntentFullService] Full intent extraction completed');

            return result;

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'unknown';
            const errorName = error instanceof Error ? error.name : 'unknown';
            const durationMs = Date.now() - startTime;
            
            // Determine failure reason for better debugging
            let reason = 'extraction_failed';
            const isTimeout = errorMsg.includes('timeout') || 
                             errorMsg.includes('aborted') || 
                             errorMsg.includes('AbortError') ||
                             errorName === 'AbortError';
            
            if (errorMsg.includes('Invalid JSON Schema')) {
                reason = 'invalid_schema';
            } else if (isTimeout) {
                reason = 'timeout';
            } else if (errorMsg.includes('parse') || errorMsg.includes('JSON')) {
                reason = 'parse_error';
            }
            
            // Log timeout with specific details
            if (isTimeout) {
                logger.warn({ 
                    requestId,
                    traceId, // Keep original traceId
                    sessionId, // Keep original sessionId
                    query, 
                    reason: 'timeout',
                    timeoutMs: INTENT_FULL_TIMEOUT_MS,
                    elapsedMs: durationMs,
                    error: errorMsg
                }, 'intent_full_failed');
            } else {
                logger.error({ 
                    requestId,
                    traceId, // Keep original traceId
                    sessionId, // Keep original sessionId
                    query, 
                    error: errorMsg,
                    reason,
                    durationMs
                }, 'intent_full_failed');
            }

            // Re-throw error - full intent timeout is a hard failure
            // (unlike gate timeout which can fallback)
            throw error;
        }
    }
}
