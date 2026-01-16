# Infrastructure High-Level Architecture

## Table of Contents
- [System Architecture](#system-architecture)
- [Component Relationships](#component-relationships)
- [Data Flow](#data-flow)
- [Service Layers](#service-layers)
- [Integration Points](#integration-points)
- [Error Handling](#error-handling)
- [Observability](#observability)

---

## System Architecture

### Overview

The system follows a **layered architecture** with clear separation of concerns:

```
┌────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│  Frontend Application (Angular) via HTTP/WebSocket              │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                         │
│  Express.js + Middleware                                        │
│  • HTTP Request Handling                                        │
│  • Logging Middleware (httpLogging.middleware.ts)               │
│  • Request Context (requestContext.middleware.ts)               │
│  • Error Middleware (error.middleware.ts)                       │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                      CONTROLLER LAYER                           │
│  • Search Controller: Orchestrates search pipeline              │
│  • Analytics Controller: Event tracking                         │
│  • Request Validation (Zod schemas)                             │
│  • Response Transformation                                      │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                       BUSINESS LOGIC LAYER                      │
│  ROUTE2 Pipeline (services/search/route2/)                      │
│  • Gate2: Classification Stage                                  │
│  • Intent2: Extraction Stage                                    │
│  • Route-LLM: Strategy Stage                                    │
│  • Google-Maps: Execution Stage                                 │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                     INFRASTRUCTURE LAYER                        │
│  lib/ and infra/ modules                                        │
│  • LLM Providers (llm/)                                         │
│  • Logger (lib/logger/)                                         │
│  • Cache (lib/cache/)                                           │
│  • Reliability (lib/reliability/)                               │
│  • Metrics (lib/metrics/)                                       │
│  • WebSocket (infra/websocket/)                                 │
│  • State Store (infra/state/)                                   │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                       EXTERNAL SERVICES                         │
│  • OpenAI API (LLM)                                             │
│  • Anthropic API (LLM alternative)                              │
│  • Google Places API (search)                                   │
└────────────────────────────────────────────────────────────────┘
```

---

## Component Relationships

### 1. Server Initialization Flow

```
server.ts
  ├─> createApp() [app.ts]
  │    ├─> Middleware Stack
  │    │    ├─> httpLogging.middleware
  │    │    ├─> requestContext.middleware
  │    │    └─> error.middleware
  │    └─> Route Registration
  │         └─> /v1/* routes [routes/v1/index.ts]
  │              ├─> /search → searchRouter [controllers/search/]
  │              └─> /analytics → analyticsRouter [controllers/analytics/]
  │
  ├─> InMemoryRequestStore [infra/state/]
  │    • Stores request state for async operations
  │    • Auto-cleanup with TTL
  │
  └─> WebSocketManager [infra/websocket/]
       • Manages WebSocket connections
       • Handles subscriptions and broadcasts
       • Late-subscriber replay support
```

### 2. Search Request Flow

```
POST /v1/search
  ↓
searchRouter (controllers/search/search.controller.ts)
  ├─> Validate request (Zod schema)
  ├─> Generate requestId
  ├─> Check ROUTE2_ENABLED flag
  ├─> Create LLMProvider
  └─> Call searchRoute2()
       ↓
route2.orchestrator.ts
  ├─> resolveUserRegionCode() [utils/region-resolver.ts]
  │    • Check device coordinates (IL bbox)
  │    • Check session cache
  │    • Use default from env
  │
  ├─> executeGate2Stage() [stages/gate2.stage.ts]
  │    • LLM call: language + isFoodRelated
  │    • Deterministic routing: CONTINUE or BYPASS
  │    • Timeout: 900ms
  │
  ├─> executeIntent2Stage() [stages/intent2.stage.ts]
  │    • LLM call: food + location + mode
  │    • Detect queryRegionCode
  │    • Timeout: 2000ms
  │
  ├─> executeRouteLLMStage() [stages/route-llm.stage.ts]
  │    • Determine search mode & radius
  │
  └─> executeGoogleMapsStage() [stages/google-maps.stage.ts]
       • Call Google Places API
       • Return results
```

### 3. LLM Provider Abstraction

```
LLMProvider Interface (llm/types.ts)
  ├─> OpenAiProvider (llm/openai.provider.ts)
  │    • Uses OpenAI API
  │    • Structured outputs with JSON schema
  │    • Default model: gpt-4o-mini
  │
  └─> AnthropicProvider (llm/anthropic.provider.ts)
       • Uses Anthropic Claude API
       • Alternative LLM backend

Factory Pattern (llm/factory.ts)
  • createLLMProvider()
  • Environment-based selection
  • Singleton caching
```

### 4. Infrastructure Services

```
Logger (lib/logger/structured-logger.ts)
  • Pino-based JSON logging
  • Daily file rotation (dev)
  • Pretty console output (dev)
  • Secret redaction
  • Child loggers for context

Cache (lib/cache/cache-manager.ts)
  • In-memory with TTL
  • LRU eviction
  • Hit/miss statistics
  • Thread-safe (Node.js)

Reliability
  ├─> retry-policy.ts
  │    • Exponential backoff
  │    • Configurable attempts
  │    • Retry on transient errors
  │
  └─> timeout-guard.ts
       • Promise-based timeouts
       • Abort signal support
       • Error wrapping

Metrics (lib/metrics/performance-metrics.ts)
  • Request duration tracking
  • Stage timings
  • Error rates
  • Percentile calculations

Telemetry
  ├─> providerTrace.ts
  │    • LLM call tracing
  │    • Token usage tracking
  │    • Cost estimation
  │
  └─> providerAudit.store.ts
       • Audit log of LLM calls
       • Prompt + response storage
```

---

## Data Flow

### Request Context Propagation

```typescript
// Context created at controller
const route2Context: Route2Context = {
  requestId: "req-1234567890",
  traceId: "trace-abc",
  sessionId: "session-xyz",
  startTime: Date.now(),
  llmProvider: llm,
  userLocation: { lat: 32.0853, lng: 34.7818 },
  // Added by pipeline:
  userRegionCode: "IL",
  queryRegionCode: "IL",
  regionCodeFinal: "IL"
};

// Passed through all stages
Gate2Stage(request, context)
  → Intent2Stage(gate, request, context)
    → RouteLLMStage(intent, request, context)
      → GoogleMapsStage(route, intent, request, context)
```

### Logging Flow

```
Every stage logs:
1. stage_started
   { requestId, stage, event: "stage_started", ... }

2. stage_completed
   { requestId, stage, event: "stage_completed", durationMs, ... }

3. stage_failed (if error)
   { requestId, stage, event: "stage_failed", error, ... }
```

### LLM Call Flow

```
Stage → llmProvider.completeJSON()
  ├─> Construct messages (system + user)
  ├─> Generate promptHash (SHA256)
  ├─> Apply timeout guard
  ├─> Call external LLM API
  │    ├─> OpenAI: POST /v1/chat/completions
  │    └─> Anthropic: POST /v1/messages
  ├─> Validate response with Zod
  ├─> Log provider_call event
  │    { promptVersion, promptHash, promptLength,
  │      durationMs, tokens, cost }
  └─> Return typed result
```

---

## Service Layers

### Layer 1: HTTP & WebSocket
- **Express Server**: HTTP request handling
- **WebSocket Manager**: Real-time bidirectional communication
- **Middleware Stack**: Request processing pipeline

### Layer 2: Controllers
- **Search Controller**: Main search orchestration
- **Analytics Controller**: Event tracking
- **Request Validation**: Zod-based input validation

### Layer 3: Business Logic
- **ROUTE2 Pipeline**: Multi-stage search processing
- **Stage Execution**: Independent, testable stages
- **Domain Logic**: Search-specific rules

### Layer 4: Infrastructure
- **LLM Integration**: Provider abstraction
- **Logging**: Structured observability
- **Caching**: Performance optimization
- **Reliability**: Error handling patterns

---

## Integration Points

### External APIs

#### OpenAI
```
Endpoint: https://api.openai.com/v1/chat/completions
Auth: Bearer token (OPENAI_API_KEY)
Model: gpt-4o-mini (configurable)
Features: Structured outputs, JSON schema
```

#### Anthropic
```
Endpoint: https://api.anthropic.com/v1/messages
Auth: x-api-key header (ANTHROPIC_API_KEY)
Model: claude-3-sonnet
Features: System prompts, tool use
```

#### Google Places
```
Endpoint: https://maps.googleapis.com/maps/api/place/
Auth: API key (GOOGLE_API_KEY)
APIs: Text Search, Nearby Search, Find Place
```

### Internal Communication

#### HTTP Routes
```
POST /v1/search       → Search endpoint
GET  /v1/search/stats → Pipeline statistics
POST /v1/analytics/events → Event tracking
```

#### WebSocket Protocol
```
Client → Server:
  { type: "subscribe", requestId: "..." }
  { type: "unsubscribe", requestId: "..." }
  { type: "ping" }

Server → Client:
  { type: "update", requestId: "...", data: {...} }
  { type: "complete", requestId: "...", data: {...} }
  { type: "error", requestId: "...", error: "..." }
  { type: "pong" }
```

---

## Error Handling

### Error Flow

```
Error occurs in pipeline stage
  ↓
Stage catches error
  ↓
Logs stage_failed event
  ↓
Returns fallback result (if possible)
  OR throws error
  ↓
Orchestrator catches error
  ↓
Logs search_failed event
  ↓
Controller catches error
  ↓
Error middleware transforms to client-safe response
  ↓
Client receives structured error:
  {
    error: "User-friendly message",
    code: "ERROR_CODE",
    details: { ... }
  }
```

### Error Categories

1. **Validation Errors**: Bad request data (400)
2. **Configuration Errors**: Missing API keys, bad config (500)
3. **External API Errors**: LLM or Google API failures (503)
4. **Timeout Errors**: Stage exceeds time limit (504)
5. **Unknown Errors**: Unexpected failures (500)

---

## Observability

### Logging Strategy

```
Request Level:
  search_started
    → stage_started (gate2)
      → provider_call (LLM)
      → stage_completed (gate2)
    → stage_started (intent2)
      → provider_call (LLM)
      → stage_completed (intent2)
    → stage_started (route_llm)
      → stage_completed (route_llm)
    → stage_started (google_maps)
      → stage_completed (google_maps)
  → search_completed
```

### Key Metrics

- **Request Duration**: Total pipeline time
- **Stage Duration**: Individual stage times
- **LLM Metrics**: Tokens, cost, latency
- **Cache Metrics**: Hit rate, size, evictions
- **Error Rates**: By stage and type

### Tracing

- **Request ID**: Unique per request
- **Trace ID**: Optional distributed tracing
- **Session ID**: User session tracking
- **Prompt Version**: LLM prompt tracking

---

## Performance Characteristics

### Target Latencies

- **Gate2**: <900ms (LLM call)
- **Intent2**: <2000ms (LLM call)
- **Route-LLM**: <100ms (logic only)
- **Google-Maps**: <1000ms (API call)
- **Total Pipeline**: <4000ms (end-to-end)

### Scalability

- **Stateless**: No in-process state (horizontally scalable)
- **Concurrent Requests**: Backpressure handling
- **Rate Limiting**: Configurable per endpoint
- **Caching**: In-memory (single instance) or Redis (multi-instance)

---

## Security Considerations

### API Key Management
- Environment variables only
- Never committed to git
- Redacted in logs

### Request Validation
- Zod schema validation
- Input sanitization
- Type safety

### Error Handling
- No stack traces in production
- Safe error messages
- Detailed logging server-side

### CORS & Origins
- Configurable allowed origins
- WebSocket origin validation
- Production security checks

---

## Next Steps

For detailed technical specifications:
- [INFRASTRUCTURE_LOW_LEVEL.md](./INFRASTRUCTURE_LOW_LEVEL.md)

For pipeline documentation:
- [ROUTE2 README](../server/src/services/search/route2/README.md)
