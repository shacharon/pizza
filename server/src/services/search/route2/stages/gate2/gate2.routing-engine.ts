/**
 * Gate2 Routing Engine
 * 
 * Pure deterministic routing logic for Gate2 stage.
 * Maps LLM classification output to routing decisions.
 * 
 * POLICY:
 * - foodSignal="YES" => CONTINUE (proceed to search)
 * - foodSignal="UNCERTAIN" => ASK_CLARIFY (ask user to clarify)
 * - foodSignal="NO" => STOP (reject search)
 * 
 * This is the SINGLE SOURCE OF TRUTH for Gate2 routing decisions.
 * NO LLM calls, NO side effects - pure mapping logic only.
 */

import type { Gate2Result } from '../../types.js';

/**
 * LLM classification result (before routing)
 */
export interface Gate2LLMResult {
  foodSignal: 'NO' | 'UNCERTAIN' | 'YES';
  confidence: number;
  assistantLanguage: 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other';
  assistantLanguageConfidence: number;
  stop: {
    type: 'GATE_FAIL' | 'CLARIFY';
    reason: 'NO_FOOD' | 'UNCERTAIN_DOMAIN' | 'MISSING_LOCATION';
    blocksSearch: true;
    suggestedAction: 'ASK_FOOD' | 'ASK_DOMAIN' | 'ASK_LOCATION';
    message: string;
    question: string;
  } | null;
}

/**
 * Routing decision details
 */
export interface RoutingDecision {
  route: 'CONTINUE' | 'ASK_CLARIFY' | 'STOP';
  reason: string;
  expectedBehavior: string;
}

/**
 * Gate2RoutingEngine - Pure deterministic routing logic
 * 
 * Maps LLM classification results to routing decisions.
 * All routing rules and decision matrix logic live here.
 */
export class Gate2RoutingEngine {
  /**
   * Apply deterministic routing rules to LLM classification result
   * 
   * This is the main entry point for routing decisions.
   * NO LLM calls, NO side effects - pure mapping logic only.
   * 
   * @param llmResult - LLM classification output
   * @returns Gate2Result with routing decision
   */
  static applyDeterministicRouting(llmResult: Gate2LLMResult): Gate2Result {
    // Determine route based on foodSignal (decision matrix)
    const route = this.determineRoute(llmResult.foodSignal);

    return {
      foodSignal: llmResult.foodSignal,
      language: llmResult.assistantLanguage,
      languageConfidence: llmResult.assistantLanguageConfidence,
      route,
      confidence: llmResult.confidence,
      stop: llmResult.stop // Pass through stop payload from LLM
    };
  }

  /**
   * Determine route based on food signal (core decision matrix)
   * 
   * DECISION MATRIX:
   * - YES       => CONTINUE     (proceed to search)
   * - UNCERTAIN => ASK_CLARIFY  (ask user to clarify intent)
   * - NO        => STOP         (reject as non-food query)
   * 
   * @param foodSignal - Food signal from LLM
   * @returns Route decision
   */
  static determineRoute(foodSignal: 'NO' | 'UNCERTAIN' | 'YES'): 'CONTINUE' | 'ASK_CLARIFY' | 'STOP' {
    switch (foodSignal) {
      case 'YES':
        return 'CONTINUE';
      case 'UNCERTAIN':
        return 'ASK_CLARIFY';
      case 'NO':
        return 'STOP';
    }
  }

  /**
   * Get routing decision details for a given food signal
   * 
   * Useful for logging, debugging, and testing
   * 
   * @param foodSignal - Food signal from LLM
   * @returns Routing decision details
   */
  static getRoutingDecision(foodSignal: 'NO' | 'UNCERTAIN' | 'YES'): RoutingDecision {
    const route = this.determineRoute(foodSignal);

    const decisions: Record<typeof foodSignal, RoutingDecision> = {
      YES: {
        route: 'CONTINUE',
        reason: 'Food intent detected',
        expectedBehavior: 'Proceed to search pipeline'
      },
      UNCERTAIN: {
        route: 'ASK_CLARIFY',
        reason: 'Ambiguous intent - needs clarification',
        expectedBehavior: 'Ask user to clarify if they want food/restaurants'
      },
      NO: {
        route: 'STOP',
        reason: 'Non-food query detected',
        expectedBehavior: 'Stop pipeline and inform user'
      }
    };

    return decisions[foodSignal];
  }

  /**
   * Validate that LLM result has consistent stop payload
   * 
   * INVARIANT: stop payload should be present when foodSignal is not YES
   * (Though LLM may sometimes omit it, we don't enforce this strictly)
   * 
   * @param llmResult - LLM classification result
   * @returns True if stop payload is consistent with foodSignal
   */
  static validateStopPayload(llmResult: Gate2LLMResult): boolean {
    // If foodSignal is YES, stop should be null
    if (llmResult.foodSignal === 'YES') {
      return llmResult.stop === null;
    }

    // If foodSignal is not YES, stop SHOULD be present (but we're lenient)
    // This is not enforced strictly because LLM may not always provide it
    return true;
  }

  /**
   * Get human-readable summary of routing decision
   * 
   * @param llmResult - LLM classification result
   * @returns Summary string
   */
  static summarize(llmResult: Gate2LLMResult): string {
    const decision = this.getRoutingDecision(llmResult.foodSignal);
    return `foodSignal=${llmResult.foodSignal} => route=${decision.route} (${decision.reason})`;
  }
}
