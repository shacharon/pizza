/**
 * Assistant LLM Service
 * 
 * Simple LLM-based assistant message generation for UX messages.
 * NO post-processing, NO policy enforcement, NO deterministic logic.
 * Pure LLM → strict JSON parsing → done.
 * 
 * REFACTORED: Now a thin facade over modular components:
 * - AssistantTypes: Type definitions and schemas
 * - PromptEngine: Prompt generation per context type
 * - ValidationEngine: Validation, invariants, fallbacks
 * - LLMClient: Main orchestration
 */

import type { LLMProvider } from '../../../../llm/types.js';
import { AssistantLLMClient, type GenerationOptions } from './llm-client.js';
import type { AssistantContext, AssistantOutput } from './assistant.types.js';

// ============================================================================
// Re-export Types for Backward Compatibility
// ============================================================================

export type {
  AssistantContext,
  AssistantGateContext,
  AssistantClarifyContext,
  AssistantSummaryContext,
  AssistantSearchFailedContext,
  AssistantGenericQueryNarrationContext,
  AssistantOutput
} from './assistant.types.js';

export {
  AssistantOutputSchema,
  ASSISTANT_JSON_SCHEMA,
  ASSISTANT_SCHEMA_VERSION,
  ASSISTANT_PROMPT_VERSION,
  ASSISTANT_SCHEMA_HASH
} from './assistant.types.js';

// ============================================================================
// Main Function (Thin Facade)
// ============================================================================

// Create singleton instances
const llmClient = new AssistantLLMClient();

/**
 * Generate assistant message via LLM
 * With deterministic validation, invariant enforcement, and fallback
 * 
 * Backward-compatible facade over modular components
 */
export async function generateAssistantMessage(
  context: AssistantContext,
  llmProvider: LLMProvider,
  requestId: string,
  opts?: GenerationOptions
): Promise<AssistantOutput> {
  return llmClient.generateMessage(context, llmProvider, requestId, opts);
}
