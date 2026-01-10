# WebSocket-Based Async Assistant - Implementation Plan

## Executive Summary

Refactor the SearchOrchestrator to separate fast synchronous core search (<1s) from slow asynchronous LLM assistant (3-4s). This enables immediate HTTP responses with results while streaming AI-powered narration and recommendations via WebSocket.

**Goal**: Reduce perceived latency from 4-6s to <1s while maintaining backward compatibility.

---

## Architecture Overview

```
BEFORE (Synchronous):
┌──────────┐
│  Client  │
└────┬─────┘
     │ POST /search
     ▼
┌────────────────────────────────────────┐
│  SearchOrchestrator.search()           │
│  1. Intent Parse          (~100ms)     │
│  2. Geo Resolve           (~50ms)      │
│  3. Google Places         (~300ms)     │
│  4. Filter/Rank           (~50ms)      │
│  5. LLM Assistant         (~3000ms) ❌ │
│  ════════════════════════════════════  │
│  Total: 4-6s                           │
└────────────────────────────────────────┘
     │
     ▼
┌──────────┐
│ Response │  (after 4-6s)
└──────────┘

AFTER (Async):
┌──────────┐                    ┌──────────────┐
│  Client  │◄───────WebSocket───┤ AssistantJob │
└────┬─────┘                    └──────┬───────┘
     │ POST /search?mode=async         │
     ▼                                 │
┌────────────────────────────┐         │
│ searchCore()               │         │
│ 1. Intent      (~100ms)    │         │
│ 2. Geo         (~50ms)     │         │
│ 3. Provider    (~300ms)    │         │
│ 4. Filter/Rank (~50ms)     │         │
│ ══════════════════════     │         │
│ Total: ~500ms              │         │
└────────────────────────────┘         │
     │                                 │
     ▼                                 │
┌──────────────────┐                   │
│ HTTP 200         │                   │
│ {requestId,      │                   │
│  results, chips} │                   │
└──────────────────┘                   │
     │                                 │
     │ (fire & forget)                 │
     └─────────────────────────────────►
                                       │
                                       ▼
                              ┌─────────────────┐
                              │ LLM Stream      │
                              │ status          │
                              │ stream.delta    │
                              │ stream.done     │
                              │ recommendation  │
                              └─────────────────┘
```

---

## Message Protocol

### WebSocket Connection
- **Endpoint**: `ws://localhost:3000/ws` (or `wss://` for production)
- **Client initiates**: Connect on page load, authenticate if needed
- **Server broadcasts**: Messages keyed by requestId

### Client → Server Messages

```typescript
type WSClientMessage =
  | { type: 'subscribe'; requestId: string }
  | { type: 'action_clicked'; requestId: string; actionId: string }
  | { type: 'ui_state_changed'; requestId: string; state: UIState };
```

### Server → Client Messages

```typescript
type WSServerMessage =
  | { type: 'status'; requestId: string; status: 'pending' | 'streaming' | 'completed' | 'failed' }
  | { type: 'stream.delta'; requestId: string; text: string }
  | { type: 'stream.done'; requestId: string; fullText: string }
  | { type: 'recommendation'; requestId: string; actions: ProposedAction[] }
  | { type: 'error'; requestId: string; error: string; message: string };
```

**Example Flow**:
```javascript
// Client connects
ws.send(JSON.stringify({ type: 'subscribe', requestId: 'abc-123' }));

// Server streams
← { type: 'status', requestId: 'abc-123', status: 'streaming' }
← { type: 'stream.delta', requestId: 'abc-123', text: 'Found ' }
← { type: 'stream.delta', requestId: 'abc-123', text: '10 great ' }
← { type: 'stream.delta', requestId: 'abc-123', text: 'pizza places!' }
← { type: 'stream.done', requestId: 'abc-123', fullText: 'Found 10 great pizza places!' }
← { type: 'recommendation', requestId: 'abc-123', actions: [...] }
```

---

## API Contract

### Sync Mode (Legacy - Default)

**Request**:
```http
POST /api/v1/search
Content-Type: application/json

{
  "query": "pizza in tel aviv",
  "sessionId": "session-123" // optional
}
```

**Response** (4-6s latency):
```json
{
  "sessionId": "session-123",
  "query": {
    "original": "pizza in tel aviv",
    "parsed": { "category": "pizza", "location": {...} },
    "language": "en"
  },
  "results": [...],
  "chips": [...],
  "assist": {
    "type": "guide",
    "message": "I found 10 great pizza places in Tel Aviv",
    "mode": "NORMAL"
  },
  "proposedActions": {...},
  "meta": {...}
}
```

### Async Mode (New - Opt-In)

**Request**:
```http
POST /api/v1/search?mode=async
Content-Type: application/json

{
  "query": "pizza in tel aviv",
  "sessionId": "session-123" // optional
}
```

**Response** (<1s latency):
```json
{
  "requestId": "req-abc-123",
  "sessionId": "session-123",
  "query": {
    "original": "pizza in tel aviv",
    "parsed": { "category": "pizza", "location": {...} },
    "language": "en"
  },
  "results": [...],
  "chips": [...],
  "meta": {
    "tookMs": 523,
    "mode": "textsearch",
    "confidence": 0.85
  }
}
```

**Then via WebSocket**:
```javascript
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.requestId === 'req-abc-123') {
    // Display assistant output in real-time
  }
};
```

---

## Implementation Phases

### Phase 1: Extract Core Search (Week 1) ✅ CURRENT PHASE

**Goal**: Split orchestrator into fast core + slow assistant without breaking existing API.

#### Acceptance Criteria
- [ ] `searchCore()` method extracts intent→geo→provider→filter→rank logic
- [ ] `searchCore()` NEVER calls `assistantNarration.generateFast()`
- [ ] `search()` method calls `searchCore()` then runs assistant (legacy behavior preserved)
- [ ] Controller generates `requestId` (UUID) at entry point
- [ ] Controller passes `requestId` + `traceId` in context to orchestrator
- [ ] New types: `CoreSearchResult`, `CoreSearchMetadata`, `SearchContext`
- [ ] Structured logs: `search_started`, `search_core_completed`, `assistant_completed`
- [ ] Unit test: Mock assistant service, verify `searchCore()` never calls it
- [ ] Integration test: Verify sync mode returns exact previous response shape
- [ ] TypeScript compiles with zero errors
- [ ] All existing tests pass

#### Changes

**File**: `server/src/services/search/types/search.types.ts`

Add new types:
```typescript
export interface SearchContext {
  requestId: string;
  sessionId?: string;
  traceId?: string;
  startTime: number;
  timings: {
    intentMs: number;
    geocodeMs: number;
    providerMs: number;
    rankingMs: number;
    assistantMs: number;
    totalMs: number;
  };
}

export interface CoreSearchResult {
  requestId: string;
  sessionId: string;
  query: {
    original: string;
    parsed: ParsedIntent;
    language: string;
  };
  results: RestaurantResult[];
  groups?: ResultGroup[];
  chips: SuggestionChip[];
  truthState: TruthState;
  meta: CoreSearchMetadata;
}

export interface CoreSearchMetadata {
  tookMs: number;
  mode: SearchMode;
  appliedFilters: string[];
  confidence: number;
  source: string;
  failureReason: FailureReason;
  // Timing breakdown for core only
  timings: {
    intentMs: number;
    geocodeMs: number;
    providerMs: number;
    rankingMs: number;
  };
}
```

**File**: `server/src/services/search/orchestrator/search.orchestrator.ts`

Extract core method:
```typescript
/**
 * Core search logic - FAST path (no LLM assistant)
 * Returns raw results + metadata in ~500ms
 */
async searchCore(request: SearchRequest, ctx: SearchContext): Promise<CoreSearchResult> {
  const { requestId, traceId, startTime, timings } = ctx;

  logger.info({ requestId, query: request.query }, 'search_started');

  // Step 1-8: All existing logic EXCEPT assistant narration
  // (intent, geo, provider, filters, ranking, chips, truthState)
  
  // ... copy existing logic here, but SKIP assistant calls ...

  const coreMs = Date.now() - startTime;
  
  logger.info({ 
    requestId, 
    coreMs, 
    resultCount: results.length 
  }, 'search_core_completed');

  return {
    requestId,
    sessionId,
    query: { original: request.query, parsed: intent, language: intent.language },
    results,
    groups,
    chips,
    truthState,
    meta: {
      tookMs: coreMs,
      mode: intent.searchMode,
      appliedFilters,
      confidence,
      source: 'google_places',
      failureReason,
      timings: {
        intentMs: timings.intentMs,
        geocodeMs: timings.geocodeMs,
        providerMs: timings.providerMs,
        rankingMs: timings.rankingMs
      }
    }
  };
}

/**
 * Legacy search method - calls core + assistant synchronously
 * PRESERVES EXACT PREVIOUS BEHAVIOR for backward compatibility
 */
async search(request: SearchRequest, traceId?: string): Promise<SearchResponse> {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  const timings = { intentMs: 0, geocodeMs: 0, providerMs: 0, rankingMs: 0, assistantMs: 0, totalMs: 0 };
  
  const ctx: SearchContext = { requestId, traceId, startTime, timings };
  
  // Call core (fast)
  const coreResult = await this.searchCore(request, ctx);
  
  // Run assistant synchronously (slow)
  const assistStart = Date.now();
  const assist = await this.assistantNarration.generateFast(
    coreResult.truthState.assistantContext,
    coreResult.truthState
  );
  timings.assistantMs = Date.now() - assistStart;
  
  logger.info({ 
    requestId, 
    assistantMs: timings.assistantMs 
  }, 'assistant_completed');
  
  timings.totalMs = Date.now() - startTime;
  
  // Return EXACT previous response shape
  return createSearchResponse({
    sessionId: coreResult.sessionId,
    originalQuery: request.query,
    intent: coreResult.query.parsed,
    results: coreResult.results,
    groups: coreResult.groups,
    chips: coreResult.chips,
    assist,
    proposedActions: this.generateProposedActions(),
    meta: {
      ...coreResult.meta,
      tookMs: timings.totalMs
    },
    diagnostics: { /* ... */ }
  });
}
```

**File**: `server/src/controllers/search/search.controller.ts`

Generate requestId at entry:
```typescript
router.post('/', async (req: Request, res: Response) => {
  // Generate requestId ONCE (source of truth)
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  req.log.info({ requestId, query: req.body.query }, 'Search request validated');
  
  try {
    const validation = safeParseSearchRequest(req.body);
    if (!validation.success) {
      req.log.warn({ requestId, error: validation.error }, 'Invalid search request');
      // ... error handling
      return;
    }

    // Phase 1: Both sync and async modes call legacy search() (no breaking change yet)
    const mode = (req.query.mode as string) || 'sync';
    
    const response = await orchestrator.search(validation.data!, req.traceId);
    
    req.log.info({ requestId, resultCount: response.results.length }, 'Search completed');
    
    res.json(response);
  } catch (error) {
    req.log.error({ requestId, error }, 'Search error');
    res.status(500).json(createSearchError('Internal server error', 'SEARCH_ERROR'));
  }
});
```

---

### Phase 2: State Store (Week 1-2)

**Goal**: In-memory request state store with TTL cleanup, Redis-ready interface.

#### Acceptance Criteria
- [ ] `IRequestStateStore` interface defined
- [ ] `InMemoryRequestStore` implemented with TTL (300s default)
- [ ] Background cleanup job runs every 60s
- [ ] `shutdown()` method clears intervals (leak-safe)
- [ ] Unit tests: TTL expiration, cleanup, memory bounds

#### Changes

**File**: `server/src/infra/state/request-state.store.ts`

```typescript
export interface IRequestStateStore {
  set(requestId: string, state: RequestState, ttlSeconds?: number): Promise<void>;
  get(requestId: string): Promise<RequestState | null>;
  delete(requestId: string): Promise<void>;
  cleanup(): Promise<number>;
  shutdown(): void;
}

export interface RequestState {
  requestId: string;
  sessionId?: string;
  traceId?: string;
  coreResult: CoreSearchResult;
  assistantStatus: 'pending' | 'streaming' | 'completed' | 'failed';
  assistantOutput?: string;
  recommendations?: ProposedAction[];
  seed: number; // Deterministic randomness
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}
```

**File**: `server/src/infra/state/in-memory-request-store.ts`

```typescript
export class InMemoryRequestStore implements IRequestStateStore {
  private store = new Map<string, { state: RequestState; expiresAt: number }>();
  private cleanupInterval?: NodeJS.Timeout;
  
  constructor(
    private defaultTtlSeconds = 300,
    private cleanupIntervalMs = 60_000
  ) {
    this.startCleanup();
  }

  async set(requestId: string, state: RequestState, ttl = this.defaultTtlSeconds) {
    const expiresAt = Date.now() + ttl * 1000;
    this.store.set(requestId, { state: { ...state, expiresAt }, expiresAt });
  }

  async get(requestId: string): Promise<RequestState | null> {
    const entry = this.store.get(requestId);
    if (!entry || Date.now() > entry.expiresAt) {
      this.store.delete(requestId);
      return null;
    }
    return entry.state;
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  private startCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup().then(count => {
        if (count > 0) logger.debug({ cleaned: count }, 'State store cleanup');
      });
    }, this.cleanupIntervalMs);
  }

  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.store.clear();
  }
}
```

---

### Phase 3: WebSocket Server (Week 2)

**Goal**: Real-time bidirectional communication with leak-safe connection management.

#### Acceptance Criteria
- [ ] `WebSocketManager` mounts at `/ws`
- [ ] Client subscription protocol works
- [ ] Connection pooling per requestId
- [ ] Closed sockets removed from ALL subscriptions (leak-safe)
- [ ] Structured logs: `websocket_connected`, `websocket_subscribed`, `websocket_disconnected`
- [ ] Test with `wscat` or Postman

#### Changes

**File**: `server/src/infra/websocket/websocket-manager.ts`

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { logger } from '../../lib/logger/structured-logger.js';

export class WebSocketManager {
  private wss: WebSocketServer;
  private subscriptions = new Map<string, Set<WebSocket>>();
  private socketToRequests = new WeakMap<WebSocket, Set<string>>();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', this.handleConnection.bind(this));
  }

  private handleConnection(ws: WebSocket) {
    logger.info('websocket_connected');
    
    ws.on('message', (data) => this.handleMessage(ws, data));
    ws.on('close', () => this.handleClose(ws));
    ws.on('error', (err) => logger.error({ err }, 'WebSocket error'));
  }

  private handleMessage(ws: WebSocket, data: Buffer) {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'subscribe' && message.requestId) {
        this.subscribe(message.requestId, ws);
        logger.info({ requestId: message.requestId }, 'websocket_subscribed');
      }
    } catch (err) {
      logger.error({ err }, 'Failed to parse WebSocket message');
    }
  }

  private handleClose(ws: WebSocket) {
    // LEAK PREVENTION: Remove socket from all subscriptions
    const requestIds = this.socketToRequests.get(ws);
    if (requestIds) {
      for (const requestId of requestIds) {
        const sockets = this.subscriptions.get(requestId);
        if (sockets) {
          sockets.delete(ws);
          if (sockets.size === 0) {
            this.subscriptions.delete(requestId);
          }
        }
      }
      this.socketToRequests.delete(ws);
    }
    logger.info('websocket_disconnected');
  }

  subscribe(requestId: string, client: WebSocket) {
    if (!this.subscriptions.has(requestId)) {
      this.subscriptions.set(requestId, new Set());
    }
    this.subscriptions.get(requestId)!.add(client);
    
    // Track reverse mapping for cleanup
    if (!this.socketToRequests.has(client)) {
      this.socketToRequests.set(client, new Set());
    }
    this.socketToRequests.get(client)!.add(requestId);
  }

  broadcast(requestId: string, message: any) {
    const clients = this.subscriptions.get(requestId);
    if (!clients || clients.size === 0) return;

    const data = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
    
    logger.debug({ requestId, messageType: message.type }, 'websocket_message_sent');
  }

  shutdown() {
    this.wss.close();
    this.subscriptions.clear();
  }
}
```

**File**: `server/src/server.ts`

Mount WebSocket:
```typescript
import { WebSocketManager } from './infra/websocket/websocket-manager.js';

const server = app.listen(PORT);
const wsManager = new WebSocketManager(server);

// Graceful shutdown
process.on('SIGTERM', () => {
  wsManager.shutdown();
  server.close();
});
```

---

### Phase 4: Assistant Job Service (Week 2-3)

**Goal**: Async assistant processing with streaming and deterministic recommendations.

#### Acceptance Criteria
- [ ] `AssistantJobService.startJob(requestId)` runs async
- [ ] Fetches state from store
- [ ] Streams LLM output via WS (`stream.delta`)
- [ ] Generates deterministic recommendations (seeded by requestId)
- [ ] Sends `stream.done` + `recommendation` events
- [ ] Updates state to `completed`
- [ ] Error handling: timeout (15s), WS disconnect, LLM failure
- [ ] Structured logs: `assistant_job_started`, `assistant_job_completed`, `assistant_job_failed`

#### Changes

**File**: `server/src/services/search/assistant-job.service.ts`

```typescript
import seedrandom from 'seedrandom';
import { logger } from '../../lib/logger/structured-logger.js';

export class AssistantJobService {
  constructor(
    private stateStore: IRequestStateStore,
    private wsManager: WebSocketManager,
    private assistantNarration: AssistantNarrationService
  ) {}

  async startJob(requestId: string): Promise<void> {
    logger.info({ requestId }, 'assistant_job_started');
    
    try {
      const state = await this.stateStore.get(requestId);
      if (!state) {
        logger.warn({ requestId }, 'State not found for assistant job');
        return;
      }

      // Update status
      await this.updateState(requestId, { assistantStatus: 'streaming' });
      this.wsManager.broadcast(requestId, { 
        type: 'status', 
        requestId, 
        status: 'streaming' 
      });

      // Stream LLM output
      const startTime = Date.now();
      let fullText = '';
      
      const assist = await this.assistantNarration.generateFast(
        state.coreResult.truthState.assistantContext,
        state.coreResult.truthState,
        {
          onChunk: (chunk) => {
            fullText += chunk;
            this.wsManager.broadcast(requestId, {
              type: 'stream.delta',
              requestId,
              text: chunk
            });
          }
        }
      );

      // Generate deterministic recommendations
      const rng = seedrandom(state.seed.toString());
      const recommendations = this.generateRecommendations(
        state.coreResult,
        rng
      );

      // Broadcast final events
      this.wsManager.broadcast(requestId, {
        type: 'stream.done',
        requestId,
        fullText: assist.message
      });
      
      this.wsManager.broadcast(requestId, {
        type: 'recommendation',
        requestId,
        actions: recommendations
      });

      // Update state
      await this.updateState(requestId, {
        assistantStatus: 'completed',
        assistantOutput: assist.message,
        recommendations,
        updatedAt: Date.now()
      });

      logger.info({
        requestId,
        assistantMs: Date.now() - startTime,
        recommendationCount: recommendations.length
      }, 'assistant_job_completed');

    } catch (err) {
      logger.error({ requestId, err }, 'assistant_job_failed');
      
      this.wsManager.broadcast(requestId, {
        type: 'error',
        requestId,
        error: 'ASSISTANT_FAILED',
        message: 'Failed to generate assistant response'
      });
      
      await this.updateState(requestId, { assistantStatus: 'failed' });
    }
  }
}
```

---

### Phase 5: Enable Async Mode (Week 3)

**Goal**: Wire up async mode in controller, enable fire-and-forget assistant jobs.

#### Acceptance Criteria
- [ ] Controller checks `?mode=async` query param
- [ ] Async mode calls `searchCore()` and returns immediately
- [ ] Saves state to store with TTL
- [ ] Fires `assistantJobService.startJob(requestId)` (no await)
- [ ] Sync mode still calls legacy `search()` (backward compatible)
- [ ] Response includes `requestId` for WS subscription
- [ ] Frontend can connect to WS and receive events
- [ ] Load test: 100 req/s to async endpoint

#### Changes

**File**: `server/src/controllers/search/search.controller.ts`

```typescript
router.post('/', async (req: Request, res: Response) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const mode = (req.query.mode as string) || 'sync';
  
  try {
    const validation = safeParseSearchRequest(req.body);
    if (!validation.success) {
      req.log.warn({ requestId, error: validation.error }, 'Invalid search request');
      res.status(400).json(createSearchError('Invalid request', 'VALIDATION_ERROR'));
      return;
    }

    req.log.info({ requestId, query: validation.data!.query, mode }, 'Search request validated');

    if (mode === 'async') {
      // NEW FAST PATH
      const ctx: SearchContext = {
        requestId,
        traceId: req.traceId,
        startTime: Date.now(),
        timings: { intentMs: 0, geocodeMs: 0, providerMs: 0, rankingMs: 0, assistantMs: 0, totalMs: 0 }
      };
      
      const coreResult = await orchestrator.searchCore(validation.data!, ctx);
      
      // Save to state store
      await stateStore.set(requestId, {
        requestId,
        sessionId: coreResult.sessionId,
        traceId: req.traceId,
        coreResult,
        assistantStatus: 'pending',
        seed: hashRequestId(requestId),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 300_000
      });
      
      // Fire and forget assistant job
      assistantJobService.startJob(requestId).catch(err => {
        logger.error({ requestId, err }, 'Assistant job failed to start');
      });
      
      req.log.info({ requestId }, 'assistant_job_queued');
      
      // Return immediately
      res.json({
        requestId: coreResult.requestId,
        sessionId: coreResult.sessionId,
        query: coreResult.query,
        results: coreResult.results,
        groups: coreResult.groups,
        chips: coreResult.chips,
        meta: coreResult.meta
      });
      
    } else {
      // LEGACY SYNC PATH (backward compatible)
      const response = await orchestrator.search(validation.data!, req.traceId);
      req.log.info({ requestId, resultCount: response.results.length }, 'Search completed');
      res.json(response);
    }

  } catch (error) {
    req.log.error({ requestId, error }, 'Search error');
    res.status(500).json(createSearchError('Internal server error', 'SEARCH_ERROR'));
  }
});
```

---

## Testing Strategy

### Unit Tests
- [ ] `searchCore()` never calls `assistantNarration` (spy/mock)
- [ ] `search()` calls `searchCore()` then `assistantNarration`
- [ ] State store TTL cleanup works
- [ ] WebSocket subscription/unsubscription
- [ ] Deterministic recommendations (same seed → same output)

### Integration Tests
- [ ] Sync mode returns exact previous response shape
- [ ] Async mode returns fast response + WS events
- [ ] WS reconnect handling
- [ ] Assistant job retries on failure

### Load Tests
- [ ] 100 req/s to `/search?mode=async`
- [ ] 1000 concurrent WS connections
- [ ] State store memory usage under load

---

## Rollout Plan

### Week 1: Phase 1 (No Breaking Changes)
1. Deploy Phase 1 to staging
2. Verify metrics: `coreMs` vs `assistantMs`
3. Verify all existing tests pass
4. Deploy to production (no user-facing changes)

### Week 2: Phases 2-3 (Infrastructure)
1. Deploy state store (in-memory)
2. Deploy WebSocket server
3. Test with `wscat`
4. Monitor memory usage

### Week 3: Phases 4-5 (Enable Async)
1. Deploy assistant job service
2. Enable `?mode=async` for internal testing
3. Frontend WS client implementation
4. Feature flag: 10% → 50% → 100%

---

## Risk Mitigation

### Memory Leaks
- **Risk**: State store or WS manager leaks memory
- **Mitigation**: 
  - Strict TTL (300s) with cleanup every 60s
  - `shutdown()` hooks clear intervals
  - WS manager removes closed sockets from all subscriptions
  - Monitor `state_store_entries_count` metric
  - Alert if > 10,000 entries

### WebSocket Failures
- **Risk**: Client doesn't receive assistant output
- **Mitigation**:
  - Cache output in state store
  - Provide fallback HTTP polling: `GET /api/v1/search/:requestId/assistant`
  - Frontend auto-reconnect with exponential backoff

### LLM Timeouts
- **Risk**: Assistant job hangs forever
- **Mitigation**:
  - 15s hard timeout on LLM calls
  - Send partial `stream.done` on timeout
  - Retry with exponential backoff
  - Log timeout events for monitoring

### Deterministic Randomness
- **Risk**: Same requestId produces different outputs
- **Mitigation**:
  - Hash requestId → PRNG seed
  - Cache LLM output in state store
  - Unit test: verify determinism

---

## Success Metrics

| Metric | Before (Sync) | Target (Async) |
|--------|---------------|----------------|
| **Initial Response (P95)** | 4-6s | <1s |
| **Time to First Assistant Token** | 4-6s | 1-2s |
| **Total Time to Complete** | 4-6s | 4-6s (non-blocking) |
| **Server CPU** | ~60% | ~40% (async I/O) |
| **Memory Usage** | Baseline | +10% (state store) |

---

## Structured Logging Events

```typescript
// Search lifecycle
logger.info({ requestId, query }, 'search_started');
logger.info({ requestId, coreMs, resultCount }, 'search_core_completed');
logger.info({ requestId }, 'assistant_job_queued');

// Assistant job
logger.info({ requestId }, 'assistant_job_started');
logger.info({ requestId, assistantMs }, 'assistant_completed');
logger.error({ requestId, error }, 'assistant_job_failed');

// WebSocket
logger.info({ clientId }, 'websocket_connected');
logger.info({ requestId }, 'websocket_subscribed');
logger.info({ clientId }, 'websocket_disconnected');
```

---

## Next Steps

1. ✅ Review this plan with team
2. ✅ Implement Phase 1 (extract core, add types, update controller)
3. ⏳ Verify TypeScript compiles + tests pass
4. ⏳ Deploy Phase 1 to staging
5. ⏳ Proceed to Phase 2 after Phase 1 is stable
