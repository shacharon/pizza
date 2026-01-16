# Infrastructure Overview

## Executive Summary

The Piza search backend infrastructure is built on Node.js with TypeScript, featuring a clean ROUTE2 pipeline architecture that processes natural language food search queries through multiple stages using Large Language Models (LLMs).

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT REQUEST                            │
│                         ↓                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Express.js Server                        │  │
│  │  • Middleware (Logging, Context, Error Handling)      │  │
│  │  • Routes (v1/search, v1/analytics)                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            Search Controller                          │  │
│  │  • Request Validation                                 │  │
│  │  • LLM Provider Initialization                        │  │
│  │  • Pipeline Context Setup                             │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         ROUTE2 Pipeline (4 Stages)                    │  │
│  │                                                        │  │
│  │  1. GATE2: Language + Food Classification             │  │
│  │     • LLM-based detection                             │  │
│  │     • Route: CONTINUE or BYPASS                       │  │
│  │                                                        │  │
│  │  2. INTENT2: Intent Extraction                        │  │
│  │     • Food & location parsing                         │  │
│  │     • Mode selection (nearby/landmark/textsearch)     │  │
│  │     • Region detection                                │  │
│  │                                                        │  │
│  │  3. ROUTE_LLM: Search Strategy                        │  │
│  │     • Determine search mode & radius                  │  │
│  │                                                        │  │
│  │  4. GOOGLE_MAPS: Places API Execution                │  │
│  │     • Call Google Places API                          │  │
│  │     • Return restaurant results                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Infrastructure Layer                      │  │
│  │  • LLM Providers (OpenAI, Anthropic)                  │  │
│  │  • Structured Logger (Pino)                           │  │
│  │  • Cache Manager                                      │  │
│  │  • Reliability (Retry, Timeout)                       │  │
│  │  • WebSocket Manager (async support)                  │  │
│  │  • Request State Store                                │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. **ROUTE2 Pipeline**
- Clean, staged architecture for search processing
- LLM-driven classification and extraction
- Deterministic routing logic
- Observable with structured logging

### 2. **Infrastructure Services**
- **Logger**: Pino-based structured logging with daily rotation
- **Cache**: In-memory TTL-based caching
- **LLM**: Pluggable providers (OpenAI, Anthropic)
- **Reliability**: Retry policies and timeout guards
- **WebSocket**: Real-time updates for async operations
- **Metrics**: Performance tracking and telemetry

### 3. **Request Flow**
1. Request arrives at Express endpoint
2. Validation and context setup
3. ROUTE2 pipeline execution (4 stages)
4. Response with structured results
5. Logging and metrics collection

## Key Design Principles

### Observability First
- Every pipeline stage logs: `stage_started`, `stage_completed`, `stage_failed`
- Structured JSON logs with request IDs for tracing
- Prompt versions and hashes for LLM calls

### Reliability
- Configurable timeouts at each stage
- Retry policies for transient failures
- Graceful fallbacks for LLM unavailability
- Backpressure handling for concurrent requests

### Performance
- In-memory caching with TTL
- Request deduplication for identical queries
- Token-sparing LLM prompts
- Fast pipeline stages (<2s total)

### Maintainability
- TypeScript with strict types
- Clean separation of concerns
- Minimal dependencies between stages
- Comprehensive error handling

## Infrastructure Layers

### Layer 1: HTTP Server
- Express.js application
- Middleware stack (logging, context, error handling)
- Route handlers

### Layer 2: Business Logic
- Search controller (orchestration)
- ROUTE2 pipeline (domain logic)
- Validation and error transformation

### Layer 3: Services
- LLM providers (abstracted interface)
- State management (request store)
- Real-time communication (WebSocket)

### Layer 4: Utilities
- Structured logging
- Caching
- Reliability patterns (retry, timeout)
- Performance metrics
- Telemetry and audit trails

## Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript (strict mode)
- **Web Framework**: Express.js
- **Logger**: Pino (with rotation)
- **LLM**: OpenAI GPT-4o-mini (default), Anthropic Claude
- **WebSocket**: ws library
- **Validation**: Zod schemas
- **External APIs**: Google Places API

## Configuration

All infrastructure components are configurable via environment variables:

```env
# LLM Configuration
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...
LLM_PROVIDER=openai
DEFAULT_LLM_MODEL=gpt-4o-mini

# Search Configuration
ROUTE2_ENABLED=true
DEFAULT_REGION_CODE=IL

# Server Configuration
PORT=3000
NODE_ENV=production

# Logging
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_DIR=./logs

# WebSocket
WS_ALLOWED_ORIGINS=https://app.piza.co

# Google Places
GOOGLE_API_KEY=...
```

## Deployment Considerations

### Horizontal Scaling
- Stateless design (no in-process state)
- WebSocket requires sticky sessions or Redis pub/sub
- Cache can be replaced with Redis for multi-instance

### Monitoring
- Structured logs to stdout (compatible with CloudWatch, DataDog)
- Request IDs for distributed tracing
- Performance metrics exposed via /stats endpoint

### Error Handling
- All errors caught and transformed to client-safe messages
- Stack traces never exposed in production
- Detailed logging for debugging

## Next Steps

For detailed architecture documentation, see:
- [INFRASTRUCTURE_HIGH_LEVEL.md](./INFRASTRUCTURE_HIGH_LEVEL.md) - Component relationships and data flow
- [INFRASTRUCTURE_LOW_LEVEL.md](./INFRASTRUCTURE_LOW_LEVEL.md) - Technical specifications and implementation details

For pipeline-specific documentation, see:
- [ROUTE2 README](../server/src/services/search/route2/README.md) - Pipeline stages and contracts
