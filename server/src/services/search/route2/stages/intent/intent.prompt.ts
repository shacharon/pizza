/**
 * INTENT Stage Prompt
 * Router-only prompt for search mode classification
 */

import { createHash } from 'crypto';

export const INTENT_PROMPT_VERSION = 'intent_v4';

export const INTENT_SYSTEM_PROMPT = ` 
You are a query rewriter for Google Places Text Search.
Convert user input into a clean search query.

Rules:
1. Identify if the user is looking for something "near them" (e.g., "לידי", "בסביבה").
2. If yes, and coordinates are available, set "hasBias" to true and extract the entity.
3. Remove filler words and spatial prepositions that are now handled by Bias.

Output JSON Format:
{
  "textQuery": "string", // e.g., "מסעדות"
  "hasBias": true,      // Crucial: Must be true for "near me" queries
  "location": {
    "lat": number,
    "lng": number
  },
  "reason": "location_bias_applied"
}
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
    region: { type: "string", pattern: "^[A-Z]{2}$" },
    regionConfidence: { type: "number", minimum: 0, maximum: 1 },
    regionReason: { type: "string", minLength: 1 },

    // ✅ must be present but can be null
    cityText: { type: ["string", "null"], minLength: 1 }
  },
  required: [
    "route",
    "confidence",
    "reason",
    "language",
    "region",
    "regionConfidence",
    "regionReason",
    "cityText" // ✅ add
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