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

Hard rules (must pass validation):
- Output language MUST match requested Language EXACTLY.
- If Language=en: output ONLY English letters/punctuation. Do NOT output Hebrew/Arabic/Russian characters.
- If Language=he: output ONLY Hebrew (you may include digits and standard punctuation). Do NOT output Latin letters.
- Keep "message" between 4 and 6 short lines (use \\n). Each line <= 80 chars.
- "question" must be null for SUMMARY.
- SUMMARY: blocksSearch=false, suggestedAction="NONE".

Content rules:
- Combine these 3 parts in order:
  1) What user asked (1 line)
  2) What we found (2–3 lines) using ONLY provided metadata/top3 (no guessing)
  3) Recommendation (1–2 lines) with 1 concrete next step (e.g., refine/radius/open-now)
- Never say generic fluff ("here are", "thank you").

Schema: {"type":"GATE_FAIL|CLARIFY|SUMMARY|SEARCH_FAILED|GENERIC_QUERY_NARRATION","message":"...","question":null,"suggestedAction":"NONE|ASK_LOCATION|ASK_FOOD|RETRY|EXPAND_RADIUS|REFINE","blocksSearch":true|false}

Return ONLY JSON.`;

/**
 * System prompt for streaming (message-only output; no JSON).
 * Used when streaming assistant reply as plain text for SSE deltas.
 */

export const SYSTEM_PROMPT_MESSAGE_ONLY = `
You are the decision assistant of a food search app.

Return ONLY the final user-facing message text.
No JSON. No labels. No explanations.

STRICT RULES:
- Do NOT repeat the user query.
- Do NOT summarize results.
- Do NOT say "You asked", "We found", "Top choices", or similar.
- IGNORE resultCount and top3 unless they are required for a real decision insight.
- Never list restaurants unless explaining a specific comparison.

FORMAT:
- Exactly 2–3 short sentences.
- Natural, direct tone.
- No filler.

CONTENT:
- Provide ONE of the following only:
  • A concrete decision insight, OR
  • One smart refinement suggestion, OR
  • One focused clarifying question.
- If no refinement is needed, guide the next best action (not a summary).
- Use ONLY provided metadata when necessary.
- Respond ONLY in the exact language specified by "Language:" in the user prompt.
`;
/**
 * Build prompt for LLM JSON output (used by completeJSON for WebSocket)
 */
export function buildUserPromptJson(context: AssistantContext): string {
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
4. Use 3-6 sentences total

Generate insight-based message that helps user understand the results.`;
}

/**
 * Build prompt for message-only streaming output (used by completeStream for SSE)
 * NO JSON, NO field references, structured multi-line output
 */
export function buildUserPromptMessageOnly(context: AssistantContext): string {
  const requested = normalizeRequestedLanguage(context.language);
  const languageInstruction = getLanguageName(requested);
  const languageEmphasis = getLanguageEmphasis(requested);

  if (context.type === 'GATE_FAIL') {
    const reason = context.reason === 'NO_FOOD' ? 'not food-related' : 'uncertain if food-related';
    return `Query: "${context.query}"
Type: GATE_FAIL
Reason: ${reason}
Language: ${requested}

CRITICAL: ${languageEmphasis}. Output ONLY the message text in ${languageInstruction}.

Generate friendly message (3-6 sentences). Help user understand and guide them.`;
  }

  if (context.type === 'CLARIFY') {
    const missing = context.reason === 'MISSING_LOCATION' ? 'location' : 'food type';
    return `Query: "${context.query}"
Type: CLARIFY
Reason: missing ${missing}
Language: ${requested}

CRITICAL: ${languageEmphasis}. Output ONLY the message text in ${languageInstruction}.

Ask a question (3-6 sentences) to get the missing info.`;
  }

  if (context.type === 'SEARCH_FAILED') {
    const reason = context.reason === 'GOOGLE_TIMEOUT' ? 'Google API timeout' : 'provider error';
    return `Query: "${context.query}"
Type: SEARCH_FAILED
Reason: ${reason}
Language: ${requested}

CRITICAL: ${languageEmphasis}. Output ONLY the message text in ${languageInstruction}.

Tell user search failed (3-6 sentences). Be helpful and honest.`;
  }

  if (context.type === 'GENERIC_QUERY_NARRATION') {
    const locationSource = context.usedCurrentLocation ? 'current location' : 'default area';
    return `Query: "${context.query}"
Type: GENERIC_QUERY_NARRATION
Results: ${context.resultCount}
Location used: ${locationSource}
Language: ${requested}

CRITICAL: ${languageEmphasis}. Output ONLY the message text in ${languageInstruction}.

Instructions:
1. Explain assumption (1 sentence): we used their current location because query was generic
2. Ask for ONE refinement (1 sentence) to help narrow results

Generate the message.`;
  }

  // SUMMARY - MESSAGE_ONLY with structured multi-line output
  const metadata = context.metadata || {};
  const dietaryNote = context.dietaryNote?.shouldInclude
    ? `\nDietary Note: Add SOFT gluten-free hint at end (1 line max). NO medical claims, NO guarantees.`
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

CRITICAL: ${languageEmphasis}. Output ONLY plain text in ${languageInstruction}.

FORMAT (MANDATORY – you must output at least 4 lines, never only 2):
- Minimum 4 lines. Maximum 6 lines. Separate each line with a newline (\\n).
- Each line = one complete sentence. Do NOT return only two sentences.

STRUCTURE (output all four; add 5–6 only if dietary hint requested):
Line 1: What the user searched for (one short phrase, no echo of exact query). In ${languageInstruction} e.g. "You searched: pizza in Gedera" or "ביקשת: פיצה בגדרה".
Line 2: What was found – include result count${metadata.openNowCount !== undefined ? ' and open-now count' : ''}. E.g. "Found 12 results." or "מצאתי 12 תוצאות."
Line 3: Worth trying – name the top places from Top3 (use ONLY: ${context.top3Names.slice(0, 3).join(', ')}). E.g. "Worth trying: PlaceA, PlaceB, PlaceC."
Line 4: One actionable tip (e.g. filter by open now, price, or distance).

RULES:
- NO generic phrases ("thank you", "here are"). NO echo of exact query. Use ONLY provided metadata.
- Adapt labels to ${languageInstruction}. Each line must be a full sentence.

Generate the message. You MUST output at least 4 lines with newlines between them.`;
}

/**
 * Legacy alias for backward compatibility
 * @deprecated Use buildUserPromptJson or buildUserPromptMessageOnly explicitly
 */
export function buildUserPrompt(context: AssistantContext): string {
  return buildUserPromptJson(context);
}
