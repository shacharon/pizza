const store = new Map<string, { exp: number; val: any }>();

export class InMemoryCache {
    async get<T>(key: string): Promise<T | null> {
        const r = store.get(key);
        if (!r) return null;
        if (Date.now() > r.exp) { store.delete(key); return null; }
        return r.val as T;
    }
    async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
        store.set(key, { exp: Date.now() + ttlSec * 1000, val: value });
    }
}