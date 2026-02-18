/**
 * Prompt Builder Module
 * Builds system and user prompts for LLM
 */

import type { AssistantLanguage } from './language-detector.js';
import { normalizeRequestedLanguage, getLanguageName, getLanguageEmphasis } from './language-detector.js';

export type AssistantContext =
  | { type: 'GATE_FAIL'; reason: 'NO_FOOD' | 'UNCERTAIN_FOOD'; query: string; language: AssistantLanguage }
  | { type: 'CLARIFY'; reason: 'MISSING_LOCATION' | 'MISSING_FOOD'; query: string; language: AssistantLanguage }
  | { type: 'SUMMARY'; query: string; language: AssistantLanguage; resultCount: number; top3Names: string[]; metadata?: any; dietaryNote?: any }
  | { type: 'SEARCH_FAILED'; reason: 'GOOGLE_TIMEOUT' | 'PROVIDER_ERROR' | 'NETWORK_ERROR'; query: string; language: AssistantLanguage }
  | { type: 'GENERIC_QUERY_NARRATION'; query: string; language: AssistantLanguage; resultCount: number; usedCurrentLocation: boolean };

/**
 * System prompt for LLM
 */
export const SYSTEM_PROMPT = `
You are an assistant narrator for a food search app. Return ONLY valid JSON.

Tone:
- Friendly, confident, concise.
- "message" must be 1-2 sentences max.
- No generic filler like "thank you", "here are", "I found X results".

CRITICAL LANGUAGE RULE:
- Respond in the EXACT language specified by the "Language:" field in the user prompt.
- Supported languages: he, en, ar, ru, fr, es.
- NEVER output English unless Language: en.

ANTI-ECHO RULE (VERY IMPORTANT):
- DO NOT restate or paraphrase the user's query.
- DO NOT repeat more than 2 consecutive words from the original query.
- The message must NOT start by rephrasing what the user searched.
- If you violate this rule, the answer is invalid.

RESULT-FIRST RULE:
- For SUMMARY and GENERIC_QUERY_NARRATION:
  * Start from what was found in the results (counts, openNow, top items, radius, filters).
  * Base the insight ONLY on provided metadata.
  * Do NOT invent information (no delivery, weather, availability unless explicitly in metadata).

TRIPLE SYNTHESIS RULE (for SUMMARY):
- The message must naturally combine:
  1) A short reference to the intent (without echoing wording),
  2) What was actually found,
  3) A light recommendation or direction (optional but preferred).
- Keep it natural, not structured as bullet points.

"question" field:
- Add a clarifying question ONLY when needed.
- CLARIFY type MUST ask a question.
- SUMMARY type question is optional.

"blocksSearch":
- SUMMARY: MUST be false.
- GENERIC_QUERY_NARRATION: MUST be false.
- CLARIFY/GATE_FAIL: MUST be true.
- SEARCH_FAILED: usually true.

"suggestedAction":
- SUMMARY: MUST be NONE.
- GENERIC_QUERY_NARRATION: MUST be REFINE.
- Others: choose what helps most.

Schema:
{
  "type":"GATE_FAIL|CLARIFY|SUMMARY|SEARCH_FAILED|GENERIC_QUERY_NARRATION",
  "message":"string",
  "question":"string|null",
  "suggestedAction":"NONE|ASK_LOCATION|ASK_FOOD|RETRY|EXPAND_RADIUS|REFINE",
  "blocksSearch":true|false
}
`;

/**
 * System prompt for streaming (message-only output; no JSON).
 * Used when streaming assistant reply as plain text for SSE deltas.
 */

export const SYSTEM_PROMPT_MESSAGE_ONLY = `You are an assistant for a food search app. Reply with ONLY the user-facing message text. No JSON, no labels.

Rules:
- Be friendly, concise (1-2 sentences max).
- CRITICAL: Respond in the EXACT language specified by "Language:" in the user prompt (he, en, ar, ru, fr, es).
- Output nothing except the message text the user will see.`;


/**
 * Build prompt for LLM (language enforced by Language: <code>)
 */
export function buildUserPrompt(context: AssistantContext): string {
  const requested = normalizeRequestedLanguage(context.language);
  const languageInstruction = getLanguageName(requested);
  const languageEmphasis = getLanguageEmphasis(requested);

  if (context.type === 'GATE_FAIL') {
    const reason = context.reason === 'NO_FOOD' ? 'not food-related' : 'uncertain if food-related';
    return `Query: "${context.query}"
Type: GATE_FAIL
Reason: ${reason}
Language: ${requested}

CRITICAL: ${languageEmphasis}. Both "message" and "question" fields must be in ${languageInstruction}.

Generate friendly message. Help user understand and guide them. Decide blocksSearch and suggestedAction.`;
  }

  if (context.type === 'CLARIFY') {
    const missing = context.reason === 'MISSING_LOCATION' ? 'location' : 'food type';
    return `Query: "${context.query}"
Type: CLARIFY
Reason: missing ${missing}
Language: ${requested}

CRITICAL: ${languageEmphasis}. Both "message" and "question" fields must be in ${languageInstruction}.

Ask a question to get the missing info. Decide blocksSearch and suggestedAction.`;
  }

  if (context.type === 'SEARCH_FAILED') {
    const reason = context.reason === 'GOOGLE_TIMEOUT' ? 'Google API timeout' : 'provider error';
    return `Query: "${context.query}"
Type: SEARCH_FAILED
Reason: ${reason}
Language: ${requested}

CRITICAL: ${languageEmphasis}. Both "message" and "question" fields must be in ${languageInstruction}.

Tell user search failed. Decide what to suggest and whether to block. Be helpful and honest.`;
  }

  if (context.type === 'GENERIC_QUERY_NARRATION') {
    const locationSource = context.usedCurrentLocation ? 'current location' : 'default area';
    return `Query: "${context.query}"
Type: GENERIC_QUERY_NARRATION
Results: ${context.resultCount}
Location used: ${locationSource}
Language: ${requested}

CRITICAL: ${languageEmphasis}. Both "message" and "question" fields must be in ${languageInstruction}.

Instructions:
1. Message (1 sentence): Explain assumption - we used their current location because query was generic
2. Question (1 sentence): Ask for ONE refinement to help narrow results
3. Set blocksSearch=false (search already ran)
4. Set suggestedAction="REFINE"

Generate the best single refinement question.`;
  }

  // SUMMARY
  const metadata = context.metadata || {};
  const dietaryNote = context.dietaryNote?.shouldInclude
    ? `\nDietary Note: Add SOFT gluten-free hint at end (1 sentence max). NO medical claims, NO guarantees.`
    : '';

  const metadataContext = `
Metadata (use ONLY this data, DO NOT invent):
- Results: ${context.resultCount}
${metadata.openNowCount !== undefined ? `- Open now: ${metadata.openNowCount}/${context.resultCount}` : ''}
${metadata.currentHour !== undefined ? `- Current hour: ${metadata.currentHour}:00` : ''}
${metadata.radiusKm !== undefined ? `- Search radius: ${metadata.radiusKm}km` : ''}
${metadata.filtersApplied && metadata.filtersApplied.length > 0 ? `- Active filters: ${metadata.filtersApplied.join(', ')}` : ''}
- Top3: ${context.top3Names.slice(0, 3).join(', ')}`;

  return `Query: "${context.query}"
Type: SUMMARY
Language: ${requested}${metadataContext}${dietaryNote}

CRITICAL: ${languageEmphasis}. Both "message" and "question" fields must be in ${languageInstruction}.

Instructions:
1. NO generic phrases like "thank you", "here are", "found X results"
2. Provide ONE short insight based on metadata
3. Use ONLY existing metadata - DO NOT invent weather, delivery, availability
4. Max 2 sentences total

Generate insight-based message that helps user understand the results.`;
}
