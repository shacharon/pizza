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
      const newHistory = [
        ...session.context.conversationHistory.slice(-(this.config.maxHistoryLength - 1)),
        {
          query: data.currentIntent.query,
          intent: data.currentIntent,
          timestamp: new Date(),
        },
      ];

      updated.context = {
        conversationHistory: newHistory,
      };

      // Only add previousIntent if it exists
      if (session.currentIntent) {
        updated.context.previousIntent = session.currentIntent;
      }
    }

    this.sessions.set(sessionId, updated);
  }

  /**
   * Destroy a session
   */
  async destroy(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    // SessionManager doesn't have a destroy(id) method, just cleanup()
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
   * Check if a city has been validated in this session
   * Avoids redundant geocoding calls
   */
  async getValidatedCity(sessionId: string, cityName: string): Promise<{
    displayName: string;
    coordinates: { lat: number; lng: number };
    status: 'VERIFIED' | 'FAILED' | 'AMBIGUOUS';
  } | null> {
    const session = await this.get(sessionId);
    if (!session || !session.context.validatedCities) {
      return null;
    }

    const cached = session.context.validatedCities.get(cityName.toLowerCase());
    if (!cached) {
      return null;
    }

    // Check if cache entry is still fresh (within session lifetime)
    if (Date.now() - cached.timestamp > this.config.ttlMs) {
      session.context.validatedCities.delete(cityName.toLowerCase());
      return null;
    }

    return {
      displayName: cached.displayName,
      coordinates: cached.coordinates,
      status: cached.status,
    };
  }

  /**
   * Store a validated city in session cache
   */
  async storeValidatedCity(
    sessionId: string,
    cityName: string,
    data: {
      displayName: string;
      coordinates: { lat: number; lng: number };
      status: 'VERIFIED' | 'FAILED' | 'AMBIGUOUS';
    }
  ): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) {
      return;
    }

    // Initialize cache if needed
    if (!session.context.validatedCities) {
      session.context.validatedCities = new Map();
    }

    session.context.validatedCities.set(cityName.toLowerCase(), {
      ...data,
      timestamp: Date.now(),
    });

    this.sessions.set(sessionId, session);
  }

  /**
   * Clear session context (intent reset)
   * Clears conversation history and constraints, but keeps validated cities cache
   */
  async clearContext(sessionId: string): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) {
      console.log(`[SessionService] ⚠️ No session found to clear: ${sessionId}`);
      return;
    }

    // Keep validated cities cache, clear everything else
    const validatedCities = session.context.validatedCities;

    session.context = {
      conversationHistory: [],
      validatedCities,  // Preserve city validation cache
    };

    // Clear current intent
    session.currentIntent = undefined;
    session.updatedAt = new Date();

    this.sessions.set(sessionId, session);
    console.log(`[SessionService] 🔄 Context cleared for session ${sessionId}`);
  }

  /**
   * Clear all sessions (for testing)
   */
  clearAll(): void {
    this.sessions.clear();
    // Note: SessionManager doesn't expose cleanup() publicly
  }

  /**
   * Add a ChatBack turn to memory
   * Track shown places, actions, and message variations
   */
  addChatBackTurn(
    sessionId: string,
    placeIds: string[],
    actionIds: string[],
    messageHash: string,
    scenario: string
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[SessionService] Cannot add ChatBack turn: session ${sessionId} not found`);
      return;
    }

    // Initialize chatBackHistory if needed
    if (!session.chatBackHistory) {
      session.chatBackHistory = {
        turnIndex: 0,
        lastShownPlaceIds: [],
        lastSuggestedActions: [],
        messageVariations: [],
        scenarioCount: {}
      };
    }

    const history = session.chatBackHistory;

    // Increment turn index
    history.turnIndex++;

    // Update last shown places (keep last 20)
    history.lastShownPlaceIds = [
      ...history.lastShownPlaceIds,
      ...placeIds
    ].slice(-20);

    // Update last suggested actions (keep last 10)
    history.lastSuggestedActions = [
      ...history.lastSuggestedActions,
      ...actionIds
    ].slice(-10);

    // Add message variation (keep last 5)
    history.messageVariations = [
      ...history.messageVariations,
      messageHash
    ].slice(-5);

    // Increment scenario count
    history.scenarioCount[scenario] = (history.scenarioCount[scenario] || 0) + 1;

    session.updatedAt = new Date();
    this.sessions.set(sessionId, session);

    console.log(`[SessionService] ChatBack turn ${history.turnIndex} added for session ${sessionId}`);
  }

  /**
   * Get ChatBack memory for a session
   */
  getChatBackMemory(sessionId: string): SearchSession['chatBackHistory'] {
    const session = this.sessions.get(sessionId);
    return session?.chatBackHistory;
  }

  /**
   * Check if a scenario has been seen before
   */
  hasSeenScenario(sessionId: string, scenario: string): boolean {
    const memory = this.getChatBackMemory(sessionId);
    return (memory?.scenarioCount[scenario] || 0) > 0;
  }

  /**
   * Get count of how many times a scenario was seen
   */
  getScenarioCount(sessionId: string, scenario: string): number {
    const memory = this.getChatBackMemory(sessionId);
    return memory?.scenarioCount[scenario] || 0;
  }

  /**
   * Get last N message hashes to avoid repetition
   */
  getRecentMessages(sessionId: string, count: number = 3): string[] {
    const memory = this.getChatBackMemory(sessionId);
    if (!memory) return [];
    return memory.messageVariations.slice(-count);
  }
}

