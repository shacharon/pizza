import { logger } from '../lib/logger/structured-logger.js';

type Status = "PENDING" | "DONE" | "FAILED";

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
        this.map.set(requestId, { status: "PENDING", createdAt: now, updatedAt: now });

        logger.info({
            requestId,
            status: 'PENDING',
            msg: '[AsyncStore] init -> PENDING'
        });
    }

    setDone(requestId: string, result: unknown, resultCount: number) {
        const e = this.map.get(requestId);
        if (!e) {
            logger.error({ requestId, msg: '[AsyncStore] setDone called but entry not found' });
            return;
        }
        e.status = "DONE";
        e.updatedAt = Date.now();
        e.result = result;
        e.resultCount = resultCount;

        logger.info({
            requestId,
            status: 'DONE',
            resultCount,
            hasResult: !!result,
            msg: '[AsyncStore] transition PENDING -> DONE'
        });
    }

    setFailed(requestId: string, code: string, message: string) {
        const e = this.map.get(requestId);
        if (!e) {
            logger.error({ requestId, msg: '[AsyncStore] setFailed called but entry not found' });
            return;
        }
        e.status = "FAILED";
        e.updatedAt = Date.now();
        e.error = { code, message };

        logger.warn({
            requestId,
            status: 'FAILED',
            code,
            message,
            msg: '[AsyncStore] transition PENDING -> FAILED'
        });
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

// Export Status type for use in controller
export type { Status };
