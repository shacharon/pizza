/**
 * INTENT Stage Prompt
 * Router-only prompt for search mode classification
 */

import { createHash } from 'crypto';

export const INTENT_PROMPT_VERSION = 'intent_v1';

export const INTENT_SYSTEM_PROMPT = `You are a router for food search.

Return ONLY JSON:
{ "route": "TEXTSEARCH|NEARBY|LANDMARK", "confidence": 0-1, "reason": "short_reason" }

Choose route:
- NEARBY: phrases like "near me", "closest", "around here", "לידי", "ממני",
  or explicit distance from the user (e.g., "100m from me", "200 מטר ממני").
- LANDMARK: a specific, named place or area that should be resolved to a point
  before searching (e.g., "Champs-Élysées", "Azrieli", "מרינה הרצליה").
- TEXTSEARCH: city/area text suitable for direct search (default).

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
- Output ONLY the 3 keys above.
- If uncertain, choose TEXTSEARCH with lower confidence.
`;

export const INTENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    route: { type: 'string', enum: ['TEXTSEARCH', 'NEARBY', 'LANDMARK'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reason: { type: 'string' }
  },
  required: ['route', 'confidence', 'reason'],
  additionalProperties: false
} as const;

export const INTENT_PROMPT_HASH = createHash('sha256')
  .update(INTENT_SYSTEM_PROMPT, 'utf8')
  .digest('hex');
