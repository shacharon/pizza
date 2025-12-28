/**
 * Assistant Execution Policy
 * Assistant Narration Performance Policy: Decision logic for template vs cache vs LLM
 */

import type { TruthState } from '../types/truth-state.types.js';

export type AssistantStrategy = 'TEMPLATE' | 'CACHE' | 'LLM';

export interface PolicyDecision {
  strategy: AssistantStrategy;
  reason: string;
  skipLLM: boolean;
}

/**
 * Assistant Performance Policy Decision Engine
 * 
 * Rules (Authoritative):
 * 1. RECOVERY and CLARIFY modes ALWAYS use LLM (natural language required)
 * 2. High-confidence NORMAL with results uses TEMPLATE (0ms, no LLM)
 * 3. Other cases use CACHE strategy (try cache, fallback to LLM)
 */
export class AssistantPolicy {
  /**
   * Decide whether to use template, cache, or LLM
   * 
   * @param truthState - Complete search truth state
   * @returns PolicyDecision with strategy and rationale
   */
  static decide(truthState: TruthState): PolicyDecision {
    const { mode, results, failureReason } = truthState;
    const confidence = truthState.confidence || 0;
    
    // Rule 1: Always use LLM for RECOVERY and CLARIFY
    // Rationale: These modes require nuanced natural language and suggestions
    if (mode === 'RECOVERY' || mode === 'CLARIFY') {
      return {
        strategy: 'LLM',
        reason: `${mode}_mode_requires_llm`,
        skipLLM: false
      };
    }
    
    // Rule 2: Use template for high-confidence NORMAL with results
    // Rationale: Deterministic message is sufficient for successful searches
    if (
      mode === 'NORMAL' &&
      confidence >= 0.8 &&
      results.length > 0 &&
      failureReason === 'NONE'
    ) {
      return {
        strategy: 'TEMPLATE',
        reason: 'high_confidence_normal',
        skipLLM: true
      };
    }
    
    // Rule 3: Try cache first, fallback to LLM
    // Rationale: Medium confidence or edge cases benefit from LLM but can be cached
    return {
      strategy: 'CACHE',
      reason: 'normal_mode_cacheable',
      skipLLM: false
    };
  }
  
  /**
   * Get cache TTL based on mode
   */
  static getCacheTTL(mode: 'NORMAL' | 'RECOVERY' | 'CLARIFY'): number {
    switch (mode) {
      case 'NORMAL':
        return 1800000; // 30 minutes
      case 'RECOVERY':
      case 'CLARIFY':
        return 600000; // 10 minutes
      default:
        return 600000;
    }
  }
}

