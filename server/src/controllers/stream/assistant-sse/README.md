# Assistant SSE Module

Clean, SOLID/OOP refactor of the Assistant SSE streaming endpoint.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  assistant-sse.router.ts                    │
│              (Express route wiring + DI setup)              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ delegates to
                       ▼
┌─────────────────────────────────────────────────────────────┐
│             assistant-sse.orchestrator.ts                   │
│         (Main flow coordinator - CLARIFY vs SEARCH)         │
└─────┬─────┬─────┬─────┬─────┬─────────────────────────────┘
      │     │     │     │     │
      │     │     │     │     └──────────────────┐
      │     │     │     │                        │
      ▼     ▼     ▼     ▼                        ▼
   ┌────┐ ┌────┐ ┌────┐ ┌────┐              ┌────────┐
   │SSE │ │Narr│ │Own.│ │Ctx │              │Result  │
   │Wtr │ │Tmpl│ │Val.│ │Bld │              │Waiter  │
   └────┘ └────┘ └────┘ └────┘              └────────┘
     │      │      │      │                      │
     └──────┴──────┴──────┴──────────────────────┘
                     │
                     ▼
              ┌──────────────┐
              │  models.ts   │
              │   (Types)    │
              └──────────────┘
```

## Module Responsibilities

### `assistant-sse.router.ts`
- Express route wiring: `GET /assistant/:requestId`
- Dependency injection setup
- Initializes orchestrator with config

### `assistant-sse.orchestrator.ts`
- **Main coordinator** - orchestrates entire SSE flow
- Branches on decision type (CLARIFY/STOPPED vs SEARCH)
- Manages client disconnect and error handling
- Delegates to specialized modules

### `sse-writer.ts`
- Sets SSE headers (`Content-Type`, `Cache-Control`, etc.)
- Formats and sends SSE events (`meta`, `message`, `error`, `done`)
- Manages response stream lifecycle

### `narration-templates.ts`
- Localized narration strings (he, en, ru, ar, fr, es)
- Localized timeout messages
- No LLM - deterministic template resolution

### `ownership-validator.ts`
- Best-effort job ownership validation
- Checks `ownerSessionId` and `ownerUserId`
- Graceful fallback if JobStore unavailable

### `assistant-context-builder.ts`
- Reconstructs `AssistantContext` from job/result
- Extracts top 3 restaurant names for SUMMARY
- Falls back to GENERIC_QUERY_NARRATION if needed

### `result-waiter.ts`
- Polls job status until `DONE_SUCCESS` or timeout
- Configurable poll interval and timeout
- Supports abort signals and client disconnect

### `models.ts`
- Type definitions for all SSE payloads
- `SseMetaPayload`, `SseMessagePayload`, `SseErrorPayload`, `SseDonePayload`
- Internal types: `OwnershipValidationResult`, `PollResult`

## Flow Diagram

### CLARIFY/STOPPED Flow
```
Client Request
  │
  ├─► Validate Ownership
  │     │
  │     ├─► Send Meta Event
  │     │
  │     ├─► Build Context (from job/result)
  │     │
  │     ├─► Generate LLM Message (CLARIFY or STOPPED)
  │     │
  │     ├─► Send Message Event
  │     │
  │     └─► Send Done Event
  │
  └─► End
```

### SEARCH Flow
```
Client Request
  │
  ├─► Validate Ownership
  │     │
  │     ├─► Send Meta Event
  │     │
  │     ├─► Send Narration Template (immediate, no LLM)
  │     │
  │     ├─► Poll for Results (up to timeout)
  │     │     │
  │     │     ├─► Results Ready?
  │     │     │     │
  │     │     │     ├─► YES: Generate SUMMARY (LLM)
  │     │     │     │         Send Message Event
  │     │     │     │
  │     │     │     └─► NO: Send Timeout Template (no LLM)
  │     │     │             Send Message Event
  │     │
  │     └─► Send Done Event
  │
  └─► End
```

## Configuration

Environment variables (unchanged):
- `ASSISTANT_SSE_TIMEOUT_MS` - SSE timeout in milliseconds (default: 20000)
- Poll interval hardcoded: 400ms

## Testing

Run existing smoke test:
```bash
./test-assistant-sse.sh
```

Expected flows:
1. **CLARIFY/STOP**: `meta` → `message(CLARIFY/STOP)` → `done`
2. **SEARCH**: `meta` → `message(GENERIC_QUERY_NARRATION)` → `message(SUMMARY)` → `done`
3. **SEARCH (timeout)**: `meta` → `message(GENERIC_QUERY_NARRATION)` → `message(timeout)` → `done`

## Dependencies

- `searchJobStore` - Job storage abstraction (Redis or in-memory)
- `createLLMProvider` - LLM provider factory
- `generateAssistantMessage` - LLM service for assistant messages
- `authSessionOrJwt` - Authentication middleware
- `logger` - Structured logger (pino)

## API Contract (unchanged)

**Endpoint**: `GET /api/v1/stream/assistant/:requestId`

**Auth**: Session cookie (preferred) or Bearer JWT

**SSE Events**:
- `meta`: Initial metadata
- `message`: Assistant message (AssistantOutput shape)
- `done`: Stream completion
- `error`: Error event

**Error Codes**:
- `UNAUTHORIZED` - Ownership validation failed
- `LLM_TIMEOUT` - LLM timeout
- `ABORTED` - Request aborted
- `LLM_FAILED` - LLM error

## Design Principles

✅ **SOLID**
- Single Responsibility: Each class has one clear purpose
- Open/Closed: Easy to extend without modification
- Liskov Substitution: Proper abstractions
- Interface Segregation: Focused interfaces
- Dependency Inversion: Constructor injection

✅ **KISS**
- No over-engineering
- Clear, simple naming
- Minimal abstractions

✅ **OOP**
- Constructor injection
- No global state
- Clear public/private boundaries

✅ **Testability**
- Easy to mock dependencies
- Independent unit testing
- No side effects in constructors
