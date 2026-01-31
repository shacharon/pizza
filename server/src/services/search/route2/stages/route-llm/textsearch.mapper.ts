/**
 * TextSearch Mapper - ROUTE2 Pipeline
 * * LLM-based mapper for TEXTSEARCH route
 * Converts raw query into Google Places Text Search parameters
 */

import { createHash } from 'crypto';
import type { SearchRequest } from '../../../types/search-request.dto.js';
import type { Route2Context, IntentResult, FinalSharedFilters } from '../../types.js';
import type { Message } from '../../../../../llm/types.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import { resolveLLM } from '../../../../../lib/llm/index.js';
import { TextSearchLLMResponseSchema, type TextSearchMapping } from './schemas.js';
import { canonicalizeTextQuery } from '../../../utils/google-query-normalizer.js';
import { generateCanonicalQuery } from './canonical-query.generator.js';
import { getCachedCanonicalQuery } from './canonical-query.cache.js';

const TEXTSEARCH_MAPPER_VERSION = 'textsearch_mapper_v4_keyed_freetext';

const TEXTSEARCH_MAPPER_PROMPT = `You are a query analyzer for Google Places Text Search API.
Your goal is to extract structured intent (cuisine keys, city, place type) from user queries.

CRITICAL: DO NOT generate full query sentences. Output ONLY semantic keys and mode.

Output ONLY JSON with these fields:
{
  "providerMethod": "textSearch",
  "mode": "KEYED" | "FREE_TEXT",
  "cuisineKey": "italian" | "asian" | ... | null,
  "placeTypeKey": "restaurant" | "cafe" | "bar" | null,
  "cityText": "string" | null,
  "region": "IL|FR|US|etc",
  "language": "he|en|ru|ar|fr|es|other",
  "reason": "token",
  "requiredTerms": [],
  "preferredTerms": [],
  "strictness": "STRICT" | "RELAX_IF_EMPTY",
  "typeHint": "restaurant" | "cafe" | "bar" | "any"
}

Mode Selection Rules:
1) KEYED mode: Use when query contains EXPLICIT cuisine intent or city mention
   - Extract cuisineKey (canonical: "italian", "asian", "japanese", etc.)
   - Extract cityText if explicitly mentioned (e.g., "בגדרה", "Ashdod")
   - Set strictness = "STRICT" if explicit cuisine detected
   - Example: "מסעדות איטלקיות בגדרה" → mode="KEYED", cuisineKey="italian", cityText="גדרה"

2) FREE_TEXT mode: Use for generic queries without specific cuisine/city keys
   - Set cuisineKey = null, cityText = null
   - Set strictness = "RELAX_IF_EMPTY"
   - Example: "מסעדות טובות" → mode="FREE_TEXT"

Cuisine Key Mapping (examples):
- "איטלקיות", "איטלקי", "Italian", "pasta", "pizza" → cuisineKey="italian"
- "סושי", "sushi", "יפנית", "Japanese" → cuisineKey="japanese"
- "בשרים", "בשר", "steak", "meat" → cuisineKey="steakhouse"
- "דגים", "דג", "fish", "seafood" → cuisineKey="seafood"
- "חלבי", "חלבית", "dairy" → cuisineKey="dairy"
- "טבעוני", "vegan" → cuisineKey="vegan"

City Extraction:
- Extract ONLY if explicitly mentioned in query
- Keep original form (don't translate): "גדרה" stays "גדרה", "Ashdod" stays "Ashdod"
- Set cityText = null if no explicit city mention

Important:
- NEVER generate full query sentences (no "Italian restaurant in Gedera")
- Output ONLY keys: cuisineKey, placeTypeKey, cityText, mode
- DO NOT fill requiredTerms/preferredTerms arrays (leave empty, filled by mapper)
- Reason must be: "keyed_cuisine_city", "keyed_cuisine_only", "freetext_generic", etc.
`;


const TEXTSEARCH_MAPPER_PROMPT_HASH = createHash('sha256')
  .update(TEXTSEARCH_MAPPER_PROMPT, 'utf8')
  .digest('hex');

/**
 * Build deterministic provider query based on mode
 * 
 * KEYED mode: "Italian restaurant in Gedera" (English provider format)
 * FREE_TEXT mode: clean(originalUserQuery) - no semantic rewrite
 * 
 * @param mode KEYED or FREE_TEXT
 * @param llmResult LLM extraction result (keys, cityText)
 * @param originalQuery Original user query
 * @param searchLanguage Language for provider (from filters_resolved)
 * @returns providerTextQuery and providerLanguage
 */
function buildProviderQuery(
  mode: 'KEYED' | 'FREE_TEXT',
  llmResult: {
    cuisineKey: string | null;
    placeTypeKey: string | null;
    cityText: string | null;
  },
  originalQuery: string,
  searchLanguage: 'he' | 'en',
  requestId?: string
): { providerTextQuery: string; providerLanguage: 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other'; source: string } {
  
  if (mode === 'KEYED' && llmResult.cuisineKey && llmResult.cityText) {
    // KEYED mode with cuisine + city: Build structured English query
    const cuisineKey = llmResult.cuisineKey as CuisineKey;
    const restaurantLabel = getCuisineRestaurantLabel(cuisineKey, 'en'); // Always English for provider
    
    // P0 FIX: Transliterate city to English for provider query
    const cityEnglish = transliterateCityToEnglish(llmResult.cityText);
    const providerTextQuery = `${restaurantLabel} in ${cityEnglish}`;
    
    logger.info({
      requestId,
      stage: 'textsearch_mapper',
      event: 'deterministic_builder_keyed',
      mode: 'KEYED',
      cuisineKey,
      cityText: llmResult.cityText,
      cityEnglish,
      providerTextQuery,
      providerLanguage: 'en',
      source: 'deterministic_builder'
    }, '[TEXTSEARCH] Built KEYED mode query (cuisine + city) - fully in English');
    
    return {
      providerTextQuery,
      providerLanguage: 'en', // Provider always uses English for structured queries
      source: 'deterministic_builder_keyed'
    };
  }
  
  if (mode === 'KEYED' && llmResult.cuisineKey) {
    // KEYED mode with cuisine only (no city): Use restaurant label
    const cuisineKey = llmResult.cuisineKey as CuisineKey;
    const restaurantLabel = getCuisineRestaurantLabel(cuisineKey, 'en');
    
    logger.info({
      requestId,
      stage: 'textsearch_mapper',
      event: 'deterministic_builder_keyed',
      mode: 'KEYED',
      cuisineKey,
      cityText: null,
      providerTextQuery: restaurantLabel,
      providerLanguage: 'en',
      source: 'deterministic_builder'
    }, '[TEXTSEARCH] Built KEYED mode query (cuisine only)');
    
    return {
      providerTextQuery: restaurantLabel,
      providerLanguage: 'en',
      source: 'deterministic_builder_keyed_no_city'
    };
  }
  
  // FREE_TEXT mode: Clean original query, preserve language
  const cleanedQuery = originalQuery
    .trim()
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .replace(/[״""'']/g, '') // Remove quotes
    .replace(/\?+$/g, ''); // Remove trailing question marks
  
  logger.info({
    requestId,
    stage: 'textsearch_mapper',
    event: 'deterministic_builder_freetext',
    mode: 'FREE_TEXT',
    originalQuery,
    cleanedQuery,
    providerLanguage: searchLanguage,
    source: 'deterministic_builder'
  }, '[TEXTSEARCH] Built FREE_TEXT mode query (cleaned original)');
  
  return {
    providerTextQuery: cleanedQuery,
    providerLanguage: searchLanguage, // Preserve original query language
    source: 'deterministic_builder_freetext'
  };
}

/**
 * Deterministic cuisine detector
 * 
 * Scans query for cuisine keywords and returns cuisineKey if found
 * This is a FALLBACK when LLM fails - ensures cuisine enforcement always works
 * 
 * Priority: Look for exact matches first, then partial matches
 * 
 * @param query User query in any language
 * @returns cuisineKey if detected, null otherwise
 */
function detectCuisineKeyword(query: string): CuisineKey | null {
  const queryLower = query.toLowerCase();

  // Iterate through all cuisines and check if any search term appears in query
  for (const [cuisineKey, token] of Object.entries(CUISINE_REGISTRY)) {
    // Check Hebrew terms
    for (const term of token.searchTerms.he) {
      if (queryLower.includes(term.toLowerCase())) {
        return cuisineKey as CuisineKey;
      }
    }

    // Check English terms
    for (const term of token.searchTerms.en) {
      if (queryLower.includes(term.toLowerCase())) {
        return cuisineKey as CuisineKey;
      }
    }
  }

  return null;
}

/**
 * Extract original cuisine word from query
 * Returns the actual word form used in the query (e.g., "איטלקיות", "איטלקי", "פיצה")
 * 
 * @param query Original user query
 * @param cuisineKey Detected cuisine key
 * @returns Original cuisine word or null if not found
 */
function extractOriginalCuisineWord(query: string, cuisineKey: CuisineKey): string | null {
  const token = CUISINE_REGISTRY[cuisineKey];
  if (!token) return null;

  const queryLower = query.toLowerCase();

  // Check Hebrew terms first (more likely for Hebrew queries)
  for (const term of token.searchTerms.he) {
    const termLower = term.toLowerCase();
    const index = queryLower.indexOf(termLower);
    if (index !== -1) {
      // Extract the original case from the query
      return query.substring(index, index + term.length);
    }
  }

  // Check English terms
  for (const term of token.searchTerms.en) {
    const termLower = term.toLowerCase();
    const index = queryLower.indexOf(termLower);
    if (index !== -1) {
      return query.substring(index, index + term.length);
    }
  }

  return null;
}

/**
 * Build deterministic textQuery for cuisine + city queries
 * 
 * Format (Hebrew): "מסעדה <cuisine-adj> ב<cityText>"
 * Example: "מסעדה איטלקית בגדרה"
 * 
 * This preserves the ORIGINAL cuisine word form from the query
 * 
 * @param originalQuery User's original query
 * @param cuisineWord Original cuisine word extracted from query
 * @param cityText City name from intent
 * @returns Formatted textQuery
 */
function buildDeterministicCuisineCityQuery(
  originalQuery: string,
  cuisineWord: string,
  cityText: string
): string {
  // Format: "מסעדה <cuisine> ב<city>"
  // Example: "מסעדה איטלקית בגדרה"
  
  // Check if query is in Hebrew (contains Hebrew characters)
  const hasHebrew = /[\u0590-\u05FF]/.test(originalQuery);
  
  if (hasHebrew) {
    // Hebrew format
    return `מסעדה ${cuisineWord} ${cityText}`;
  } else {
    // English format (fallback)
    return `${cuisineWord} restaurant ${cityText}`;
  }
}

// Import the updated static schema (the one without 'bias' fields)
import { TEXTSEARCH_JSON_SCHEMA, TEXTSEARCH_SCHEMA_HASH, assertStrictSchema } from './static-schemas.js';
import { CUISINE_REGISTRY, type CuisineKey, getCuisineSearchTerms, getCuisinePreferredTerms, getCuisineRestaurantLabel } from '../../shared/cuisine-tokens.js';

/**
 * City transliteration map (Hebrew → English)
 * For provider queries (Google API), we need English city names
 */
const CITY_TRANSLITERATION_MAP: Record<string, string> = {
  'תל אביב': 'Tel Aviv',
  'ירושלים': 'Jerusalem',
  'חיפה': 'Haifa',
  'באר שבע': 'Beer Sheva',
  'ראשון לציון': 'Rishon Lezion',
  'פתח תקווה': 'Petah Tikva',
  'אשדוד': 'Ashdod',
  'נתניה': 'Netanya',
  'בני ברק': 'Bnei Brak',
  'רחובות': 'Rehovot',
  'חולון': 'Holon',
  'בת ים': 'Bat Yam',
  'רמת גן': 'Ramat Gan',
  'אשקלון': 'Ashkelon',
  'הרצליה': 'Herzliya',
  'כפר סבא': 'Kfar Saba',
  'חדרה': 'Hadera',
  'מודיעין': 'Modiin',
  'נצרת': 'Nazareth',
  'לוד': 'Lod',
  'רמלה': 'Ramla',
  'נהריה': 'Nahariya',
  'בית שמש': 'Beit Shemesh',
  'גדרה': 'Gedera',
  'יבנה': 'Yavne',
  'יפו': 'Jaffa',
  'עכו': 'Acre',
  'טבריה': 'Tiberias',
  'צפת': 'Safed',
  'אילת': 'Eilat',
  'קריית אתא': 'Kiryat Ata',
  'קריית גת': 'Kiryat Gat',
  'קריית מוצקין': 'Kiryat Motzkin',
  'קריית ביאליק': 'Kiryat Bialik',
  'קריית אונו': 'Kiryat Ono',
  'קריית שמונה': 'Kiryat Shmona',
  'דימונה': 'Dimona',
  'אור יהודה': 'Or Yehuda',
  'ערד': 'Arad',
  'קרית ים': 'Kiryat Yam',
  'גבעתיים': 'Givatayim',
  'רעננה': 'Raanana'
};

/**
 * Transliterate city name to English for provider queries
 * Falls back to original if no mapping exists
 * 
 * @param cityText Original city text (may be Hebrew or English)
 * @returns English transliteration
 */
function transliterateCityToEnglish(cityText: string): string {
  // Check if already English (no Hebrew characters)
  const hasHebrew = /[\u0590-\u05FF]/.test(cityText);
  if (!hasHebrew) {
    return cityText; // Already English, return as-is
  }
  
  // Look up transliteration
  const normalized = cityText.trim();
  const transliteration = CITY_TRANSLITERATION_MAP[normalized];
  
  if (transliteration) {
    return transliteration;
  }
  
  // Fallback: return original (Google can handle Hebrew too)
  return cityText;
}

/**
 * Execute TextSearch Mapper
 */
/**
 * TextSearch Mapper
 * Handles the conversion of user queries into structured Google Search parameters.
 * 
 * @param finalFilters Single source of truth for region/language (from filters_resolved)
 */
export async function executeTextSearchMapper(
  intent: IntentResult,
  request: SearchRequest,
  context: Route2Context,
  finalFilters: FinalSharedFilters
): Promise<TextSearchMapping> {
  const { requestId, traceId, sessionId, llmProvider } = context;
  const startTime = Date.now();

  try {
    const userPrompt = buildUserPrompt(request.query, finalFilters);
    const messages: Message[] = [
      { role: 'system', content: TEXTSEARCH_MAPPER_PROMPT },
      { role: 'user', content: userPrompt }
    ];

    // DIAGNOSTIC: Validate and log schema before OpenAI call
    // Ensure schema is strict-mode compliant (all properties in required array)
    const propertyKeys = Object.keys(TEXTSEARCH_JSON_SCHEMA.properties);
    const requiredArray = TEXTSEARCH_JSON_SCHEMA.required as readonly string[];
    const missingRequired = propertyKeys.filter(key => !requiredArray.includes(key));
    const hasModeField = requiredArray.includes('mode');
    
    logger.info({
      requestId,
      stage: 'textsearch_mapper',
      event: 'schema_check_before_llm',
      schemaId: 'TEXTSEARCH_JSON_SCHEMA',
      schemaProperties: propertyKeys,
      schemaPropertiesCount: propertyKeys.length,
      schemaRequired: Array.from(requiredArray),
      schemaRequiredCount: requiredArray.length,
      hasModeField,
      missingRequired: missingRequired.length > 0 ? missingRequired : undefined,
      schemaValid: missingRequired.length === 0,
      schemaHash: TEXTSEARCH_SCHEMA_HASH
    });

    // Assert schema is valid before OpenAI call (fail fast if invalid)
    assertStrictSchema(TEXTSEARCH_JSON_SCHEMA, 'TEXTSEARCH_JSON_SCHEMA');

    // Resolve model and timeout for routeMapper purpose
    const { model, timeoutMs } = resolveLLM('routeMapper');

    let response: any = null;
    let lastError: any = null;

    // FINAL SCHEMA CHECK: Log schema state right before OpenAI call
    const finalPropertyKeys = Object.keys(TEXTSEARCH_JSON_SCHEMA.properties);
    const finalRequiredKeys = Array.from(TEXTSEARCH_JSON_SCHEMA.required);
    const missingRequiredKeys = finalPropertyKeys.filter(key => !finalRequiredKeys.includes(key as any));
    
    logger.info({
      requestId,
      stage: 'textsearch_mapper',
      event: 'schema_final_check',
      schemaType: TEXTSEARCH_JSON_SCHEMA.type,
      propertyKeys: finalPropertyKeys,
      requiredKeys: finalRequiredKeys,
      missingRequiredKeys: missingRequiredKeys.length > 0 ? missingRequiredKeys : undefined,
      hasModeField: finalRequiredKeys.includes('mode'),
      additionalProperties: TEXTSEARCH_JSON_SCHEMA.additionalProperties,
      isValid: missingRequiredKeys.length === 0
    }, '[TEXTSEARCH] Final schema check before OpenAI call');

    // Attempt 1: Initial LLM call
    try {
      response = await llmProvider.completeJSON(
        messages,
        TextSearchLLMResponseSchema,  // Use LLM response schema (no bias)
        {
          model,
          temperature: 0,
          timeout: timeoutMs,
          requestId,
          ...(context.traceId && { traceId: context.traceId }),
          ...(context.sessionId && { sessionId: context.sessionId }),
          stage: 'textsearch_mapper',
          promptVersion: TEXTSEARCH_MAPPER_VERSION,
          promptHash: TEXTSEARCH_MAPPER_PROMPT_HASH,
          schemaHash: TEXTSEARCH_SCHEMA_HASH
        },
        TEXTSEARCH_JSON_SCHEMA // Use the simplified schema defined above
      );
    } catch (err: any) {
      lastError = err;
      const errorMsg = err?.message || String(err);
      const errorType = err?.errorType || '';
      const isTimeout = errorType === 'abort_timeout' ||
        errorMsg.toLowerCase().includes('abort') ||
        errorMsg.toLowerCase().includes('timeout');

      if (isTimeout) {
        logger.warn({
          requestId,
          stage: 'textsearch_mapper',
          errorType,
          attempt: 1,
          msg: '[ROUTE2] textsearch_mapper timeout, retrying once'
        });

        // Jittered backoff: 100-200ms (gate2 pattern)
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));

        // FINAL SCHEMA CHECK (retry): Log schema state before retry call
        logger.info({
          requestId,
          stage: 'textsearch_mapper',
          event: 'schema_final_check',
          attempt: 2,
          schemaType: TEXTSEARCH_JSON_SCHEMA.type,
          propertyKeys: finalPropertyKeys,
          requiredKeys: finalRequiredKeys,
          missingRequiredKeys: missingRequiredKeys.length > 0 ? missingRequiredKeys : undefined,
          hasModeField: finalRequiredKeys.includes('mode'),
          additionalProperties: TEXTSEARCH_JSON_SCHEMA.additionalProperties,
          isValid: missingRequiredKeys.length === 0
        }, '[TEXTSEARCH] Final schema check before OpenAI retry call');

        // Attempt 2: Retry once
        try {
          response = await llmProvider.completeJSON(
            messages,
            TextSearchLLMResponseSchema,
            {
              model,
              temperature: 0,
              timeout: timeoutMs,
              requestId,
              ...(context.traceId && { traceId: context.traceId }),
              ...(context.sessionId && { sessionId: context.sessionId }),
              stage: 'textsearch_mapper',
              promptVersion: TEXTSEARCH_MAPPER_VERSION,
              promptHash: TEXTSEARCH_MAPPER_PROMPT_HASH,
              schemaHash: TEXTSEARCH_SCHEMA_HASH
            },
            TEXTSEARCH_JSON_SCHEMA
          );

          logger.info({
            requestId,
            stage: 'textsearch_mapper',
            attempt: 2,
            msg: '[ROUTE2] textsearch_mapper retry succeeded'
          });
        } catch (retryErr) {
          // Retry failed - will use fallback below
          lastError = retryErr;
        }
      }
    }

    // If LLM failed (even after retry), use fallback
    if (!response) {
      logger.warn({
        requestId,
        stage: 'textsearch_mapper',
        error: lastError?.message || String(lastError),
        msg: '[ROUTE2] textsearch_mapper LLM failed, using fallback'
      });
      return buildDeterministicMapping(intent, request, finalFilters, context);
    }

    // Using 'as any' because the LLM response structure changed
    const llmResult = response.data as any;

    // CRITICAL: Override LLM's region/language with filters_resolved values (single source of truth)
    llmResult.region = finalFilters.regionCode;
    llmResult.language = finalFilters.languageContext?.searchLanguage ?? finalFilters.providerLanguage;

    // DETERMINISTIC QUERY BUILDER: Build providerTextQuery based on mode
    const { providerTextQuery, providerLanguage, source } = buildProviderQuery(
      llmResult.mode,
      {
        cuisineKey: llmResult.cuisineKey,
        placeTypeKey: llmResult.placeTypeKey,
        cityText: llmResult.cityText
      },
      request.query,
      finalFilters.languageContext?.searchLanguage as 'he' | 'en' ?? 'he',
      requestId
    );

    // Store both textQuery (for logging) and providerTextQuery (for Google)
    const mapping = {
      ...llmResult,
      textQuery: providerTextQuery, // For backwards compatibility
      providerTextQuery,
      providerLanguage,
      source
    };

    // Generate requiredTerms/preferredTerms from cuisineKey if present
    if (llmResult.cuisineKey) {
      const searchLang = finalFilters.languageContext?.searchLanguage as 'he' | 'en' ?? 'he';
      mapping.requiredTerms = getCuisineSearchTerms(llmResult.cuisineKey as CuisineKey, searchLang);
      mapping.preferredTerms = getCuisinePreferredTerms(llmResult.cuisineKey as CuisineKey, searchLang);
      mapping.strictness = 'STRICT';
      
      logger.info({
        requestId,
        stage: 'textsearch_mapper',
        event: 'cuisine_terms_generated',
        cuisineKey: llmResult.cuisineKey,
        searchLanguage: searchLang,
        requiredTerms: mapping.requiredTerms,
        preferredTerms: mapping.preferredTerms
      }, '[TEXTSEARCH] Generated cuisine terms from cuisineKey');
    } else {
      // No cuisine: empty terms, RELAX mode
      mapping.requiredTerms = [];
      mapping.preferredTerms = [];
      mapping.strictness = 'RELAX_IF_EMPTY';
    }

    // Propagate cityText from LLM result if present
    if (llmResult.cityText) {
      mapping.cityText = llmResult.cityText;
    } else if (intent.cityText) {
      // Fallback to intent cityText if LLM didn't extract it
      mapping.cityText = intent.cityText;
    }

    // CRITICAL: Manually inject 'bias' property as undefined.
    mapping.bias = undefined;

    // Apply location bias logic based on available anchors
    const biasResult = applyLocationBias(mapping, intent, request, requestId);
    mapping.bias = biasResult.bias;

    logger.info({
      requestId,
      stage: 'textsearch_mapper',
      event: 'mapper_success',
      mode: llmResult.mode,
      cuisineKey: llmResult.cuisineKey,
      cityText: mapping.cityText,
      providerTextQuery,
      providerLanguage,
      source,
      strictness: mapping.strictness
    }, '[TEXTSEARCH] Mapper completed successfully');

    return mapping as TextSearchMapping;

  } catch (error) {
    // Fallback logic if LLM fails or returns 400
    return buildDeterministicMapping(intent, request, finalFilters, context);
  }
}
/**
 * Build deterministic mapping when LLM fails
 * Uses filters_resolved as single source of truth for region/language
 * 
 * Fallback strategy:
 * 1. Try to detect cuisine + city → KEYED mode
 * 2. Otherwise → FREE_TEXT mode with cleaned query
 */
async function buildDeterministicMapping(
  intent: IntentResult,
  request: SearchRequest,
  finalFilters: FinalSharedFilters,
  context: Route2Context
): Promise<TextSearchMapping> {
  const { requestId } = context;
  
  // Deterministic cuisine detection
  const detectedCuisineKey = detectCuisineKeyword(request.query);
  const hasCityText = !!intent.cityText;
  
  let mode: 'KEYED' | 'FREE_TEXT' = 'FREE_TEXT';
  let cityText: string | null = null;
  let cuisineKey: CuisineKey | null = null;
  
  // Determine mode based on detection results
  if (detectedCuisineKey && hasCityText) {
    mode = 'KEYED';
    cuisineKey = detectedCuisineKey;
    cityText = intent.cityText!;
    
    logger.info({
      requestId,
      stage: 'textsearch_mapper_fallback',
      event: 'deterministic_mode_keyed',
      cuisineKey,
      cityText,
      reason: 'cuisine_and_city_detected'
    }, '[TEXTSEARCH] Fallback: KEYED mode (cuisine + city detected)');
  } else if (detectedCuisineKey) {
    mode = 'KEYED';
    cuisineKey = detectedCuisineKey;
    
    logger.info({
      requestId,
      stage: 'textsearch_mapper_fallback',
      event: 'deterministic_mode_keyed',
      cuisineKey,
      cityText: null,
      reason: 'cuisine_only_detected'
    }, '[TEXTSEARCH] Fallback: KEYED mode (cuisine only)');
  } else {
    logger.info({
      requestId,
      stage: 'textsearch_mapper_fallback',
      event: 'deterministic_mode_freetext',
      reason: 'no_cuisine_detected'
    }, '[TEXTSEARCH] Fallback: FREE_TEXT mode (no cuisine detected)');
  }
  
  // Build provider query using deterministic builder
  const searchLang = finalFilters.languageContext?.searchLanguage as 'he' | 'en' ?? 'he';
  const { providerTextQuery, providerLanguage, source } = buildProviderQuery(
    mode,
    { cuisineKey, placeTypeKey: null, cityText },
    request.query,
    searchLang,
    requestId
  );
  
  // Generate cuisine terms if cuisineKey detected
  let requiredTerms: string[] = [];
  let preferredTerms: string[] = [];
  let strictness: 'STRICT' | 'RELAX_IF_EMPTY' = 'RELAX_IF_EMPTY';
  
  if (cuisineKey) {
    requiredTerms = getCuisineSearchTerms(cuisineKey, searchLang);
    preferredTerms = getCuisinePreferredTerms(cuisineKey, searchLang);
    strictness = 'STRICT';
    
    logger.info({
      requestId,
      stage: 'textsearch_mapper_fallback',
      event: 'cuisine_terms_generated',
      cuisineKey,
      searchLanguage: searchLang,
      requiredTerms,
      preferredTerms
    }, '[TEXTSEARCH] Generated cuisine terms in fallback');
  }

  const mapping: TextSearchMapping = {
    providerMethod: 'textSearch',
    mode,
    textQuery: providerTextQuery,
    providerTextQuery,
    providerLanguage,
    cuisineKey,
    placeTypeKey: null,
    cityText,
    region: finalFilters.regionCode,
    language: searchLang,
    bias: undefined,
    reason: source,
    requiredTerms,
    preferredTerms,
    strictness,
    typeHint: 'restaurant'
  };

  // Apply location bias
  const biasResult = applyLocationBias(mapping, intent, request, requestId);
  mapping.bias = biasResult.bias;

  logger.info({
    requestId,
    stage: 'textsearch_mapper_fallback',
    event: 'fallback_mapping_complete',
    mode,
    cuisineKey,
    cityText,
    providerTextQuery,
    providerLanguage,
    strictness
  }, '[TEXTSEARCH] Fallback mapping completed');

  return mapping;
}

function buildUserPrompt(query: string, finalFilters: FinalSharedFilters): string {
  const language = finalFilters.languageContext?.searchLanguage ?? finalFilters.providerLanguage;
  return `Query: "${query}"\nRegion: ${finalFilters.regionCode}\nLanguage: ${language}`;
}

/**
 * Apply location bias based on available anchors
 * 
 * P0 FIX: When explicit city is mentioned (intent.reason = explicit_city_mentioned OR cityText exists),
 * PREFER city-center bias (geocoded in handler) over userLocation default anchor.
 * This ensures explicit city searches focus on the city center, not user's current location.
 * 
 * Priority:
 * 1. cityText (explicit_city_mentioned) - will be geocoded in handler with smaller radius
 * 2. userLocation (fallback when no explicit city)
 * 3. No bias
 */
function applyLocationBias(
  mapping: TextSearchMapping,
  intent: IntentResult,
  request: SearchRequest,
  requestId?: string
): { bias: any, source: string | null, nullReason?: string } {
  // P0 FIX: Priority 1 - Check for EXPLICIT city first (before userLocation)
  // When user explicitly mentions a city, prefer city-center bias over their current location
  const hasExplicitCity = !!(mapping.cityText || intent.reason === 'explicit_city_mentioned');
  
  if (hasExplicitCity && mapping.cityText) {
    logger.info({
      requestId,
      stage: 'textsearch_mapper',
      event: 'bias_planned',
      source: 'cityCenter_pending_geocode',
      cityText: mapping.cityText,
      intentReason: intent.reason,
      note: 'explicit_city_preferred_over_userLocation'
    }, '[TEXTSEARCH] City-center bias planned (explicit city takes priority over userLocation)');

    // Return undefined bias but indicate it's planned (handler will geocode with smaller radius)
    return {
      bias: undefined,
      source: 'cityCenter_pending_geocode'
    };
  }

  // Priority 2: userLocation (fallback when no explicit city mentioned)
  if (request.userLocation) {
    const bias = {
      type: 'locationBias' as const,
      center: { lat: request.userLocation.lat, lng: request.userLocation.lng },
      radiusMeters: 20000 // Default 20km for user location bias
    };

    logger.info({
      requestId,
      stage: 'textsearch_mapper',
      event: 'bias_applied',
      source: 'userLocation',
      lat: bias.center.lat,
      lng: bias.center.lng,
      radiusMeters: bias.radiusMeters,
      note: 'no_explicit_city_using_userLocation'
    }, '[TEXTSEARCH] Location bias applied from userLocation (fallback, no explicit city)');

    return { bias, source: 'userLocation' };
  }

  // Priority 3: No location anchor available
  logger.debug({
    requestId,
    stage: 'textsearch_mapper',
    event: 'bias_not_available',
    hasUserLocation: !!request.userLocation,
    hasCityText: !!mapping.cityText,
    reason: 'no_location_anchor'
  }, '[TEXTSEARCH] No location bias available');

  return {
    bias: undefined,
    source: null,
    nullReason: 'no_location_anchor'
  };
}