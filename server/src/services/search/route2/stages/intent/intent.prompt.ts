/**
 * INTENT Stage Prompt
 * Router-only prompt for search mode classification
 */

import { createHash } from 'crypto';

export const INTENT_PROMPT_VERSION = 'intent_v4';

export const INTENT_SYSTEM_PROMPT = `SYSTEM: You are a routing classifier for restaurant search.

INPUT:
- userQuery (string)
- gateAssistantLanguage (required: "he"|"en"|"ru"|"ar"|"fr"|"es"|"other")
- gateAssistantLanguageConfidence (required: number 0..1)
- uiLanguageHint (optional: "he"|"en"|"ru"|"ar"|"fr"|"es"|null)

OUTPUT: JSON only:
{
  "route": "TEXTSEARCH"|"NEARBY"|"LANDMARK",
  "assistantLanguage": "he"|"en"|"ru"|"ar"|"fr"|"es"|"other",
  "assistantLanguageConfidence": number,     // 0..1
  "uiLanguage": "he"|"en"|"ru"|"ar"|"fr"|"es"|"other",
  "providerLanguage": "he"|"en"|"ru"|"ar"|"fr"|"es"|"other",
  "region": string,                          // ISO-3166-1 alpha-2 (e.g. "IL","FR","US") default "IL" if unknown
  "cityText": string|null,
  "reason": "explicit_city_mentioned"|"default_textsearch"|"near_me_phrase"|"explicit_distance_from_me"|"landmark_detected"|"ambiguous",
  "distanceIntent": boolean,
  "openNowRequested": boolean,
  "priceIntent": "cheap"|"any",
  "qualityIntent": boolean,
  "occasion": "romantic"|null,
  "cuisineKey": string|null
}

RULES:
0) assistantLanguage MUST be propagated from Gate:
- assistantLanguage = gateAssistantLanguage
- assistantLanguageConfidence = gateAssistantLanguageConfidence
- NEVER re-detect or change assistantLanguage in this stage.

1) route:
- TEXTSEARCH if explicit city/area present (e.g. “בתל אביב”, “in New York”)
- NEARBY if “near me / לידי / בקרבתי / close by / nearby / מרחק ממני”
- LANDMARK if specific landmark mentioned (“ליד איכילוב”, “near Eiffel Tower”)
- If unclear → TEXTSEARCH + reason="ambiguous"

2) uiLanguage:
- If uiLanguageHint provided and not null → use it.
- Else uiLanguage = assistantLanguage.

3) providerLanguage (language used for Google/provider requests):
- providerLanguage = "en" unless the query includes a strong cuisine/city/landmark term in another language that would be harmed by translation.
- If unsure → "en".
- NEVER set providerLanguage based on uiLanguage or assistantLanguage.

4) region:
- Extract ONLY from explicit country/city/area mentions or strong location clues.
- If city/country implies a country, set region accordingly.
- If unsure → "IL".
- NEVER set region based on assistantLanguage.

5) cityText:
- Extract ONLY if explicitly present; else null.

6) intent flags (language-agnostic semantics):
- distanceIntent = true if route=NEARBY
- openNowRequested = true if “open now/פתוח עכשיו”
- priceIntent = "cheap" if cheap/budget intent else "any"
- qualityIntent = true if best/top rated/recommended OR romantic/special occasion/fine dining
- occasion="romantic" if romantic/date/anniversary intent else null
- cuisineKey if cuisine mentioned else null

STRICT:
- Output JSON only. No explanations.



`;

/**
 * Manually define the JSON Schema to avoid circular dependency issues 
 * between the prompt and the Zod types during runtime.
 */
export const INTENT_JSON_SCHEMA = {
   type: "object",
   properties: {
      route: { type: "string", enum: ["TEXTSEARCH", "NEARBY", "LANDMARK", "CLARIFY"] },
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