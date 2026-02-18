/**
 * Orchestrator Guards Module (Re-export / Backward Compatibility)
 * 
 * All guard logic has been extracted into focused modules:
 * - gate-stop.guard.ts: GATE2 STOP (not food related)
 * - gate-clarify.guard.ts: GATE2 ASK_CLARIFY (uncertain query)
 * - nearby-location.guard.ts: NEARBY route guard + generic query check
 * - textsearch-location.guard.ts: Early INTENT guard + textSearch location guard
 * 
 * This file re-exports the same public API for backward compatibility.
 */

// Re-export all guards
export { handleGateStop } from './guards/gate-stop.guard.js';
export { handleGateClarify } from './guards/gate-clarify.guard.js';
export { handleNearbyLocationGuard, checkGenericFoodQuery } from './guards/nearby-location.guard.js';
export { handleEarlyTextSearchLocationGuard, handleTextSearchMissingLocationGuard } from './guards/textsearch-location.guard.js';
