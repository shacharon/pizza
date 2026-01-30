/**
 * Search Types - Barrel Re-Export
 * 
 * REFACTORED: This file now re-exports types from focused modules:
 * - domain.types.ts: Business domain types (language, location, restaurant, etc.)
 * - api-contracts.types.ts: API request/response contracts
 * - internal-state.types.ts: Internal service interfaces and orchestration state
 * 
 * All existing imports from this file continue to work unchanged.
 * New code should import from specific files for clarity.
 */

// ============================================================================
// Domain Types (Business Logic)
// ============================================================================

export * from './domain.types.js';

// ============================================================================
// API Contracts (External Boundaries)
// ============================================================================

export * from './api-contracts.types.js';

// ============================================================================
// Internal State (Implementation Details)
// ============================================================================

export * from './internal-state.types.js';

// ============================================================================
// Response Plan Types (RSE → ChatBack Communication)
// ============================================================================

export * from './response-plan.types.js';
