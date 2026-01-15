/**
 * Intent Lite Stage - V2 Pipeline
 * 
 * LLM-based lightweight intent extraction
 * 
 * Behavior:
 * - Extracts canonical food (English) and location (original language)
 * - Determines target type (EXACT, COORDS, FREE)
 * - Detects virtual flags (dietary, openNow, etc.)
 * - Timeout with fallback to minimal safe intent
 * 
 * Phase: V2 Pipeline Real Implementation
 */

import { z } from 'zod';
import type { GateResult, IntentLiteResult, PipelineContext } from '../types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { createLLMProvider } from '../../../../llm/factory.js';
import type { LLMProvider, Message } from '../../../../llm/types.js';
import { INTENT_LITE_TIMEOUT_MS } from '../../../../config/intent-flags.js';

const INTENT_LITE_PROMPT_VERSION = "intent_lite_v1";

/**
 * Zod schema for INTENT_LITE JSON response
 */
const IntentLiteSchema = z.object({
  food: z.object({
    raw: z.string().optional(),
    canonical: z.string() // English canonical form
  }),
  location: z.object({
    text: z.string().optional(),
    isRelative: z.boolean()
  }), // Required, but text is optional
  radiusMeters: z.number().optional(),
  targetType: z.enum(['EXACT', 'COORDS', 'FREE']),
  confidence: z.number().min(0).max(1),
  virtual: z.object({
    dairy: z.boolean().optional(),
    meat: z.boolean().optional(),
    kosher: z.boolean().optional(),
    vegan: z.boolean().optional(),
    vegetarian: z.boolean().optional(),
    glutenFree: z.boolean().optional(),
    openNow: z.boolean().optional(),
    cheap: z.boolean().optional(),
    delivery: z.boolean().optional()
  }).optional()
});

type IntentLiteOutput = z.infer<typeof IntentLiteSchema>;

/**
 * System prompt for INTENT_LITE stage
 */
const INTENT_LITE_SYSTEM_PROMPT = `You are a food search intent extractor for a V2 search pipeline.

Your job: Extract structured intent from the user's query.

Output ONLY JSON (no markdown, no code fences).

Required fields:
- food: { raw?: string, canonical: string }
  - canonical: English canonical form (e.g., "pizza", "italian restaurant", "sushi")
  - raw: optional, original food text from query
- location: { text?: string, isRelative: boolean }
  - Always include this field
  - text: optional, location text if mentioned (original language)
  - isRelative: true for "near me", "closest", etc., false otherwise
- targetType: "EXACT" | "COORDS" | "FREE"
  - EXACT: Specific restaurant name (e.g., "Romano Allenby")
  - COORDS: Relative location requiring GPS (e.g., "near me", "closest")
  - FREE: Text search (e.g., "pizza in Ashkelon", just "sushi")
- confidence: 0-1 (how confident you are)

Optional fields:
- radiusMeters: number (if query specifies distance like "100 meters", "1km")
- virtual: { kosher?, vegan?, vegetarian?, glutenFree?, openNow?, cheap?, delivery?, dairy?, meat? }
  - Only include flags that are explicitly mentioned or strongly implied

Examples:

Query: "pizza in Ashkelon"
{
  "food": { "canonical": "pizza" },
  "location": { "text": "Ashkelon", "isRelative": false },
  "targetType": "FREE",
  "confidence": 0.95
}

Query: "פיצה באשקלון"
{
  "food": { "canonical": "pizza" },
  "location": { "text": "אשקלון", "isRelative": false },
  "targetType": "FREE",
  "confidence": 0.95
}

Query: "dairy restaurant near me"
{
  "food": { "canonical": "dairy restaurant" },
  "location": { "text": "near me", "isRelative": true },
  "targetType": "COORDS",
  "confidence": 0.9,
  "virtualFlags": { "dairy": true }
}

Query: "Romano Allenby"
{
  "food": { "canonical": "Romano restaurant" },
  "location": { "text": "Allenby", "isRelative": false },
  "targetType": "EXACT",
  "confidence": 0.85
}

Query: "vegan sushi open now"
{
  "food": { "canonical": "vegan sushi" },
  "targetType": "FREE",
  "confidence": 0.9,
  "virtualFlags": { "vegan": true, "openNow": true }
}

Query: "kosher burger 100 meters from me"
{
  "food": { "canonical": "kosher burger" },
  "location": { "text": "near me", "isRelative": true },
  "radiusMeters": 100,
  "targetType": "COORDS",
  "confidence": 0.9,
  "virtualFlags": { "kosher": true }
}

Be precise. Return valid JSON only.`;

/**
 * Create fallback intent for timeout/error cases
 */
function createFallbackIntent(gateResult: GateResult): IntentLiteOutput {
  return {
    food: { canonical: 'restaurant' },
    location: { isRelative: false },
    targetType: 'FREE',
    confidence: 0.1
  };
}

/**
 * Execute INTENT_LITE stage
 * 
 * @param gateResult Output from GATE stage
 * @param context Pipeline context
 * @returns IntentLiteResult with extracted intent
 */
export async function executeIntentLiteStage(
  gateResult: GateResult,
  context: PipelineContext
): Promise<IntentLiteResult> {
  const { requestId } = context;
  const startTime = Date.now();
  
  // Log stage start
  logger.info({
    requestId,
    pipelineVersion: 'v2',
    stage: 'intent_lite',
    event: 'stage_started',
    promptVersion: INTENT_LITE_PROMPT_VERSION
  }, 'stage_started');
  
  try {
    const llm: LLMProvider | null = createLLMProvider();
    
    if (!llm) {
      logger.warn({
        requestId,
        stage: 'intent_lite',
        reason: 'llm_provider_unavailable'
      }, '[IntentLite] LLM provider unavailable, using fallback');
      
      const fallbackOutput = createFallbackIntent(gateResult);
      const durationMs = Date.now() - startTime;
      
      const result: IntentLiteResult = {
        food: { canonical: fallbackOutput.food.canonical },
        location: { isRelative: fallbackOutput.location.isRelative },
        targetType: fallbackOutput.targetType,
        confidence: fallbackOutput.confidence,
        gateResult,
        skipped: false,
        fallback: true,
        reason: 'llm_unavailable'
      };
      
      logger.info({
        requestId,
        pipelineVersion: 'v2',
        stage: 'intent_lite',
        event: 'stage_completed',
        durationMs,
        fallback: true,
        confidence: result.confidence
      }, 'stage_completed');
      
      return result;
    }
    
    // Build user prompt with context from gate
    const userPrompt = `Query: "${context.request.query}"

Context from GATE:
- Language: ${gateResult.language}
- Has food anchor: ${gateResult.hasFood}
${gateResult.food.raw ? `- Food (raw): "${gateResult.food.raw}"` : ''}
${gateResult.food.canonical ? `- Food (canonical): "${gateResult.food.canonical}"` : ''}
- Has location anchor: ${gateResult.hasLocation}
${gateResult.location.raw ? `- Location (raw): "${gateResult.location.raw}"` : ''}
${gateResult.location.isRelative ? '- Location is relative (near me)' : ''}
- Has modifiers: ${gateResult.hasModifiers}
${gateResult.modifiers.openNow ? '- Modifier: openNow' : ''}
${gateResult.modifiers.kosher ? '- Modifier: kosher' : ''}
${gateResult.modifiers.vegan ? '- Modifier: vegan' : ''}
${gateResult.modifiers.vegetarian ? '- Modifier: vegetarian' : ''}
${gateResult.modifiers.glutenFree ? '- Modifier: glutenFree' : ''}
${gateResult.modifiers.cheap ? '- Modifier: cheap' : ''}
${gateResult.modifiers.delivery ? '- Modifier: delivery' : ''}

Extract structured intent as JSON.`;

    const messages: Message[] = [
      { role: 'system', content: INTENT_LITE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ];
    
    // Call LLM with timeout
    try {
      const output = await llm.completeJSON(
        messages,
        IntentLiteSchema,
        {
          temperature: 0.3,
          timeout: INTENT_LITE_TIMEOUT_MS,
          requestId,
          ...(context.traceId && { traceId: context.traceId }),
          sessionId: context.sessionId,
          promptVersion: INTENT_LITE_PROMPT_VERSION,
          stage: 'intent_lite'
        }
      );
      
      const durationMs = Date.now() - startTime;
      
      const result: IntentLiteResult = {
        food: {
          canonical: output.food.canonical,
          ...(output.food.raw !== undefined && { raw: output.food.raw })
        },
        location: {
          isRelative: output.location.isRelative,
          ...(output.location.text !== undefined && { text: output.location.text })
        },
        targetType: output.targetType,
        confidence: output.confidence,
        ...(output.radiusMeters !== undefined && { radiusMeters: output.radiusMeters }),
        ...(output.virtual && {
          virtual: {
            ...(output.virtual.dairy !== undefined && { dairy: output.virtual.dairy }),
            ...(output.virtual.meat !== undefined && { meat: output.virtual.meat }),
            ...(output.virtual.kosher !== undefined && { kosher: output.virtual.kosher }),
            ...(output.virtual.vegan !== undefined && { vegan: output.virtual.vegan }),
            ...(output.virtual.vegetarian !== undefined && { vegetarian: output.virtual.vegetarian }),
            ...(output.virtual.glutenFree !== undefined && { glutenFree: output.virtual.glutenFree }),
            ...(output.virtual.openNow !== undefined && { openNow: output.virtual.openNow }),
            ...(output.virtual.cheap !== undefined && { cheap: output.virtual.cheap }),
            ...(output.virtual.delivery !== undefined && { delivery: output.virtual.delivery })
          }
        }),
        gateResult,
        skipped: false,
        fallback: false
      };
      
      logger.info({
        requestId,
        pipelineVersion: 'v2',
        stage: 'intent_lite',
        event: 'stage_completed',
        durationMs,
        promptVersion: INTENT_LITE_PROMPT_VERSION,
        targetType: result.targetType,
        confidence: result.confidence,
        hasLocation: !!result.location,
        fallback: false
      }, 'stage_completed');
      
      return result;
      
    } catch (error) {
      // LLM call failed (timeout or error) - use fallback
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      const isTimeout = errorMessage.toLowerCase().includes('timeout') || 
                       errorMessage.toLowerCase().includes('aborted');
      
      logger.warn({
        requestId,
        stage: 'intent_lite',
        error: errorMessage,
        isTimeout,
        reason: 'llm_call_failed'
      }, '[IntentLite] LLM call failed, using fallback');
      
      const fallbackOutput = createFallbackIntent(gateResult);
      const durationMs = Date.now() - startTime;
      
      const result: IntentLiteResult = {
        food: { canonical: fallbackOutput.food.canonical },
        location: { isRelative: fallbackOutput.location.isRelative },
        targetType: fallbackOutput.targetType,
        confidence: fallbackOutput.confidence,
        gateResult,
        skipped: false,
        fallback: true,
        reason: isTimeout ? 'timeout' : 'llm_error'
      };
      
      logger.info({
        requestId,
        pipelineVersion: 'v2',
        stage: 'intent_lite',
        event: 'stage_completed',
        durationMs,
        fallback: true,
        confidence: result.confidence
      }, 'stage_completed');
      
      return result;
    }
    
  } catch (error) {
    const durationMs = Date.now() - startTime;
    
    logger.error({
      requestId,
      pipelineVersion: 'v2',
      stage: 'intent_lite',
      event: 'stage_failed',
      durationMs,
      error: error instanceof Error ? error.message : 'unknown'
    }, 'stage_failed');
    
    throw error;
  }
}
