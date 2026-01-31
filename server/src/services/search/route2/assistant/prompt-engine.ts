/**
 * Assistant Prompt Engine
 * Builds LLM prompts for each assistant context type
 * 
 * Responsibility: Generate system and user prompts
 * Pure logic, no LLM calls, no validation
 */

import type {
  AssistantContext,
  AssistantGateContext,
  AssistantClarifyContext,
  AssistantSummaryContext,
  AssistantSearchFailedContext,
  AssistantGenericQueryNarrationContext
} from './assistant.types.js';

/**
 * System prompt (universal rules for all assistant types)
 */
const SYSTEM_PROMPT = `You are an assistant for a food search app. Return ONLY JSON.

Rules:
- Be friendly, concise (1-2 sentences max for message), helpful
- CRITICAL: Respond in the EXACT language specified (he=Hebrew ONLY, en=English ONLY)
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

Schema: {"type":"GATE_FAIL|CLARIFY|SUMMARY|SEARCH_FAILED|GENERIC_QUERY_NARRATION","message":"...","question":"..."|null,"suggestedAction":"NONE|ASK_LOCATION|ASK_FOOD|RETRY|EXPAND_RADIUS|REFINE","blocksSearch":true|false}
The response language is provided externally and MUST be used as-is.
Do NOT infer, detect, or change language.

`;

/**
 * Assistant Prompt Engine
 * Pure prompt building logic
 */
export class AssistantPromptEngine {
  /**
   * Get system prompt (same for all contexts)
   */
  buildSystemPrompt(): string {
    return SYSTEM_PROMPT;
  }

  /**
   * Build user prompt based on context type
   */
  buildUserPrompt(context: AssistantContext): string {
    switch (context.type) {
      case 'GATE_FAIL':
        return this.buildGateFailPrompt(context);
      case 'CLARIFY':
        return this.buildClarifyPrompt(context);
      case 'SUMMARY':
        return this.buildSummaryPrompt(context);
      case 'SEARCH_FAILED':
        return this.buildSearchFailedPrompt(context);
      case 'GENERIC_QUERY_NARRATION':
        return this.buildGenericNarrationPrompt(context);
      default:
        // Exhaustiveness check
        const _exhaustive: never = context;
        throw new Error(`Unknown context type: ${(_exhaustive as any).type}`);
    }
  }

  private buildGateFailPrompt(context: AssistantGateContext): string {
    const languageInstruction = context.language === 'he' ? 'Hebrew' : 'English';
    const languageEmphasis = context.language === 'he'
      ? 'MUST write in Hebrew (עברית)'
      : 'MUST write in English';
    const reason = context.reason === 'NO_FOOD' ? 'not food-related' : 'uncertain if food-related';

    return `Query: "${context.query}"
Type: GATE_FAIL
Reason: ${reason}
Language: ${context.language}

CRITICAL: You ${languageEmphasis}. Both "message" and "question" fields must be in ${languageInstruction}.

Generate friendly message. Help user understand and guide them. Decide blocksSearch and suggestedAction.`;
  }

  private buildClarifyPrompt(context: AssistantClarifyContext): string {
    const languageInstruction = context.language === 'he' ? 'Hebrew' : 'English';
    const languageEmphasis = context.language === 'he'
      ? 'MUST write in Hebrew (עברית)'
      : 'MUST write in English';
    const missing = context.reason === 'MISSING_LOCATION' ? 'location' : 'food type';

    return `Query: "${context.query}"
Type: CLARIFY
Reason: missing ${missing}
Language: ${context.language}

CRITICAL: You ${languageEmphasis}. Both "message" and "question" fields must be in ${languageInstruction}.

Ask a question to get the missing info. Decide blocksSearch and suggestedAction.`;
  }

  private buildSearchFailedPrompt(context: AssistantSearchFailedContext): string {
    const languageInstruction = context.language === 'he' ? 'Hebrew' : 'English';
    const languageEmphasis = context.language === 'he'
      ? 'MUST write in Hebrew (עברית)'
      : 'MUST write in English';
    const reason = context.reason === 'GOOGLE_TIMEOUT' ? 'Google API timeout' : 'provider error';

    return `Query: "${context.query}"
Type: SEARCH_FAILED
Reason: ${reason}
Language: ${context.language}

CRITICAL: You ${languageEmphasis}. Both "message" and "question" fields must be in ${languageInstruction}.

Tell user search failed. Decide what to suggest and whether to block. Be helpful and honest.`;
  }

  private buildGenericNarrationPrompt(context: AssistantGenericQueryNarrationContext): string {
    const languageInstruction = context.language === 'he' ? 'Hebrew' : 'English';
    const languageEmphasis = context.language === 'he'
      ? 'MUST write in Hebrew (עברית)'
      : 'MUST write in English';
    const locationSource = context.usedCurrentLocation ? 'current location' : 'default area';

    return `Query: "${context.query}"
Type: GENERIC_QUERY_NARRATION
Results: ${context.resultCount}
Location used: ${locationSource}
Language: ${context.language}

CRITICAL: You ${languageEmphasis}. Both "message" and "question" fields must be in ${languageInstruction}.

Instructions:
1. Message (1 sentence): Explain assumption - we used their current location because query was generic
2. Question (1 sentence): Ask for ONE refinement to help narrow results. Choose the MOST helpful:
   - Cuisine type (e.g., "איזה סוג אוכל?", "What cuisine?")
   - Dietary preference (e.g., "צריך כשר?", "Need kosher?")
   - Time constraint (e.g., "צריך פתוח עכשיו?", "Need open now?")
   - Distance (e.g., "כמה רחוק בסדר?", "How far is okay?")
3. Set blocksSearch=false (search already ran)
4. Set suggestedAction="REFINE"

Examples:
- (he) "חיפשתי לפי המיקום הנוכחי שלך. איזה סוג אוכל מעניין אותך?"
- (en) "I searched near your current location. What type of cuisine interests you?"`;
  }

  private buildSummaryPrompt(context: AssistantSummaryContext): string {
    const languageInstruction = context.language === 'he' ? 'Hebrew' : 'English';
    const languageEmphasis = context.language === 'he'
      ? 'MUST write in Hebrew (עברית)'
      : 'MUST write in English';

    const metadata = context.metadata || {};
    const dietaryNote = context.dietaryNote?.shouldInclude
      ? `\nDietary Note: Add SOFT gluten-free hint at end (1 sentence max).
  - Tone: uncertain, non-authoritative, helpful
  - Example (he): "ייתכן שיש אפשרויות ללא גלוטן - כדאי לוודא עם המסעדה."
  - Example (en): "Some places may offer gluten-free options - please confirm with restaurant."
  - NO medical claims, NO guarantees
  - Combine naturally with summary (max 2 sentences total)`
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
Language: ${context.language}${metadataContext}${dietaryNote}

CRITICAL: You ${languageEmphasis}. Both "message" and "question" fields must be in ${languageInstruction}.

Instructions:
1. CRITICAL: Reference the QUERY context in your response. User searched for "${context.query}" - acknowledge this.
2. NO generic phrases like "thank you", "here are", "found X results"
3. Provide ONE short insight (why results look this way OR what makes them relevant to "${context.query}")
4. Use the QUERY + metadata together (e.g., for "מסעדות איטלקיות בגדרה": mention Italian + Gedera context)
5. Optionally suggest: narrow search (filters, rating), expand search (radius, remove filters), or time-based advice
6. Use ONLY existing metadata - DO NOT invent weather, delivery, availability
7. Max 2 sentences total (including any dietary note)
8. VARY your response based on QUERY INTENT:
   - Cuisine queries (e.g., "איטלקיות", "sushi"): mention cuisine type and location
   - City queries (e.g., "בגדרה", "in Tel Aviv"): mention the specific city
   - Romantic/quality queries: acknowledge the special intent
   - Generic queries: focus on location/variety
9. Examples:
   - (he) Query="מסעדות איטלקיות בגדרה": "מצאתי מסעדות איטלקיות בגדרה. אפשר למיין לפי דירוג או מרחק."
   - (he) Query="מסעדות רומנטיות כשרות בת"א": "מצאתי מסעדות רומנטיות כשרות בתל אביב. רובן מדורגות גבוה."
   - (en) Query="Italian restaurants in Gedera": "Found Italian restaurants in Gedera. Most are rated highly."
   - (en) Query="romantic kosher restaurants in Tel Aviv": "Found romantic kosher spots in Tel Aviv. Several are open now."

Generate a QUERY-SPECIFIC message that helps user understand results in context of THEIR search.`;
  }
}
