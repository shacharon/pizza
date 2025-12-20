/**
 * GeocodeCache
 * Caches geocoding results to eliminate duplicate API calls
 * 
 * Problem: Currently geocoding the same city multiple times per request
 * Example: "אשקלון" geocoded twice in one request = wasted 800ms
 * 
 * Solution: Cache coordinates for 24 hours
 * 
 * Benefits:
 * - Eliminates duplicate geocoding in same request
 * - Speeds up repeated searches for same locations
 * - Reduces Google Places API quota usage
 */

interface CacheEntry {
    coords: { lat: number; lng: number };
    timestamp: number;
}

export class GeocodeCache {
    private cache = new Map<string, CacheEntry>();
    private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours
    private hits = 0;
    private misses = 0;

    /**
     * Get cached coordinates for a location
     * Returns null if not cached or expired
     */
    get(location: string, language: string = 'en'): { lat: number; lng: number } | null {
        const key = this.makeKey(location, language);
        const entry = this.cache.get(key);

        if (!entry) {
            this.misses++;
            return null;
        }

        // Check if expired
        if (Date.now() - entry.timestamp > this.TTL) {
            this.cache.delete(key);
            this.misses++;
            console.log(`[GeocodeCache] EXPIRED: ${location} (${language})`);
            return null;
        }

        this.hits++;
        console.log(`[GeocodeCache] HIT: ${location} (${language}) [${this.hits} hits, ${this.misses} misses]`);
        return entry.coords;
    }

    /**
     * Store coordinates for a location
     */
    set(location: string, language: string = 'en', coords: { lat: number; lng: number }): void {
        const key = this.makeKey(location, language);
        this.cache.set(key, {
            coords,
            timestamp: Date.now()
        });
        console.log(`[GeocodeCache] STORE: ${location} (${language}) → ${coords.lat}, ${coords.lng}`);
    }

    /**
     * Check if location is cached
     */
    has(location: string, language: string = 'en'): boolean {
        const key = this.makeKey(location, language);
        const entry = this.cache.get(key);
        
        if (!entry) {
            return false;
        }

        // Check if expired
        if (Date.now() - entry.timestamp > this.TTL) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    /**
     * Clear specific location
     */
    clear(location: string, language: string = 'en'): void {
        const key = this.makeKey(location, language);
        this.cache.delete(key);
        console.log(`[GeocodeCache] CLEARED: ${location} (${language})`);
    }

    /**
     * Clear all cached entries
     */
    clearAll(): void {
        const size = this.cache.size;
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
        console.log(`[GeocodeCache] CLEARED ALL (${size} entries)`);
    }

    /**
     * Get cache statistics
     */
    getStats(): { size: number; hits: number; misses: number; hitRate: number } {
        const total = this.hits + this.misses;
        const hitRate = total > 0 ? this.hits / total : 0;
        
        return {
            size: this.cache.size,
            hits: this.hits,
            misses: this.misses,
            hitRate: Math.round(hitRate * 100) / 100
        };
    }

    /**
     * Make cache key from location and language
     * Normalizes to lowercase for case-insensitive matching
     */
    private makeKey(location: string, language: string): string {
        return `${location.toLowerCase().trim()}-${language}`;
    }

    /**
     * Cleanup expired entries (called periodically)
     */
    cleanup(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.TTL) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[GeocodeCache] Cleaned up ${cleaned} expired entries`);
        }
    }

    /**
     * Get cache size in entries
     */
    size(): number {
        return this.cache.size;
    }
}

