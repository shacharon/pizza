/**
 * Stub Wolt Search Adapter
 * 
 * Provides mock search results for development/testing.
 * Replace with real implementation (Google Custom Search API, Bing, etc.)
 * 
 * STUB BEHAVIOR:
 * - Simulates web search with artificial delay
 * - Returns mock Wolt URLs based on restaurant name heuristics
 * - NOT for production use (replace with real adapter)
 */

import type { SearchResult, WoltSearchAdapter } from './wolt-search.adapter.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';

/**
 * Stub implementation of WoltSearchAdapter
 * 
 * Returns mock search results with simulated latency.
 * Use for development/testing without external search API.
 */
export class StubWoltSearchAdapter implements WoltSearchAdapter {
  /**
   * Simulated search latency (milliseconds)
   * Mimics real search API response time
   */
  private readonly simulatedLatencyMs = 500;

  /**
   * Mock probability of finding a result (0.0 to 1.0)
   * 0.7 = 70% chance of finding a Wolt link
   */
  private readonly mockFoundProbability = 0.7;

  /**
   * Search the web for Wolt restaurant pages (STUB)
   * 
   * @param query - Search query
   * @param limit - Max results
   * @returns Mock search results
   */
  async searchWeb(query: string, limit: number): Promise<SearchResult[]> {
    logger.info(
      {
        event: 'wolt_stub_search_called',
        query,
        limit,
      },
      '[StubWoltSearchAdapter] Mock search called (STUB)'
    );

    // Simulate network latency
    await this.sleep(this.simulatedLatencyMs);

    // Extract restaurant name from query (between quotes)
    const nameMatch = query.match(/"([^"]+)"/);
    const restaurantName = (nameMatch && nameMatch[1]) ? nameMatch[1] : 'restaurant';

    // Simulate probabilistic result (not all restaurants on Wolt)
    const shouldFindResult = Math.random() < this.mockFoundProbability;

    if (!shouldFindResult) {
      logger.info(
        {
          event: 'wolt_stub_no_results',
          query,
        },
        '[StubWoltSearchAdapter] Mock: No results (simulated NOT_FOUND)'
      );
      return [];
    }

    // Generate mock Wolt URL
    const mockUrl = this.generateMockWoltUrl(restaurantName);

    const mockResults: SearchResult[] = [
      {
        title: `${restaurantName} - Order Online | Wolt`,
        url: mockUrl,
        snippet: `Order food from ${restaurantName} with Wolt. Fast delivery to your door. See menu, reviews, and opening hours.`,
      },
    ];

    logger.info(
      {
        event: 'wolt_stub_results',
        query,
        resultCount: mockResults.length,
        mockUrl,
      },
      '[StubWoltSearchAdapter] Mock search results generated (STUB)'
    );

    return mockResults;
  }

  /**
   * Generate mock Wolt URL based on restaurant name
   * 
   * Format: https://wolt.com/en/isr/tel-aviv/restaurant/{slug}
   * 
   * @param name - Restaurant name
   * @returns Mock Wolt URL
   */
  private generateMockWoltUrl(name: string): string {
    // Convert name to URL-friendly slug
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
      .trim()
      .replace(/\s+/g, '-')          // Replace spaces with hyphens
      .replace(/-+/g, '-');          // Remove duplicate hyphens

    // Mock Wolt URL (Tel Aviv, Israel as default)
    return `https://wolt.com/en/isr/tel-aviv/restaurant/${slug}`;
  }

  /**
   * Sleep helper for simulating latency
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create stub search adapter instance
 * 
 * @returns Stub adapter for development/testing
 */
export function createStubWoltSearchAdapter(): WoltSearchAdapter {
  logger.warn(
    {
      event: 'wolt_stub_adapter_created',
      warning: 'Using STUB adapter (not for production)',
    },
    '[WoltSearchAdapter] STUB adapter created - replace with real implementation'
  );

  return new StubWoltSearchAdapter();
}
