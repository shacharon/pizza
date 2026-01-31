/**
 * INTENT Stage Prompt
 * Router-only prompt for search mode classification
 */

import { createHash } from 'crypto';

export const INTENT_PROMPT_VERSION = 'intent_v4';

export const INTENT_SYSTEM_PROMPT = ` 
You are a routing classifier for a restaurant search system.
Analyze the user's query and determine the appropriate search strategy AND intent flags for ordering.

Your task:
1. Determine the search route: TEXTSEARCH, NEARBY, or LANDMARK
2. Detect the query language: he, en, ru, ar, fr, es, or other
3. Provide languageConfidence (0-1): how confident you are in the language detection
4. Infer the region code (ISO-3166-1 alpha-2, e.g., "IL", "US", "FR")
5. Extract city name if explicitly mentioned (e.g., "תל אביב", "חיפה")
6. **NEW:** Extract intent flags for hybrid ordering (language-agnostic)

Route Guidelines:
- TEXTSEARCH: Query contains explicit location (city/area) like "פיצה בתל אביב" or "restaurants in New York"
- NEARBY: Query implies proximity without explicit location, like "לידי", "בקרבתי", "near me"
- LANDMARK: Query mentions specific landmark, like "ליד בית החולים איכילוב"

Valid Reason Values:
- For TEXTSEARCH: "explicit_city_mentioned", "default_textsearch"
- For NEARBY: "near_me_phrase", "explicit_distance_from_me"
- For LANDMARK: "landmark_detected"
- For uncertain: "ambiguous"

Language Detection:
- languageConfidence: 0.9-1.0 for clear language signals (multi-word, script-specific)
- languageConfidence: 0.7-0.9 for partial signals (short query, mixed script)
- languageConfidence: 0.4-0.7 for single word or ambiguous queries
- languageConfidence: 0.1-0.4 for very uncertain (emoji-only, numbers)

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

**NEW: Hybrid Ordering Intent Flags (Language-Agnostic)**

These flags drive deterministic weight adjustments for result ordering.
Set these flags based on SEMANTIC INTENT, not language/keywords.
The same query in different languages should produce the SAME flags.

1. **distanceIntent** (boolean):
   - true if: "near me", "לידי", "קרוב", "בקרבתי", "close by", "nearby"
   - true if: route=NEARBY (proximity implied)
   - false otherwise
   
2. **openNowRequested** (boolean):
   - true if: "open now", "פתוח עכשיו", "open right now", "currently open"
   - false otherwise
   
3. **priceIntent** ("cheap" | "any"):
   - "cheap" if: "cheap", "זול", "inexpensive", "budget", "affordable"
   - "any" otherwise (default)
   
4. **qualityIntent** (boolean):
   - true if: "best", "הכי טוב", "recommended", "מומלץ", "high quality", "top rated"
   - true if: "romantic", "רומנטי", "special occasion", "fine dining"
   - false otherwise
   
5. **occasion** ("romantic" | null):
   - "romantic" if: "romantic", "רומנטי", "date night", "דייט", "anniversary"
   - null otherwise
   
6. **cuisineKey** (string | null):
   - Extract canonical cuisine identifier if mentioned:
     * "italian", "italian", "איטלקית", "פיצה", "pasta" → "italian"
     * "japanese", "יפנית", "sushi", "סושי" → "japanese"
     * "asian", "אסיאתית" → "asian"
     * "chinese", "סינית" → "chinese"
     * "french", "צרפתית" → "french"
     * "mediterranean", "ים תיכונית" → "mediterranean"
     * "middle_eastern", "מזרח תיכונית", "shawarma", "שווארמה" → "middle_eastern"
   - null if no specific cuisine mentioned

**CRITICAL:** These flags are language-independent!
- "romantic italian" (en) and "איטלקית רומנטית" (he) → SAME flags
- "cheap near me" (en) and "זול לידי" (he) → SAME flags

Examples:
- "מסעדות איטלקיות בתל אביב" → route: TEXTSEARCH, cityText: "תל אביב", distanceIntent: false, openNowRequested: false, priceIntent: "any", qualityIntent: false, occasion: null, cuisineKey: "italian"
- "Italian restaurants in Tel Aviv" → route: TEXTSEARCH, cityText: "Tel Aviv", distanceIntent: false, openNowRequested: false, priceIntent: "any", qualityIntent: false, occasion: null, cuisineKey: "italian"
- "מסעדות רומנטיות" → route: TEXTSEARCH, cityText: null, distanceIntent: false, openNowRequested: false, priceIntent: "any", qualityIntent: true, occasion: "romantic", cuisineKey: null
- "romantic restaurants" → route: TEXTSEARCH, cityText: null, distanceIntent: false, openNowRequested: false, priceIntent: "any", qualityIntent: true, occasion: "romantic", cuisineKey: null
- "פיצה זולה לידי פתוח עכשיו" → route: NEARBY, cityText: null, distanceIntent: true, openNowRequested: true, priceIntent: "cheap", qualityIntent: false, occasion: null, cuisineKey: "italian"
- "cheap pizza near me open now" → route: NEARBY, cityText: null, distanceIntent: true, openNowRequested: true, priceIntent: "cheap", qualityIntent: false, occasion: null, cuisineKey: "italian"
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

      // NEW: Hybrid ordering intent flags (language-agnostic)
      distanceIntent: { type: "boolean" },
      openNowRequested: { type: "boolean" },
      priceIntent: { type: "string", enum: ["cheap", "any"] },
      qualityIntent: { type: "boolean" },
      occasion: { type: ["string", "null"], enum: ["romantic", null] },
      cuisineKey: { type: ["string", "null"] }
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
      // NEW: Required hybrid ordering flags
      "distanceIntent",
      "openNowRequested",
      "priceIntent",
      "qualityIntent",
      "occasion",
      "cuisineKey"
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