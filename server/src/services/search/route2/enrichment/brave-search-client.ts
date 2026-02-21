/**
 * Brave Search API Client
 * 
 * Low-level Brave Search API client with timeout and retry logic.
 * Used by ProviderDeepLinkResolver for multi-layer search.
 */

import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Search result (normalized, compatible with CSEResult)
 */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Brave Search client configuration
 */
export interface BraveSearchClientConfig {
  apiKey: string;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Brave Search API error
 */
export class BraveSearchError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'BraveSearchError';
  }
}

/**
 * Brave Search API Client
 * 
 * Features:
 * - Timeout protection (default: 5s)
 * - Automatic retries (default: 2 retries)
 * - Exponential backoff
 * - Normalized result format
 */
export class BraveSearchClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private callCount = 0;

  constructor(config: BraveSearchClientConfig) {
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 5000; // 5s default
    this.maxRetries = config.maxRetries ?? 2; // 2 retries = 3 total attempts
  }

  /**
   * Search with timeout and retry logic
   * @param signal - Optional request-scoped abort signal
   */
  async search(query: string, limit: number = 10, signal?: AbortSignal): Promise<SearchResult[]> {
    return this.searchWithRetry(query, limit, 0, signal);
  }

  /**
   * Internal search with retry logic
   */
  private async searchWithRetry(
    query: string,
    limit: number,
    attempt: number,
    signal?: AbortSignal
  ): Promise<SearchResult[]> {
    this.callCount++;

    try {
      const results = await this.searchInternal(query, limit, signal);
      
      logger.debug(
        {
          event: 'search_api_success',
          engine: 'brave',
          query,
          resultCount: results.length,
          attempt: attempt + 1,
          callNumber: this.callCount,
        },
        '[BraveSearchClient] Search succeeded'
      );

      return results;
    } catch (err) {
      const error = err instanceof BraveSearchError ? err : new BraveSearchError(
        err instanceof Error ? err.message : String(err),
        undefined,
        this.isTransientError(err)
      );

      logger.warn(
        {
          event: 'search_api_attempt_failed',
          engine: 'brave',
          query,
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          error: error.message,
          statusCode: error.statusCode,
          isRetryable: error.isRetryable,
        },
        '[BraveSearchClient] Search attempt failed'
      );

      // Retry logic
      if (error.isRetryable && attempt < this.maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        
        logger.info(
          {
            event: 'search_api_retrying',
            engine: 'brave',
            query,
            attempt: attempt + 1,
            nextAttempt: attempt + 2,
            delayMs,
          },
          '[BraveSearchClient] Retrying after delay'
        );

        await this.sleep(delayMs);
        return this.searchWithRetry(query, limit, attempt + 1, signal);
      }

      // No more retries or non-retryable error
      throw error;
    }
  }

  /**
   * Internal search implementation with timeout
   */
  private async searchInternal(query: string, limit: number, signal?: AbortSignal): Promise<SearchResult[]> {
    const url = 'https://api.search.brave.com/res/v1/web/search';
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(limit, 20)), // Brave max: 20
    });

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), this.timeoutMs);
    let abortListener: (() => void) | undefined;
    if (signal) {
      if (signal.aborted) abortController.abort();
      else {
        abortListener = () => abortController.abort();
        signal.addEventListener('abort', abortListener);
      }
    }

    try {
      const response = await fetch(`${url}?${params}`, {
        signal: abortController.signal,
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.apiKey,
        },
      });

      clearTimeout(timeoutId);
      abortListener && signal?.removeEventListener('abort', abortListener);

      if (!response.ok) {
        const errorBody = await response.text();
        const isRetryable = response.status >= 500 || response.status === 429;
        
        throw new BraveSearchError(
          `Brave Search API failed: HTTP ${response.status} - ${errorBody.substring(0, 200)}`,
          response.status,
          isRetryable
        );
      }

      const data = await response.json();

      // Normalize results from Brave's format
      const results: SearchResult[] = (data.web?.results || []).map((item: any) => ({
        title: item.title || '',
        url: item.url || '',
        snippet: item.description || '',
      }));

      return results;
    } catch (err) {
      clearTimeout(timeoutId);
      abortListener && signal?.removeEventListener('abort', abortListener);

      // Handle abort (timeout)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new BraveSearchError(
          `Brave Search timeout after ${this.timeoutMs}ms`,
          undefined,
          true // Timeout is retryable
        );
      }

      throw err;
    }
  }

  /**
   * Determine if error is transient (retryable)
   */
  private isTransientError(err: any): boolean {
    if (err instanceof BraveSearchError) {
      return err.isRetryable;
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    const transientPatterns = [
      'timeout',
      'Timeout',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ECONNRESET',
      'ENETUNREACH',
      'AbortError',
      '5xx',
      '500',
      '502',
      '503',
      '504',
      '429', // Rate limiting
    ];

    return transientPatterns.some((pattern) => errorMsg.includes(pattern));
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get total API calls made
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Reset call counter
   */
  resetCallCount(): void {
    this.callCount = 0;
  }
}

/**
 * Create Brave Search client from environment variables
 */
export function createBraveSearchClientFromEnv(): BraveSearchClient | null {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new BraveSearchClient({
    apiKey,
    timeoutMs: 5000, // 5s timeout
    maxRetries: 2, // 2 retries = 3 total attempts
  });
}
