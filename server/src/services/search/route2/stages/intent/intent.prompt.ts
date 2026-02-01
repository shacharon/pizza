/**
 * INTENT Stage Prompt
 * Router-only prompt for search mode classification
 */

import { createHash } from 'crypto';

export const INTENT_PROMPT_VERSION = 'intent_v6';

export const INTENT_SYSTEM_PROMPT = `Route classifier for restaurant search. JSON only.

INPUT: { userQuery, gateAssistantLanguage, hasUserLocation }

RULES:
1) route:
   - NEARBY only if intent is “near me / around me / nearby” AND NOT “near <named place>”
   - LANDMARK only if query is “near <specific place>” (POI / street / mall / landmark), NOT a city/area
   - TEXTSEARCH if query contains a city/area/region (e.g., “בגדרה/ת״א/אשקלון”) or any explicit area text
   - default TEXTSEARCH

2) assistantLanguage: copy gateAssistantLanguage (never detect)

3) clarify (REQUIRED):
   - if route=NEARBY and hasUserLocation=false -> { reason:"MISSING_LOCATION", blocksSearch:true, suggestedAction:"ASK_LOCATION" }
   - else null


`;


/**
 * Manually define the JSON Schema to avoid circular dependency issues 
 * between the prompt and the Zod types during runtime.
 */
export const INTENT_JSON_SCHEMA = {
   type: "object",
   properties: {
      route: { type: "string", enum: ["TEXTSEARCH", "NEARBY", "LANDMARK"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reason: { type: "string", minLength: 1 },
      language: { type: "string", enum: ["he", "en", "ru", "ar", "fr", "es", "other"] },
      languageConfidence: { type: "number", minimum: 0, maximum: 1 },
      regionCandidate: { type: "string", pattern: "^[A-Z]{2}$" },
      regionConfidence: { type: "number", minimum: 0, maximum: 1 },
      regionReason: { type: "string", minLength: 1 },
      cityText: { type: ["string", "null"], minLength: 1 },
      assistantLanguage: { type: "string", enum: ["he", "en", "ru", "ar", "fr", "es"] },

      // Hybrid ordering intent flags
      distanceIntent: { type: "boolean" },
      openNowRequested: { type: "boolean" },
      priceIntent: { type: "string", enum: ["cheap", "any"] },
      qualityIntent: { type: "boolean" },
      occasion: { type: ["string", "null"], enum: ["romantic", null] },
      cuisineKey: { type: ["string", "null"] },

      // CLARIFY Payload (required, nullable)
      // NOTE: message/question generated deterministically at publish time
      clarify: {
         type: ["object", "null"],
         properties: {
            reason: { type: "string", enum: ["MISSING_LOCATION", "MISSING_FOOD", "AMBIGUOUS"] },
            blocksSearch: { type: "boolean", const: true },
            suggestedAction: { type: "string", enum: ["ASK_LOCATION", "ASK_FOOD", "REFINE"] }
         },
         required: ["reason", "blocksSearch", "suggestedAction"],
         additionalProperties: false
      }
   },
   required: [
      "route",
      "confidence",
      "reason",
      "language",
      "languageConfidence",
      "regionCandidate",
      "regionConfidence",
      "regionReason",
      "cityText",
      "assistantLanguage",
      "distanceIntent",
      "openNowRequested",
      "priceIntent",
      "qualityIntent",
      "occasion",
      "cuisineKey",
      "clarify"
   ],
   additionalProperties: false
};


/**
 * Generate a hash for the schema to manage versioning and caching.
 */
export const INTENT_SCHEMA_HASH = createHash('sha256')
   .update(JSON.stringify(INTENT_JSON_SCHEMA))
   .digest('hex')
   .substring(0, 12);

/**
 * Generate a hash for the system prompt to track changes.
 */
export const INTENT_PROMPT_HASH = createHash('sha256')
   .update(INTENT_SYSTEM_PROMPT, 'utf8')
   .digest('hex');
