type Status = "running" | "done" | "failed";

type Entry = {
    status: Status;
    createdAt: number;
    updatedAt: number;
    result?: unknown;
    resultCount?: number;
    error?: { code: string; message: string };
};

export class SearchAsyncStore {
    private readonly ttlMs: number;
    private readonly map = new Map<string, Entry>();

    constructor(ttlMs = 5 * 60_000) {
        this.ttlMs = ttlMs;
        setInterval(() => this.sweep(), Math.min(60_000, this.ttlMs)).unref?.();
    }

    init(requestId: string) {
        const now = Date.now();
        this.map.set(requestId, { status: "running", createdAt: now, updatedAt: now });
    }

    setDone(requestId: string, result: unknown, resultCount: number) {
        const e = this.map.get(requestId);
        if (!e) return;
        e.status = "done";
        e.updatedAt = Date.now();
        e.result = result;
        e.resultCount = resultCount;
    }

    setFailed(requestId: string, code: string, message: string) {
        const e = this.map.get(requestId);
        if (!e) return;
        e.status = "failed";
        e.updatedAt = Date.now();
        e.error = { code, message };
    }

    get(requestId: string): Entry | undefined {
        const e = this.map.get(requestId);
        if (!e) return undefined;
        if (Date.now() - e.createdAt > this.ttlMs) {
            this.map.delete(requestId);
            return undefined;
        }
        return e;
    }

    private sweep() {
        const now = Date.now();
        for (const [k, v] of this.map.entries()) {
            if (now - v.createdAt > this.ttlMs) this.map.delete(k);
        }
    }
}

export const searchAsyncStore = new SearchAsyncStore();
