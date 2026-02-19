/**
 * Search Card State Types
 * Defines the lifecycle state of a search card
 */

/**
 * SearchCardState enum
 * 
 * - RUNNING: Search in progress, card is active and processing
 * - CLARIFY: Search paused, waiting for user clarification (non-terminal)
 * - STOP: Search completed or failed, terminal state (card should show final result)
 */
export type SearchCardState = 'RUNNING' | 'CLARIFY' | 'STOP';

/**
 * Backend status/outcome mapping to card state:
 * 
 * RUNNING:
 * - Search progress events
 * - Results being processed
 * 
 * CLARIFY:
 * - DONE_CLARIFY (blocksSearch=true)
 * - decision: "ASK_CLARIFY"
 * - ready: "ask"
 * 
 * STOP:
 * - DONE_SUCCESS (search complete with results)
 * - DONE_FAILED (GATE_FAIL or error)
 * - decision: "STOP"
 * - ready: "results" or "stop"
 */
