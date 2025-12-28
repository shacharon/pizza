/**
 * Request Deduplicator
 * Phase 8: Prevents duplicate in-flight requests
 * 
 * If multiple identical requests arrive while one is processing,
 * all subsequent requests share the same promise result.
 */

export class RequestDeduplicator {
  private inFlight = new Map<string, Promise<any>>();
  private stats = {
    deduplicated: 0,
    unique: 0,
  };
  
  /**
   * Deduplicate request by key
   * Returns existing promise if request is in-flight, otherwise executes fn
   */
  async dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // If request already in flight, return same promise
    if (this.inFlight.has(key)) {
      this.stats.deduplicated++;
      console.log(`[RequestDeduplicator] Deduped request: ${key}`);
      return this.inFlight.get(key)!;
    }
    
    // Start new request
    this.stats.unique++;
    const promise = fn().finally(() => {
      // Clean up after promise resolves/rejects
      this.inFlight.delete(key);
    });
    
    this.inFlight.set(key, promise);
    return promise;
  }
  
  /**
   * Get deduplication statistics
   */
  getStats() {
    const total = this.stats.unique + this.stats.deduplicated;
    return {
      ...this.stats,
      total,
      dedupeRate: total > 0 ? this.stats.deduplicated / total : 0,
    };
  }
  
  /**
   * Clear all in-flight requests (for testing)
   */
  clear() {
    this.inFlight.clear();
  }
}

/**
 * Global deduplicator instance
 */
export const globalDeduplicator = new RequestDeduplicator();



