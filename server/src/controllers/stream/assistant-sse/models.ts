/**
 * Type definitions for Assistant SSE
 * All SSE event payloads and internal models
 */

import type { AssistantLanguage } from '../../../services/search/route2/assistant/assistant-llm.service.js';

/**
 * SSE meta event payload
 */
export interface SseMetaPayload {
  requestId: string;
  language: AssistantLanguage;
  startedAt: string;
}

/**
 * SSE message event payload
 * Must match AssistantOutput shape from assistant-llm.service (forward as-is; do not drop fields).
 */
export interface SseMessagePayload {
  type: string;
  message: string;
  question: string | null;
  blocksSearch: boolean;
  language: AssistantLanguage;
  suggestedAction?: string;
}

/**
 * SSE error event payload
 */
export interface SseErrorPayload {
  code: 'UNAUTHORIZED' | 'LLM_TIMEOUT' | 'ABORTED' | 'LLM_FAILED';
  message: string;
  reason?: string;
}

/**
 * SSE narration event payload (immediate "working…" text)
 */
export interface SseNarrationPayload {
  text: string;
}

/**
 * SSE delta event payload (streaming chunk; client appends)
 */
export interface SseDeltaPayload {
  text: string;
}

/**
 * SSE done event payload
 */
export interface SseDonePayload {
  // Empty object marker
}

/**
 * Ownership validation result
 */
export interface OwnershipValidationResult {
  valid: boolean;
  reason?: 'session_mismatch' | 'user_mismatch' | 'job_not_found_allowed' | 'validation_skipped_no_redis';
}

/**
 * Result polling outcome
 */
export interface PollResult {
  resultsReady: boolean;
  latestStatus: string | null;
}
