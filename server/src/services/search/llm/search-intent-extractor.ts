/**
 * LLM-based SearchIntent Extractor (Phase 3)
 * 
 * Extracts SearchIntent directly from user query using LLM with a strict prompt.
 * Output validates against Zod schema and complies with SEARCH_INTENT_CONTRACT.md
 * 
 * This is the future path - once validated, the legacy parser + mapper will be removed.
 */

import type { LLMProvider } from '../../../llm/types.js';
import type { SearchIntent } from '../types/intent.dto.js';
import { validateIntent } from '../types/intent.dto.js';
import { logger } from '../../../lib/logger/structured-logger.js';

/**
 * The exact prompt for LLM intent extraction
 * Outputs only JSON matching SearchIntent schema
 */
const SEARCH_INTENT_EXTRACTOR_PROMPT = `# SEARCH_INTENT_EXTRACTOR_PROMPT (Cursor-ready)
# Purpose: Extract SearchIntent JSON ONLY (no execution details).
# Output must validate against Zod schema in intent.dto.ts and comply with docs/SEARCH_INTENT_CONTRACT.md

SYSTEM:
You are a strict intent extraction engine for a language-first food discovery product.
Your ONLY responsibility is to extract a SearchIntent object from the user's query.
You MUST return ONLY valid JSON (no prose, no markdown, no code fences).

NON-NEGOTIABLE RULES:
1) OUTPUT FORMAT: JSON ONLY. No extra text, no explanations, no markdown, no comments.
2) SCHEMA: Follow the exact schema below. Do NOT add fields. Do NOT remove fields.
3) ZERO EXECUTION: You MUST NOT provide execution details:
   - NO default radius decisions (except extracting an explicit user-stated distance)
   - NO coordinates (lat/lng), NO geocoding, NO places API params
   - NO ranking/scoring weights, NO filter precedence, NO "expand radius" suggestions
4) EXPLICIT ONLY: Extract ONLY what user explicitly said. Do NOT infer.
5) LANGUAGE: Detect language from the query text only (he/en/ar/ru). If uncertain, use "en".
6) CONFIDENCE: 0..1 representing extraction clarity, not execution readiness.

SCHEMA (MUST MATCH EXACTLY):
{
  "foodAnchor": { "type": string, "present": boolean },
  "locationAnchor": { "text": string, "type": "city"|"street"|"poi"|"gps"|"" , "present": boolean },
  "nearMe": boolean,
  "explicitDistance": { "meters": number|null, "originalText": string|null },
  "preferences": {
    "dietary": string[]|undefined,
    "priceLevel": 1|2|3|4|undefined,
    "openNow": boolean|undefined,
    "delivery": boolean|undefined,
    "takeout": boolean|undefined
  },
  "language": "he"|"en"|"ar"|"ru",
  "confidence": number,
  "originalQuery": string
}

FIELD RULES:
A) foodAnchor
- present=true ONLY if user explicitly specifies a food/cuisine/category (pizza/sushi/italian/burger/etc.)
- Generic "food", "restaurants", "something to eat" => present=false, type=""
- type should be a short canonical label from the user phrase (do not expand cuisines)

B) locationAnchor + nearMe
- present=true ONLY if the user explicitly provides a location text OR explicitly asks near-me/nearby.
- Near-me patterns (set both):
  - locationAnchor: { text: "near me" (or the original text), type:"gps", present:true }
  - nearMe: true
- If user gives a city/street/poi:
  - locationAnchor.text = the exact phrase (no geocoding)
  - type one of: city | street | poi
  - nearMe=false
- If missing location entirely: text="", type="", present=false, nearMe=false

C) explicitDistance
- Fill ONLY if user explicitly states distance (e.g., "within 500m", "עד 3 ק״מ")
- Convert to meters if clearly convertible:
  - 500m => 500
  - 3km => 3000
- If ambiguous or not stated: meters=null, originalText=null
- NEVER set a default distance.

D) preferences
- dietary: array ONLY when explicitly stated. Supported values:
  "vegan","vegetarian","kosher","halal","gluten_free"
  Multiple allowed if explicitly stated.
- priceLevel:
  - If explicit: map "cheap/not expensive" => 1 or 2; "expensive" => 3 or 4
  - If unclear: omit (undefined)
- openNow=true only if user explicitly says "open now / currently open / פתוח עכשיו"
  openNow=false only if user explicitly says "closed now / סגור עכשיו"
- delivery/takeout only if explicitly mentioned.

E) confidence
- 0.9+ clear food+location
- 0.7-0.85 partial but clear
- <0.6 very ambiguous or generic

FEW-SHOT EXAMPLES (follow style exactly, JSON only in answers):

Example 1
USER: "pizza in Tel Aviv open now"
ASSISTANT:
{
  "foodAnchor": { "type": "pizza", "present": true },
  "locationAnchor": { "text": "Tel Aviv", "type": "city", "present": true },
  "nearMe": false,
  "explicitDistance": { "meters": null, "originalText": null },
  "preferences": { "openNow": true },
  "language": "en",
  "confidence": 0.95,
  "originalQuery": "pizza in Tel Aviv open now"
}

Example 2
USER: "פיצה בגדרה"
ASSISTANT:
{
  "foodAnchor": { "type": "פיצה", "present": true },
  "locationAnchor": { "text": "גדרה", "type": "city", "present": true },
  "nearMe": false,
  "explicitDistance": { "meters": null, "originalText": null },
  "preferences": {},
  "language": "he",
  "confidence": 0.93,
  "originalQuery": "פיצה בגדרה"
}

Example 3
USER: "kosher gluten-free pizza near me"
ASSISTANT:
{
  "foodAnchor": { "type": "pizza", "present": true },
  "locationAnchor": { "text": "near me", "type": "gps", "present": true },
  "nearMe": true,
  "explicitDistance": { "meters": null, "originalText": null },
  "preferences": { "dietary": ["kosher", "gluten_free"] },
  "language": "en",
  "confidence": 0.9,
  "originalQuery": "kosher gluten-free pizza near me"
}

Example 4
USER: "sushi within 500 meters"
ASSISTANT:
{
  "foodAnchor": { "type": "sushi", "present": true },
  "locationAnchor": { "text": "", "type": "", "present": false },
  "nearMe": false,
  "explicitDistance": { "meters": 500, "originalText": "within 500 meters" },
  "preferences": {},
  "language": "en",
  "confidence": 0.82,
  "originalQuery": "sushi within 500 meters"
}

Example 5
USER: "מה מומלץ בתל אביב?"
ASSISTANT:
{
  "foodAnchor": { "type": "", "present": false },
  "locationAnchor": { "text": "תל אביב", "type": "city", "present": true },
  "nearMe": false,
  "explicitDistance": { "meters": null, "originalText": null },
  "preferences": {},
  "language": "he",
  "confidence": 0.72,
  "originalQuery": "מה מומלץ בתל אביב?"
}

RUNTIME INSTRUCTIONS:
Now extract intent for the next user query.
Remember: JSON ONLY.

USER QUERY:
{{USER_QUERY}}

A:`;

/**
 * Extract SearchIntent from user query using LLM
 * 
 * @param query - User's search query
 * @param llm - LLM provider instance
 * @param context - Optional context (sessionId, etc.)
 * @returns Validated SearchIntent
 * @throws Error if LLM fails or output is invalid
 */
export async function extractSearchIntentFromLLM(
  query: string,
  llm: LLMProvider,
  context?: { sessionId?: string }
): Promise<SearchIntent> {
  const startTime = Date.now();
  
  try {
    // Replace placeholder with actual query
    const prompt = SEARCH_INTENT_EXTRACTOR_PROMPT.replace('{{USER_QUERY}}', query);
    
    logger.debug({
      sessionId: context?.sessionId,
      queryLength: query.length
    }, '[LLM Extractor] Calling LLM for intent extraction');
    
    // Call LLM
    const response = await llm.complete([{
      role: 'user',
      content: prompt
    }], {
      temperature: 0.1  // Low temperature for consistent JSON output
    });
    
    const llmTime = Date.now() - startTime;
    
    logger.debug({
      sessionId: context?.sessionId,
      llmTime,
      responseLength: response.length
    }, '[LLM Extractor] LLM response received');
    
    // Clean response: remove markdown code fences if present
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.slice(7);
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }
    cleanedResponse = cleanedResponse.trim();
    
    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanedResponse);
    } catch (parseError) {
      logger.error({
        sessionId: context?.sessionId,
        rawResponse: response,
        cleanedResponse,
        error: parseError instanceof Error ? parseError.message : 'unknown'
      }, '[LLM Extractor] JSON parse failed');
      
      // Retry with clearer instructions
      return await retryWithClearerInstructions(query, llm, context);
    }
    
    // Validate with Zod
    const intent = validateIntent(parsed);
    
    const totalTime = Date.now() - startTime;
    
    logger.info({
      sessionId: context?.sessionId,
      totalTime,
      llmTime,
      foodPresent: intent.foodAnchor.present,
      locationPresent: intent.locationAnchor.present,
      confidence: intent.confidence
    }, '[LLM Extractor] Intent extracted successfully');
    
    return intent;
    
  } catch (error) {
    const totalTime = Date.now() - startTime;
    
    logger.error({
      sessionId: context?.sessionId,
      totalTime,
      error: error instanceof Error ? error.message : 'unknown',
      stack: error instanceof Error ? error.stack : undefined
    }, '[LLM Extractor] Intent extraction failed');
    
    throw error;
  }
}

/**
 * Retry extraction with clearer instructions if initial attempt fails
 * 
 * @param query - User's search query
 * @param llm - LLM provider instance
 * @param context - Optional context
 * @returns Validated SearchIntent
 * @throws Error if retry also fails
 */
async function retryWithClearerInstructions(
  query: string,
  llm: LLMProvider,
  context?: { sessionId?: string }
): Promise<SearchIntent> {
  
  logger.warn({
    sessionId: context?.sessionId
  }, '[LLM Extractor] Retrying with clearer instructions');
  
  const retryPrompt = `You MUST output ONLY valid JSON. No markdown, no explanations, no code fences.

Extract SearchIntent from this query: "${query}"

Output ONLY this JSON structure (fill with actual values):
{
  "foodAnchor": { "type": "", "present": false },
  "locationAnchor": { "text": "", "type": "", "present": false },
  "nearMe": false,
  "explicitDistance": { "meters": null, "originalText": null },
  "preferences": {},
  "language": "en",
  "confidence": 0.5,
  "originalQuery": "${query}"
}`;
  
  try {
    const response = await llm.complete([{
      role: 'user',
      content: retryPrompt
    }], {
      temperature: 0.1
    });
    
    // Clean and parse
    let cleaned = response.trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/```(json)?/g, '');
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();
    
    const parsed = JSON.parse(cleaned);
    const intent = validateIntent(parsed);
    
    logger.info({
      sessionId: context?.sessionId
    }, '[LLM Extractor] Retry succeeded');
    
    return intent;
    
  } catch (retryError) {
    logger.error({
      sessionId: context?.sessionId,
      error: retryError instanceof Error ? retryError.message : 'unknown'
    }, '[LLM Extractor] Retry also failed');
    
    throw new Error(`Failed to extract intent after retry: ${retryError instanceof Error ? retryError.message : 'unknown'}`);
  }
}

/**
 * Helper: Create a minimal CLARIFY-mode intent when extraction fails completely
 * Used as last resort fallback
 */
export function createClarifyIntent(query: string): SearchIntent {
  return {
    foodAnchor: { type: '', present: false },
    locationAnchor: { text: '', type: '', present: false },
    nearMe: false,
    explicitDistance: { meters: null, originalText: null },
    preferences: {},
    language: detectLanguageSimple(query),
    confidence: 0.1,
    originalQuery: query
  };
}

/**
 * Simple language detection based on character sets
 */
function detectLanguageSimple(text: string): 'he' | 'en' | 'ar' | 'ru' {
  // Hebrew: contains Hebrew characters
  if (/[\u0590-\u05FF]/.test(text)) return 'he';
  
  // Arabic: contains Arabic characters
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  
  // Russian: contains Cyrillic characters
  if (/[\u0400-\u04FF]/.test(text)) return 'ru';
  
  // Default to English
  return 'en';
}
