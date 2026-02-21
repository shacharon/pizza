/**
 * Google Custom Search Engine (CSE) Adapter
 * 
 * Generic search adapter that works for both Wolt and 10bis enrichments.
 * Uses Google Custom Search API to find restaurant pages on provider domains.
 * 
 * Configuration:
 * - GOOGLE_CSE_API_KEY: Google Custom Search API key
 * - GOOGLE_CSE_ENGINE_ID: Programmable Search Engine ID
 */

import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Search result from Google CSE
 */
export interface SearchResult {
  /**
   * Result title (page title)
   */
  title: string;

  /**
   * Result URL
   */
  url: string;

  /**
   * Result snippet (description/excerpt)
   */
  snippet: string;
}

/**
 * Google CSE configuration
 */
export interface GoogleCSEConfig {
  apiKey: string;
  searchEngineId: string;
}

/**
 * Generic search adapter interface
 */
export interface SearchAdapter {
  searchWeb(query: string, limit: number): Promise<SearchResult[]>;
}

/**
 * Google Custom Search Engine adapter
 * 
 * Uses Google's Custom Search API to find restaurant pages.
 * Can be configured with domain restrictions in the CSE settings.
 */
export class GoogleCSEAdapter implements SearchAdapter {
  private config: GoogleCSEConfig;
  private apiCallCount = 0;

  constructor(config: GoogleCSEConfig) {
    this.config = config;
    
    logger.info(
      {
        event: 'google_cse_adapter_init',
        hasApiKey: Boolean(config.apiKey),
        hasEngineId: Boolean(config.searchEngineId),
      },
      '[GoogleCSE] Adapter initialized'
    );
  }

  /**
   * Search the web using Google Custom Search API
   * @param signal - Optional request-scoped abort signal
   */
  async searchWeb(query: string, limit: number, signal?: AbortSignal): Promise<SearchResult[]> {
    const url = 'https://www.googleapis.com/customsearch/v1';
    const params = new URLSearchParams({
      key: this.config.apiKey,
      cx: this.config.searchEngineId,
      q: query,
      num: String(Math.min(limit, 10)), // Google CSE max: 10 results per call
    });

    this.apiCallCount++;
    
    logger.info(
      {
        event: 'google_cse_search_started',
        query,
        limit,
        callNumber: this.apiCallCount,
      },
      '[GoogleCSE] Searching for restaurant links'
    );

    try {
      const response = await fetch(`${url}?${params}`, { signal: signal ?? null });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Google CSE API failed: HTTP ${response.status} - ${errorBody.substring(0, 200)}`
        );
      }

      const data = await response.json();

      // Parse search results
      const results: SearchResult[] = (data.items || []).map((item: any) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet || '',
      }));

      logger.info(
        {
          event: 'google_cse_search_completed',
          query,
          resultCount: results.length,
          callNumber: this.apiCallCount,
          searchInformation: data.searchInformation
            ? {
                totalResults: data.searchInformation.totalResults,
                searchTime: data.searchInformation.searchTime,
              }
            : undefined,
        },
        '[GoogleCSE] Search completed'
      );

      return results;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      
      logger.error(
        {
          event: 'google_cse_search_error',
          query,
          limit,
          error,
          callNumber: this.apiCallCount,
        },
        '[GoogleCSE] Search failed'
      );

      // Return empty results on error (will result in NOT_FOUND)
      return [];
    }
  }

  /**
   * Get total API calls made (for monitoring)
   */
  getApiCallCount(): number {
    return this.apiCallCount;
  }

  /**
   * Reset API call counter (for testing)
   */
  resetApiCallCount(): void {
    this.apiCallCount = 0;
  }
}

/**
 * Create Google CSE adapter from environment variables
 * 
 * @returns GoogleCSEAdapter instance or null if not configured
 */
export function createGoogleCSEAdapterFromEnv(): GoogleCSEAdapter | null {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const searchEngineId = process.env.GOOGLE_CSE_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    logger.warn(
      {
        event: 'google_cse_adapter_not_configured',
        hasApiKey: Boolean(apiKey),
        hasEngineId: Boolean(searchEngineId),
      },
      '[GoogleCSE] Adapter not configured (missing GOOGLE_CSE_API_KEY or GOOGLE_CSE_ENGINE_ID)'
    );
    return null;
  }

  return new GoogleCSEAdapter({
    apiKey,
    searchEngineId,
  });
}
