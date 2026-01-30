/**
 * Ranking Suggestion Prompt
 * 
 * Generates actionable suggestions based on RankingSignals.
 * Minimal LLM call - only invoked when triggers fire or "load more" action.
 */

import type { RankingSignals } from '../../ranking/ranking-signals.js';

/**
 * Ranking Suggestion Context
 * Minimal input to LLM
 */
export interface RankingSuggestionContext {
  uiLanguage: 'he' | 'en';
  query: string;
  rankingSignals: RankingSignals;
}

/**
 * System prompt for ranking suggestions
 * Hard rules enforced at LLM level
 */
export const RANKING_SUGGESTION_SYSTEM_PROMPT = `
You are a UX narrator for search results. Your job is to suggest ONE actionable change to improve search results.

**HARD RULES:**
1. Max 2 sentences in message
2. ONE actionable suggestion only (or null if results are good)
3. NEVER mention "weights", "scores", internal metrics, or pool counts
4. NEVER claim "real-time" or "best"
5. Language MUST match uiLanguage (he=Hebrew ONLY, en=English ONLY)
6. Be friendly and helpful, not technical
7. Do NOT invent filters or facts. Base everything ONLY on the provided input fields.
8. suggestion must be a single actionable change the user can do now (one filter or one refinement).

**Decision Guidance:**
- If triggers.lowResults OR triggers.relaxUsed → suggest loosening one constraint
  * If open filter present → suggest removing "open now"
  * If rating-focused → suggest lowering rating requirement
  * If price-focused → suggest expanding price range
  
- If triggers.manyOpenUnknown → suggest trying without "open now" filter OR asking for specific neighborhood
  
- If dominantFactor=DISTANCE but query implies quality → suggest adding "rating 4+"
  
- If dominantFactor=RATING but query implies proximity → suggest specifying area/neighborhood
+ **Language Guard (HARD):**
+ - If uiLanguage = "he": output Hebrew ONLY (Hebrew characters, quotes and punctuation allowed).
+ - If uiLanguage = "en": output English ONLY.
+ - For any other uiLanguage: respond strictly in the same language code received.


**Output Schema (strict JSON):**
{
  "message": "string (1-2 sentences, in correct language)",
  "suggestion": "string (one action) OR null",
  "suggestedAction": "REFINE_LOCATION" | "ADD_MIN_RATING" | "REMOVE_OPEN_NOW" | "REMOVE_PRICE" | "NONE"
}

**Examples:**

Input (he): lowResults=true, openState=OPEN_NOW
Output: {"message":"מצאנו רק מעט תוצאות. אפשר לנסות ללא הדרישה 'פתוח עכשיו'?","suggestion":"הסר את הסינון 'פתוח עכשיו'","suggestedAction":"REMOVE_OPEN_NOW"}

Input (en): dominantFactor=DISTANCE, query="best pizza"
Output: {"message":"Showing nearby options. Want to focus on highly-rated places?","suggestion":"Add minimum rating 4.0","suggestedAction":"ADD_MIN_RATING"}

Input (he): manyOpenUnknown=true
Output: {"message":"אין לנו מידע על שעות פתיחה לחלק מהמקומות. אפשר לחפש לפי אזור ספציפי?","suggestion":"ציין שכונה או רחוב","suggestedAction":"REFINE_LOCATION"}

Return ONLY valid JSON.`;

/**
 * Build user prompt from ranking context
 */
export function buildRankingSuggestionPrompt(context: RankingSuggestionContext): string {
  const { uiLanguage, query, rankingSignals } = context;
  const { profile, dominantFactor, triggers, facts } = rankingSignals;

  const languageInstruction = uiLanguage === 'he' ? 'Hebrew (עברית)' : 'English';
  const languageEmphasis = uiLanguage === 'he'
    ? 'CRITICAL: You MUST write in Hebrew (עברית) ONLY'
    : 'CRITICAL: You MUST write in English ONLY';

  // Build triggers summary
  const triggersActive: string[] = [];
  if (triggers.lowResults) triggersActive.push('lowResults');
  if (triggers.relaxUsed) triggersActive.push('relaxUsed');
  if (triggers.manyOpenUnknown) triggersActive.push('manyOpenUnknown');
  if (triggers.dominatedByOneFactor) triggersActive.push('dominatedByOneFactor');

  return `Query: "${query}"
Language: ${uiLanguage}
${languageEmphasis}

Ranking Signals:
- Profile: ${profile}
- Dominant Factor: ${dominantFactor}
- Active Triggers: ${triggersActive.join(', ') || 'none'}
- Results shown: ${facts.shownNow} (from pool of ${facts.totalPool})
- Has user location: ${facts.hasUserLocation}

Analyze the signals and generate ONE helpful suggestion (or null if results are good).
Message must be in ${languageInstruction}.`;
}
