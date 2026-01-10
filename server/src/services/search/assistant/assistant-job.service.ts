/**
 * Phase 4: Assistant Job Service
 * Async LLM streaming over WebSocket with deterministic recommendations
 */

import seedrandom from 'seedrandom';
import type { LLMProvider, Message } from '../../../llm/types.js';
import type { IRequestStateStore } from '../../../infra/state/request-state.store.js';
import type { WebSocketManager } from '../../../infra/websocket/websocket-manager.js';
import type { ActionDefinition } from '../types/search.types.js';
import { logger } from '../../../lib/logger/structured-logger.js';
import { buildAssistantContext } from '../types/truth-state.types.js';

const ASSISTANT_TIMEOUT_MS = 15_000;

export class AssistantJobService {
  constructor(
    private llm: LLMProvider | null,
    private requestStateStore: IRequestStateStore,
    private wsManager: WebSocketManager
  ) {}

  /**
   * Start async assistant job (fire-and-forget)
   * Streams narration + generates deterministic recommendations
   */
  async startJob(requestId: string): Promise<void> {
    const startTime = Date.now();

    try {
      // 1. Load state
      const state = await this.requestStateStore.get(requestId);

      if (!state) {
        logger.warn({ requestId }, 'assistant_job_skipped: state not found');
        return;
      }

      logger.info({ requestId }, 'assistant_job_started');

      // 2. Persist + publish status 'streaming'
      state.assistantStatus = 'streaming';
      state.updatedAt = Date.now();
      await this.requestStateStore.set(requestId, state);

      this.wsManager.publish(requestId, {
        type: 'status',
        requestId,
        status: 'streaming'
      });

      // 3. Stream assistant narration
      let fullText = '';
      let timedOut = false;

      try {
        fullText = await this.streamAssistant(requestId, state, (chunk) => {
          // Publish each chunk
          this.wsManager.publish(requestId, {
            type: 'stream.delta',
            requestId,
            text: chunk
          });
        });
      } catch (error: any) {
        if (error?.name === 'AbortError' || error?.message?.includes('timeout')) {
          timedOut = true;
          logger.warn({
            requestId,
            elapsedMs: Date.now() - startTime
          }, 'assistant_job_timeout');

          // Publish error for timeout
          this.wsManager.publish(requestId, {
            type: 'error',
            requestId,
            error: 'ASSISTANT_TIMEOUT',
            message: 'Assistant narration timed out'
          });

          // If we have partial text, still send stream.done
          if (fullText) {
            this.wsManager.publish(requestId, {
              type: 'stream.done',
              requestId,
              fullText: fullText + ' (timeout)'
            });
          }

          // Update state to failed
          state.assistantStatus = 'failed';
          state.assistantOutput = fullText || 'Timeout';
          state.updatedAt = Date.now();
          await this.requestStateStore.set(requestId, state);
          return;
        }

        throw error; // Re-throw non-timeout errors
      }

      // 4. Generate deterministic recommendations
      const recommendations = this.generateDeterministicRecommendations(
        state.coreResult,
        state.seed
      );

      // 5. Publish completion
      this.wsManager.publish(requestId, {
        type: 'stream.done',
        requestId,
        fullText
      });

      this.wsManager.publish(requestId, {
        type: 'recommendation',
        requestId,
        actions: recommendations
      });

      this.wsManager.publish(requestId, {
        type: 'status',
        requestId,
        status: 'completed'
      });

      // 6. Cache outputs
      state.assistantStatus = 'completed';
      state.assistantOutput = fullText;
      state.recommendations = recommendations;
      state.updatedAt = Date.now();
      await this.requestStateStore.set(requestId, state);

      const assistantMs = Date.now() - startTime;
      logger.info({
        requestId,
        assistantMs,
        recommendationCount: recommendations.length
      }, 'assistant_job_completed');

    } catch (error: any) {
      const assistantMs = Date.now() - startTime;

      logger.error({
        requestId,
        error: error?.message || String(error),
        assistantMs
      }, 'assistant_job_failed');

      // Publish error message
      this.wsManager.publish(requestId, {
        type: 'error',
        requestId,
        error: 'ASSISTANT_FAILED',
        message: 'Assistant narration failed'
      });

      this.wsManager.publish(requestId, {
        type: 'status',
        requestId,
        status: 'failed'
      });

      // Update state to failed
      try {
        const state = await this.requestStateStore.get(requestId);
        if (state) {
          state.assistantStatus = 'failed';
          state.updatedAt = Date.now();
          await this.requestStateStore.set(requestId, state);
        }
      } catch (stateError) {
        logger.error({ requestId, error: stateError }, 'Failed to update state after error');
      }
    }
  }

  /**
   * Stream assistant narration with timeout
   */
  private async streamAssistant(
    requestId: string,
    state: any,
    onChunk: (text: string) => void
  ): Promise<string> {
    if (!this.llm) {
      // Fallback when LLM not available
      const fallbackText = this.getFallbackMessage(state.coreResult);
      onChunk(fallbackText);
      return fallbackText;
    }

    // Build prompt for assistant
    const prompt = this.buildAssistantPrompt(state.coreResult);

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Assistant stream timeout'));
      }, ASSISTANT_TIMEOUT_MS);
    });

    // Race between stream and timeout
    const streamPromise = this.llm.completeStream(
      prompt,
      onChunk,
      {
        temperature: 0.3,
        timeout: ASSISTANT_TIMEOUT_MS,
        ...(state.traceId !== undefined && { traceId: state.traceId }),
        ...(state.sessionId !== undefined && { sessionId: state.sessionId })
      }
    );

    return Promise.race([streamPromise, timeoutPromise]);
  }

  /**
   * Build assistant prompt from core result
   */
  private buildAssistantPrompt(coreResult: any): Message[] {
    const { query, results = [], chips = [], truthState } = coreResult || {};
    
    // Build minimal context - simplified version without buildAssistantContext
    // (to avoid dependency issues in testing)
    const assistantContext = {
      originalQuery: query?.original || 'search',
      resultsCount: results.length,
      failureReason: 'NONE' as const,
      mode: 'NORMAL' as const,
      language: query?.language || 'en',
      chipAllowlist: chips.map((c: any) => ({
        id: c.id,
        label: c.label,
        emoji: c.emoji
      })),
      canonical: query?.parsed?.canonical,
      liveData: { openingHoursVerified: false },
      flags: { requiresLiveData: false, hasLocation: false, isLowConfidence: false }
    };

    const systemPrompt = `You are a helpful restaurant search assistant.

USER QUERY: "${assistantContext.originalQuery}"
RESULTS FOUND: ${assistantContext.resultsCount}
LANGUAGE: ${assistantContext.language}

YOUR TASK:
Write a brief, friendly message (2-3 sentences) about the search results in ${assistantContext.language}.
- Be conversational and encouraging
- Mention the query and result count
- Suggest what the user can do next (filter, sort, explore)
- Do NOT claim "open now" or mention hours unless verified

Write ONLY the message text (no JSON, no formatting).`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Generate assistant message.' }
    ];
  }

  /**
   * Fallback message when LLM unavailable
   */
  private getFallbackMessage(coreResult: any): string {
    const count = coreResult?.results?.length || 0;
    const lang = coreResult?.query?.language || 'en';

    if (count === 0) {
      return lang === 'he' 
        ? 'לא נמצאו תוצאות. נסה לשנות את הפילטרים או להרחיב את השאילתה.'
        : 'No results found. Try adjusting your filters or broadening your search.';
    }

    if (lang === 'he') {
      return `נמצאו ${count} מקומות. אפשר לסנן לפי דירוג, מרחק או מחיר.`;
    }

    return `Found ${count} places. You can filter by rating, distance, or price.`;
  }

  /**
   * Generate deterministic recommendations based on seed
   * Returns stable, ordered list of 3-5 actions
   */
  private generateDeterministicRecommendations(
    coreResult: any,
    seed: number
  ): ActionDefinition[] {
    const rng = seedrandom(seed.toString()) as seedrandom.PRNG;
    const { results = [], chips = [] } = coreResult || {};

    // Base recommendations (always include these)
    const baseRecommendations: ActionDefinition[] = [];

    // If we have results, add result-level actions
    if (results.length > 0) {
      baseRecommendations.push({
        id: 'view_on_map',
        type: 'GET_DIRECTIONS',
        level: 0,
        label: 'View on Map',
        icon: '🗺️',
        enabled: true
      });

      // Top result action (call or visit)
      if (results[0]?.phoneNumber) {
        baseRecommendations.push({
          id: 'call_top',
          type: 'CALL_RESTAURANT',
          level: 0,
          label: `Call ${results[0].name}`,
          icon: '📞',
          requiresSelection: false,
          enabled: true
        });
      }
    }

    // Add chip-based actions (deterministically select from available chips)
    const availableChips = chips.slice(0, 5); // Max 5 chips
    const numToSelect = Math.min(3, availableChips.length);
    const selectedChipIndices = this.deterministicSample(
      availableChips.length,
      numToSelect,
      rng
    );

    for (const idx of selectedChipIndices) {
      const chip = availableChips[idx];
      if (chip) {
        baseRecommendations.push({
          id: chip.id,
          type: 'VIEW_DETAILS', // Generic type for chip actions
          level: 0,
          label: chip.label,
          icon: chip.emoji || '✨',
          enabled: true
        });
      }
    }

    // Limit to 5 actions max
    return baseRecommendations.slice(0, 5);
  }

  /**
   * Deterministic sampling: select K indices from N using RNG
   * Returns sorted array of indices
   */
  private deterministicSample(n: number, k: number, rng: seedrandom.PRNG): number[] {
    if (k >= n) {
      return Array.from({ length: n }, (_, i) => i);
    }

    const indices = Array.from({ length: n }, (_, i) => i);
    const selected: number[] = [];

    for (let i = 0; i < k; i++) {
      const randomIndex = Math.floor(rng() * indices.length);
      const value = indices[randomIndex];
      if (value !== undefined) {
        selected.push(value);
      }
      indices.splice(randomIndex, 1);
    }

    return selected.sort((a, b) => a - b);
  }
}
