/**
 * Google Custom Search Engine (CSE) Client
 * 
 * Low-level CSE API client with timeout and retry logic.
 * Used by ProviderDeepLinkResolver for multi-layer search.
 */

import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * CSE search result (normalized)
 */
export interface CSEResult {
  title: string;
  url: string;
  snippet: string;
}

/** Raw item shape from Google CSE API (response.json()) */
interface GoogleCSEApiItem {
  title?: string;
  link?: string;
  snippet?: string;
}

interface GoogleCSEApiResponse {
  items?: GoogleCSEApiItem[];
}

/**
 * CSE client configuration
 */
export interface CSEClientConfig {
  apiKey: string;
  searchEngineId: string;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Google CSE API error
 */
export class CSEError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'CSEError';
  }
}

/**
 * Google Custom Search Engine Client
 * 
 * Features:
 * - Timeout protection (default: 5s)
 * - Automatic retries (default: 2 retries)
 * - Exponential backoff
 * - Normalized result format
 */
export class GoogleCSEClient {
  private readonly apiKey: string;
  private readonly searchEngineId: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private callCount = 0;

  constructor(config: CSEClientConfig) {
    this.apiKey = config.apiKey;
    this.searchEngineId = config.searchEngineId;
    this.timeoutMs = config.timeoutMs ?? 5000; // 5s default
    this.maxRetries = config.maxRetries ?? 2; // 2 retries = 3 total attempts
  }

  /**
   * Search with timeout and retry logic
   * @param signal - Optional request-scoped abort signal
   */
  async search(query: string, limit: number = 5, signal?: AbortSignal): Promise<CSEResult[]> {
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
  ): Promise<CSEResult[]> {
    this.callCount++;

    try {
      const results = await this.searchInternal(query, limit, signal);
      
      logger.debug(
        {
          event: 'cse_search_success',
          query,
          resultCount: results.length,
          attempt: attempt + 1,
          callNumber: this.callCount,
        },
        '[CSEClient] Search succeeded'
      );

      return results;
    } catch (err) {
      const error = err instanceof CSEError ? err : new CSEError(
        err instanceof Error ? err.message : String(err),
        undefined,
        this.isTransientError(err)
      );

      logger.warn(
        {
          event: 'cse_search_attempt_failed',
          query,
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          error: error.message,
          statusCode: error.statusCode,
          isRetryable: error.isRetryable,
        },
        '[CSEClient] Search attempt failed'
      );

      // Retry logic
      if (error.isRetryable && attempt < this.maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        
        logger.info(
          {
            event: 'cse_search_retrying',
            query,
            attempt: attempt + 1,
            nextAttempt: attempt + 2,
            delayMs,
          },
          '[CSEClient] Retrying after delay'
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
  private async searchInternal(query: string, limit: number, signal?: AbortSignal): Promise<CSEResult[]> {
    const url = 'https://www.googleapis.com/customsearch/v1';
    const params = new URLSearchParams({
      key: this.apiKey,
      cx: this.searchEngineId,
      q: query,
      num: String(Math.min(limit, 10)), // CSE max: 10
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
      });

      clearTimeout(timeoutId);
      abortListener && signal!.removeEventListener('abort', abortListener);

      if (!response.ok) {
        const errorBody = await response.text();
        const isRetryable = response.status >= 500 || response.status === 429;
        
        throw new CSEError(
          `Google CSE API failed: HTTP ${response.status} - ${errorBody.substring(0, 200)}`,
          response.status,
          isRetryable
        );
      }

      const data = (await response.json()) as GoogleCSEApiResponse;

      // Normalize results
      const results: CSEResult[] = (data.items || []).map((item) => ({
        title: item.title ?? '',
        url: item.link ?? '',
        snippet: item.snippet ?? '',
      }));

      return results;
    } catch (err) {
      clearTimeout(timeoutId);
      abortListener && signal?.removeEventListener('abort', abortListener);

      // Handle abort (timeout)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new CSEError(
          `Google CSE search timeout after ${this.timeoutMs}ms`,
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
    if (err instanceof CSEError) {
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
 * Create CSE client from environment variables
 */
export function createCSEClientFromEnv(): GoogleCSEClient | null {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const searchEngineId = process.env.GOOGLE_CSE_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    return null;
  }

  return new GoogleCSEClient({
    apiKey,
    searchEngineId,
    timeoutMs: 5000, // 5s timeout
    maxRetries: 2, // 2 retries = 3 total attempts
  });
}
