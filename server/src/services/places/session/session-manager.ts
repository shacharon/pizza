/**
 * SessionManager
 * Manages search session context for enabling natural refinements
 * 
 * Allows users to refine searches without repeating themselves:
 * - "pizza in ashkelon" → "gluten free" → adds filter without re-specifying pizza/ashkelon
 * 
 * Features:
 * - In-memory storage (can be upgraded to Redis later)
 * - Automatic TTL and cleanup
 * - Simple refinement detection
 */

export interface ParsedIntent {
    foodType?: string;
    location?: string;
    dietary?: string[];
    temporal?: string[];
    price?: { min?: number; max?: number };
    delivery?: boolean;
    rating?: number;
}

export interface Filter {
    id: string;
    type: 'dietary' | 'temporal' | 'price' | 'delivery' | 'rating' | 'other';
    value: string | number | boolean;
    label: string;
    autoApplied: boolean;
}

export interface SessionContext {
    sessionId: string;
    baseQuery: string;
    parsedIntent: ParsedIntent;
    appliedFilters: Filter[];
    lastSearchTime: number;
    searchHistory: Array<{ query: string; timestamp: number }>;
}

export class SessionManager {
    private sessions = new Map<string, SessionContext>();
    private readonly TTL = 30 * 60 * 1000; // 30 minutes
    private cleanupInterval: NodeJS.Timeout | undefined;

    constructor() {
        // Start automatic cleanup
        this.startCleanup();
    }

    /**
     * Get session context by ID
     * Returns null if session doesn't exist or is expired
     */
    get(sessionId?: string): SessionContext | null {
        if (!sessionId) {
            return null;
        }

        const context = this.sessions.get(sessionId);
        if (!context) {
            return null;
        }

        // Check if expired
        if (Date.now() - context.lastSearchTime > this.TTL) {
            this.sessions.delete(sessionId);
            console.log(`[SessionManager] Expired session: ${sessionId}`);
            return null;
        }

        return context;
    }

    /**
     * Update or create session context
     */
    update(
        sessionId: string,
        query: string,
        parsedIntent: ParsedIntent,
        appliedFilters: Filter[]
    ): void {
        const existing = this.sessions.get(sessionId);

        const context: SessionContext = {
            sessionId,
            baseQuery: existing?.baseQuery || query,
            parsedIntent,
            appliedFilters,
            lastSearchTime: Date.now(),
            searchHistory: [
                ...(existing?.searchHistory || []).slice(-4), // Keep last 5
                { query, timestamp: Date.now() }
            ]
        };

        this.sessions.set(sessionId, context);
        console.log(`[SessionManager] Updated session: ${sessionId}`);
    }

    /**
     * Clear specific session
     */
    clear(sessionId: string): void {
        this.sessions.delete(sessionId);
        console.log(`[SessionManager] Cleared session: ${sessionId}`);
    }

    /**
     * Clear all sessions (for testing)
     */
    clearAll(): void {
        this.sessions.clear();
        console.log(`[SessionManager] Cleared all sessions`);
    }

    /**
     * Get active session count
     */
    getSessionCount(): number {
        return this.sessions.size;
    }

    /**
     * Detect if query is a refinement of existing search
     * Simple heuristic: short queries with existing context are likely refinements
     * More complex intent analysis is handled by Intent LLM
     */
    isRefinement(query: string, context: SessionContext): boolean {
        const words = query.toLowerCase().trim().split(/\s+/);
        const baseWords = context.baseQuery.toLowerCase().trim().split(/\s+/);

        // Short queries with context are likely refinements
        if (words.length <= 3 && context.searchHistory.length > 0) {
            return true;
        }

        // Check word overlap with base query
        const overlap = words.filter(w => baseWords.includes(w)).length;
        const overlapRatio = overlap / Math.max(words.length, 1);

        // If > 50% overlap, likely same search
        // If < 30% overlap, likely new search
        if (overlapRatio >= 0.5) {
            return true; // Same search with modifications
        } else if (overlapRatio < 0.3) {
            return false; // New search
        } else {
            // Ambiguous - use context presence as tie-breaker
            return context.searchHistory.length > 0;
        }
    }

    /**
     * Start automatic cleanup of expired sessions
     */
    private startCleanup(): void {
        // Clean up every 5 minutes
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            let cleaned = 0;

            for (const [id, context] of this.sessions.entries()) {
                if (now - context.lastSearchTime > this.TTL) {
                    this.sessions.delete(id);
                    cleaned++;
                }
            }

            if (cleaned > 0) {
                console.log(`[SessionManager] Cleaned up ${cleaned} expired session(s)`);
            }
        }, 5 * 60 * 1000); // Every 5 minutes
    }

    /**
     * Stop cleanup interval (for graceful shutdown)
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
        this.sessions.clear();
        console.log('[SessionManager] Destroyed');
    }
}

