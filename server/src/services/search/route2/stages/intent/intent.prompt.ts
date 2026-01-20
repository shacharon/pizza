/**
 * INTENT Stage Prompt
 * Router-only prompt for search mode classification
 */

import { createHash } from 'crypto';

export const INTENT_PROMPT_VERSION = 'intent_v4';

export const INTENT_SYSTEM_PROMPT = `You are a router for food search.

Return ONLY JSON with ALL fields:
{
  "route": "TEXTSEARCH|NEARBY|LANDMARK",
  "confidence": 0-1,
  "reason": "short_reason",
  "language": "he|en|ru|ar|fr|es|other",
  "region": "IL|FR|US|etc (ISO-3166-1 alpha-2)",
  "regionConfidence": 0-1,
  "regionReason": "detected_from_X|default_IL|etc"
}

Route rules:
- NEARBY: phrases like "near me", "closest", "around here", "לידי", "ממני".
  IMPORTANT: Distance from USER location ONLY (e.g., "100m from me", "200 מטר ממני").
  If distance is from a LANDMARK/PLACE (not "me"), use LANDMARK route instead.
- LANDMARK: a specific, named place/landmark as anchor point, especially:
  * Pattern "X meters from <landmark>" (e.g., "800m from Arc de Triomphe", "500 מטר מאזריאלי")
  * Named places/areas to geocode (e.g., "Champs-Élysées", "Azrieli", "מרינה הרצליה")
  * Foreign landmarks (e.g., "שער הניצחון" = Arc de Triomphe)
- TEXTSEARCH: city/area text suitable for direct search (default).

Language detection:
- Detect primary language from query text.
- Use "other" if language is unclear or mixed.

Region detection:
- IL if no location mentioned or Hebrew location names (default).
- FR if French location (Paris, Lyon, Marseille, etc.).
- US if US location (NYC, LA, etc.).
- Use uppercase ISO-3166-1 alpha-2 codes.
- regionConfidence: 0.9+ if explicit location, 0.3-0.5 if inferred from language, 0.1 if default.
- regionReason: explain how region was determined.

Confidence rules:
- NEARBY with explicit "from me" → confidence ≥ 0.85
- LANDMARK with distance from named place → confidence 0.80–0.95
- LANDMARK with clear named place → confidence 0.75–0.9
- TEXTSEARCH with clear city/area → confidence 0.75–0.85
- Ambiguous TEXTSEARCH → confidence 0.5–0.7

Reason rules:
- reason MUST explain the routing decision (e.g., "distance_from_user", "distance_from_landmark",
  "named_landmark", "city_text").
- For LANDMARK with distance pattern, use "distance_from_landmark".
- For NEARBY with "from me", use "distance_from_user" or "near_me".
- Do NOT echo the full query.
- Do NOT use generic values like "token" or "explicit_distance" (be specific!).

Rules:
- Output ALL 7 keys.
- If uncertain, choose TEXTSEARCH with lower confidence.
`;

/**
 * Manually define the JSON Schema to avoid circular dependency issues 
 * between the prompt and the Zod types during runtime.
 */
export const INTENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    route: {
      type: "string",
      enum: ["TEXTSEARCH", "NEARBY", "LANDMARK"]
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string", minLength: 1 },
    language: {
      type: "string",
      enum: ["he", "en", "ru", "ar", "fr", "es", "other"]
    },
    region: { type: "string", pattern: "^[A-Z]{2}$" },
    regionConfidence: { type: "number", minimum: 0, maximum: 1 },
    regionReason: { type: "string", minLength: 1 }
  },
  required: [
    "route",
    "confidence",
    "reason",
    "language",
    "region",
    "regionConfidence",
    "regionReason"
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