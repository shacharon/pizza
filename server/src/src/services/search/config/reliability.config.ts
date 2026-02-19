/**
 * Reliability Configuration
 * Phase 7: Timeout and retry policies
 * 
 * Defines timeouts and retry behavior for external API calls
 * to ensure graceful degradation under failures
 */

export interface TimeoutConfig {
  geocoding: number;
  placesSearch: number;
  llmPassA: number;
  llmPassB: number;
  total: number;
}

export interface RetryConfig {
  attempts: number;
  backoffMs: number;
}

export interface ReliabilityConfigType {
  timeouts: TimeoutConfig;
  retries: {
    geocoding: RetryConfig;
    placesSearch: RetryConfig;
    llm: RetryConfig;
  };
}

/**
 * Production reliability configuration
 * 
 * Timeouts:
 * - Geocoding: 3s (fast API, should respond quickly)
 * - Places Search: 5s (more complex queries)
 * - LLM Pass A (Intent): 8s (language model can be slower)
 * - LLM Pass B (Assistant): 5s (shorter response expected)
 * - Total: 15s per request (overall timeout)
 * 
 * Retries:
 * - Geocoding: 2 attempts with 500ms backoff (fast recovery)
 * - Places Search: 2 attempts with 1s backoff (allow more time)
 * - LLM: 1 attempt, no retry (expensive, use fallback instead)
 */
export const ReliabilityConfig: ReliabilityConfigType = {
  timeouts: {
    geocoding: 3000,       // 3 seconds
    placesSearch: 5000,    // 5 seconds
    llmPassA: 8000,        // 8 seconds
    llmPassB: 5000,        // 5 seconds
    total: 15000           // 15 seconds total per request
  },
  retries: {
    geocoding: {
      attempts: 2,
      backoffMs: 500       // 500ms, 1000ms backoff
    },
    placesSearch: {
      attempts: 2,
      backoffMs: 1000      // 1s, 2s backoff
    },
    llm: {
      attempts: 1,
      backoffMs: 0         // No retry - use fallback on failure
    }
  }
};

/**
 * Get timeout for specific operation
 * Allows for environment-based overrides
 */
export function getTimeout(operation: keyof TimeoutConfig): number {
  const envKey = `TIMEOUT_${operation.toUpperCase()}`;
  const envValue = process.env[envKey];
  
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  
  return ReliabilityConfig.timeouts[operation];
}

/**
 * Get retry config for specific operation
 * Allows for environment-based overrides
 */
export function getRetryConfig(operation: 'geocoding' | 'placesSearch' | 'llm'): RetryConfig {
  const attemptsKey = `RETRY_ATTEMPTS_${operation.toUpperCase()}`;
  const backoffKey = `RETRY_BACKOFF_${operation.toUpperCase()}`;
  
  const attempts = process.env[attemptsKey];
  const backoff = process.env[backoffKey];
  
  const config = { ...ReliabilityConfig.retries[operation] };
  
  if (attempts) {
    const parsed = parseInt(attempts, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      config.attempts = parsed;
    }
  }
  
  if (backoff) {
    const parsed = parseInt(backoff, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      config.backoffMs = parsed;
    }
  }
  
  return config;
}





