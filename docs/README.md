# Piza Backend Documentation

> **Last Updated:** January 2026  
> **Current Architecture:** ROUTE2 Pipeline

---

## Quick Start

If you're new to this codebase, start here:

1. 📜 **[Infrastructure Overview](./INFRASTRUCTURE_OVERVIEW.md)** - Executive summary of the system
2. 🏗️ **[Infrastructure High-Level](./INFRASTRUCTURE_HIGH_LEVEL.md)** - Component relationships and data flow
3. 🔧 **[Infrastructure Low-Level](./INFRASTRUCTURE_LOW_LEVEL.md)** - Technical specifications and implementation details

---

## System Overview

The Piza search backend is a **Node.js + TypeScript** application featuring a clean **ROUTE2 pipeline architecture** that processes natural language food search queries through multiple stages using Large Language Models (LLMs).

### Core Architecture

```
Client Request
    ↓
Express Server (Middleware Stack)
    ↓
Search Controller
    ↓
ROUTE2 Pipeline:
  1. GATE2: Language + Food Classification (LLM)
  2. INTENT2: Intent Extraction (LLM)
  3. ROUTE_LLM: Search Strategy (Logic)
  4. GOOGLE_MAPS: Places API Execution
    ↓
Structured Response
```

---

## Documentation Structure

### 🎯 Infrastructure Documentation (Core)

| Document | Purpose | Audience |
|----------|---------|----------|
| [**INFRASTRUCTURE_OVERVIEW.md**](./INFRASTRUCTURE_OVERVIEW.md) | Executive summary, system architecture, design principles | Everyone |
| [**INFRASTRUCTURE_HIGH_LEVEL.md**](./INFRASTRUCTURE_HIGH_LEVEL.md) | Component relationships, data flow, integration points | Architects, Senior Engineers |
| [**INFRASTRUCTURE_LOW_LEVEL.md**](./INFRASTRUCTURE_LOW_LEVEL.md) | Technical specs, implementation details, code examples | Engineers |

### 🔧 Pipeline Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| **ROUTE2 README** | `../server/src/services/search/route2/README.md` | Pipeline stages, contracts, LLM prompts |

### 🚀 CI/CD Documentation

| Document | Purpose | Status |
|----------|---------|--------|
| [**CI_INTEGRATION.md**](./CI_INTEGRATION.md) | Bitbucket Pipelines setup | Legacy (may need update) |

---

## Key Concepts

### ROUTE2 Pipeline Stages

#### 1. GATE2 - Classification Stage
- **Purpose**: Fast food/non-food classification + language detection
- **Input**: Raw query text
- **Output**: `isFoodRelated`, `language`, `confidence`, `route` (CONTINUE/BYPASS)
- **LLM**: Yes (900ms timeout)
- **Prompt Version**: `gate2_v4`

#### 2. INTENT2 - Extraction Stage
- **Purpose**: Extract food type, location, and search mode
- **Input**: Query text + Gate2 result
- **Output**: Food, location, mode (nearby/landmark/textsearch), region
- **LLM**: Yes (2000ms timeout)
- **Prompt Version**: `intent2_v2`

#### 3. ROUTE_LLM - Strategy Stage
- **Purpose**: Determine final search parameters
- **Input**: Intent2 result
- **Output**: Search mode, radius
- **LLM**: No (pure logic)

#### 4. GOOGLE_MAPS - Execution Stage
- **Purpose**: Call Google Places API and return results
- **Input**: Route decision + intent
- **Output**: Restaurant results
- **LLM**: No

### LLM Integration

```typescript
// All LLM calls go through:
llmProvider.completeJSON(
  messages: Message[],
  schema: ZodSchema,
  options: { temperature, timeout, model }
): Promise<T>

// Supported providers:
- OpenAI (default: gpt-4o-mini)
- Anthropic (claude-3-sonnet)
```

### Infrastructure Services

- **Logger**: Pino with daily rotation, structured JSON logs
- **Cache**: In-memory TTL-based caching
- **Reliability**: Retry policies, timeout guards
- **WebSocket**: Real-time updates (currently unused, reserved for future)
- **State Store**: Request state management
- **Metrics**: Performance tracking, LLM telemetry

---

## Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript (strict mode)
- **Framework**: Express.js
- **Logger**: Pino
- **LLM**: OpenAI GPT-4o-mini (default), Anthropic Claude
- **Validation**: Zod schemas
- **External APIs**: Google Places API
- **WebSocket**: ws library

---

## Configuration

### Environment Variables

```env
# LLM
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...
LLM_PROVIDER=openai
DEFAULT_LLM_MODEL=gpt-4o-mini

# Search
ROUTE2_ENABLED=true
DEFAULT_REGION_CODE=IL
GOOGLE_API_KEY=...

# Server
PORT=3000
NODE_ENV=production

# Logging
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_DIR=./logs

# WebSocket
WS_ALLOWED_ORIGINS=https://app.piza.co
```

---

## File Locations

### Key Backend Files

**Controllers:**
- `server/src/controllers/search/search.controller.ts` - Main search endpoint

**ROUTE2 Pipeline:**
- `server/src/services/search/route2/route2.orchestrator.ts` - Pipeline orchestrator
- `server/src/services/search/route2/stages/gate2.stage.ts` - Stage 1
- `server/src/services/search/route2/stages/intent2.stage.ts` - Stage 2
- `server/src/services/search/route2/stages/route-llm.stage.ts` - Stage 3
- `server/src/services/search/route2/stages/google-maps.stage.ts` - Stage 4

**LLM:**
- `server/src/llm/factory.ts` - Provider factory
- `server/src/llm/openai.provider.ts` - OpenAI implementation
- `server/src/llm/anthropic.provider.ts` - Anthropic implementation

**Infrastructure:**
- `server/src/lib/logger/structured-logger.ts` - Logging system
- `server/src/lib/cache/cache-manager.ts` - Cache manager
- `server/src/lib/reliability/` - Retry policies, timeout guards
- `server/src/infra/websocket/` - WebSocket manager
- `server/src/infra/state/` - Request state store

**Types:**
- `server/src/services/search/route2/types.ts` - ROUTE2 types
- `server/src/services/search/types/search-request.dto.ts` - Request DTOs
- `server/src/services/search/types/search-response.dto.ts` - Response DTOs

---

## Design Principles

### 1. Observability First
- Every stage logs: `stage_started`, `stage_completed`, `stage_failed`
- Structured JSON logs with request IDs
- LLM calls tracked with prompt versions and hashes

### 2. Reliability
- Configurable timeouts per stage
- Retry policies for transient failures
- Graceful fallbacks for LLM unavailability

### 3. Performance
- In-memory caching with TTL
- Token-sparing LLM prompts
- Fast pipeline (<4s total)

### 4. Maintainability
- TypeScript with strict types
- Clean separation of concerns
- Minimal stage dependencies

---

## Development Workflow

### Adding a New Feature

1. **Read infrastructure docs** to understand current architecture
2. **Identify the appropriate pipeline stage** or infrastructure service
3. **Follow TypeScript strict mode** and existing patterns
4. **Add structured logging** at key points
5. **Update this documentation** if adding new concepts

### Debugging an Issue

1. **Check logs** in `server/logs/` for structured JSON logs
2. **Look for request ID** to trace through pipeline
3. **Review stage timings** and LLM metrics
4. **Check LLM prompt versions** for classification issues

### Modifying Pipeline

1. **Read ROUTE2 README** in `server/src/services/search/route2/`
2. **Update stage contracts** if changing inputs/outputs
3. **Update prompt versions** if changing LLM behavior
4. **Test with various queries** in different languages

---

## Performance Targets

- **Gate2**: <900ms (LLM call)
- **Intent2**: <2000ms (LLM call)
- **Route-LLM**: <100ms (logic only)
- **Google-Maps**: <1000ms (API call)
- **Total Pipeline**: <4000ms (end-to-end)

---

## Architecture Evolution

### Previous Architecture (Removed)
- **V1 Orchestrator**: Monolithic search orchestrator with multiple sub-services
- **Async Mode**: WebSocket-based async assistant (removed, infra kept for future)
- **Phase Documents**: Incremental implementation phases (all completed and archived)

### Current Architecture (Active)
- **ROUTE2 Pipeline**: Clean 4-stage pipeline with clear contracts
- **LLM-First**: Classification and extraction driven by LLMs
- **Deterministic Routing**: Business logic in code, not in prompts

---

## Support & Questions

### Architecture Questions
- See [INFRASTRUCTURE_HIGH_LEVEL.md](./INFRASTRUCTURE_HIGH_LEVEL.md)
- See [INFRASTRUCTURE_OVERVIEW.md](./INFRASTRUCTURE_OVERVIEW.md)

### Implementation Questions
- See [INFRASTRUCTURE_LOW_LEVEL.md](./INFRASTRUCTURE_LOW_LEVEL.md)
- See [ROUTE2 README](../server/src/services/search/route2/README.md)

### Pipeline Questions
- See [ROUTE2 README](../server/src/services/search/route2/README.md) for stage contracts
- Check logs for stage execution details

---

## Document Maintenance

### When to Update

**INFRASTRUCTURE_*.md:**
- When major architectural changes are made
- When new infrastructure services are added
- When technology stack changes

**This README:**
- When new documentation is added
- When architecture evolves significantly
- When key concepts change

**ROUTE2 README:**
- When pipeline stages change
- When LLM prompts are updated
- When contracts evolve

---

## Quick Reference

### Common Tasks

**Start the server:**
```bash
cd server
npm install
npm run dev
```

**Run tests:**
```bash
npm test
```

**Build for production:**
```bash
npm run build
```

**View logs:**
```bash
tail -f server/logs/server.log
```

---

**Last Updated:** January 2026  
**Architecture:** ROUTE2 Pipeline  
**Document Owner:** Engineering Team
