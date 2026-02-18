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
  assistant: {
    template: number;
    cache: number;
    llm: number;
    total: number;
    avgTemplateMs: number;
    avgCacheMs: number;
    avgLLMMs: number;
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
    assistantCalls: [] as { strategy: 'TEMPLATE' | 'CACHE' | 'LLM'; durationMs: number }[],
  };
  
  private readonly maxLatencyHistory = 1000;
  private readonly maxAssistantHistory = 500;
  
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
   * Record assistant call strategy (Performance Policy tracking)
   */
  trackAssistant(strategy: 'TEMPLATE' | 'CACHE' | 'LLM', durationMs: number) {
    this.metrics.assistantCalls.push({ strategy, durationMs });
    
    // Keep only last N calls (memory efficient)
    if (this.metrics.assistantCalls.length > this.maxAssistantHistory) {
      this.metrics.assistantCalls.shift();
    }
  }
  
  /**
   * Get assistant performance stats
   */
  getAssistantStats() {
    const calls = this.metrics.assistantCalls;
    
    const templateCalls = calls.filter(c => c.strategy === 'TEMPLATE');
    const cacheCalls = calls.filter(c => c.strategy === 'CACHE');
    const llmCalls = calls.filter(c => c.strategy === 'LLM');
    
    const avg = (arr: { durationMs: number }[]) => 
      arr.length > 0 ? arr.reduce((sum, c) => sum + c.durationMs, 0) / arr.length : 0;
    
    return {
      template: templateCalls.length,
      cache: cacheCalls.length,
      llm: llmCalls.length,
      total: calls.length,
      avgTemplateMs: avg(templateCalls),
      avgCacheMs: avg(cacheCalls),
      avgLLMMs: avg(llmCalls)
    };
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
    const assistantStats = this.getAssistantStats();
    
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
      assistant: assistantStats,
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
      assistantCalls: [],
    };
  }
}

/**
 * Global metrics instance
 */
export const globalMetrics = new PerformanceMetrics();



