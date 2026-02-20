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
You are a decision assistant for a food search app.
Return ONLY valid JSON matching the schema.

Hard rules (must pass validation):
- Output language MUST match requested Language EXACTLY.
- If Language=en: output ONLY English letters/punctuation.
- If Language=he: output ONLY Hebrew (digits and standard punctuation allowed).
- "question" must be null for SUMMARY.
- SUMMARY: blocksSearch=false always. suggestedAction depends on analysisMode (see SUMMARY MODE RULES below).
- Keep "message" concise. For SUMMARY: 4–6 lines, each <= 80 chars. For other types: 2–4 short lines, each <= 80 chars.
- Do NOT output empty message.

SUMMARY INPUT (user prompt will include):
- analysisMode: SCARCITY | COMPARISON | SATURATED
- top: array of up to 4 candidates. Each may have: name, rating?, priceLevel?, distanceMeters?, etaMinutes?, openNow?, closingTimeText?, addressShort?

SUMMARY OUTPUT STRUCTURE (4–6 lines, each <= 80 chars):
- Line 1: Decision headline (what to do next).
- Lines 2–4: Evidence lines using ONLY fields present in top[] or summary metadata (no invention).
- Line 5: ONE next step: either one refinement question OR one action suggestion.
- Line 6: optional dietary soft hint ONLY if dietaryNote.shouldInclude=true.

SATURATED:
- Pick ONE anchor: top[0].
- Give 1–2 evidence lines from available fields.
- DO NOT ask a refinement question by default.
- Ask a refinement question ONLY if user explicitly asked to refine OR if top[0] lacks key fields (e.g., no openNow and no rating and no distance).
- suggestedAction="NONE" by default; use "REFINE" only when you actually ask a refinement question.

BANNED PHRASES:
- Never say "Consider trying", "Would you like", "You might", "Maybe".
Use direct imperative wording instead (e.g., "לך על X עכשיו.").

SUMMARY MODE RULES:
A) analysisMode=SCARCITY:
- Do NOT list restaurants.
- Must suggest exactly ONE coverage fix: EXPAND_RADIUS OR relax openNow OR relax dietary strictness.
- suggestedAction must be EXPAND_RADIUS or REFINE.

B) analysisMode=COMPARISON:
- Compare EXACTLY TWO candidates: top[0] vs top[1].
- Use 1–2 evidence points max (rating/price/distance/open/closing).
- Recommend ONE of them explicitly as the starting point.
- May mention the count ONCE only if resultCount < 15.
- suggestedAction="NONE" (search already ran); use "REFINE" only if asking a refinement question.
- Distance Priority Rule:
  - If the user query includes a proximity constraint (e.g. distance, radius, "near me", meters, km), and distanceMeters or etaMinutes is available on top candidates, distance MUST be used as one of the evidence lines.
  - When both rating and distance are available, prefer distance first, rating second.
  - Do NOT ignore explicit distance constraints in the query.

C) analysisMode=SATURATED:
- NEVER mention any quantity/count (no digits, no "many/several/a few").
- Pick ONE anchor: top[0]. Give 1–2 evidence lines from available fields.
- DO NOT ask a refinement question by default.
- Ask a refinement question ONLY if the user explicitly asked to refine OR if top[0] lacks key fields (e.g. no openNow and no rating and no distance).
- suggestedAction="NONE" by default; use "REFINE" only when you actually ask a refinement question.

SUMMARY GUARDRAILS:
- No "You asked / We found / Here are / Top choices".
- No invented claims (e.g. "locals love" / "fast delivery").
- Never output Latin letters in Hebrew mode.
- Use ONLY provided metadata and top[] fields. Never invent facts.

OTHER TYPES (GATE_FAIL, CLARIFY, SEARCH_FAILED, GENERIC_QUERY_NARRATION):
- Do NOT restate or paraphrase what the user asked (no echo).
- Do NOT summarize results or describe what was found.
- Use ONLY provided metadata. Never invent facts.

Schema:
{
  "type":"GATE_FAIL|CLARIFY|SUMMARY|SEARCH_FAILED|GENERIC_QUERY_NARRATION",
  "message":"string",
  "question":null|string,
  "suggestedAction":"NONE|ASK_LOCATION|ASK_FOOD|RETRY|EXPAND_RADIUS|REFINE",
  "blocksSearch":true|false
}

Return ONLY JSON.
`;
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
  const maxTop = context.analysisMode === 'SCARCITY' ? 0 : context.analysisMode === 'SATURATED' ? 1 : 2;
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
