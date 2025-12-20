/**
 * SessionService: Manages search sessions and context
 * Wraps SessionManager with new SearchSession types
 */

import type { ISessionService, SearchSession, SessionContext, ParsedIntent, RestaurantResult } from '../types/search.types.js';
import { SessionManager } from '../../places/session/session-manager.js';
import { randomBytes } from 'crypto';
import { SearchConfig, type SessionConfig } from '../config/search.config.js';

export class SessionService implements ISessionService {
  private sessionManager: SessionManager;
  private sessions = new Map<string, SearchSession>();
  private config: SessionConfig;

  constructor(config?: Partial<SessionConfig>, sessionManager?: SessionManager) {
    this.sessionManager = sessionManager ?? new SessionManager();
    this.config = {
      ...SearchConfig.session,
      ...config,
    };
  }

  /**
   * Get an existing session or create a new one
   */
  async getOrCreate(sessionId?: string): Promise<SearchSession> {
    if (sessionId) {
      const existing = await this.get(sessionId);
      if (existing) {
        return existing;
      }
    }

    // Create new session
    const newSession: SearchSession = {
      id: this.generateSessionId(),
      context: {
        conversationHistory: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(newSession.id, newSession);
    return newSession;
  }

  /**
   * Get a session by ID
   */
  async get(sessionId: string): Promise<SearchSession | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    // Check if expired
    if (Date.now() - session.updatedAt.getTime() > this.config.ttlMs) {
      this.sessions.delete(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Update session with new data
   */
  async update(sessionId: string, data: Partial<SearchSession>): Promise<void> {
    const session = await this.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Update session
    const updated: SearchSession = {
      ...session,
      ...data,
      updatedAt: new Date(),
    };

    // Update context if intent is provided
    if (data.currentIntent) {
      updated.context = {
        ...session.context,
        previousIntent: session.currentIntent,
        conversationHistory: [
          ...session.context.conversationHistory.slice(-(this.config.maxHistoryLength - 1)),
          {
            query: data.currentIntent.query,
            intent: data.currentIntent,
            timestamp: new Date(),
          },
        ],
      };
    }

    this.sessions.set(sessionId, updated);
  }

  /**
   * Destroy a session
   */
  async destroy(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    this.sessionManager.destroy(sessionId);
  }

  /**
   * Check if a query is a refinement of the previous query
   */
  isRefinement(sessionId: string, currentQuery: string): boolean {
    const session = this.sessions.get(sessionId);

    if (!session || !session.context.previousIntent) {
      return false;
    }

    // Simple heuristic: if query is short and session has context, likely a refinement
    const isShort = currentQuery.length < 20;
    const hasContext = session.context.conversationHistory.length > 0;

    return isShort && hasContext;
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `search-${Date.now()}-${randomBytes(6).toString('hex')}`;
  }

  /**
   * Cleanup expired sessions (called periodically)
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, session] of this.sessions.entries()) {
      if (now - session.updatedAt.getTime() > this.config.ttlMs) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[SessionService] Cleaned up ${cleaned} expired sessions`);
    }
  }

  /**
   * Start automatic cleanup interval
   */
  startCleanup(intervalMs?: number): void {
    const interval = intervalMs ?? this.config.cleanupIntervalMs;
    setInterval(() => this.cleanup(), interval);
  }

  /**
   * Get session statistics
   */
  getStats(): { totalSessions: number; activeSessions: number } {
    const now = Date.now();
    const activeSessions = Array.from(this.sessions.values()).filter(
      session => now - session.updatedAt.getTime() < this.config.ttlMs
    ).length;

    return {
      totalSessions: this.sessions.size,
      activeSessions,
    };
  }

  /**
   * Clear all sessions (for testing)
   */
  clearAll(): void {
    this.sessions.clear();
    this.sessionManager.cleanup();
  }
}

