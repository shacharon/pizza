import type { FoodQueryDTO } from '../services/pipeline/chatPipeline.js';

export interface GuardState {
    lastOffDomainAt: number;
    offDomainCount: number;
}

export interface SessionData {
    dto: FoodQueryDTO;
    guard?: GuardState;
}

export interface SessionAgent {
    get(sessionId: string): Promise<SessionData | null>;
    set(sessionId: string, data: SessionData): Promise<void>;
}

export interface CacheAgent {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
}
