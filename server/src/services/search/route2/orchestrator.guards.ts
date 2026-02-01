/**
 * Orchestrator Guards Module
 * Handles guard clauses and early stops (GATE STOP, ASK_CLARIFY, NEARBY location check)
 */

import type { SearchRequest } from '../types/search-request.dto.js';
import type { SearchResponse } from '../types/search-response.dto.js';
import type { Route2Context, Gate2StageOutput, IntentResult, Gate2Language } from './types.js';
import type { RouteLLMMapping } from './stages/route-llm/schemas.js';
import { logger } from '../../../lib/logger/structured-logger.js';
import { generateAndPublishAssistant } from './assistant/assistant-integration.js';
import { publishAssistantMessage } from './assistant/assistant-publisher.js';
import type { AssistantGateContext, AssistantClarifyContext, AssistantGenericQueryNarrationContext } from './assistant/assistant-llm.service.js';
import { resolveAssistantLanguage, resolveSessionId } from './orchestrator.helpers.js';
import type { WebSocketManager } from '../../../infra/websocket/websocket-manager.js';
import { buildEarlyExitResponse } from './orchestrator.response.js';

/**
 * Narrow Gate2Language to response language type ('he' | 'en')
 * Fallback: 'other'/'ru'/'ar'/'fr'/'es' → 'en'
 */
function narrowLanguageForResponse(language: Gate2Language): 'he' | 'en' {
  return language === 'he' ? 'he' : 'en';
}

/**
 * Handle GATE2 STOP (not food related)
 * Returns SearchResponse if should stop, null if should continue
 */
export async function handleGateStop(
  request: SearchRequest,
  gateResult: Gate2StageOutput,
  ctx: Route2Context,
  wsManager: WebSocketManager
): Promise<SearchResponse | null> {
  if (gateResult.gate.route !== 'STOP') {
    return null; // Continue
  }

  const { requestId, startTime } = ctx;
  const sessionId = resolveSessionId(request, ctx);

  logger.info(
    {
      requestId,
      pipelineVersion: 'route2',
      event: 'pipeline_stopped',
      reason: 'not_food_related',
      foodSignal: gateResult.gate.foodSignal
    },
    '[ROUTE2] Pipeline stopped - not food related'
  );

  // Initialize langCtx before generateAndPublishAssistant
  const assistantLanguage = resolveAssistantLanguage(ctx, request, gateResult.gate.language, gateResult.gate.confidence);
  if (!ctx.langCtx) {
    ctx.langCtx = {
      assistantLanguage,
      assistantLanguageConfidence: gateResult.gate.confidence || 0,
      uiLanguage: assistantLanguage,
      providerLanguage: assistantLanguage,
      region: 'IL'
    };
  }

  const fallbackHttpMessage = "זה לא נראה כמו חיפוש אוכל/מסעדות. נסה למשל: 'פיצה בתל אביב'.";
  const assistantContext: AssistantGateContext = {
    type: 'GATE_FAIL',
    reason: 'NO_FOOD',
    query: request.query,
    language: assistantLanguage
  };

  const assistMessage = await generateAndPublishAssistant(
    ctx,
    requestId,
    sessionId,
    assistantContext,
    fallbackHttpMessage,
    wsManager
  );

  return {
    requestId,
    sessionId,
    query: {
      original: request.query,
      parsed: {
        query: request.query,
        searchMode: 'textsearch' as const,
        filters: {},
        languageContext: {
          uiLanguage: 'he' as const,
          requestLanguage: 'he' as const,
          googleLanguage: 'he' as const
        },
        originalQuery: request.query
      },
      language: gateResult.gate.language
    },
    results: [],
    chips: [],
    assist: { type: 'guide' as const, message: assistMessage },
    meta: {
      tookMs: Date.now() - startTime,
      mode: 'textsearch' as const,
      appliedFilters: [],
      confidence: gateResult.gate.confidence,
      source: 'route2_gate_stop',
      failureReason: 'LOW_CONFIDENCE'
    }
  };
}

/**
 * Handle GATE2 ASK_CLARIFY (uncertain query)
 * Returns SearchResponse if should stop, null if should continue
 */
export async function handleGateClarify(
  request: SearchRequest,
  gateResult: Gate2StageOutput,
  ctx: Route2Context,
  wsManager: WebSocketManager
): Promise<SearchResponse | null> {
  if (gateResult.gate.route !== 'ASK_CLARIFY') {
    return null; // Continue
  }

  const { requestId, startTime } = ctx;
  const sessionId = resolveSessionId(request, ctx);

  logger.info(
    {
      requestId,
      pipelineVersion: 'route2',
      event: 'pipeline_clarify',
      reason: 'uncertain_query',
      foodSignal: gateResult.gate.foodSignal
    },
    '[ROUTE2] Pipeline asking for clarification'
  );

  // Initialize langCtx before generateAndPublishAssistant
  const assistantLanguage = resolveAssistantLanguage(ctx, request, gateResult.gate.language, gateResult.gate.confidence);
  if (!ctx.langCtx) {
    ctx.langCtx = {
      assistantLanguage,
      assistantLanguageConfidence: gateResult.gate.confidence || 0,
      uiLanguage: assistantLanguage,
      providerLanguage: assistantLanguage,
      region: 'IL'
    };
  }

  const fallbackHttpMessage =
    "כדי לחפש טוב צריך 2 דברים: מה אוכלים + איפה. לדוגמה: 'סושי באשקלון' או 'פיצה ליד הבית'.";

  const assistantContext: AssistantClarifyContext = {
    type: 'CLARIFY',
    reason: 'MISSING_FOOD',
    query: request.query,
    language: assistantLanguage
  };

  const assistMessage = await generateAndPublishAssistant(
    ctx,
    requestId,
    sessionId,
    assistantContext,
    fallbackHttpMessage,
    wsManager
  );

  return buildEarlyExitResponse({
    requestId,
    sessionId,
    query: request.query,
    language: narrowLanguageForResponse(gateResult.gate.language),
    confidence: gateResult.gate.confidence,
    assistType: 'clarify',
    assistMessage,
    source: 'route2_gate_clarify',
    failureReason: 'LOW_CONFIDENCE',
    startTime
  });
}


/**
 * Handle NEARBY route guard (requires userLocation)
 * Returns SearchResponse if should stop, null if should continue
 */
export async function handleNearbyLocationGuard(
  request: SearchRequest,
  gateResult: Gate2StageOutput,
  intentDecision: IntentResult,
  mapping: RouteLLMMapping,
  ctx: Route2Context,
  wsManager: WebSocketManager
): Promise<SearchResponse | null> {
  if (mapping.providerMethod !== 'nearbySearch' || ctx.userLocation) {
    return null; // Continue
  }

  const { requestId, startTime } = ctx;
  const sessionId = resolveSessionId(request, ctx);

  logger.info(
    {
      requestId,
      pipelineVersion: 'route2',
      event: 'pipeline_clarify',
      reason: 'missing_user_location_for_nearby'
    },
    '[ROUTE2] Missing userLocation for nearbySearch - asking to clarify'
  );

  // Initialize langCtx before generateAndPublishAssistant
  const assistantLanguage = resolveAssistantLanguage(ctx, request, mapping.language, undefined);
  if (!ctx.langCtx) {
    ctx.langCtx = {
      assistantLanguage,
      assistantLanguageConfidence: 0,
      uiLanguage: assistantLanguage,
      providerLanguage: assistantLanguage,
      region: 'IL'
    };
  }

  const fallbackHttpMessage =
    "כדי לחפש 'לידי' אני צריך את המיקום שלך. אפשר לאשר מיקום או לכתוב עיר/אזור (למשל: 'פיצה בגדרה').";

  const assistantContext: AssistantClarifyContext = {
    type: 'CLARIFY',
    reason: 'MISSING_LOCATION',
    query: request.query,
    language: assistantLanguage
  };

  const assistMessage = await generateAndPublishAssistant(
    ctx,
    requestId,
    sessionId,
    assistantContext,
    fallbackHttpMessage,
    wsManager
  );

  return buildEarlyExitResponse({
    requestId,
    sessionId,
    query: request.query,
    language: narrowLanguageForResponse(gateResult.gate.language),
    confidence: intentDecision.confidence,
    assistType: 'clarify',
    assistMessage,
    source: 'route2_guard_clarify',
    failureReason: 'LOW_CONFIDENCE',
    startTime
  });
}

/**
 * Deterministic list of generic food query patterns
 * These are queries that ask "what to eat" without specificity
 */
const GENERIC_FOOD_PATTERNS = [
  // Hebrew patterns
  /^מה\s+(יש\s+)?לאכול(\s+היום)?$/i,
  /^מה\s+אוכלים(\s+היום)?$/i,
  /^אוכל$/i,
  /^מה\s+בא\s+לי(\s+לאכול)?$/i,
  /^רעב$/i,
  /^מה\s+יש$/i,
  /^מה\s+תמליצ?ו?$/i,
  // English patterns
  /^what\s+to\s+eat(\s+today)?$/i,
  /^food$/i,
  /^hungry$/i,
  /^what(\s+do\s+you)?\s+recommend$/i,
  /^where\s+to\s+eat$/i
];

/**
 * Check if query matches generic food patterns (deterministic)
 */
function matchesGenericFoodPattern(query: string): boolean {
  const normalized = query.trim();
  return GENERIC_FOOD_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * Check if query is generic (e.g., "what to eat")
 * Generic query: foodSignal=YES but no specific location in query (no cityText)
 */
function isGenericFoodQuery(
  gateResult: Gate2StageOutput,
  intentDecision: IntentResult
): boolean {
  return (
    gateResult.gate.foodSignal === 'YES' &&
    !intentDecision.cityText &&
    intentDecision.route === 'NEARBY' // Generic queries typically route to NEARBY
  );
}

/**
 * Guard: Block overly-generic TEXTSEARCH queries without location anchors
 * Prevents sending "what to eat" without any location context to Google
 * 
 * Conditions:
 * - foodSignal=YES
 * - Query matches generic patterns (deterministic)
 * - No location anchor (no userLocation, no cityText)
 * 
 * Returns CLARIFY asking for location OR specificity
 */
export async function handleGenericQueryGuard(
  request: SearchRequest,
  gateResult: Gate2StageOutput,
  intentDecision: IntentResult,
  ctx: Route2Context,
  wsManager: WebSocketManager
): Promise<SearchResponse | null> {
  // Only check for TEXTSEARCH route (after intent stage)
  if (intentDecision.route !== 'TEXTSEARCH') {
    return null; // Continue
  }

  // Check conditions
  const isFoodQuery = gateResult.gate.foodSignal === 'YES';
  const isGeneric = matchesGenericFoodPattern(request.query);
  const hasLocationAnchor = !!ctx.userLocation || !!intentDecision.cityText;

  // If not generic or has location anchor, continue
  if (!isFoodQuery || !isGeneric || hasLocationAnchor) {
    return null; // Continue
  }

  const { requestId, startTime } = ctx;
  const sessionId = resolveSessionId(request, ctx);

  logger.info(
    {
      requestId,
      pipelineVersion: 'route2',
      event: 'generic_query_blocked',
      reason: 'no_location_anchor',
      query: request.query,
      hasUserLocation: false,
      hasCityText: false
    },
    '[ROUTE2] Blocking generic food query without location anchor'
  );

  // Initialize langCtx before generateAndPublishAssistant
  const assistantLanguage = resolveAssistantLanguage(ctx, request, gateResult.gate.language, gateResult.gate.confidence);
  if (!ctx.langCtx) {
    ctx.langCtx = {
      assistantLanguage,
      assistantLanguageConfidence: gateResult.gate.confidence || 0,
      uiLanguage: assistantLanguage,
      providerLanguage: assistantLanguage,
      region: 'IL'
    };
  }

  // Determine which question to ask based on language
  const fallbackHttpMessage = assistantLanguage === 'he'
    ? "כדי לעזור לך למצוא מסעדה טובה, אני צריך לדעת: באיזה אזור אתה מחפש? (למשל: 'פיצה בתל אביב')"
    : "To help you find a good restaurant, I need to know: which area are you searching in? (e.g., 'pizza in Tel Aviv')";

  const assistantContext: AssistantClarifyContext = {
    type: 'CLARIFY',
    reason: 'MISSING_LOCATION',
    query: request.query,
    language: assistantLanguage
  };

  const assistMessage = await generateAndPublishAssistant(
    ctx,
    requestId,
    sessionId,
    assistantContext,
    fallbackHttpMessage,
    wsManager
  );

  return buildEarlyExitResponse({
    requestId,
    sessionId,
    query: request.query,
    language: narrowLanguageForResponse(gateResult.gate.language),
    confidence: gateResult.gate.confidence,
    assistType: 'clarify',
    assistMessage,
    source: 'route2_generic_query_guard',
    failureReason: 'LOW_CONFIDENCE',
    startTime
  });
}

export async function handleIntentClarify(
  request: SearchRequest,
  intentDecision: IntentResult,
  ctx: Route2Context,
  wsManager: any
): Promise<SearchResponse | null> {
  if (intentDecision.route !== 'CLARIFY') return null;

  const sessionId = resolveSessionId(request, ctx);
  const enforcedLanguage = intentDecision.assistantLanguage;

  // Check if Intent provided clarify payload (single source of truth)
  if (intentDecision.clarify) {
    // USE INTENT CLARIFY PAYLOAD (no LLM generation)
    logger.info({
      requestId: ctx.requestId,
      event: 'intent_clarify_payload_from_intent',
      assistantLanguage: enforcedLanguage,
      reason: intentDecision.clarify.reason,
      hasClarify: true
    }, '[ROUTE2] CLARIFY path - using payload from Intent LLM');

    publishAssistantMessage(
      wsManager,
      ctx.requestId,
      sessionId,
      {
        type: 'CLARIFY',
        message: intentDecision.clarify.message,
        question: intentDecision.clarify.question,
        blocksSearch: intentDecision.clarify.blocksSearch,
        suggestedAction: intentDecision.clarify.suggestedAction,
        language: enforcedLanguage
      },
      {
        assistantLanguage: enforcedLanguage,
        assistantLanguageConfidence: intentDecision.languageConfidence,
        uiLanguage: enforcedLanguage,
        providerLanguage: enforcedLanguage,
        region: 'IL'
      },
      undefined
    );

    return {
      requestId: ctx.requestId,
      sessionId,
      query: {
        original: request.query,
        parsed: null as any,
        language: intentDecision.language
      },
      results: [],
      chips: [],
      assist: {
        type: 'clarify' as const,
        message: intentDecision.clarify.message
      },
      meta: {
        tookMs: Date.now() - ctx.startTime,
        mode: 'textsearch' as const,
        appliedFilters: [],
        confidence: intentDecision.confidence,
        source: 'intent_clarify',
        failureReason: 'LOW_CONFIDENCE' as const
      }
    };
  }

  // FALLBACK: Intent failed or didn't provide clarify - use deterministic fallback
  logger.warn({
    requestId: ctx.requestId,
    event: 'intent_clarify_fallback_used',
    errorType: 'missing_clarify_payload',
    assistantLanguage: enforcedLanguage,
    reason: intentDecision.reason
  }, '[ROUTE2] CLARIFY fallback - Intent did not provide clarify payload');

  // Deterministic fallback messages (localized by assistantLanguage)
  const fallbackMessages: Record<typeof enforcedLanguage, { message: string; question: string }> = {
    he: {
      message: 'כדי לחפש מסעדות קרובות אני צריך את המיקום שלך.',
      question: 'באיזו עיר אתה נמצא (או תשתף מיקום)?'
    },
    en: {
      message: 'I need your location to find places near you.',
      question: 'What city are you in (or can you share location)?'
    },
    ar: {
      message: 'أحتاج موقعك للعثور على أماكن قريبة منك.',
      question: 'في أي مدينة أنت (أو يمكنك مشاركة الموقع)?'
    },
    ru: {
      message: 'Мне нужно ваше местоположение, чтобы найти места рядом с вами.',
      question: 'В каком городе вы находитесь (или можете поделиться местоположением)?'
    },
    fr: {
      message: 'J\'ai besoin de votre position pour trouver des lieux près de vous.',
      question: 'Dans quelle ville êtes-vous (ou pouvez-vous partager votre position)?'
    },
    es: {
      message: 'Necesito tu ubicación para encontrar lugares cerca de ti.',
      question: '¿En qué ciudad estás (o puedes compartir tu ubicación)?'
    }
  };

  const fallback = fallbackMessages[enforcedLanguage];

  publishAssistantMessage(
    wsManager,
    ctx.requestId,
    sessionId,
    {
      type: 'CLARIFY',
      message: fallback.message,
      question: fallback.question,
      blocksSearch: true,
      suggestedAction: 'ASK_LOCATION',
      language: enforcedLanguage
    },
    {
      assistantLanguage: enforcedLanguage,
      assistantLanguageConfidence: intentDecision.languageConfidence,
      uiLanguage: enforcedLanguage,
      providerLanguage: enforcedLanguage,
      region: 'IL'
    },
    undefined
  );

  return {
    requestId: ctx.requestId,
    sessionId,
    query: {
      original: request.query,
      parsed: null as any,
      language: intentDecision.language
    },
    results: [],
    chips: [],
    assist: {
      type: 'clarify' as const,
      message: fallback.message
    },
    meta: {
      tookMs: Date.now() - ctx.startTime,
      mode: 'textsearch' as const,
      appliedFilters: [],
      confidence: intentDecision.confidence,
      source: 'intent_clarify',
      failureReason: 'LOW_CONFIDENCE' as const
    }
  };
}

/**
 * Store generic query narration flag for later use in response builder
 * Returns null (always continues)
 */
export function checkGenericFoodQuery(
  gateResult: Gate2StageOutput,
  intentDecision: IntentResult,
  ctx: Route2Context
): null {
  if (isGenericFoodQuery(gateResult, intentDecision)) {
    logger.info(
      {
        requestId: ctx.requestId,
        pipelineVersion: 'route2',
        event: 'generic_query_detected',
        reason: 'food_yes_no_location_text',
        hasUserLocation: !!ctx.userLocation
      },
      '[ROUTE2] Detected generic food query - will add narration after results'
    );

    // Store flag for response builder to add narration
    (ctx as any).isGenericQuery = true;
  }

  return null; // Always continue
}
