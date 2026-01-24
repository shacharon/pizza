# 🏗️ Architecture Overview - Route2 Search Pipeline

## Table of Contents
1. [System Flow Overview](#system-flow-overview)
2. [Entry Points & Routing](#entry-points--routing)
3. [Pipeline Architecture](#pipeline-architecture)
4. [Directory Structure](#directory-structure)
5. [Key Components](#key-components)

---

## System Flow Overview

```
HTTP Request
    ↓
server.ts (Boot & Config)
    ↓
app.ts (Express App Setup)
    ↓
routes/v1/index.ts (API Routes)
    ↓
controllers/search/search.controller.ts (HTTP Handler)
    ↓
services/search/route2/route2.orchestrator.ts (PIPELINE BRAIN)
    ↓
    ├─ stages/gate2.stage.ts (Food Signal Check)
    ├─ stages/intent/intent.stage.ts (Route Decision)
    ├─ stages/route-llm/*.mapper.ts (Query Mapping)
    ├─ shared/base-filters-llm.ts (Filter Extraction)
    ├─ stages/post-constraints/post-constraints.stage.ts (Post Constraints)
    ├─ stages/google-maps.stage.ts (Google API Call)
    └─ post-filters/post-results.filter.ts (Result Filtering)
    ↓
HTTP Response + WebSocket Events
```

---

## Entry Points & Routing

### 1. **`server/src/server.ts`** - Application Bootstrap
**Role**: Main entry point that starts the Express server

```typescript
// Key responsibilities:
- Load environment variables (dotenv)
- Initialize singleton services (Redis, WebSocket, State Store)
- Create Express app via createApp()
- Start HTTP server on port 3000
- Set up graceful shutdown handlers
```

**Path**: `server/src/server.ts`

---

### 2. **`server/src/app.ts`** - Express Application Factory
**Role**: Creates and configures the Express app

```typescript
// Key responsibilities:
- Apply middleware (CORS, Helmet, Compression, JSON parser)
- Mount request context & logging middleware
- Create and mount API v1 router at /api/v1
- Mount legacy API router at /api (deprecated)
- Add health check endpoint at /healthz
- Add centralized error handler
```

**Path**: `server/src/app.ts`

**Mounts**:
- `/api/v1` → V1 Router (canonical)
- `/api` → V1 Router (legacy, deprecated)
- `/healthz` → Health check

---

### 3. **`server/src/routes/v1/index.ts`** - API Route Aggregator
**Role**: Central router that organizes all v1 API endpoints

```typescript
// Route structure:
createV1Router() {
  router.use('/search', searchRouter);       // → /api/v1/search
  router.use('/analytics', analyticsRouter); // → /api/v1/analytics
  return router;
}
```

**Path**: `server/src/routes/v1/index.ts`

**Exposed Endpoints**:
- `POST /api/v1/search` → Main search endpoint
- `GET /api/v1/search/stats` → Search statistics
- `GET /api/v1/search/:requestId/result` → Async search result polling
- `POST /api/v1/analytics/events` → Analytics tracking

---

### 4. **`server/src/controllers/search/search.controller.ts`** - Search HTTP Handler
**Role**: HTTP controller that handles search requests and calls the Route2 orchestrator

```typescript
// Key responsibilities:
- Validate incoming search requests
- Create LLM provider instance
- Build Route2Context (requestId, traceId, sessionId, etc.)
- Call searchRoute2() orchestrator
- Handle sync vs async modes
- Manage WebSocket notifications
- Store results in job store
- Return HTTP response
```

**Path**: `server/src/controllers/search/search.controller.ts`

**Routes Defined**:
```typescript
router.post('/', searchHandler);              // POST /search
router.get('/stats', statsHandler);           // GET /search/stats
router.get('/:requestId/result', resultHandler); // GET /search/:id/result
```

**Key Function**:
```typescript
const response = await searchRoute2(validatedRequest, route2Context);
```

---

## Pipeline Architecture

### 5. **`server/src/services/search/route2/route2.orchestrator.ts`** - THE BRAIN 🧠
**Role**: Main pipeline orchestrator that coordinates all search stages

This is the **"conductor of the orchestra"** you asked about!

```typescript
export async function searchRoute2(
  request: SearchRequest,
  ctx: Route2Context
): Promise<SearchResponse>
```

**Pipeline Flow**:

```
┌─────────────────────────────────────────────────────────────┐
│  ROUTE2 ORCHESTRATOR - Pipeline Stages                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. GATE2                                                    │
│     ├─ executeGate2Stage()                                  │
│     ├─ Check: Is this a food-related query?                 │
│     └─ Output: CONTINUE / STOP / ASK_CLARIFY               │
│                                                              │
│  2. INTENT                                                   │
│     ├─ executeIntentStage()                                 │
│     ├─ Decide: TEXTSEARCH / NEARBY / LANDMARK              │
│     └─ Output: route, region, language, confidence          │
│                                                              │
│  3. ROUTE_LLM                                                │
│     ├─ executeRouteLLM() → dispatcher                       │
│     ├─ Calls: textsearch.mapper / nearby.mapper / landmark  │
│     └─ Output: Google API parameters (textQuery, etc.)      │
│                                                              │
│  4. PARALLEL FILTERS                                         │
│     ├─ Promise.all([                                        │
│     │    resolveBaseFiltersLLM(),                           │
│     │    executePostConstraintsStage()                      │
│     │  ])                                                    │
│     ├─ Base: language, openState, regionHint               │
│     └─ Post: priceLevel, isKosher, requirements            │
│                                                              │
│  5. FILTERS_RESOLVED                                         │
│     ├─ resolveFilters()                                     │
│     └─ Merge base + intent + device region                  │
│                                                              │
│  6. GOOGLE_MAPS                                              │
│     ├─ executeGoogleMapsStage()                             │
│     ├─ Calls: Google Places API (Text/Nearby/Landmark)     │
│     └─ Output: 20 raw place results                         │
│                                                              │
│  7. POST_FILTERS                                             │
│     ├─ applyPostFilters()                                   │
│     ├─ Filter by: openState, openAt, openBetween           │
│     └─ Output: Filtered results                             │
│                                                              │
│  8. RESPONSE_BUILD                                           │
│     ├─ Transform to SearchResponse DTO                      │
│     └─ Add metadata (timing, filters, confidence)           │
│                                                              │
│  9. WS_PUBLISH                                               │
│     ├─ publishToChannel('search', requestId)                │
│     └─ Notify frontend via WebSocket                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Path**: `server/src/services/search/route2/route2.orchestrator.ts`

---

## Directory Structure

```
server/src/
├── server.ts                          ← 🚀 Boot (entry point)
├── app.ts                             ← 🔧 Express app factory
│
├── routes/
│   └── v1/
│       └── index.ts                   ← 🗺️ API route aggregator
│
├── controllers/
│   └── search/
│       └── search.controller.ts       ← 🎮 HTTP handler (calls orchestrator)
│
├── services/
│   └── search/
│       └── route2/
│           ├── route2.orchestrator.ts ← 🧠 PIPELINE BRAIN (main conductor)
│           │
│           ├── stages/                ← 🎭 Individual pipeline stages
│           │   ├── gate2.stage.ts           (Food signal check)
│           │   ├── intent/
│           │   │   ├── intent.stage.ts      (Route decision)
│           │   │   └── intent.prompt.ts     (LLM prompt)
│           │   ├── route-llm/
│           │   │   ├── textsearch.mapper.ts (Text search params)
│           │   │   ├── nearby.mapper.ts     (Nearby search params)
│           │   │   ├── landmark.mapper.ts   (Landmark search params)
│           │   │   ├── schemas.ts           (Zod validation)
│           │   │   └── static-schemas.ts    (OpenAI JSON schemas)
│           │   ├── google-maps.stage.ts     (Google API caller)
│           │   └── post-constraints/
│           │       └── post-constraints.stage.ts (Post-filter constraints)
│           │
│           ├── shared/                ← 🔀 Shared filter logic
│           │   ├── base-filters-llm.ts      (LLM filter extraction)
│           │   ├── filters-resolver.ts      (Merge filters)
│           │   └── shared-filters.types.ts  (Filter schemas)
│           │
│           ├── post-filters/          ← 🎯 Result filtering
│           │   └── post-results.filter.ts   (Deterministic filters)
│           │
│           ├── prompts/                ← 📝 LLM prompts
│           │   ├── gate2.prompt.ts
│           │   ├── base-filters.prompt.ts
│           │   └── post-constraints.prompt.ts
│           │
│           └── types.ts                ← 📦 Pipeline types
│
├── llm/                               ← 🤖 LLM providers
│   ├── factory.ts                          (Create LLM provider)
│   ├── openai.provider.ts                  (OpenAI implementation)
│   └── types.ts                            (LLM interfaces)
│
├── infra/                             ← 🏗️ Infrastructure
│   ├── websocket/
│   │   ├── websocket-manager.ts            (WS connection manager)
│   │   ├── search-ws.publisher.ts          (Search event publisher)
│   │   └── assistant-ws.publisher.ts       (Assistant msg publisher)
│   └── state/
│       └── in-memory-request-store.ts      (Request state cache)
│
├── middleware/                        ← 🛡️ Express middleware
│   ├── requestContext.middleware.ts        (Add requestId, logger)
│   ├── httpLogging.middleware.ts           (HTTP access logs)
│   └── error.middleware.ts                 (Centralized error handler)
│
├── config/                            ← ⚙️ Configuration
│   ├── env.ts                              (Environment variables)
│   ├── route2.flags.ts                     (Feature flags)
│   └── assistant.flags.ts                  (Assistant mode config)
│
└── lib/                               ← 🔧 Utilities
    ├── logger/
    │   └── structured-logger.ts            (Pino logger instance)
    ├── telemetry/
    │   ├── stage-timer.ts                  (Stage timing helpers)
    │   └── query-sanitizer.ts              (PII redaction)
    └── cache/
        └── googleCacheService.ts           (Redis L1/L2 cache)
```

---

## Key Components

### HTTP Layer

| Component | Path | Role |
|-----------|------|------|
| **server.ts** | `src/server.ts` | Application entry point |
| **app.ts** | `src/app.ts` | Express app factory |
| **V1 Router** | `src/routes/v1/index.ts` | API route aggregator |
| **Search Controller** | `src/controllers/search/search.controller.ts` | HTTP request handler |

### Pipeline Layer (Route2)

| Component | Path | Role |
|-----------|------|------|
| **Orchestrator** 🧠 | `src/services/search/route2/route2.orchestrator.ts` | **Main pipeline conductor** |
| **Gate2 Stage** | `src/services/search/route2/stages/gate2.stage.ts` | Food signal classifier |
| **Intent Stage** | `src/services/search/route2/stages/intent/intent.stage.ts` | Route decision (TEXTSEARCH/NEARBY/LANDMARK) |
| **Route-LLM** | `src/services/search/route2/stages/route-llm/*.mapper.ts` | Query → Google params |
| **Base Filters** | `src/services/search/route2/shared/base-filters-llm.ts` | Extract filters via LLM |
| **Post Constraints** | `src/services/search/route2/stages/post-constraints/post-constraints.stage.ts` | Extract post-filters via LLM |
| **Google Maps** | `src/services/search/route2/stages/google-maps.stage.ts` | Google Places API caller |
| **Post Filters** | `src/services/search/route2/post-filters/post-results.filter.ts` | Deterministic filtering |

### Infrastructure Layer

| Component | Path | Role |
|-----------|------|------|
| **WebSocket Manager** | `src/infra/websocket/websocket-manager.ts` | WS connection lifecycle |
| **Redis Client** | `src/lib/redis/redis-client.ts` | Shared Redis singleton |
| **Job Store** | `src/services/search/job-store/` | Async search state storage |
| **Logger** | `src/lib/logger/structured-logger.ts` | Structured logging (Pino) |

---

## Request Flow Example

### Example: User searches "pizza open now"

```
┌──────────────────────────────────────────────────────────────┐
│ 1. HTTP Request                                               │
│    POST /api/v1/search                                        │
│    Body: { query: "pizza open now" }                         │
└────────────────────┬─────────────────────────────────────────┘
                     ↓
┌──────────────────────────────────────────────────────────────┐
│ 2. server.ts                                                  │
│    - Receives request on port 3000                           │
│    - Routes to Express app                                    │
└────────────────────┬─────────────────────────────────────────┘
                     ↓
┌──────────────────────────────────────────────────────────────┐
│ 3. app.ts                                                     │
│    - Apply middleware (context, logging)                     │
│    - Route to /api/v1 → V1 Router                           │
└────────────────────┬─────────────────────────────────────────┘
                     ↓
┌──────────────────────────────────────────────────────────────┐
│ 4. routes/v1/index.ts                                        │
│    - Match /search → searchRouter                            │
└────────────────────┬─────────────────────────────────────────┘
                     ↓
┌──────────────────────────────────────────────────────────────┐
│ 5. search.controller.ts                                      │
│    - Validate request body                                    │
│    - Create LLM provider                                      │
│    - Build Route2Context                                      │
│    - Call: searchRoute2(request, context)                    │
└────────────────────┬─────────────────────────────────────────┘
                     ↓
┌──────────────────────────────────────────────────────────────┐
│ 6. route2.orchestrator.ts ← THE BRAIN! 🧠                   │
│    ┌──────────────────────────────────────────────────────┐ │
│    │ GATE2: Is "pizza open now" food-related?            │ │
│    │ → YES (confidence: 0.9)                              │ │
│    └──────────────────────────────────────────────────────┘ │
│    ┌──────────────────────────────────────────────────────┐ │
│    │ INTENT: What route?                                  │ │
│    │ → TEXTSEARCH (no location, so not NEARBY)           │ │
│    └──────────────────────────────────────────────────────┘ │
│    ┌──────────────────────────────────────────────────────┐ │
│    │ ROUTE_LLM: Map to Google params                     │ │
│    │ → textQuery: "pizza open now"                       │ │
│    └──────────────────────────────────────────────────────┘ │
│    ┌──────────────────────────────────────────────────────┐ │
│    │ PARALLEL FILTERS:                                    │ │
│    │   BASE_FILTERS → { openState: "OPEN_NOW" }          │ │
│    │   POST_CONSTRAINTS → { openState: "OPEN_NOW" }      │ │
│    └──────────────────────────────────────────────────────┘ │
│    ┌──────────────────────────────────────────────────────┐ │
│    │ GOOGLE_MAPS: Call Google Places API                 │ │
│    │ → Returns 20 pizza places                           │ │
│    └──────────────────────────────────────────────────────┘ │
│    ┌──────────────────────────────────────────────────────┐ │
│    │ POST_FILTERS: Filter by openState                   │ │
│    │ → Keep only places with openNow=true                │ │
│    │ → 20 results → 15 results (5 closed filtered out)   │ │
│    └──────────────────────────────────────────────────────┘ │
│    ┌──────────────────────────────────────────────────────┐ │
│    │ RESPONSE_BUILD: Format results                       │ │
│    │ → Add metadata, timing, filters applied              │ │
│    └──────────────────────────────────────────────────────┘ │
│    ┌──────────────────────────────────────────────────────┐ │
│    │ WS_PUBLISH: Notify frontend                          │ │
│    │ → publishToChannel('search', requestId)              │ │
│    └──────────────────────────────────────────────────────┘ │
└────────────────────┬─────────────────────────────────────────┘
                     ↓
┌──────────────────────────────────────────────────────────────┐
│ 7. HTTP Response                                              │
│    Status: 200                                                │
│    Body: {                                                    │
│      success: true,                                          │
│      results: [ ... 15 open pizza places ... ],             │
│      meta: { tookMs: 7400, confidence: 0.9 }                │
│    }                                                          │
└──────────────────────────────────────────────────────────────┘
```

---

## API Endpoints Reference

### Search Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/search` | Main search (sync/async) |
| `GET` | `/api/v1/search/stats` | Search statistics |
| `GET` | `/api/v1/search/:requestId/result` | Poll async search result |

### WebSocket

| Path | Description |
|------|-------------|
| `ws://localhost:3000/ws` | WebSocket connection for real-time updates |

**Channels**:
- `search` - Search progress & results
- `assistant` - Assistant messages (if enabled)

---

## Configuration Files

| File | Purpose |
|------|---------|
| `server/src/config/env.ts` | Environment variables (Redis, OpenAI, Google API) |
| `server/src/config/route2.flags.ts` | Feature flags (`ROUTE2_ENABLED`) |
| `server/src/config/assistant.flags.ts` | Assistant mode config |
| `server/.env` | Local environment variables (not in git) |

---

## Key Exports

### From `route2/index.ts`:
```typescript
export { searchRoute2 } from './route2.orchestrator.js';
export type { Route2Context } from './types.js';
```

### From `search.controller.ts`:
```typescript
export default router; // Express router mounted at /search
```

### From `v1/index.ts`:
```typescript
export function createV1Router(): Router;
```

---

## Summary

### "Who manages the orchestra?"
**Answer**: `route2.orchestrator.ts` is the main conductor that coordinates all pipeline stages.

### "Where are all the paths?"
**Answer**: 
1. **Entry**: `server.ts` (boot)
2. **App Setup**: `app.ts` (Express config)
3. **API Routes**: `routes/v1/index.ts` (route aggregator)
4. **HTTP Handler**: `controllers/search/search.controller.ts` (calls orchestrator)
5. **Pipeline Brain**: `services/search/route2/route2.orchestrator.ts` (stage coordinator)

---

## Quick Reference

**Start Server**:
```bash
cd server
npm run dev  # Development mode with hot reload
```

**Build**:
```bash
cd server
npm run build  # Compile TypeScript
```

**Test Search**:
```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza open now"}'
```

---

**Last Updated**: 2026-01-20  
**Pipeline Version**: Route2 (with parallel filters)
