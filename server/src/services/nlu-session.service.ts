import type { ExtractedSlots } from './nlu.service.js';

interface SessionContext {
    sessionId: string;
    lastSlots: ExtractedSlots;
    previousSlots: ExtractedSlots | null;
    lastQuery: string;
    createdAt: number;
}

// In-memory session storage (upgrade to Redis later)
const sessions = new Map<string, SessionContext>();

// Clean old sessions every hour
setInterval(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [id, session] of sessions.entries()) {
        if (session.createdAt < oneHourAgo) {
            sessions.delete(id);
        }
    }
}, 60 * 60 * 1000);

export class NLUSessionService {

    getSessionContext(sessionId: string): SessionContext | null {
        return sessions.get(sessionId) || null;
    }

    updateSession(sessionId: string, slots: ExtractedSlots, query: string): void {
        const existing = sessions.get(sessionId);

        // The old 'lastSlots' become the new 'previousSlots'
        const previousSlots = existing ? existing.lastSlots : null;

        // Merge with previous slots, new slots override
        const mergedSlots: ExtractedSlots = {
            city: slots.city || existing?.lastSlots.city || null,
            type: slots.type || existing?.lastSlots.type || null,
            maxPrice: slots.maxPrice ?? existing?.lastSlots.maxPrice ?? null,
            dietary: slots.dietary.length > 0 ? slots.dietary : existing?.lastSlots.dietary || [],
            spicy: slots.spicy ?? existing?.lastSlots.spicy ?? null,
            quantity: slots.quantity ?? existing?.lastSlots.quantity ?? null,
        };

        sessions.set(sessionId, {
            sessionId,
            lastSlots: mergedSlots,
            previousSlots, // store previous state for delta tracking
            lastQuery: query,
            createdAt: Date.now()
        });
    }

    clearSession(sessionId: string): void {
        sessions.delete(sessionId);
    }

    // Merge current extraction with session context
    mergeWithSession(sessionId: string, currentSlots: ExtractedSlots): ExtractedSlots {
        const session = this.getSessionContext(sessionId);
        if (!session) return currentSlots;

        return {
            city: currentSlots.city || session.lastSlots.city,
            type: currentSlots.type || session.lastSlots.type,
            maxPrice: currentSlots.maxPrice ?? session.lastSlots.maxPrice,
            dietary: currentSlots.dietary.length > 0 ? currentSlots.dietary : session.lastSlots.dietary,
            spicy: currentSlots.spicy ?? session.lastSlots.spicy,
            quantity: currentSlots.quantity ?? session.lastSlots.quantity,
        };
    }
}

export const nluSessionService = new NLUSessionService();
