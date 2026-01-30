/**
 * Cuisine Enforcer Service
 * LLM-based post-Google filtering for explicit cuisine queries
 * 
 * NO HARDCODED RULES - Pure LLM understanding of cuisine signals
 */

import type { Message } from '../../../../../llm/types.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import { resolveLLM } from '../../../../../lib/llm/index.js';
import type { LLMProvider } from '../../../../../llm/types.js';
import {
  CuisineEnforcementResponseSchema,
  CUISINE_ENFORCEMENT_JSON_SCHEMA,
  CUISINE_ENFORCEMENT_SCHEMA_HASH,
  type PlaceInput,
  type CuisineEnforcementResponse
} from './cuisine-enforcer.schema.js';

const CUISINE_ENFORCER_VERSION = 'cuisine_enforcer_v1';

const CUISINE_ENFORCER_SYSTEM_PROMPT = `You are a cuisine enforcement filter for restaurant search results.

Your task: Given a list of places from Google Maps and explicit cuisine requirements (requiredTerms, preferredTerms), determine which places ACTUALLY match the cuisine intent.

NO HARDCODED RULES - Use your understanding of:
- Restaurant names (e.g., "Pasta Bar" = Italian)
- Google place types (e.g., "italian_restaurant")
- Address context
- Cuisine keywords in any language

Output ONLY JSON with:
{
  "keepPlaceIds": ["id1", "id2", ...],
  "relaxApplied": boolean,
  "relaxStrategy": "none" | "fallback_preferred" | "drop_required_once"
}

Rules:
1) STRICT mode: Keep only places that STRONGLY match requiredTerms via name/types/address signals
2) If keepPlaceIds.length < 5 in STRICT, apply relaxation ONCE:
   - Try strategy "fallback_preferred": include places matching preferredTerms
   - If still < 5, try "drop_required_once": relax to broader cuisine category
3) RELAX_IF_EMPTY mode: Prioritize requiredTerms but keep top places even if no strong match
4) ALWAYS return keepPlaceIds in best-first order (strongest match first)
5) If no matches at all after relaxation: return empty keepPlaceIds with relaxApplied=true

Examples:
Query: "מסעדות איטלקיות" (Italian restaurants)
- requiredTerms: ["איטלקית", "איטלקי"]
- KEEP: "Pasta Bar", "Pizza Hut" (name signals), place with types=["italian_restaurant"]
- REJECT: "Burger King", "סושי בר" (no Italian signals)

Query: "מסעדות טובות" (good restaurants)
- requiredTerms: []
- strictness: RELAX_IF_EMPTY
- KEEP: All places (no specific cuisine requirement)
`;

const CUISINE_ENFORCER_USER_PROMPT_TEMPLATE = `Strictness: {{strictness}}
Required Terms: {{requiredTerms}}
Preferred Terms: {{preferredTerms}}

Places ({{count}} total):
{{places}}

Filter these places based on cuisine requirements. Return keepPlaceIds in best-first order.`;

export interface CuisineEnforcerInput {
  requiredTerms: string[];
  preferredTerms: string[];
  strictness: 'STRICT' | 'RELAX_IF_EMPTY';
  places: PlaceInput[];
}

/**
 * Execute cuisine enforcement via LLM
 */
export async function executeCuisineEnforcement(
  input: CuisineEnforcerInput,
  llmProvider: LLMProvider,
  requestId: string
): Promise<CuisineEnforcementResponse> {
  const { requiredTerms, preferredTerms, strictness, places } = input;

  // Early exit: no places to filter
  if (places.length === 0) {
    return {
      keepPlaceIds: [],
      relaxApplied: false,
      relaxStrategy: 'none'
    };
  }

  // Early exit: no required terms and RELAX mode => keep all
  if (requiredTerms.length === 0 && strictness === 'RELAX_IF_EMPTY') {
    return {
      keepPlaceIds: places.map(p => p.placeId),
      relaxApplied: false,
      relaxStrategy: 'none'
    };
  }

  try {
    // Build user prompt with places data
    const placesText = places.map((p, idx) => {
      const typesStr = p.types.length > 0 ? p.types.join(', ') : 'none';
      const addressStr = p.address || 'unknown';
      return `${idx + 1}. placeId="${p.placeId}", name="${p.name}", types=[${typesStr}], address="${addressStr}"`;
    }).join('\n');

    const userPrompt = CUISINE_ENFORCER_USER_PROMPT_TEMPLATE
      .replace('{{strictness}}', strictness)
      .replace('{{requiredTerms}}', JSON.stringify(requiredTerms))
      .replace('{{preferredTerms}}', JSON.stringify(preferredTerms))
      .replace('{{count}}', String(places.length))
      .replace('{{places}}', placesText);

    const messages: Message[] = [
      { role: 'system', content: CUISINE_ENFORCER_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ];

    // Resolve LLM config
    const { model, timeoutMs } = resolveLLM('filterEnforcer');

    logger.info({
      requestId,
      event: 'cuisine_enforcement_llm_call',
      version: CUISINE_ENFORCER_VERSION,
      strictness,
      requiredTermsCount: requiredTerms.length,
      preferredTermsCount: preferredTerms.length,
      placesCount: places.length,
      model,
      schemaHash: CUISINE_ENFORCEMENT_SCHEMA_HASH
    }, '[CUISINE_ENFORCER] Calling LLM for enforcement');

    // Call LLM with structured output
    const response = await llmProvider.completeJSON(
      messages,
      CuisineEnforcementResponseSchema,
      {
        model,
        temperature: 0,
        timeout: timeoutMs,
        requestId,
        stage: 'cuisine_enforcer',
        schemaHash: CUISINE_ENFORCEMENT_SCHEMA_HASH
      },
      CUISINE_ENFORCEMENT_JSON_SCHEMA  // Pass static schema as 4th argument
    );

    logger.info({
      requestId,
      event: 'cuisine_enforcement_llm_success',
      keepCount: response.data.keepPlaceIds.length,
      relaxApplied: response.data.relaxApplied,
      relaxStrategy: response.data.relaxStrategy
    }, '[CUISINE_ENFORCER] LLM enforcement completed');

    return response.data;

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    logger.error({
      requestId,
      event: 'cuisine_enforcement_llm_failed',
      error: msg
    }, '[CUISINE_ENFORCER] LLM call failed, returning all places');

    // Fail gracefully: return all places
    return {
      keepPlaceIds: places.map(p => p.placeId),
      relaxApplied: false,
      relaxStrategy: 'none'
    };
  }
}
