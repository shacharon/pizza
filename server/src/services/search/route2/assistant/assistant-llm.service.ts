/**
 * Assistant LLM Service
 *
 * Simple LLM-based assistant message generation for UX messages.
 * NO post-processing, NO policy enforcement, NO deterministic logic.
 * Pure LLM → strict JSON parsing → done.
 */

import { createHash } from 'node:crypto';
import type { LLMProvider } from '../../../../llm/types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { buildLLMOptions } from '../../../../lib/llm/index.js';
import { z } from 'zod';

// ============================================================================
// Debug Helpers (ASSISTANT_LANG_DEBUG=1)
// ============================================================================

const ASSISTANT_LANG_DEBUG = process.env.ASSISTANT_LANG_DEBUG === '1';

/**
 * Simple script-based language detection for debug logging
 * Returns first detected script or 'unknown'
 */
function detectMessageLanguage(text: string): string {
  if (!text || typeof text !== 'string') return 'unknown';

  // Strong script signals
  if (/[\u0590-\u05FF]/.test(text)) return 'he'; // Hebrew
  if (/[\u0400-\u04FF]/.test(text)) return 'ru'; // Cyrillic
  if (/[\u0600-\u06FF]/.test(text)) return 'ar'; // Arabic

  // Latin as a catch-all for en/fr/es (script-only heuristic)
  if (/[a-zA-Z]/.test(text)) return 'latin';

  return 'unknown';
}

/**
 * Get first N chars of text for preview (safe truncation)
 */
function getMessagePreview(text: string, maxChars: number = 80): string {
  if (!text) return '';
  return text.length > maxChars ? text.substring(0, maxChars) + '...' : text;
}

// ============================================================================
// Types
// ============================================================================

export type AssistantLanguage = 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' | 'other';

export interface AssistantGateContext {
  type: 'GATE_FAIL';
  reason: 'NO_FOOD' | 'UNCERTAIN_FOOD';
  query: string;
  language: AssistantLanguage;
}

export interface AssistantClarifyContext {
  type: 'CLARIFY';
  reason: 'MISSING_LOCATION' | 'MISSING_FOOD';
  query: string;
  language: AssistantLanguage;
}

export interface AssistantSummaryContext {
  type: 'SUMMARY';
  query: string;
  language: AssistantLanguage;
  resultCount: number;
  top3Names: string[];
  metadata?: {
    openNowCount?: number;
    currentHour?: number;
    radiusKm?: number;
    filtersApplied?: string[];
  };
  dietaryNote?: {
    type: 'gluten-free';
    shouldInclude: boolean;
  };
}

export interface AssistantSearchFailedContext {
  type: 'SEARCH_FAILED';
  reason: 'GOOGLE_TIMEOUT' | 'PROVIDER_ERROR' | 'NETWORK_ERROR';
  query: string;
  language: AssistantLanguage;
}

export interface AssistantGenericQueryNarrationContext {
  type: 'GENERIC_QUERY_NARRATION';
  query: string;
  language: AssistantLanguage;
  resultCount: number;
  usedCurrentLocation: boolean;
}

export type AssistantContext =
  | AssistantGateContext
  | AssistantClarifyContext
  | AssistantSummaryContext
  | AssistantSearchFailedContext
  | AssistantGenericQueryNarrationContext;

// Output schema (strict JSON)
export const AssistantOutputSchema = z.object({
  type: z.enum(['GATE_FAIL', 'CLARIFY', 'SUMMARY', 'SEARCH_FAILED', 'GENERIC_QUERY_NARRATION']),
  message: z.string(),
  question: z.string().nullable(),
  suggestedAction: z.enum(['NONE', 'ASK_LOCATION', 'ASK_FOOD', 'RETRY', 'EXPAND_RADIUS', 'REFINE']),
  blocksSearch: z.boolean()
}).strict();

export type AssistantOutput = z.infer<typeof AssistantOutputSchema>;

// JSON Schema for OpenAI
const ASSISTANT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['GATE_FAIL', 'CLARIFY', 'SUMMARY', 'SEARCH_FAILED', 'GENERIC_QUERY_NARRATION'] },
    message: { type: 'string' },
    question: { type: ['string', 'null'] },
    suggestedAction: { type: 'string', enum: ['NONE', 'ASK_LOCATION', 'ASK_FOOD', 'RETRY', 'EXPAND_RADIUS', 'REFINE'] },
    blocksSearch: { type: 'boolean' }
  },
  required: ['type', 'message', 'question', 'suggestedAction', 'blocksSearch'],
  additionalProperties: false
} as const;

// ============================================================================
// Language helpers
// ============================================================================

function normalizeRequestedLanguage(lang: AssistantLanguage): Exclude<AssistantLanguage, 'other'> {
  return lang === 'other' ? 'en' : lang;
}

function getLanguageName(lang: Exclude<AssistantLanguage, 'other'>): string {
  switch (lang) {
    case 'he': return 'Hebrew';
    case 'en': return 'English';
    case 'ar': return 'Arabic';
    case 'ru': return 'Russian';
    case 'fr': return 'French';
    case 'es': return 'Spanish';
  }
}

function getLanguageEmphasis(lang: Exclude<AssistantLanguage, 'other'>): string {
  switch (lang) {
    case 'he': return 'MUST write in Hebrew (עברית) only';
    case 'en': return 'MUST write in English only';
    case 'ar': return 'MUST write in Arabic (العربية) only';
    case 'ru': return 'MUST write in Russian (русский) only';
    case 'fr': return 'MUST write in French (français) only';
    case 'es': return 'MUST write in Spanish (español) only';
  }
}

function detectMismatch(messageLang: string, requested: Exclude<AssistantLanguage, 'other'>): boolean {
  // script-only heuristic:
  // he/ru/ar are strict; for en/fr/es we accept 'latin'
  if (requested === 'he') return messageLang !== 'he';
  if (requested === 'ru') return messageLang !== 'ru';
  if (requested === 'ar') return messageLang !== 'ar';
  // en/fr/es are latin script in practice
  if (requested === 'en' || requested === 'fr' || requested === 'es') return messageLang !== 'latin';
  return false;
}

// ============================================================================
// LLM Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are an assistant for a food search app. Return ONLY JSON.

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
function buildUserPrompt(context: AssistantContext): string {
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

// ============================================================================
// Schema Version (for cache keys if needed)
// ============================================================================

export const ASSISTANT_SCHEMA_VERSION = 'v3_strict_validation';
export const ASSISTANT_PROMPT_VERSION = 'v2_language_enforcement';

export const ASSISTANT_SCHEMA_HASH = createHash('sha256')
  .update(JSON.stringify(ASSISTANT_JSON_SCHEMA), 'utf8')
  .digest('hex')
  .substring(0, 12);

// ============================================================================
// Validation & Normalization
// ============================================================================

function countSentences(text: string): number {
  if (!text) return 0;
  const matches = text.match(/[.!?](\s|$)/g);
  return matches ? matches.length : 1;
}

function countQuestionMarks(text: string): number {
  if (!text) return 0;
  const matches = text.match(/\?/g);
  return matches ? matches.length : 0;
}

function validateMessageFormat(
  message: string,
  question: string | null
): { messageError?: string; questionError?: string } | null {
  const errors: { messageError?: string; questionError?: string } = {};

  const messageSentences = countSentences(message);
  if (messageSentences > 2) errors.messageError = `Too many sentences (${messageSentences}, max 2)`;

  if (question) {
    const questionSentences = countSentences(question);
    if (questionSentences > 1) errors.questionError = `Too many sentences (${questionSentences}, max 1)`;

    const questionMarks = countQuestionMarks(question);
    if (questionMarks > 1) errors.questionError = `Too many question marks (${questionMarks}, max 1)`;
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

// ============================================================================
// Invariants
// ============================================================================

function enforceInvariants(
  output: AssistantOutput,
  context: AssistantContext,
  requestId: string
): AssistantOutput {
  const normalized = { ...output };
  let changed = false;

  if (context.type === 'CLARIFY') {
    if (!normalized.blocksSearch) {
      logger.warn({ requestId, event: 'assistant_invariant_enforced', type: 'CLARIFY', field: 'blocksSearch', llmValue: normalized.blocksSearch, enforcedValue: true },
        '[ASSISTANT] Enforcing CLARIFY invariant: blocksSearch=true');
      normalized.blocksSearch = true;
      changed = true;
    }

    if ((context as AssistantClarifyContext).reason === 'MISSING_LOCATION' && normalized.suggestedAction !== 'ASK_LOCATION') {
      logger.warn({ requestId, event: 'assistant_invariant_enforced', type: 'CLARIFY', reason: 'MISSING_LOCATION', field: 'suggestedAction', llmValue: normalized.suggestedAction, enforcedValue: 'ASK_LOCATION' },
        '[ASSISTANT] Enforcing CLARIFY+MISSING_LOCATION invariant: suggestedAction=ASK_LOCATION');
      normalized.suggestedAction = 'ASK_LOCATION';
      changed = true;
    }

    if ((context as AssistantClarifyContext).reason === 'MISSING_FOOD' && normalized.suggestedAction !== 'ASK_FOOD') {
      logger.warn({ requestId, event: 'assistant_invariant_enforced', type: 'CLARIFY', reason: 'MISSING_FOOD', field: 'suggestedAction', llmValue: normalized.suggestedAction, enforcedValue: 'ASK_FOOD' },
        '[ASSISTANT] Enforcing CLARIFY+MISSING_FOOD invariant: suggestedAction=ASK_FOOD');
      normalized.suggestedAction = 'ASK_FOOD';
      changed = true;
    }
  }

  if (context.type === 'SUMMARY') {
    if (normalized.blocksSearch) {
      logger.warn({ requestId, event: 'assistant_invariant_violation_enforced', type: 'SUMMARY', field: 'blocksSearch', llmValue: normalized.blocksSearch, enforcedValue: false, severity: 'PROMPT_VIOLATION' },
        '[ASSISTANT] CRITICAL: LLM returned blocksSearch=true for SUMMARY - enforcing false');
      normalized.blocksSearch = false;
      changed = true;
    }

    if (normalized.suggestedAction !== 'NONE') {
      logger.warn({ requestId, event: 'assistant_invariant_enforced', type: 'SUMMARY', field: 'suggestedAction', llmValue: normalized.suggestedAction, enforcedValue: 'NONE' },
        '[ASSISTANT] Enforcing SUMMARY invariant: suggestedAction=NONE');
      normalized.suggestedAction = 'NONE';
      changed = true;
    }
  }

  if (context.type === 'GATE_FAIL') {
    if (!normalized.blocksSearch) {
      logger.warn({ requestId, event: 'assistant_invariant_enforced', type: 'GATE_FAIL', field: 'blocksSearch', llmValue: normalized.blocksSearch, enforcedValue: true },
        '[ASSISTANT] Enforcing GATE_FAIL invariant: blocksSearch=true');
      normalized.blocksSearch = true;
      changed = true;
    }

    if (normalized.suggestedAction !== 'RETRY') {
      logger.warn({ requestId, event: 'assistant_invariant_enforced', type: 'GATE_FAIL', field: 'suggestedAction', llmValue: normalized.suggestedAction, enforcedValue: 'RETRY' },
        '[ASSISTANT] Enforcing GATE_FAIL invariant: suggestedAction=RETRY');
      normalized.suggestedAction = 'RETRY';
      changed = true;
    }
  }

  if (context.type === 'GENERIC_QUERY_NARRATION') {
    if (normalized.blocksSearch) {
      logger.warn({ requestId, event: 'assistant_invariant_enforced', type: 'GENERIC_QUERY_NARRATION', field: 'blocksSearch', llmValue: normalized.blocksSearch, enforcedValue: false },
        '[ASSISTANT] Enforcing GENERIC_QUERY_NARRATION invariant: blocksSearch=false');
      normalized.blocksSearch = false;
      changed = true;
    }

    if (normalized.suggestedAction !== 'REFINE') {
      logger.warn({ requestId, event: 'assistant_invariant_enforced', type: 'GENERIC_QUERY_NARRATION', field: 'suggestedAction', llmValue: normalized.suggestedAction, enforcedValue: 'REFINE' },
        '[ASSISTANT] Enforcing GENERIC_QUERY_NARRATION invariant: suggestedAction=REFINE');
      normalized.suggestedAction = 'REFINE';
      changed = true;
    }
  }

  if (changed) {
    logger.info({ requestId, event: 'assistant_invariants_applied', type: context.type }, '[ASSISTANT] Applied type-specific invariants');
  }

  return normalized;
}

// ============================================================================
// Fallbacks (deterministic, language-correct)
// ============================================================================

function getDeterministicFallback(
  context: AssistantContext,
  requestedLanguage: Exclude<AssistantLanguage, 'other'>
): { message: string; question: string | null; suggestedAction: AssistantOutput['suggestedAction']; blocksSearch: boolean } {
  const lang = requestedLanguage;

  const t = {
    he: {
      needLocationMsg: 'כדי לחפש מסעדות לידך אני צריך את המיקום שלך.',
      needLocationQ: 'אפשר לאשר מיקום או לכתוב עיר/אזור?',
      needFoodMsg: 'כדי לחפש טוב צריך 2 דברים: מה אוכלים + איפה.',
      needFoodQ: 'איזה אוכל את/ה מחפש/ת?',
      notFoodMsg: 'זה לא נראה כמו חיפוש אוכל/מסעדות. נסה למשל: "פיצה בתל אביב".',
      failedMsg: 'משהו השתבש בחיפוש. אפשר לנסות שוב?',
      genericMsg: 'חיפשתי לפי המיקום הנוכחי שלך.',
      genericQ: 'איזה סוג אוכל מעניין אותך?',
      noResults: 'לא מצאתי תוצאות. נסה להרחיב רדיוס חיפוש או להסיר סינון.',
      refine: 'יש כמה אפשרויות טובות באזור. אפשר למיין לפי מרחק או דירוג.'
    },
    en: {
      needLocationMsg: 'To search for restaurants near you, I need your location.',
      needLocationQ: 'Can you enable location or enter a city/area?',
      needFoodMsg: 'To search well, I need 2 things: what food + where.',
      needFoodQ: 'What type of food are you looking for?',
      notFoodMsg: `This doesn't look like a food/restaurant search. Try: "pizza in Tel Aviv".`,
      failedMsg: 'Something went wrong with the search. Can you try again?',
      genericMsg: 'I searched near your current location.',
      genericQ: 'What type of cuisine interests you?',
      noResults: 'No results found. Try expanding search radius or removing filters.',
      refine: 'Several good options in the area. Sort by distance or rating to refine.'
    },
    ar: {
      needLocationMsg: 'للبحث عن مطاعم قريبة منك، أحتاج إلى موقعك.',
      needLocationQ: 'هل يمكنك تفعيل الموقع أو كتابة المدينة/المنطقة؟',
      needFoodMsg: 'لتحسين البحث، أحتاج شيئين: ماذا تريد أن تأكل + أين.',
      needFoodQ: 'ما نوع الطعام الذي تبحث عنه؟',
      notFoodMsg: 'هذا لا يبدو كبحث عن طعام/مطاعم. جرّب مثلًا: "بيتزا في تل أبيب".',
      failedMsg: 'حدث خطأ أثناء البحث. هل تريد المحاولة مرة أخرى؟',
      genericMsg: 'بحثت باستخدام موقعك الحالي.',
      genericQ: 'ما نوع المطبخ الذي تفضله؟',
      noResults: 'لم أجد نتائج. جرّب توسيع نطاق البحث أو إزالة بعض الفلاتر.',
      refine: 'هناك خيارات جيدة في المنطقة. جرّب الفرز حسب المسافة أو التقييم.'
    },
    ru: {
      needLocationMsg: 'Чтобы найти рестораны рядом, мне нужно ваше местоположение.',
      needLocationQ: 'Можете включить геолокацию или указать город/район?',
      needFoodMsg: 'Для хорошего поиска нужны 2 вещи: что хотите поесть + где.',
      needFoodQ: 'Какую кухню вы ищете?',
      notFoodMsg: 'Это не похоже на поиск еды/ресторанов. Например: "пицца в Тель-Авиве".',
      failedMsg: 'Произошла ошибка при поиске. Попробовать ещё раз?',
      genericMsg: 'Я искал рядом с вашим текущим местоположением.',
      genericQ: 'Какая кухня вам интересна?',
      noResults: 'Результатов нет. Попробуйте увеличить радиус или убрать фильтры.',
      refine: 'Есть хорошие варианты рядом. Отсортируйте по расстоянию или рейтингу.'
    },
    fr: {
      needLocationMsg: 'Pour chercher des restaurants près de vous, j’ai besoin de votre position.',
      needLocationQ: 'Pouvez-vous activer la localisation ou indiquer une ville/zone ?',
      needFoodMsg: 'Pour bien chercher, il me faut 2 choses : quoi manger + où.',
      needFoodQ: 'Quel type de cuisine cherchez-vous ?',
      notFoodMsg: 'Cela ne ressemble pas à une recherche de restaurants. Essayez : "pizza à Tel Aviv".',
      failedMsg: 'Un problème est survenu pendant la recherche. Réessayer ?',
      genericMsg: 'J’ai cherché près de votre position actuelle.',
      genericQ: 'Quel type de cuisine vous intéresse ?',
      noResults: 'Aucun résultat. Essayez d’élargir le rayon ou de retirer des filtres.',
      refine: 'Plusieurs bonnes options. Triez par distance ou note pour affiner.'
    },
    es: {
      needLocationMsg: 'Para buscar restaurantes cerca de ti, necesito tu ubicación.',
      needLocationQ: '¿Puedes activar la ubicación o escribir una ciudad/zona?',
      needFoodMsg: 'Para buscar bien, necesito 2 cosas: qué comida + dónde.',
      needFoodQ: '¿Qué tipo de comida buscas?',
      notFoodMsg: 'Esto no parece una búsqueda de comida/restaurantes. Prueba: "pizza en Tel Aviv".',
      failedMsg: 'Algo salió mal en la búsqueda. ¿Quieres intentarlo de nuevo?',
      genericMsg: 'Busqué cerca de tu ubicación actual.',
      genericQ: '¿Qué tipo de cocina te interesa?',
      noResults: 'No hay resultados. Prueba ampliar el radio o quitar filtros.',
      refine: 'Hay buenas opciones cerca. Ordena por distancia o valoración para afinar.'
    }
  }[lang];

  if (context.type === 'CLARIFY') {
    if (context.reason === 'MISSING_LOCATION') {
      return { message: t.needLocationMsg, question: t.needLocationQ, suggestedAction: 'ASK_LOCATION', blocksSearch: true };
    }
    return { message: t.needFoodMsg, question: t.needFoodQ, suggestedAction: 'ASK_FOOD', blocksSearch: true };
  }

  if (context.type === 'GATE_FAIL') {
    return { message: t.notFoodMsg, question: null, suggestedAction: 'RETRY', blocksSearch: true };
  }

  if (context.type === 'SEARCH_FAILED') {
    return { message: t.failedMsg, question: null, suggestedAction: 'RETRY', blocksSearch: true };
  }

  if (context.type === 'GENERIC_QUERY_NARRATION') {
    return { message: t.genericMsg, question: t.genericQ, suggestedAction: 'REFINE', blocksSearch: false };
  }

  // SUMMARY
  const count = (context as any).resultCount || 0;
  const metadata = (context as any).metadata || {};
  if (count === 0) return { message: t.noResults, question: null, suggestedAction: 'NONE', blocksSearch: false };

  if (metadata.openNowCount !== undefined && metadata.openNowCount < count / 2) {
    // keep it short and non-generic; still ok as fallback
    return { message: t.refine, question: null, suggestedAction: 'NONE', blocksSearch: false };
  }

  return { message: t.refine, question: null, suggestedAction: 'NONE', blocksSearch: false };
}

// ============================================================================
// Validate language + format; fallback on mismatch
// ============================================================================

function validateAndEnforceCorrectness(
  output: AssistantOutput,
  requestedLanguage: Exclude<AssistantLanguage, 'other'>,
  context: AssistantContext,
  requestId: string
): AssistantOutput {
  let useFallback = false;
  const validationIssues: string[] = [];

  // 1) Language validation (script-based) - ONLY check message field
  const msgLang = detectMessageLanguage(output.message);

  const messageMismatch = detectMismatch(msgLang, requestedLanguage);

  if (messageMismatch) {
    validationIssues.push(`language_mismatch (requested=${requestedLanguage}, detected=${msgLang})`);
    useFallback = true;

    if (ASSISTANT_LANG_DEBUG) {
      logger.warn({
        requestId,
        event: 'assistant_language_mismatch_debug',
        requestedLang: requestedLanguage,
        messageDetected: msgLang,
        checkedField: 'message',
        messagePreview: getMessagePreview(output.message),
        willUseFallback: true
      }, '[ASSISTANT_DEBUG] Language mismatch detected in message field');
    }
  }

  // Debug log for successful validation (when enabled)
  if (!messageMismatch && ASSISTANT_LANG_DEBUG) {
    logger.info({
      requestId,
      event: 'assistant_language_validated',
      requestedLang: requestedLanguage,
      messageDetected: msgLang,
      checkedField: 'message',
      messagePreview: getMessagePreview(output.message)
    }, '[ASSISTANT_DEBUG] Language validation passed');
  }

  // 2) Format validation
  const formatErrors = validateMessageFormat(output.message, output.question);
  if (formatErrors) {
    if (formatErrors.messageError) validationIssues.push(`message_format: ${formatErrors.messageError}`);
    if (formatErrors.questionError) validationIssues.push(`question_format: ${formatErrors.questionError}`);
    useFallback = true;
  }

  if (useFallback) {
    logger.warn({
      requestId,
      event: 'assistant_validation_failed',
      requestedLanguage,
      validationIssues,
      usingFallback: true
    }, '[ASSISTANT] Validation failed - using deterministic fallback');

    const fallback = getDeterministicFallback(context, requestedLanguage);

    return {
      type: output.type,
      message: fallback.message,
      question: fallback.question,
      suggestedAction: fallback.suggestedAction,
      blocksSearch: fallback.blocksSearch
    };
  }

  return output;
}

// ============================================================================
// Main Function
// ============================================================================

export async function generateAssistantMessage(
  context: AssistantContext,
  llmProvider: LLMProvider,
  requestId: string,
  opts?: { timeout?: number; model?: string; traceId?: string; sessionId?: string }
): Promise<AssistantOutput> {
  const startTime = Date.now();
  const requestedLanguage = normalizeRequestedLanguage(context.language);

  try {
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: buildUserPrompt(context) }
    ];

    logger.info({
      requestId,
      stage: 'assistant_llm',
      event: 'assistant_llm_start',
      type: context.type,
      reason: (context as any).reason,
      questionLanguage: requestedLanguage,
      queryLen: context.query.length,
      schemaVersion: ASSISTANT_SCHEMA_VERSION,
      promptVersion: ASSISTANT_PROMPT_VERSION
    }, '[ASSISTANT] Calling LLM');

    const llmOpts = buildLLMOptions('assistant', {
      temperature: 0.7,
      requestId,
      stage: 'assistant_llm',
      promptLength: messages.reduce((sum, m) => sum + m.content.length, 0)
    });

    if (opts?.model) llmOpts.model = opts.model;
    if (opts?.timeout) llmOpts.timeout = opts.timeout;
    if (opts?.traceId) (llmOpts as any).traceId = opts.traceId;
    if (opts?.sessionId) (llmOpts as any).sessionId = opts.sessionId;

    (llmOpts as any).promptVersion = ASSISTANT_PROMPT_VERSION;
    (llmOpts as any).schemaHash = ASSISTANT_SCHEMA_HASH;

    const result = await llmProvider.completeJSON(
      messages,
      AssistantOutputSchema,
      llmOpts,
      ASSISTANT_JSON_SCHEMA
    );

    const durationMs = Date.now() - startTime;

    const withInvariants = enforceInvariants(result.data, context, requestId);

    // Track whether fallback was used during validation
    let usedFallback = false;
    const beforeValidation = JSON.stringify(withInvariants);
    
    const validated = validateAndEnforceCorrectness(
      withInvariants,
      requestedLanguage,
      context,
      requestId
    );
    
    // Check if validation replaced content with fallback
    const afterValidation = JSON.stringify(validated);
    usedFallback = beforeValidation !== afterValidation;

    logger.info({
      requestId,
      stage: 'assistant_llm',
      event: usedFallback ? 'assistant_llm_parsed_json' : 'assistant_llm_success',
      type: validated.type,
      questionLanguage: requestedLanguage,
      suggestedAction: validated.suggestedAction,
      blocksSearch: validated.blocksSearch,
      validated: !usedFallback,
      usedFallback,
      durationMs,
      usage: result.usage,
      model: result.model
    }, usedFallback 
      ? '[ASSISTANT] LLM parsed JSON successfully (validation failed, used fallback)' 
      : '[ASSISTANT] LLM generated and validated message');

    return validated;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMsg.toLowerCase().includes('timeout') || errorMsg.toLowerCase().includes('abort');

    logger.error({
      requestId,
      stage: 'assistant_llm',
      event: 'assistant_llm_failed',
      type: context.type,
      questionLanguage: requestedLanguage,
      error: errorMsg,
      isTimeout,
      durationMs
    }, '[ASSISTANT] LLM call failed - using deterministic fallback');

    const fallback = getDeterministicFallback(context, requestedLanguage);

    if (ASSISTANT_LANG_DEBUG) {
      logger.info({
        requestId,
        event: 'assistant_fallback_used_debug',
        messagePreview: getMessagePreview(fallback.message),
        messageDetectedLang: detectMessageLanguage(fallback.message),
        requestedLang: requestedLanguage,
        reason: 'llm_error',
        error: errorMsg,
        isTimeout
      }, '[ASSISTANT_DEBUG] Using fallback due to LLM error');
    }

    return {
      type: context.type,
      message: fallback.message,
      question: fallback.question,
      suggestedAction: fallback.suggestedAction,
      blocksSearch: fallback.blocksSearch
    };
  }
}
