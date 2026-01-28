/**
 * Assistant Narrator Prompt Template
 * 
 * Minimal, token-efficient prompts for LLM-based assistant messages
 */

import { createHash } from 'crypto';
import type { NarratorContext } from './narrator.types.js';

const NARRATOR_SYSTEM_PROMPT = `You are an assistant narrator for a food search app. Return ONLY JSON.

Rules:
- Max 240 chars, max 2 sentences for "message"
- "question" only when type=CLARIFY
- CLARIFY always sets blocksSearch=true (STOP search)
- Be friendly, concise, helpful
- Output English only (ignore user query language)

Schema: {"type":"GATE_FAIL|CLARIFY|SUMMARY","message":"...","question":"..."|null,"suggestedAction":"NONE|ASK_LOCATION|ASK_FOOD|...","blocksSearch":true|false}`;

export const NARRATOR_PROMPT_VERSION = 'narrator_v1';
export const NARRATOR_PROMPT_HASH = createHash('sha256')
  .update(NARRATOR_SYSTEM_PROMPT, 'utf8')
  .digest('hex')
  .substring(0, 12);

/**
 * Build minimal user prompt for LLM based on context
 * IMPORTANT: Output language is always English (hard-coded)
 */
export function buildNarratorUserPrompt(context: NarratorContext): string {
  // HARD-CODED: All output must be English
  const lang = 'English';

  if (context.type === 'GATE_FAIL') {
    const reason = context.reason === 'NO_FOOD' ? 'not food-related' : 'uncertain if food-related';
    return `Query: "${context.query}" (${lang})
Type: GATE_FAIL
Reason: ${reason}
LocationKnown: ${context.locationKnown}

Generate onboarding message in English. Guide user to proper food search. Set blocksSearch=true.`;
  }

  if (context.type === 'CLARIFY') {
    const missing = context.reason === 'MISSING_LOCATION' ? 'location' : 'food type';
    return `Query: "${context.query}" (${lang})
Type: CLARIFY
Reason: missing ${missing}
LocationKnown: ${context.locationKnown}

Ask 1 targeted question in English. Set blocksSearch=true (STOP search).`;
  }

  // SUMMARY
  const { resultCount, top3Names, openNowCount, avgRating, appliedFilters } = context;
  const hasResults = resultCount > 0;

  if (!hasResults) {
    return `Query: "${context.query}" (${lang})
Type: SUMMARY
Results: 0
Filters: ${appliedFilters.join(', ') || 'none'}

Zero results. Suggest expanding search or relaxing filters in English. Set blocksSearch=false.`;
  }

  return `Query: "${context.query}" (${lang})
Type: SUMMARY
Results: ${resultCount}
Top3: ${top3Names.slice(0, 3).join(', ')}
OpenNow: ${openNowCount}
AvgRating: ${avgRating?.toFixed(1) ?? 'N/A'}
Filters: ${appliedFilters.join(', ') || 'none'}

Summarize results in English (2 sentences) + 1 suggestion. Set blocksSearch=false.`;
}

/**
 * Build complete messages array for LLM
 */
export function buildNarratorMessages(context: NarratorContext) {
  return [
    { role: 'system' as const, content: NARRATOR_SYSTEM_PROMPT },
    { role: 'user' as const, content: buildNarratorUserPrompt(context) }
  ];
}
