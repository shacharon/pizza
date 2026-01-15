import { createHash } from 'crypto';
import type { LLMProvider, Message } from '../../llm/types.js';
import { IntentGateSchema, type IntentGateResult } from './intent-gate.types.js';
import { INTENT_GATE_TIMEOUT_MS } from '../../config/intent-flags.js';
import { logger } from '../../lib/logger/structured-logger.js';
import { applyFoodTypeFallback } from './food-type-fallback.js';

/**
 * Static JSON Schema for Intent Gate
 * Used directly with OpenAI Structured Outputs instead of converting from Zod
 * This ensures we always have a valid root type "object"
 */
const INTENT_GATE_JSON_SCHEMA = {
    type: "object",
    properties: {
        language: {
            type: "string",
            enum: ["he", "en", "ru", "ar", "fr", "es", "other"]
        },
        hasFood: { type: "boolean" },
        food: {
            type: "object",
            properties: {
                raw: { type: ["string", "null"] },
                canonical: { type: ["string", "null"] }
            },
            required: ["raw", "canonical"],
            additionalProperties: false
        },
        hasLocation: { type: "boolean" },
        location: {
            type: "object",
            properties: {
                raw: { type: ["string", "null"] },
                canonical: { type: ["string", "null"] },
                isRelative: { type: "boolean" },
                requiresUserLocation: { type: "boolean" }
            },
            required: ["raw", "canonical", "isRelative", "requiresUserLocation"],
            additionalProperties: false
        },
        hasModifiers: { type: "boolean" },
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
        route: {
            type: "string",
            enum: ["CORE", "FULL_LLM", "ASK_CLARIFY"]
        },
        routeReason: { type: "string" }
    },
    required: ["language", "hasFood", "food", "hasLocation", "location", "hasModifiers", "modifiers", "confidence", "route", "routeReason"],
    additionalProperties: false
} as const;

/**
 * Intent Gate Service - Lightweight routing decision
 * 
 * Purpose: Fast (~1s) analysis to determine routing:
 * - CORE: Clear food+location, no modifiers → skip full intent
 * - FULL_LLM: Has modifiers OR needs deeper analysis
 * - ASK_CLARIFY: Missing anchors, need user input
 * 
 * Performance: ~150 tokens input, ~100 tokens output, ~1200ms
 */

const GATE_PROMPT_VERSION = "gate_v1";
const GATE_SYSTEM_PROMPT = `You are a lightweight intent classifier for food search.

Analyze the query and return ONLY JSON (no markdown, no code fences).

Your job:
1. Detect language (he/en/ru/ar/fr/es/other)
2. Extract food anchor (raw text + English canonical)
3. Extract location anchor (raw text + original language canonical)
4. Detect modifiers (openNow, cheap, dietary restrictions, delivery, etc.)
5. Decide routing:
   - CORE: Clear food+location, no modifiers, high confidence (≥0.85)
   - FULL_LLM: Has modifiers OR confidence < 0.85 but has at least one anchor
   - ASK_CLARIFY: Missing both food and location

Canonical food mapping (multi-language):
- Meat: he="בשרים"/"מסעדת בשרים"/"סטייק"/"על האש", en="meat restaurant"/"steakhouse"/"grill"/"bbq", ru="мясной ресторан"/"стейкхаус"/"гриль" → food.canonical="meat restaurant"
- Dairy: he="חלבי"/"מסעדה חלבית", en="dairy restaurant", ru="молочный ресторан" → food.canonical="dairy restaurant"
- Hummus: he="חומוס"/"חומוסיה"/"חומוסייה", en="hummus"/"hummus place", ru="хумус"/"хумусия" → food.canonical="hummus restaurant"
- Vegetarian: he="צמחוני"/"מסעדה צמחונית", en="vegetarian restaurant", ru="вегетарианский ресторан" → food.canonical="vegetarian restaurant"

Classification: These are CATEGORIES, not modifiers.

Rules:
- food.canonical MUST be English (e.g., "pizza", "sushi", "italian restaurant")
- location.canonical MUST keep original language (e.g., "תל אביב", "Paris")
- location.isRelative = true for "near me", "closest", "around here"
- location.requiresUserLocation = true if isRelative OR no location specified
- Be conservative: if unsure, route to FULL_LLM
- Never hallucinate food or location`;

const GATE_PROMPT_HASH = createHash('sha256')
    .update(GATE_SYSTEM_PROMPT, 'utf8')
    .digest('hex');

export class IntentGateService {
    constructor(private readonly llm: LLMProvider | null) { }

    /**
     * Analyze query and return routing decision
     * 
     * @param query User query text
     * @param opts Optional context (requestId, traceId, sessionId)
     * @returns Gate result with routing decision
     */
    async analyze(query: string, opts?: { requestId?: string; traceId?: string; sessionId?: string }): Promise<IntentGateResult> {
        const requestId = opts?.requestId;
        const traceId = opts?.traceId;
        const sessionId = opts?.sessionId;
        const startTime = Date.now();

        if (!this.llm) {
            // Fallback: no LLM available, route to FULL_LLM for safety
            logger.warn({ requestId, query }, '[IntentGateService] No LLM available, routing to FULL_LLM');
            return this.createFallbackResult('no_llm_available');
        }

        try {
            const userPrompt = `Query: "${query}"

Return JSON with your analysis and routing decision.`;

            const messages: Message[] = [
                { role: 'system', content: GATE_SYSTEM_PROMPT },
                { role: 'user', content: userPrompt }
            ];

            // Use static JSON Schema instead of converting from Zod
            // This ensures we always have a valid root type "object"
            const result = await this.llm.completeJSON(
                messages,
                IntentGateSchema,
                {
                    temperature: 0,
                    timeout: INTENT_GATE_TIMEOUT_MS,
                    promptVersion: GATE_PROMPT_VERSION,
                    promptHash: GATE_PROMPT_HASH,
                    promptLength: GATE_SYSTEM_PROMPT.length,
                    // Pass real context IDs (do not overwrite with requestId)
                    ...(traceId && { traceId }),
                    ...(sessionId && { sessionId }),
                    ...(requestId && { requestId }),  // For timing correlation
                    stage: 'intent_gate'  // Identify this call stage
                },
                INTENT_GATE_JSON_SCHEMA // Pass static schema
            );

            const durationMs = Date.now() - startTime;

            // Apply deterministic fallback for common food types
            result.food.canonical = applyFoodTypeFallback(
                query,
                result.food.canonical,
                result.confidence,
                0.7
            );

            logger.debug({
                requestId,
                route: result.route,
                confidence: result.confidence,
                durationMs
            }, '[IntentGateService] Gate analysis completed');

            return result;

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'unknown';
            const errorName = error instanceof Error ? error.name : 'unknown';
            const durationMs = Date.now() - startTime;

            // Determine failure reason for better debugging
            let reason = 'gate_failed';
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
                    stage: 'intent_gate',
                    reason: 'timeout',
                    timeoutMs: INTENT_GATE_TIMEOUT_MS,
                    elapsedMs: durationMs,
                    promptVersion: GATE_PROMPT_VERSION,
                    error: errorMsg
                }, 'intent_gate_failed');
            } else {
                logger.error({
                    requestId,
                    traceId, // Keep original traceId
                    sessionId, // Keep original sessionId
                    stage: 'intent_gate',
                    query,
                    error: errorMsg,
                    reason,
                    durationMs,
                    promptVersion: GATE_PROMPT_VERSION
                }, 'intent_gate_failed');
            }

            // Fallback: route to FULL_LLM (safe default)
            // This is recoverable - gate timeout doesn't mean the query is invalid
            return this.createFallbackResult(reason);
        }
    }

    /**
     * Create fallback result when gate fails
     * Routes to FULL_LLM for safety
     */
    private createFallbackResult(reason: string): IntentGateResult {
        // Normalize timeout reason for consistent logging
        const normalizedReason = reason === 'timeout' ? 'gate_timeout' : reason;

        return {
            language: 'other',
            hasFood: false,
            food: { raw: null, canonical: null },
            hasLocation: false,
            location: {
                raw: null,
                canonical: null,
                isRelative: false,
                requiresUserLocation: true
            },
            hasModifiers: false,
            modifiers: {
                openNow: false,
                cheap: false,
                glutenFree: false,
                vegetarian: false,
                vegan: false,
                kosher: false,
                delivery: false,
                takeaway: false,
                exclude: []
            },
            confidence: 0,
            route: 'FULL_LLM',
            routeReason: normalizedReason
        };
    }
}
