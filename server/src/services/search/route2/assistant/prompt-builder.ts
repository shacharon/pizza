/**
 * Prompt Builder Module
 * Builds system and user prompts for LLM
 */

import type { AssistantLanguage } from './language-detector.js';
import { normalizeRequestedLanguage, getLanguageName, getLanguageEmphasis } from './language-detector.js';

import type { AssistantSummaryContext as SummaryContextType, TopCandidate, SummaryAnalysisMode } from './assistant.types.js';

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
You are the SUMMARY generator for a food search app. Return ONLY valid JSON (no extra keys).

HARD RULES:
- language MUST equal requestedLanguage.
- message: 4–7 lines separated by "\\n", each line <= 80 chars.
- No HTML/Markdown. Use "•" for bullets.
- Use ONLY provided inputs (no guessing).
- Detect up to 2 unsupported user constraints (e.g. kosher, parking, ETA, reservation, menu, exact price) and include them in "conversationNeeds". Do NOT pretend they were applied as filters.

DECISION:
- If analysisMode="EMPTY": suggestedAction="RELAX"; question=1 short clarifying question (1 line) or null; message still 4–6 lines.
- If analysisMode="FOCUSED": suggestedAction="CHOOSE"; choose topNames[0] with 1 reason; question=1 short confirm question (1 line).
- If analysisMode="SATURATED": suggestedAction="REFINE"; choose ONE starting point (prefer openNow unless rating gap > 0.5); end message with ONE refine suggestion from nextStepHint; question=1 refine question aligned to nextStepHint.

STYLE:
- Decisive. No fluff. No apologies. No "here are".

OUTPUT:
{"type":"SUMMARY","language":"<requestedLanguage>","message":"<...>","question":null,"suggestedAction":"RELAX|CHOOSE|REFINE","blocksSearch":false,"conversationNeeds":[{"key":"KOSHER|PARKING|ETA|RESERVATION|MENU|PRICE_EXACT|OTHER","rawText":"..."}]}
`;
/**
 * System prompt for streaming (message-only output; no JSON).
 * Used when streaming assistant reply as plain text for SSE deltas.
 */

export const SYSTEM_PROMPT_MESSAGE_ONLY = `
You are the decision assistant for a food search app.
Return ONLY plain text (no JSON, no labels, no markdown).

Rules:
- No echo of the user query.
- 3–4 short sentences.
- Choose ONE starting point (prefer openNow unless rating gap > 0.5).
- If resultCount=20: never mention quantity (no digits/words implying amount).
- If resultCount<5: suggest ONE coverage fix (radius/openNow/diet).
 - Wrap the chosen restaurant name EXACTLY ONCE with  ***name***
 - If conversationNeeds exists and non-empty:
  - Acknowledge up to 2 briefly.
  - State support is coming soon.
  - Add ONE blank line.
  - Then continue normal guidance.
- Output ONLY in Language: <lang> from the user prompt.

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
  const maxTop = context.analysisMode === 'SCARCITY' ? 0 : context.analysisMode === 'SATURATED' ? 7 : 2;
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

  // SUMMARY - MESSAGE_ONLY
  const summaryContext = context as SummaryContextType;
  const nextStepHint = summaryContext.nextStepHint ?? 'filter by open now, price, or distance';

  // SATURATED: minimal payload (language, resultCount, topNames/topMeta <=4, nextStepHint)
  if (summaryContext.analysisMode === 'SATURATED') {
    const topSlice = context.top.slice(0, 4);
    const topLines = topSlice.map((t) => {
      const parts = [t.name];
      if (t.rating != null) parts.push(`rating ${t.rating}`);
      if (t.openNow !== undefined) parts.push(`openNow ${t.openNow}`);
      if (t.distanceMeters != null) parts.push(`${t.distanceMeters}m`);
      if (t.priceLevel != null) parts.push(`price ${t.priceLevel}`);
      return parts.join(', ');
    });
    return `Type: SUMMARY (MESSAGE_ONLY, SATURATED)
Language: ${requested}
Result count: ${context.resultCount}
Top (max 4): ${topLines.join(' | ')}
Next step hint: ${nextStepHint}

CRITICAL: ${languageEmphasis}. Output ONLY plain text in ${languageInstruction}.

RULES:
- Choose ONE starting point from Top (prefer openNow unless rating gap > 0.5). Name it exactly once.
- Wrap the chosen place name EXACTLY ONCE with [[name]]. Example: [[Place Name]].
- 3–4 short sentences. End with one refine suggestion from the next step hint.
- No echo of query. No markdown.

Generate the message.`;
  }

  // Non-SATURATED SUMMARY: full metadata (legacy MESSAGE_ONLY path)
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
