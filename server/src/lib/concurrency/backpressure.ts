/**
 * Backpressure Manager
 * Phase 8: Limits concurrent requests to prevent overload
 * 
 * Queues requests when capacity is reached
 */

import { sleep } from '../reliability/timeout-guard.js';

export class BackpressureManager {
  private activeRequests = 0;
  private stats = {
    total: 0,
    queued: 0,
    rejected: 0,
    maxActive: 0,
  };
  
  constructor(
    private maxConcurrent: number = 100,
    private maxQueueWaitMs: number = 10000 // 10s max queue wait
  ) {}
  
  /**
   * Execute function with backpressure control
   * Waits if too many concurrent requests
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.stats.total++;
    
    const startWait = Date.now();
    
    // Wait if too many concurrent requests
    while (this.activeRequests >= this.maxConcurrent) {
      const waited = Date.now() - startWait;
      
      // Reject if waited too long
      if (waited > this.maxQueueWaitMs) {
        this.stats.rejected++;
        throw new Error('Request rejected: queue wait timeout exceeded');
      }
      
      this.stats.queued++;
      await sleep(10);
    }
    
    this.activeRequests++;
    this.stats.maxActive = Math.max(this.stats.maxActive, this.activeRequests);
    
    try {
      return await fn();
    } finally {
      this.activeRequests--;
    }
  }
  
  /**
   * Get backpressure statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeNow: this.activeRequests,
      capacity: this.maxConcurrent,
      utilization: this.activeRequests / this.maxConcurrent,
    };
  }
  
  /**
   * Check if at capacity
   */
  isAtCapacity(): boolean {
    return this.activeRequests >= this.maxConcurrent;
  }
}

/**
 * Global backpressure manager
 */
export const globalBackpressure = new BackpressureManager(
  parseInt(process.env.MAX_CONCURRENT_REQUESTS || '100')
);



