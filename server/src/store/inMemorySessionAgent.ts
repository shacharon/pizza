import type { SessionData, SessionAgent } from "./types.js";

export class InMemorySessionAgent implements SessionAgent {
    private sessions = new Map<string, SessionData>();

    async get(sessionId: string): Promise<SessionData | null> {
        return this.sessions.get(sessionId) || null;
    }

    async set(sessionId: string, data: SessionData): Promise<void> {
        this.sessions.set(sessionId, data);
    }
}
