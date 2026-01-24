/**
 * Fetch with Timeout Utility
 * 
 * Wraps native fetch with an AbortController to prevent hanging promises.
 * Ensures proper cleanup via clearTimeout in finally block.
 * 
 * P0 Fix: Reliability - prevents orchestrator crashes from hanging upstream API calls
 */

export interface FetchWithTimeoutConfig {
  timeoutMs: number;
  requestId?: string;
  stage?: string;
  provider?: string;
}

export interface TimeoutError extends Error {
  code: 'UPSTREAM_TIMEOUT';
  provider: string;
  timeoutMs: number;
  stage: string;
  requestId?: string;
}

/**
 * Fetch with automatic timeout using AbortController
 * 
 * @param url - The URL to fetch
 * @param options - Standard fetch options
 * @param config - Timeout configuration
 * @returns Promise<Response>
 * @throws TimeoutError if request exceeds timeoutMs
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  config: FetchWithTimeoutConfig
): Promise<Response> {
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    // Set timeout to abort the request
    timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    // Execute fetch with abort signal
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    return response;

  } catch (err) {
    // Map AbortError to structured TimeoutError
    if (err instanceof Error && (err.name === 'AbortError' || controller.signal.aborted)) {
      const timeoutError = new Error(
        `${config.provider || 'Upstream API'} timeout after ${config.timeoutMs}ms`
      ) as TimeoutError;
      
      timeoutError.code = 'UPSTREAM_TIMEOUT';
      timeoutError.provider = config.provider || 'unknown';
      timeoutError.timeoutMs = config.timeoutMs;
      timeoutError.stage = config.stage || 'unknown';
      
      if (config.requestId) {
        timeoutError.requestId = config.requestId;
      }
      
      throw timeoutError;
    }
    
    // Re-throw other errors (network, DNS, etc.)
    throw err;

  } finally {
    // P0 Fix: Always clear timeout to prevent memory leaks
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
