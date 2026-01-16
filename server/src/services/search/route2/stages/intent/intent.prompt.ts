/**
 * INTENT Stage Prompt
 * Router-only prompt for search mode classification
 */

import { createHash } from 'crypto';
import { buildLLMJsonSchema } from '../../../../../llm/types.js';
import { IntentLLMSchema } from './intent.types.js';

export const INTENT_PROMPT_VERSION = 'intent_v2';

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
- NEARBY: phrases like "near me", "closest", "around here", "לידי", "ממני",
  or explicit distance from the user (e.g., "100m from me", "200 מטר ממני").
- LANDMARK: a specific, named place or area that should be resolved to a point
  before searching (e.g., "Champs-Élysées", "Azrieli", "מרינה הרצליה").
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
- NEARBY with explicit distance → confidence ≥ 0.85
- LANDMARK with clear named place → confidence 0.75–0.9
- TEXTSEARCH with clear city/area → confidence 0.75–0.85
- Ambiguous TEXTSEARCH → confidence 0.5–0.7

Reason rules:
- reason MUST explain the routing decision (e.g., "explicit_distance", "near_me",
  "named_landmark", "city_text").
- Do NOT echo the full query.
- Do NOT use generic values like "token".

Rules:
- Output ALL 7 keys.
- If uncertain, choose TEXTSEARCH with lower confidence.
`;

// Generate JSON Schema from Zod (single source of truth)
const { schema: INTENT_JSON_SCHEMA, schemaHash: INTENT_SCHEMA_HASH } = buildLLMJsonSchema(
  IntentLLMSchema,
  'IntentLLM'
);

export { INTENT_JSON_SCHEMA, INTENT_SCHEMA_HASH };

export const INTENT_PROMPT_HASH = createHash('sha256')
  .update(INTENT_SYSTEM_PROMPT, 'utf8')
  .digest('hex');
