import type { AllowedLanguage } from '../models/types.js';

export interface PlacesSessionContext {
    lastTargetKind?: 'me' | 'city' | 'place' | 'coords';
    lastCoords?: { lat: number; lng: number };
    lastMode?: 'textsearch' | 'nearbysearch' | 'findplace';
    lastLanguage?: AllowedLanguage;
}

export interface ContextStore {
    get(sessionId: string): PlacesSessionContext | undefined;
    set(sessionId: string, ctx: PlacesSessionContext): void;
    update(sessionId: string, patch: Partial<PlacesSessionContext>): PlacesSessionContext;
}

interface Entry {
    value: PlacesSessionContext;
    expiresAt: number;
}

export class InMemoryContextStore implements ContextStore {
    private readonly store = new Map<string, Entry>();
    private readonly ttlMs: number;

    constructor(ttlMs = 1000 * 60 * 60) { // default 1h TTL
        this.ttlMs = ttlMs;
    }

    get(sessionId: string): PlacesSessionContext | undefined {
        this.#purgeExpired();
        const entry = this.store.get(sessionId);
        return entry?.value;
    }

    set(sessionId: string, ctx: PlacesSessionContext): void {
        this.store.set(sessionId, { value: ctx, expiresAt: Date.now() + this.ttlMs });
    }

    update(sessionId: string, patch: Partial<PlacesSessionContext>): PlacesSessionContext {
        const current = this.get(sessionId) ?? {};
        const updated = { ...current, ...patch } as PlacesSessionContext;
        this.set(sessionId, updated);
        return updated;
    }

    #purgeExpired() {
        const now = Date.now();
        for (const [k, v] of this.store.entries()) {
            if (v.expiresAt <= now) this.store.delete(k);
        }
    }
}


