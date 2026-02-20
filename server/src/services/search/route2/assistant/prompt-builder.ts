/**
 * Prompt Builder Module
 * Builds system and user prompts for LLM
 */

import type { AssistantLanguage } from './language-detector.js';
import { normalizeRequestedLanguage, getLanguageName, getLanguageEmphasis } from './language-detector.js';

import type { TopCandidate, SummaryAnalysisMode } from './assistant.types.js';

export type AssistantContext =
  | { type: 'GATE_FAIL'; reason: 'NO_FOOD' | 'UNCERTAIN_FOOD'; query: string; language: AssistantLanguage }
  | { type: 'CLARIFY'; reason: 'MISSING_LOCATION' | 'MISSING_FOOD'; query: string; language: AssistantLanguage }
  | { type: 'SUMMARY'; query: string; language: AssistantLanguage; resultCount: number; top: TopCandidate[]; analysisMode: SummaryAnalysisMode; metadata?: any; dietaryNote?: any }
  | { type: 'SEARCH_FAILED'; reason: 'GOOGLE_TIMEOUT' | 'PROVIDER_ERROR' | 'NETWORK_ERROR'; query: string; language: AssistantLanguage }
  | { type: 'GENERIC_QUERY_NARRATION'; query: string; language: AssistantLanguage; resultCount: number; usedCurrentLocation: boolean };

/**
 * System prompt for LLM
 */
export const SYSTEM_PROMPT = `
You are the SUMMARY generator for a food search app. Return ONLY valid JSON.

HARD RULES (validation):
- Output language MUST match requestedLanguage EXACTLY.
- If requestedLanguage="en": output ONLY Latin letters/punctuation/digits (no Hebrew/Arabic/Cyrillic).
- If requestedLanguage="he": output ONLY Hebrew letters/punctuation/digits (no Latin/Cyrillic/Arabic).
- message MUST be 4–6 lines separated by "\n". Each line <= 80 chars.
- question MUST be null for SUMMARY.
- blocksSearch MUST be false for SUMMARY.

INPUTS YOU WILL RECEIVE:
- requestedLanguage
- query (user text)
- analysisMode: "SATURATED" | "FOCUSED" | "EMPTY"
- topNames: array of up to 4 restaurant names (strings)
- topMeta: array of up to 4 items with minimal fields (rating, priceLevel, openNow, area)
- nextStepHint: one of ["REFINE_PRICE","REFINE_DISTANCE","REFINE_OPEN_NOW","REFINE_DIET","REFINE_QUERY"]

DECISION RULES (MUST):
A) If analysisMode="EMPTY":
- suggestedAction MUST be "RELAX"
- question MUST be a single short clarifying question (1 line) OR null if not needed.

B) If analysisMode="FOCUSED":
- suggestedAction MUST be "CHOOSE"
- message MUST recommend exactly ONE place from topNames[0] with 1 reason.
- question MUST be one short question to confirm (1 line).

C) If analysisMode="SATURATED":
- suggestedAction MUST be "REFINE" (ANY other value is INVALID)
- message MUST analyze tradeoffs between the top options.
- MUST recommend ONE starting point explicitly.
- May briefly mention 3–4 alternatives for contrast.
- MUST convert data into reasoning (rating → quality, openNow → convenience, etc.)
- MUST end with one concrete refinement suggestion.
- message MUST end with ONE concrete refine suggestion based on nextStepHint.
- question MUST ask ONE refine question aligned to nextStepHint (1 line).

STYLE RULES:
- Use decisive language. DO NOT use soft phrasing like "Consider", "Would you like", "Maybe".
- No fluff. No apologies. No "here are".
- Use ONLY provided fields. No guessing.

OUTPUT JSON SCHEMA (exact keys, no extras):
{
  "type": "SUMMARY",
  "language": "<requestedLanguage>",
  "message": "<4-6 lines with \\n>",
  "question": null,
  "suggestedAction": "RELAX|CHOOSE|REFINE",
  "blocksSearch": false
}

NOW GENERATE THE JSON.`;
/**
 * System prompt for streaming (message-only output; no JSON).
 * Used when streaming assistant reply as plain text for SSE deltas.
 */

export const SYSTEM_PROMPT_MESSAGE_ONLY = `
You are the decision assistant of a food search app.

Return ONLY the final user-facing message text.
No JSON. No labels. No explanations.

STRICT RULES:
- Do NOT repeat or paraphrase the user query (no echo).
- Do NOT summarize results or describe what was found.
- Do NOT say "You asked", "We found", "Here are", "Top choices", or similar.
- Never list restaurants unless explaining ONE concrete comparison.

RESULT COUNT POLICY (HARD):
- If resultCount === 20: NEVER mention any count/quantity (no digits, no "many/several").
- If resultCount < 15: You MAY mention the count ONCE, briefly.
- If resultCount < 5: You MUST recommend a coverage fix:
  expand radius OR relax openNow OR relax dietary strictness.
- Never imply quantity indirectly ("a few", "plenty", "tons", "many", "several").

FORMAT:
- Exactly 2–3 short sentences.
- Natural, direct tone.
- No filler.

CONTENT:
- Provide EXACTLY ONE of the following:
  • A concrete decision insight, OR
  • One focused refinement suggestion, OR
  • One focused clarifying question (only if ambiguity exists).
- If you cannot add a NEW insight beyond the user query,
  output ONE refinement suggestion instead.
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

  // SUMMARY: minimal payload – analysisMode, resultCount, top (max 2 COMPARISON, 1 SATURATED, 0 SCARCITY); per candidate name + up to 3 numeric fields
  const maxTop = context.analysisMode === 'SCARCITY' ? 0 : context.analysisMode === 'SATURATED' ? 3 : 2;
  const topSlice = context.top.slice(0, maxTop);

  const numericKeys = ['rating', 'distanceMeters', 'etaMinutes', 'priceLevel', 'openNow'] as const;
  const topJson = JSON.stringify(topSlice.map((t) => {
    const o: Record<string, unknown> = { name: t.name };
    let added = 0;
    for (const k of numericKeys) {
      if (added >= 3) break;
      const v = (t as unknown as Record<string, unknown>)[k];
      if (v != null) {
        o[k] = v;
        added++;
      }
    }
    return o;
  }));

  const dietaryNote = context.dietaryNote?.shouldInclude
    ? '\nDietary: Add SOFT gluten-free hint at end (Line 6, 1 sentence).'
    : '';

  return `Query: "${context.query}"
Type: SUMMARY
Language: ${requested}
analysisMode: ${context.analysisMode}
resultCount: ${context.resultCount}
top: ${topJson}${dietaryNote}

CRITICAL: ${languageEmphasis}. "message" and "question" in ${languageInstruction}. question=null.
Follow MODE RULES for analysisMode=${context.analysisMode}. message MUST be 4–6 lines (each line one sentence; Line 1: headline, 2–4: evidence from top[], Line 5: next step). Use only fields present in top[].`;
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
- Top (max 4): ${context.top.slice(0, 4).map((t) => t.name).join(', ')}
- Analysis mode: ${context.analysisMode}`;

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
Line 3: Worth trying – name the top places from Top (use ONLY: ${context.top.slice(0, 4).map((t) => t.name).join(', ')}). E.g. "Worth trying: PlaceA, PlaceB, PlaceC."
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
