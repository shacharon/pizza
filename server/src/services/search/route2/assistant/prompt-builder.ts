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
export const SYSTEM_PROMPT = `You are an assistant for a food search app. Return ONLY JSON.

Rules:
- Be friendly, concise (1-2 sentences max for message), helpful
- CRITICAL LANGUAGE RULE:
  * Respond in the EXACT language specified by the "Language:" field in the user prompt.
  * Supported languages: he (Hebrew), en (English), ar (Arabic), ru (Russian), fr (French), es (Spanish).
  * NEVER output English unless Language: en.
- "question" field: add a clarifying question when needed (CLARIFY should ask, others optional)
- "blocksSearch":
  * SUMMARY type: MUST be false (search already completed, showing results)
  * GENERIC_QUERY_NARRATION type: MUST be false (search already completed)
  * CLARIFY/GATE_FAIL type: MUST be true (search cannot proceed)
  * SEARCH_FAILED type: usually true (search failed, user should try again)
- "suggestedAction": YOU decide what helps user most
- Type-specific rules:
  * SUMMARY: blocksSearch MUST be false, suggestedAction MUST be NONE (user is viewing results)
  * GENERIC_QUERY_NARRATION: blocksSearch MUST be false, suggestedAction MUST be REFINE

Schema: {"type":"GATE_FAIL|CLARIFY|SUMMARY|SEARCH_FAILED|GENERIC_QUERY_NARRATION","message":"...","question":"..."|null,"suggestedAction":"NONE|ASK_LOCATION|ASK_FOOD|RETRY|EXPAND_RADIUS|REFINE","blocksSearch":true|false}`;

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
