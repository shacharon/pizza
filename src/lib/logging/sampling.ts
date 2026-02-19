/**
 * Sampling Utility for Log Noise Reduction
 * Provides deterministic sampling for logs with optional seeded RNG for testing
 */

/**
 * Simple deterministic sampler based on hash
 * Returns true if the item should be sampled
 * 
 * @param key Unique identifier for deterministic sampling (e.g., requestId)
 * @param rate Sampling rate (0.0 to 1.0). 0.01 = 1%, 0.1 = 10%, etc.
 * @param seed Optional seed for testing (makes sampling deterministic across runs)
 */
export function shouldSample(key: string, rate: number, seed?: number): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;

  // Use seed if provided (for tests), otherwise use key hash
  const hashInput = seed !== undefined ? `${seed}-${key}` : key;
  
  // Simple hash function (FNV-1a)
  let hash = 2166136261;
  for (let i = 0; i < hashInput.length; i++) {
    hash ^= hashInput.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  
  // Convert hash to 0-1 range
  const normalized = (hash >>> 0) / 0xffffffff;
  
  return normalized < rate;
}

/**
 * Random sampler (non-deterministic)
 * Use when deterministic sampling is not needed
 * 
 * @param rate Sampling rate (0.0 to 1.0)
 */
export function shouldSampleRandom(rate: number): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  return Math.random() < rate;
}

/**
 * Check if operation exceeded slow threshold
 * Used for threshold-based log level determination
 * 
 * @param durationMs Operation duration in milliseconds
 * @param thresholdMs Threshold in milliseconds
 * @returns true if operation is slow (should log at INFO)
 */
export function isSlowOperation(durationMs: number, thresholdMs: number): boolean {
  return durationMs > thresholdMs;
}

/**
 * Sampling configuration presets
 */
export const SAMPLING_RATES = {
  /** 1% sampling for high-frequency operations */
  LOW: 0.01,
  /** 10% sampling for medium-frequency operations */
  MEDIUM: 0.1,
  /** 50% sampling for low-frequency operations */
  HIGH: 0.5,
  /** Never sample (always skip) */
  NEVER: 0,
  /** Always sample (never skip) */
  ALWAYS: 1
} as const;

/**
 * Slow operation thresholds (milliseconds)
 */
export const SLOW_THRESHOLDS = {
  /** LLM operations: log at INFO if >1500ms */
  LLM: 1500,
  /** Google API calls: log at INFO if >2000ms */
  GOOGLE_API: 2000,
  /** Pipeline stages: log at INFO if >2000ms */
  STAGE: 2000,
  /** HTTP requests: log at INFO if >5000ms */
  HTTP: 5000,
  /** Cache operations: log at INFO if >200ms */
  CACHE: 200,
  /** Photo proxy: log at INFO if >800ms */
  PHOTO: 800
} as const;

/**
 * Get cache sampling rate from environment variable
 * Default: 5% sampling for DEBUG cache logs
 * 
 * @returns Sampling rate between 0.0 and 1.0
 */
export function getCacheSamplingRate(): number {
  const envRate = process.env.LOG_CACHE_SAMPLE_RATE;
  if (!envRate) return 0.05; // 5% default
  
  const parsed = parseFloat(envRate);
  if (isNaN(parsed) || parsed < 0 || parsed > 1) {
    return 0.05; // fallback to default if invalid
  }
  
  return parsed;
}
