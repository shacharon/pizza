/**
 * Assistant Narration Service
 * LLM Pass B: Generate contextual guidance messages and select actions
 * Always references original user intent and current system state
 */

import { z } from 'zod';
import type { LLMProvider, Message } from '../../../types/llm.types.js';
import type {
  ParsedIntent,
  RestaurantResult,
  RefinementChip,
  AssistPayload,
  FailureReason,
  LiveDataVerification,
} from '../types/search.types.js';
import { getI18n, normalizeLang, type Lang } from '../../i18n/index.js';

const i18n = getI18n();

// ============================================================================
// Input/Output Types
// ============================================================================

export interface AssistantGenerationInput {
  originalQuery: string;
  intent: ParsedIntent;
  results: RestaurantResult[];
  chips: RefinementChip[];
  failureReason: FailureReason;
  liveData: LiveDataVerification;
  language: string;
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
   * Generate AI assistant payload with LLM
   */
  async generate(input: AssistantGenerationInput): Promise<AssistPayload> {
    // Fallback if LLM not available
    if (!this.llm) {
      return this.createFallbackPayload(input);
    }

    try {
      const prompt = this.buildPrompt(input);

      const result = await this.llm.completeJSON<AssistantResponse>(
        prompt,
        AssistantResponseSchema,
        {
          temperature: 0.3, // Allow variety but stay grounded
          timeout: 5000, // 5s timeout
        }
      );

      // Validate chip IDs exist in allowlist
      const validatedPayload = this.validateChipIds(result, input.chips);

      return {
        type: input.failureReason === 'NONE' ? 'guide' : 'recovery',
        mode: this.isCriticalFailure(input.failureReason) ? 'RECOVERY' : 'NORMAL',
        message: validatedPayload.message,
        primaryActionId: validatedPayload.primaryActionId,
        secondaryActionIds: validatedPayload.secondaryActionIds || [],
        reasoning: validatedPayload.reasoning,
        failureReason: input.failureReason,
      };
    } catch (error) {
      console.error('[AssistantNarration] LLM failed, using fallback:', error);
      return this.createFallbackPayload(input);
    }
  }

  /**
   * Build LLM prompt with safety rules and context
   */
  private buildPrompt(input: AssistantGenerationInput): Message[] {
    const safetyRules = `
CRITICAL SAFETY RULES (MUST FOLLOW):
1. NEVER claim "open now", "closed", or provide hours unless openingHoursVerified is true
2. NEVER invent actions - only select IDs from the provided allowlist
3. Always reference the original user request (category + location if known)
4. If a tool/API failed, acknowledge honestly without technical jargon
5. Vary phrasing - avoid repetitive responses (be creative but professional)
6. Write in the user's language: ${input.language}
7. Keep message to 1-2 sentences maximum (concise and actionable)
8. Be friendly, helpful, and conversational`;

    const contextSummary = this.buildContextSummary(input);
    const chipsList = this.buildChipsList(input.chips);

    const systemPrompt = `You are a helpful restaurant search assistant.

${safetyRules}

CURRENT SITUATION:
${contextSummary}

AVAILABLE ACTIONS (chip IDs you MUST select from - no others allowed):
${chipsList}

YOUR TASK:
1. Write a brief, friendly message (1-2 sentences) about the results and what the user can do next
2. Select ONE primary action (most important next step)
3. Select 2-4 secondary actions (alternative options)
4. Provide reasoning for your choices

OUTPUT JSON ONLY (no other text):
{
  "message": "Brief, friendly message in ${input.language}",
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
   */
  private buildContextSummary(input: AssistantGenerationInput): string {
    const lines: string[] = [];

    lines.push(`- User asked: "${input.originalQuery}"`);

    if (input.intent.canonical?.category || input.intent.canonical?.locationText) {
      const parts = [];
      if (input.intent.canonical.category) parts.push(input.intent.canonical.category);
      if (input.intent.canonical.locationText)
        parts.push(`in ${input.intent.canonical.locationText}`);
      lines.push(`- Parsed as: ${parts.join(' ')}`);
    }

    lines.push(`- Results found: ${input.results.length}`);
    lines.push(`- Failure reason: ${input.failureReason}`);
    lines.push(`- Live data verified: ${input.liveData.openingHoursVerified}`);

    if (input.intent.filters.openNow) {
      lines.push(`- User wants: places open now`);
    }

    if (input.intent.location?.cityValidation) {
      lines.push(`- City validation: ${input.intent.location.cityValidation}`);
    }

    return lines.join('\n');
  }

  /**
   * Build chips allowlist for LLM
   */
  private buildChipsList(chips: RefinementChip[]): string {
    if (chips.length === 0) {
      return '(No actions available)';
    }

    return chips.map((c) => `- ${c.id}: ${c.emoji} ${c.label}`).join('\n');
  }

  /**
   * Validate chip IDs exist in allowlist
   */
  private validateChipIds(
    result: AssistantResponse,
    chips: RefinementChip[]
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
   */
  private createFallbackPayload(input: AssistantGenerationInput): AssistPayload {
    const lang = normalizeLang(input.language);
    let message = '';

    // Get appropriate message based on failure reason
    switch (input.failureReason) {
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
        if (input.results.length > 0) {
          message = i18n.t('fallback.foundPlacesCanFilter', lang, { 
            count: input.results.length 
          });
        } else {
          message = i18n.t('fallback.whatToDo', lang);
        }
    }

    // Simple heuristic: pick first 3 chips
    const primaryActionId = input.chips[0]?.id;
    const secondaryActionIds = input.chips.slice(1, 4).map((c) => c.id);

    return {
      type: input.failureReason === 'NONE' ? 'guide' : 'recovery',
      mode: this.isCriticalFailure(input.failureReason) ? 'RECOVERY' : 'NORMAL',
      message,
      primaryActionId,
      secondaryActionIds,
      failureReason: input.failureReason,
    };
  }

  /**
   * Check if failure is critical (recovery mode)
   */
  private isCriticalFailure(reason: FailureReason): boolean {
    const criticalReasons: FailureReason[] = [
      'NO_RESULTS',
      'GOOGLE_API_ERROR',
      'TIMEOUT',
      'QUOTA_EXCEEDED',
    ];
    return criticalReasons.includes(reason);
  }
}

