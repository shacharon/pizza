/**
 * Mock Search Adapter - For Testing/Development
 * 
 * Simple mock adapter that returns predefined results.
 * Replace with real search provider (Google Custom Search, Bing, etc.) in production.
 */

import type { WoltSearchAdapter, SearchResult } from './wolt-search.adapter.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';

/**
 * Mock search adapter for testing
 * 
 * Returns empty results by default.
 * Can be configured with predefined results for testing.
 */
export class MockSearchAdapter implements WoltSearchAdapter {
  private mockResults: Map<string, SearchResult[]> = new Map();

  /**
   * Search the web (mock implementation)
   * 
   * Returns predefined results if configured, otherwise empty array.
   */
  async searchWeb(query: string, limit: number): Promise<SearchResult[]> {
    logger.debug(
      {
        event: 'mock_search_called',
        query,
        limit,
      },
      '[MockSearchAdapter] Search called (mock)'
    );

    // Check if we have mock results for this query
    const results = this.mockResults.get(query) || [];

    // Return up to limit results
    return results.slice(0, limit);
  }

  /**
   * Configure mock results for a specific query
   * 
   * @param query - Search query
   * @param results - Mock results to return
   */
  setMockResults(query: string, results: SearchResult[]): void {
    this.mockResults.set(query, results);
  }

  /**
   * Clear all mock results
   */
  clearMockResults(): void {
    this.mockResults.clear();
  }
}

/**
 * Stub search adapter that always returns empty results
 * 
 * Use this for MVP/development when no search provider is available.
 * All enrichment jobs will result in NOT_FOUND.
 */
export class StubSearchAdapter implements WoltSearchAdapter {
  async searchWeb(query: string, limit: number): Promise<SearchResult[]> {
    logger.warn(
      {
        event: 'stub_search_called',
        query,
        limit,
      },
      '[StubSearchAdapter] Stub search called - returning empty results (configure real search provider)'
    );

    // Always return empty results (NOT_FOUND)
    return [];
  }
}
