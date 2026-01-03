/**
 * Assistant Narration Service
 * LLM Pass B: Generate contextual guidance messages and select actions
 * 
 * Phase 2: Now receives ONLY minimal AssistantContext (allowlist)
 * Cannot access full ParsedIntent, RestaurantResult[], or RefinementChip[]
 * 
 * Phase 4: Language validation added - ensures LLM output matches input language
 */

import { z } from 'zod';
import type { LLMProvider, Message } from '../../../llm/types.js';
import type {
  AssistPayload,
  FailureReason,
} from '../types/search.types.js';
import type { AssistantContext, ChipReference } from '../types/truth-state.types.js';
import type { TruthState } from '../types/truth-state.types.js';
import { getI18n, normalizeLang, type Lang } from '../../i18n/index.js';
import { AssistantPolicy } from './assistant-policy.js';
import { generateNormalTemplate, type TemplateContext } from './assistant-templates.js';
import { caches } from '../../../lib/cache/cache-manager.js';
import { CacheConfig } from '../config/cache.config.js';
import { LLM_ASSISTANT_TIMEOUT_MS } from '../../../config/index.js';
import * as crypto from 'crypto';

const i18n = getI18n();

// ============================================================================
// Input/Output Types
// ============================================================================

/**
 * Phase 2: Minimal input using AssistantContext allowlist
 * LLM Pass B can ONLY access pre-filtered context
 */
export interface AssistantGenerationInput {
  context: AssistantContext;
}

// LLM response schema
const AssistantResponseSchema = z.object({
  message: z.string(),
  primaryActionId: z.string().optional(),
  secondaryActionIds: z.array(z.string()).max(4).default([]),
  reasoning: z.string().optional(),
});

type AssistantResponse = z.infer<typeof AssistantResponseSchema>;

// ============================================================================
// Service
// ============================================================================

export class AssistantNarrationService {
  constructor(private llm: LLMProvider | null) {}

  /**
   * Phase 4: Detect language of text using Unicode ranges
   */
  private detectLanguage(text: string): Lang {
    // Hebrew
    if (/[\u0590-\u05FF]/.test(text)) return 'he';
    // Arabic
    if (/[\u0600-\u06FF]/.test(text)) return 'ar';
    // Cyrillic (Russian)
    if (/[\u0400-\u04FF]/.test(text)) return 'ru';
    // Default to English
    return 'en';
  }

  /**
   * Generate AI assistant payload with LLM
   * Phase 2: Receives only minimal AssistantContext
   * Phase 4: Validates language output
   */
  async generate(input: AssistantGenerationInput): Promise<AssistPayload> {
    const ctx = input.context;
    
    // Fallback if LLM not available
    if (!this.llm) {
      return this.createFallbackPayload(ctx);
    }

    try {
      const prompt = this.buildPrompt(ctx);

      const result = await this.llm.completeJSON(
        prompt,
        AssistantResponseSchema,
        {
          temperature: 0.3, // Allow variety but stay grounded
          timeout: LLM_ASSISTANT_TIMEOUT_MS, // 8s timeout (increased for reliability)
        }
      );

      // Phase 4: Validate language matches expected
      const detectedLang = this.detectLanguage(result.message);
      const expectedLang = normalizeLang(ctx.language);
      
      if (detectedLang !== expectedLang) {
        console.warn(
          `[AssistantNarration] Language mismatch: expected ${expectedLang}, got ${detectedLang}. Using fallback.`
        );
        return this.createFallbackPayload(ctx);
      }

      // Validate chip IDs exist in allowlist
      const validatedPayload = this.validateChipIds(result, ctx.chipAllowlist);

      return {
        type: ctx.failureReason === 'NONE' ? 'guide' : 'recovery',
        mode: ctx.mode,
        message: validatedPayload.message,
        ...(validatedPayload.primaryActionId !== undefined && { primaryActionId: validatedPayload.primaryActionId }),
        secondaryActionIds: validatedPayload.secondaryActionIds || [],
        ...(validatedPayload.reasoning !== undefined && { reasoning: validatedPayload.reasoning }),
        failureReason: ctx.failureReason,
      };
    } catch (error) {
      console.error('[AssistantNarration] LLM failed, using fallback:', error);
      return this.createFallbackPayload(ctx);
    }
  }

  /**
   * Assistant Narration Performance Policy: Fast generation with template/cache/LLM strategy
   * 
   * @param context - Minimal assistant context
   * @param truthState - Full truth state for policy decision
   * @returns AssistPayload with strategy metadata
   */
  async generateFast(
    context: AssistantContext,
    truthState: TruthState
  ): Promise<AssistPayload & { usedTemplate?: boolean; fromCache?: boolean }> {
    const decision = AssistantPolicy.decide(truthState);
    const startTime = Date.now();
    
    // Strategy 1: Template (0ms, no LLM)
    if (decision.strategy === 'TEMPLATE') {
      const templateCtx: TemplateContext = {
        resultCount: truthState.results.length,
        ...(truthState.intent.canonical?.category !== undefined && { category: truthState.intent.canonical.category }),
        ...(truthState.intent.canonical?.locationText !== undefined && { city: truthState.intent.canonical.locationText }),
        language: truthState.language as 'he' | 'en' | 'ar' | 'ru',
        hasActiveFilters: Object.keys(truthState.intent.filters || {}).length > 0,
        ...(truthState.results[0]?.name !== undefined && { topResultName: truthState.results[0].name })
      };
      
      const message = generateNormalTemplate(templateCtx);
      const duration = Date.now() - startTime;
      
      console.log(`[Assistant] ✨ TEMPLATE (${duration}ms, reason: ${decision.reason})`);
      
      return {
        type: 'guide',
        mode: 'NORMAL',
        message,
        secondaryActionIds: [],
        failureReason: 'NONE',
        usedTemplate: true,
        fromCache: false
      };
    }
    
    // Strategy 2: Check cache
    if (decision.strategy === 'CACHE' && CacheConfig.assistantNarration.enabled) {
      const cacheKey = this.buildAssistCacheKey(truthState);
      const cached = caches.assistantNarration.get(cacheKey);
      
      if (cached) {
        const duration = Date.now() - startTime;
        console.log(`[Assistant] ✅ CACHE HIT (${duration}ms)`);
        return { ...cached, fromCache: true, usedTemplate: false };
      }
    }
    
    // Strategy 3: LLM fallback
    console.log(`[Assistant] 🤖 LLM (reason: ${decision.reason})`);
    const result = await this.generate({ context });
    
    // Cache LLM result for future requests
    if (decision.strategy === 'CACHE' && CacheConfig.assistantNarration.enabled) {
      const cacheKey = this.buildAssistCacheKey(truthState);
      const ttl = AssistantPolicy.getCacheTTL(truthState.mode);
      caches.assistantNarration.set(cacheKey, result, ttl);
      console.log(`[Assistant] 💾 Cached result (TTL: ${ttl / 1000}s)`);
    }
    
    return { ...result, usedTemplate: false, fromCache: false };
  }

  /**
   * Build stable cache key for assistant narration
   * 
   * Key components:
   * - Mode (NORMAL/RECOVERY/CLARIFY)
   * - Language
   * - Canonical intent (category + city + filters)
   * - Top result IDs (for result stability)
   */
  private buildAssistCacheKey(truthState: TruthState): string {
    const { mode, intent, results, language } = truthState;
    
    // Canonical intent key
    const intentParts = [
      intent.canonical?.category,
      intent.canonical?.locationText,
      intent.filters?.openNow ? 'open' : '',
      intent.filters?.dietary?.sort().join(',')
    ].filter(Boolean);
    const intentKey = intentParts.join(':');
    
    // Top K place IDs (for result stability)
    const topPlaces = results.slice(0, 5).map(r => r.placeId).join(',');
    const placesHash = this.hashString(topPlaces);
    
    return `assist:v1:${mode}:${language}:${intentKey}:${placesHash}`;
  }

  /**
   * Simple hash function for cache key stability
   */
  private hashString(str: string): string {
    if (!str) return 'empty';
    return crypto.createHash('md5').update(str).digest('hex').substring(0, 8);
  }

  /**
   * Phase 5: Get mode-specific guidelines for LLM
   */
  private getModeGuidelines(ctx: AssistantContext): string {
    switch (ctx.mode) {
      case 'NORMAL':
        return `
MODE: NORMAL (results available, good quality)
- Provide a short summary (1 sentence)
- Suggest the most useful next action from chips
- Be concise and encouraging
- Example: "Found ${ctx.resultsCount} great options. Want to see top-rated or closest?"`;

      case 'RECOVERY':
        return `
MODE: RECOVERY (${ctx.resultsCount === 0 ? 'no results' : 'weak matches'})
- Briefly explain why (don't blame user)
- Suggest 1-2 concrete next steps from recovery chips
- Be helpful and constructive
- Example: "No exact matches here, but try expanding the search radius?"`;

      case 'CLARIFY':
        return `
MODE: CLARIFY (ambiguous intent OR missing info)
- Ask ONE specific clarifying question
- Keep it short and friendly
- Reference available chips if they help
- Example: "Which ${ctx.canonical?.locationText || 'city'} did you mean?" or "What kind of food are you looking for?"`;

      default:
        return '';
    }
  }

  /**
   * Build LLM prompt with safety rules and minimal context
   * Phase 2: Works only with AssistantContext (allowlist)
   * Phase 5: Enhanced with mode-specific guidelines
   */
  private buildPrompt(ctx: AssistantContext): Message[] {
    const modeGuidelines = this.getModeGuidelines(ctx);

    const safetyRules = `
CRITICAL SAFETY RULES (MUST FOLLOW):
1. NEVER claim "open now", "closed", or provide hours unless openingHoursVerified is ${ctx.liveData.openingHoursVerified}
2. NEVER invent actions - only select IDs from the provided allowlist
3. Always reference the original user request: "${ctx.originalQuery}"
4. Response language MUST match: ${ctx.language}
5. If a tool/API failed, acknowledge honestly without technical jargon
6. Vary phrasing - avoid repetitive responses (be creative but professional)
7. Keep message to 1-2 sentences maximum (concise and actionable)
8. Be friendly, helpful, and conversational`;

    const contextSummary = this.buildContextSummary(ctx);
    const chipsList = this.buildChipsList(ctx.chipAllowlist);

    const systemPrompt = `You are a helpful restaurant search assistant.

${safetyRules}

MODE-SPECIFIC GUIDELINES:
${modeGuidelines}

CURRENT SITUATION:
${contextSummary}

AVAILABLE ACTIONS (chip IDs you MUST select from - no others allowed):
${chipsList}

YOUR TASK:
1. Write a brief, friendly message (1-2 sentences) about the results and what the user can do next
2. Follow the MODE-SPECIFIC GUIDELINES above for your message tone and content
3. Select ONE primary action (most important next step)
4. Select 2-4 secondary actions (alternative options)
5. Provide reasoning for your choices

OUTPUT JSON ONLY (no other text):
{
  "message": "Brief, friendly message in ${ctx.language}",
  "primaryActionId": "chip-id or omit if none suitable",
  "secondaryActionIds": ["chip-id-1", "chip-id-2"],
  "reasoning": "Why you chose these actions"
}`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Generate assistant message and select actions.' },
    ];
  }

  /**
   * Build context summary for LLM
   * Phase 2: Uses only AssistantContext (minimal allowlist)
   */
  private buildContextSummary(ctx: AssistantContext): string {
    const lines: string[] = [];

    lines.push(`- User asked: "${ctx.originalQuery}"`);

    if (ctx.canonical?.category || ctx.canonical?.locationText) {
      const parts = [];
      if (ctx.canonical.category) parts.push(ctx.canonical.category);
      if (ctx.canonical.locationText)
        parts.push(`in ${ctx.canonical.locationText}`);
      lines.push(`- Parsed as: ${parts.join(' ')}`);
    }

    lines.push(`- Results found: ${ctx.resultsCount}`);
    lines.push(`- Failure reason: ${ctx.failureReason}`);
    lines.push(`- Mode: ${ctx.mode}`);
    lines.push(`- Live data verified: ${ctx.liveData.openingHoursVerified}`);

    if (ctx.flags.requiresLiveData) {
      lines.push(`- User wants: live data (open/closed status)`);
    }

    if (ctx.flags.hasLocation) {
      lines.push(`- Location specified: yes`);
    }

    if (ctx.flags.isLowConfidence) {
      lines.push(`- Confidence: low (may need clarification)`);
    }

    return lines.join('\n');
  }

  /**
   * Build chips allowlist for LLM
   * Phase 2: Uses ChipReference (minimal info only)
   */
  private buildChipsList(chips: ChipReference[]): string {
    if (chips.length === 0) {
      return '(No actions available)';
    }

    return chips.map((c) => `- ${c.id}: ${c.emoji || ''} ${c.label}`).join('\n');
  }

  /**
   * Validate chip IDs exist in allowlist
   * Phase 2: Uses ChipReference (minimal info only)
   */
  private validateChipIds(
    result: AssistantResponse,
    chips: ChipReference[]
  ): AssistantResponse {
    const validChipIds = new Set(chips.map((c) => c.id));

    const validPrimary =
      result.primaryActionId && validChipIds.has(result.primaryActionId)
        ? result.primaryActionId
        : undefined;

    const validSecondary = result.secondaryActionIds
      .filter((id) => validChipIds.has(id))
      .slice(0, 4);

    return {
      message: result.message,
      primaryActionId: validPrimary,
      secondaryActionIds: validSecondary,
      reasoning: result.reasoning,
    };
  }

  /**
   * Create fallback payload when LLM fails or unavailable
   * Phase 2: Uses only AssistantContext (minimal allowlist)
   */
  private createFallbackPayload(ctx: AssistantContext): AssistPayload {
    const lang = normalizeLang(ctx.language);
    let message = '';

    // Get appropriate message based on failure reason
    switch (ctx.failureReason) {
      case 'NO_RESULTS':
        message = i18n.t('fallback.noResultsTryExpand', lang);
        break;
      
      case 'GEOCODING_FAILED':
        message = i18n.t('fallback.geocodingFailedTryCity', lang);
        break;
      
      case 'LOW_CONFIDENCE':
        message = i18n.t('fallback.lowConfidence', lang);
        break;
      
      case 'GOOGLE_API_ERROR':
        message = i18n.t('fallback.apiError', lang);
        break;
      
      case 'TIMEOUT':
        message = i18n.t('fallback.timeout', lang);
        break;
      
      case 'QUOTA_EXCEEDED':
        message = i18n.t('fallback.quotaExceeded', lang);
        break;
      
      case 'LIVE_DATA_UNAVAILABLE':
        message = i18n.t('fallback.liveDataUnavailable', lang);
        break;
      
      default:
        // NONE or other - standard message with results
        if (ctx.resultsCount > 0) {
          message = i18n.t('fallback.foundPlacesCanFilter', lang, { 
            count: ctx.resultsCount 
          });
        } else {
          message = i18n.t('fallback.whatToDo', lang);
        }
    }

    // Simple heuristic: pick first 3 chips from allowlist
    const primaryActionId = ctx.chipAllowlist[0]?.id;
    const secondaryActionIds = ctx.chipAllowlist.slice(1, 4).map((c) => c.id);

    return {
      type: ctx.failureReason === 'NONE' ? 'guide' : 'recovery',
      mode: ctx.mode,
      message,
      ...(primaryActionId !== undefined && { primaryActionId }),
      secondaryActionIds,
      failureReason: ctx.failureReason,
    };
  }
}

