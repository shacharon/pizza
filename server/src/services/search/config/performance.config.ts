/**
 * Performance Configuration
 * Phase 8: Consolidated performance settings
 * 
 * All performance-related tuning must be config-driven
 * and environment-specific (dev/staging/prod)
 */

import { CacheConfig } from './cache.config.js';
import { ReliabilityConfig } from './reliability.config.js';

export const PerformanceConfig = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  
  // Cache settings (from cache.config)
  cache: CacheConfig,
  
  // Timeout settings (from reliability.config)
  timeouts: ReliabilityConfig.timeouts,
  
  // Retry settings (from reliability.config)
  retries: ReliabilityConfig.retries,
  
  // Concurrency limits
  concurrency: {
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '100'),
    deduplicationEnabled: process.env.DEDUPE_ENABLED !== 'false',
    backpressureEnabled: process.env.BACKPRESSURE_ENABLED !== 'false',
  },
  
  // LLM optimization settings
  llm: {
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.0'),
    maxTokensIntent: parseInt(process.env.LLM_MAX_TOKENS_INTENT || '200'),
    maxTokensAssistant: parseInt(process.env.LLM_MAX_TOKENS_ASSISTANT || '150'),
    cacheEnabled: process.env.CACHE_INTENT === 'true', // Disabled by default
  },
  
  // Parallelization flags
  parallelization: {
    intentAndSession: process.env.PARALLEL_INTENT_SESSION !== 'false',
    geocodingAndIntent: process.env.PARALLEL_GEO_INTENT === 'true',
  },
  
  // Metrics collection
  metrics: {
    enabled: process.env.METRICS_ENABLED === 'true' || process.env.NODE_ENV !== 'production',
    endpoint: process.env.METRICS_ENDPOINT || '/metrics',
  },
};

/**
 * Get recommended settings based on environment
 */
export function getEnvironmentConfig() {
  const env = PerformanceConfig.env;
  
  if (env === 'production') {
    return {
      ...PerformanceConfig,
      llm: {
        ...PerformanceConfig.llm,
        temperature: 0.0, // Deterministic in production
      },
      cache: {
        ...PerformanceConfig.cache,
        intentParsing: {
          ...PerformanceConfig.cache.intentParsing,
          enabled: true, // Enable intent caching in prod
        },
      },
      concurrency: {
        ...PerformanceConfig.concurrency,
        maxConcurrent: 200, // Higher limit in prod
      },
    };
  }
  
  return PerformanceConfig;
}



