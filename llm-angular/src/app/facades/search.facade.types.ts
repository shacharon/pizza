/**
 * Search Facade Type Definitions
 * Shared types for search facade modules
 */

/**
 * View mode for search results
 */
export type ViewMode = 'LIST' | 'MAP';

/**
 * Polling configuration
 */
export interface PollingConfig {
  delayMs: number;           // Delay before starting polling
  fastIntervalBase: number;  // Base fast poll interval
  fastJitter: number;        // +/- jitter for fast polling
  slowInterval: number;      // Slow poll interval after backoff
  backoffAt: number;         // Switch to slow polling after this duration
  maxDuration: number;       // Stop polling after this total duration
}

/**
 * Default polling configuration
 */
export const DEFAULT_POLLING_CONFIG: PollingConfig = {
  delayMs: 2500,
  fastIntervalBase: 1400,
  fastJitter: 200,
  slowInterval: 4000,
  backoffAt: 12000,
  maxDuration: 45000
};

// Note: SortKey type moved to domain/mappers/chip.mapper.ts
// Note: mapChipToSortKey function moved to domain/mappers/chip.mapper.ts
