/**
 * QA Harness Types
 * Phase 6: Type definitions for QA dataset, assertions, and results
 */

import type { FailureReason } from '../types/search.types.js';
import type { SearchResponse } from '../types/search-response.dto.js';

/**
 * QA Test Entry - A single test case in the QA dataset
 */
export interface QAEntry {
  id: string;
  query: string;
  language: string;
  category: 'NORMAL' | 'RECOVERY' | 'CLARIFY' | 'EDGE_CASE';
  expectedMode?: 'NORMAL' | 'RECOVERY' | 'CLARIFY';
  expectedFailureReason?: FailureReason;
  notes?: string;
  assertions: QAAssertions;
}

/**
 * QA Assertions - Expected behaviors to validate
 */
export interface QAAssertions {
  hasResults?: boolean;          // Should have results
  minResults?: number;           // Minimum number of results
  maxResults?: number;           // Maximum number of results
  hasChips?: boolean;            // Should have refinement chips
  minChips?: number;             // Minimum number of chips
  hasAssist?: boolean;           // Should have assistant payload
  requiresLiveData?: boolean;    // Parsed intent should require live data
  languageMatch?: boolean;       // intent.language matches request.language
  modeMatch?: boolean;           // mode matches expectedMode
}

/**
 * QA Result - Result of running a single test case
 */
export interface QAResult {
  entry: QAEntry;
  response: SearchResponse | null;
  passed: boolean;
  failures: QAFailure[];
  executionTimeMs: number;
}

/**
 * QA Failure - A single assertion failure
 */
export interface QAFailure {
  rule: string;           // Assertion rule that failed (e.g., 'contract.intent')
  expected: any;          // Expected value
  actual: any;            // Actual value
  message: string;        // Human-readable error message
}

/**
 * QA Summary - Overall results of QA run
 */
export interface QASummary {
  totalQueries: number;
  passed: number;
  failed: number;
  executionTimeMs: number;
  results: QAResult[];
  timestamp: string;      // ISO timestamp of run
}



