/**
 * Cache Manager
 * Phase 8: In-memory caching with TTL support
 * 
 * Features:
 * - Time-based expiration (TTL)
 * - Memory-efficient (limited size)
 * - Thread-safe (single-threaded Node.js)
 * - Hit/miss tracking
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
}

export class CacheManager<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };
  
  constructor(
    private maxSize: number = 1000,
    private name: string = 'default'
  ) {}
  
  /**
   * Get value from cache
   * Returns null if not found or expired
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    // Check if expired
    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    // Update hit count
    entry.hits++;
    this.stats.hits++;
    
    return entry.data;
  }
  
  /**
   * Set value in cache with TTL
   */
  set(key: string, data: T, ttl: number): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      hits: 0,
    });
  }
  
  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }
  
  /**
   * Delete specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }
  
  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.evictions = 0;
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      evictions: this.stats.evictions,
    };
  }
  
  /**
   * Get all cache keys (for debugging)
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }
  
  /**
   * Evict oldest entry (LRU-like behavior)
   * Actually evicts entry with oldest timestamp
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }
  
  /**
   * Clean up expired entries (call periodically)
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

/**
 * Global cache instances for different purposes
 */
export const caches = {
  geocoding: new CacheManager<any>(500, 'geocoding'),
  placesSearch: new CacheManager<any>(1000, 'placesSearch'),
  ranking: new CacheManager<any>(500, 'ranking'),
  intentParsing: new CacheManager<any>(200, 'intentParsing'),
};

/**
 * Cleanup interval - run every 5 minutes
 */
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    let totalCleaned = 0;
    for (const cache of Object.values(caches)) {
      totalCleaned += cache.cleanup();
    }
    if (totalCleaned > 0) {
      console.log(`[CacheManager] Cleaned up ${totalCleaned} expired entries`);
    }
  }, 5 * 60 * 1000);
}



