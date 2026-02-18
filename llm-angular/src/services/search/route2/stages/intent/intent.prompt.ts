/**
 * INTENT Stage Prompt
 * Router-only prompt for search mode classification
 */

import { createHash } from 'crypto';

export const INTENT_PROMPT_VERSION = 'intent_v4';

export const INTENT_SYSTEM_PROMPT = ` 
You are a routing classifier for a restaurant search system.
Analyze the user's query and determine the appropriate search strategy.

Your task:
1. Determine the search route: TEXTSEARCH, NEARBY, or LANDMARK
2. Detect the query language: he, en, ru, ar, fr, es, or other
3. Infer the region code (ISO-3166-1 alpha-2, e.g., "IL", "US", "FR")
4. Extract city name if explicitly mentioned (e.g., "תל אביב", "חיפה")

Route Guidelines:
- TEXTSEARCH: Query contains explicit location (city/area) like "פיצה בתל אביב" or "restaurants in New York"
- NEARBY: Query implies proximity without explicit location, like "לידי", "בקרבתי", "near me"
- LANDMARK: Query mentions specific landmark, like "ליד בית החולים איכילוב"

Valid Reason Values:
- For TEXTSEARCH: "explicit_city_mentioned", "default_textsearch"
- For NEARBY: "near_me_phrase", "explicit_distance_from_me"
- For LANDMARK: "landmark_detected"
- For uncertain: "ambiguous"

Region Inference:
- Use valid ISO-3166-1 alpha-2 codes ONLY: IL, US, GB, FR, DE, etc.
- NEVER use invalid codes like "IS", "TQ", or made-up codes
- If Hebrew query → likely "IL"
- If Arabic query → could be "IL", "JO", "EG", etc. (infer from context)
- If unsure → "IL" (default fallback)

City Text Extraction:
- Extract ONLY if explicitly mentioned: "תל אביב", "חיפה", "ירושלים", "New York", etc.
- Return null if no explicit city mentioned
- Do NOT infer city from region or context

Examples:
- "מסעדות אסיאתיות בתל אביב" → TEXTSEARCH, reason: "explicit_city_mentioned", cityText: "תל אביב", regionCandidate: "IL"
- "פיצה לידי" → NEARBY, reason: "near_me_phrase", cityText: null, regionCandidate: "IL"
- "שווארמה" → TEXTSEARCH, reason: "default_textsearch", cityText: null, regionCandidate: "IL"
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
    regionCandidate: { type: "string", pattern: "^[A-Z]{2}$" },
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
    "regionCandidate",
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