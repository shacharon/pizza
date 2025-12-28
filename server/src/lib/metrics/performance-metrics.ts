/**
 * Performance Metrics
 * Phase 8: Lightweight in-memory metrics tracking
 * 
 * Tracks latency, cache hits, and LLM calls
 * No external dependencies required
 */

export interface MetricsSnapshot {
  requests: {
    total: number;
    success: number;
    error: number;
    errorRate: number;
  };
  latency: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    max: number;
    min: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  llm: {
    passA: number;
    passB: number;
    total: number;
  };
  timestamp: string;
}

export class PerformanceMetrics {
  private metrics = {
    requests: { total: 0, success: 0, error: 0 },
    latencies: [] as number[],
    cacheHits: 0,
    cacheMisses: 0,
    llmCalls: { passA: 0, passB: 0 },
  };
  
  private readonly maxLatencyHistory = 1000;
  
  /**
   * Record a request completion
   */
  recordRequest(success: boolean, latencyMs: number) {
    this.metrics.requests.total++;
    if (success) {
      this.metrics.requests.success++;
    } else {
      this.metrics.requests.error++;
    }
    
    // Add latency
    this.metrics.latencies.push(latencyMs);
    
    // Keep only last N latencies (memory efficient)
    if (this.metrics.latencies.length > this.maxLatencyHistory) {
      this.metrics.latencies.shift();
    }
  }
  
  /**
   * Record cache hit
   */
  recordCacheHit() {
    this.metrics.cacheHits++;
  }
  
  /**
   * Record cache miss
   */
  recordCacheMiss() {
    this.metrics.cacheMisses++;
  }
  
  /**
   * Record LLM call
   */
  recordLLMCall(pass: 'A' | 'B') {
    if (pass === 'A') {
      this.metrics.llmCalls.passA++;
    } else {
      this.metrics.llmCalls.passB++;
    }
  }
  
  /**
   * Get current metrics snapshot
   */
  getSnapshot(): MetricsSnapshot {
    const sorted = [...this.metrics.latencies].sort((a, b) => a - b);
    const len = sorted.length;
    
    const latency = len > 0 ? {
      p50: sorted[Math.floor(len * 0.5)] || 0,
      p95: sorted[Math.floor(len * 0.95)] || 0,
      p99: sorted[Math.floor(len * 0.99)] || 0,
      avg: sorted.reduce((a, b) => a + b, 0) / len,
      max: sorted[len - 1] || 0,
      min: sorted[0] || 0,
    } : {
      p50: 0,
      p95: 0,
      p99: 0,
      avg: 0,
      max: 0,
      min: 0,
    };
    
    const totalCache = this.metrics.cacheHits + this.metrics.cacheMisses;
    const totalLLM = this.metrics.llmCalls.passA + this.metrics.llmCalls.passB;
    
    return {
      requests: {
        ...this.metrics.requests,
        errorRate: this.metrics.requests.total > 0
          ? this.metrics.requests.error / this.metrics.requests.total
          : 0,
      },
      latency,
      cache: {
        hits: this.metrics.cacheHits,
        misses: this.metrics.cacheMisses,
        hitRate: totalCache > 0 ? this.metrics.cacheHits / totalCache : 0,
      },
      llm: {
        passA: this.metrics.llmCalls.passA,
        passB: this.metrics.llmCalls.passB,
        total: totalLLM,
      },
      timestamp: new Date().toISOString(),
    };
  }
  
  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = {
      requests: { total: 0, success: 0, error: 0 },
      latencies: [],
      cacheHits: 0,
      cacheMisses: 0,
      llmCalls: { passA: 0, passB: 0 },
    };
  }
}

/**
 * Global metrics instance
 */
export const globalMetrics = new PerformanceMetrics();



