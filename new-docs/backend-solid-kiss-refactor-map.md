# Backend SOLID + KISS Refactor Map

**Generated:** 2026-01-29  
**Scope:** `server/` (TypeScript only)  
**Goal:** Identify oversized files violating SOLID/KISS for refactoring (NO behavior changes)

---

## Executive Summary

**Total Files Analyzed:** 171 TypeScript files  
**Files Flagged:** 13 files requiring refactoring  
**Top Priority:** 10 files with highest ROI

### Key Findings

- **Mega-File:** `google-maps.stage.old.ts` (1,298 LOC) - violates Single Responsibility (cache + HTTP + mapping + retry + 3 search methods)
- **LLM Provider:** Retry logic, streaming, and JSON completion should be extracted
- **WebSocket:** Manager has 7+ responsibilities mixed together
- **Common Pattern:** Cache management, HTTP calls, retry logic, and error handling repeatedly mixed in single files

---

## Top 10 Priority Refactoring Targets

### 1. `google-maps.stage.old.ts` ⚠️ CRITICAL
**File:** `server/src/services/search/route2/stages/google-maps.stage.old.ts`  
**LOC:** 1,298  
**Exported Symbols:** 12  
**Imports:** 8  
**Risk:** HIGH (deprecated "old" file, still in use)

**Current Responsibilities:**
- Cache initialization and service management
- Cache timeout handling (raceWithCleanup)
- Text search execution + retry logic
- Nearby search execution
- Landmark plan (two-phase geocoding + search)
- Request body building (3 variations)
- API call execution (3 endpoints)
- Result mapping from Google format
- Geocoding API calls
- Location bias validation
- Error handling and logging

**Suggested Split:**

```
google-maps/
├── cache-manager.ts              // Cache init, raceWithCleanup (DONE - referenced in other files)
├── text-search.handler.ts        // Text search logic (DONE - already extracted)
├── nearby-search.handler.ts      // Nearby search logic (DONE - already extracted)
├── landmark-plan.handler.ts      // Landmark two-phase logic
├── geocoding.service.ts          // Geocoding API wrapper
├── result-mapper.ts              // Google Place → internal format
├── request-builders.ts           // Build API request bodies
├── location-validator.ts         // Validate location bias
└── google-maps.stage.ts          // Thin orchestrator (dispatch only)
```

**Proposed Interfaces:**
- `IGoogleMapsHandler` - Common interface for text/nearby/landmark handlers
- `IGeocodingService` - Geocoding abstraction
- `IResultMapper` - Mapping abstraction

**Dependency Direction:**
```
google-maps.stage.ts
  ↓
handlers (text/nearby/landmark)
  ↓
cache-manager + result-mapper + geocoding.service
```

**Risk Level:** HIGH
- File marked ".old" but still primary implementation
- 3 search methods tightly coupled
- High chance of breaking changes if not careful

**Move Plan:**
1. Extract `geocoding.service.ts` (pure helper, no cache deps)
2. Extract `location-validator.ts` (pure validation)
3. Extract `request-builders.ts` (pure mapping logic)
4. **Already done:** `result-mapper.ts`, `cache-manager.ts`, `text-search.handler.ts`, `nearby-search.handler.ts`
5. Extract `landmark-plan.handler.ts` (uses text/nearby handlers)
6. Reduce `google-maps.stage.old.ts` to thin orchestrator (just dispatch logic)
7. Create barrel export for backward compatibility

---

### 2. `assistant-llm.service.ts` ⚠️ HIGH
**File:** `server/src/services/search/route2/assistant/assistant-llm.service.ts`  
**LOC:** 792  
**Exported Symbols:** 8  
**Imports:** 3  
**Risk:** MEDIUM

**Current Responsibilities:**
- LLM prompt building (system + user)
- LLM call orchestration
- JSON schema definition and validation
- Language detection and validation
- Message format validation (sentence counting, question marks)
- Type-specific invariant enforcement (CLARIFY, SUMMARY, GATE_FAIL rules)
- Deterministic fallback generation (Hebrew + English)
- Error handling and timeout management

**Suggested Split:**

```
assistant/
├── assistant-llm.service.ts       // Main orchestrator (reduce to ~200 LOC)
├── assistant-prompts.ts           // System/user prompt builders
├── assistant-schemas.ts           // Zod schemas + JSON schemas
├── assistant-validators.ts        // Language + format validation
├── assistant-invariants.ts        // Type-specific business rules
├── assistant-fallbacks.ts         // Deterministic fallback messages
└── assistant-language-utils.ts    // isHebrewText, countSentences, etc.
```

**Proposed Interfaces:**
- `IAssistantValidator` - Validation logic abstraction
- `IAssistantInvariantEnforcer` - Invariant enforcement
- `IAssistantFallbackProvider` - Fallback message provider

**Dependency Direction:**
```
assistant-llm.service.ts (orchestrator)
  ↓
validators + invariants + fallbacks + prompts
  ↓
language-utils (pure helpers)
```

**Risk Level:** MEDIUM
- High test coverage required (invariants are critical)
- Language-specific logic needs careful handling

**Move Plan:**
1. Extract pure helpers: `assistant-language-utils.ts` (isHebrewText, countSentences)
2. Extract schemas: `assistant-schemas.ts` (no deps)
3. Extract prompts: `assistant-prompts.ts` (uses schemas)
4. Extract validators: `assistant-validators.ts` (uses language-utils)
5. Extract invariants: `assistant-invariants.ts` (uses validators)
6. Extract fallbacks: `assistant-fallbacks.ts` (uses validators)
7. Slim down main service to orchestration only (~200 LOC)

---

### 3. `websocket-manager.ts` ⚠️ HIGH
**File:** `server/src/infra/websocket/websocket-manager.ts`  
**LOC:** 612  
**Exported Symbols:** 2  
**Imports:** 15  
**Risk:** MEDIUM

**Current Responsibilities:**
- WebSocket server initialization and configuration
- Connection handling and setup
- Message parsing and normalization
- Client message routing (subscribe/unsubscribe/event/action_clicked)
- Per-socket rate limiting (token bucket)
- Subscription management delegation
- Backlog management delegation
- Pending subscriptions activation
- Publish/broadcast logic
- Heartbeat and cleanup
- Error handling and logging

**Suggested Split:**

```
websocket/
├── websocket-manager.ts           // Thin orchestrator (~250 LOC)
├── message-parser.ts              // JSON parsing + normalization
├── message-router.ts              // Route messages to handlers
├── rate-limiter.ts                // Token bucket rate limiting
├── publish-manager.ts             // Publish/broadcast logic
├── heartbeat-manager.ts           // Heartbeat + cleanup
└── (existing) connection-handler.ts, subscription-manager.ts, backlog-manager.ts
```

**Proposed Interfaces:**
- `IMessageParser` - Parse and normalize messages
- `IMessageRouter` - Route messages to handlers
- `IRateLimiter` - Rate limiting abstraction
- `IPublishManager` - Publish abstraction

**Dependency Direction:**
```
websocket-manager.ts (orchestrator)
  ↓
message-router + publish-manager + rate-limiter + heartbeat-manager
  ↓
connection-handler + subscription-manager + backlog-manager
```

**Risk Level:** MEDIUM
- High traffic component (production critical)
- Many extracted modules already exist

**Move Plan:**
1. Extract `rate-limiter.ts` (pure token bucket logic)
2. Extract `message-parser.ts` (JSON parse + normalize)
3. Extract `message-router.ts` (route to handlers)
4. Extract `publish-manager.ts` (publish/broadcast)
5. Extract `heartbeat-manager.ts` (heartbeat + cleanup)
6. Reduce manager to initialization + orchestration (~250 LOC)

---

### 4. `openai.provider.ts` ⚠️ MEDIUM
**File:** `server/src/llm/openai.provider.ts`  
**LOC:** 492  
**Exported Symbols:** 1 class  
**Imports:** 8  
**Risk:** MEDIUM

**Current Responsibilities:**
- OpenAI client lazy initialization
- JSON completion with structured outputs
- Retry logic with exponential backoff
- Timeout handling with AbortController
- Schema conversion (Zod → JSON Schema)
- Schema validation and hashing
- Token usage tracking and cost calculation
- Error categorization (transport vs parse vs abort)
- Streaming completion
- Simple text completion
- Detailed timing instrumentation

**Suggested Split:**

```
llm/
├── openai.provider.ts             // Main provider (~200 LOC)
├── llm-retry.service.ts           // Retry logic with backoff
├── llm-schema-converter.ts        // Zod → JSON Schema + validation
├── llm-telemetry.ts               // Token usage + cost + timing
├── llm-error-classifier.ts        // Categorize errors
└── llm-streaming.service.ts       // Streaming logic
```

**Proposed Interfaces:**
- `IRetryStrategy` - Retry logic abstraction
- `ISchemaConverter` - Schema conversion
- `ITelemetryCollector` - Telemetry collection
- `IErrorClassifier` - Error classification

**Dependency Direction:**
```
openai.provider.ts (orchestrator)
  ↓
retry + schema-converter + telemetry + error-classifier + streaming
```

**Risk Level:** MEDIUM
- Critical for all LLM calls
- Timing instrumentation must be preserved

**Move Plan:**
1. Extract `llm-error-classifier.ts` (pure helper)
2. Extract `llm-schema-converter.ts` (Zod → JSON + validation)
3. Extract `llm-telemetry.ts` (token usage + cost)
4. Extract `llm-retry.service.ts` (backoff logic)
5. Extract `llm-streaming.service.ts` (streaming)
6. Slim down provider to orchestration (~200 LOC)

---

### 5. `text-search.handler.ts` ⚠️ MEDIUM
**File:** `server/src/services/search/route2/stages/google-maps/text-search.handler.ts`  
**LOC:** 511  
**Exported Symbols:** 2  
**Imports:** 6  
**Risk:** LOW (already extracted from google-maps.stage.old.ts)

**Current Responsibilities:**
- Text search execution with retry
- Cache management (wrap + timeout)
- Retry logic for low results
- City geocoding for bias enrichment
- Request body building
- Location bias validation
- API call execution
- Pagination handling
- Error handling and logging

**Suggested Split:**

```
google-maps/
├── text-search.handler.ts         // Main handler (~200 LOC)
├── text-search-retry.ts           // Retry logic for low results
├── text-search-enrichment.ts      // City geocoding + bias enrichment
├── text-search-pagination.ts      // Pagination logic
└── (reuse) cache-manager.ts, result-mapper.ts
```

**Proposed Interfaces:**
- `ISearchRetryStrategy` - Retry abstraction
- `ISearchEnrichment` - Enrichment abstraction

**Risk Level:** LOW
- Already extracted from larger file
- Clear separation of concerns possible

---

### 6. `subscription-manager.ts` ⚠️ MEDIUM
**File:** `server/src/infra/websocket/subscription-manager.ts`  
**LOC:** 352  
**Exported Symbols:** 1 class  
**Imports:** 6  
**Risk:** MEDIUM

**Current Responsibilities:**
- Subscription key building
- Subscribe/unsubscribe logic
- Subscriber tracking (Map + WeakMap)
- Subscribe request handling + validation
- Ownership verification (userId + sessionId)
- Request status retrieval
- State replay for late subscribers
- Cleanup logic
- Logging and hashing

**Suggested Split:**

```
websocket/
├── subscription-manager.ts        // Main manager (~200 LOC)
├── subscription-validator.ts      // Validation + ownership checks
├── subscription-replay.ts         // Late-subscriber replay logic
└── subscription-key-builder.ts    // Key generation
```

**Proposed Interfaces:**
- `ISubscriptionValidator` - Validation abstraction
- `IStateReplayService` - Replay abstraction

**Risk Level:** MEDIUM
- Core WebSocket functionality
- Ownership logic is complex

**Move Plan:**
1. Extract `subscription-key-builder.ts` (pure helper)
2. Extract `subscription-validator.ts` (ownership checks)
3. Extract `subscription-replay.ts` (late-subscriber logic)
4. Slim down manager (~200 LOC)

---

### 7. `assistant-llm-rewriter.service.ts` ⚠️ LOW
**File:** `server/src/services/assistant/assistant-llm-rewriter.service.ts`  
**LOC:** 333  
**Exported Symbols:** 3  
**Imports:** 2  
**Risk:** LOW

**Current Responsibilities:**
- LLM-based message rewriting
- In-memory caching with TTL
- In-flight call deduplication
- Per-request stats tracking
- Timeout handling
- Cache cleanup
- Fallback to raw message on error

**Suggested Split:**

```
assistant/
├── assistant-llm-rewriter.service.ts  // Main service (~150 LOC)
├── rewriter-cache.ts                  // Cache + deduplication
├── rewriter-stats.ts                  // Stats tracking
└── rewriter-prompts.ts                // LLM prompts
```

**Risk Level:** LOW
- Clear separation possible
- Cache logic can be generic

---

### 8. `shared-filters.tighten.ts` ⚠️ MEDIUM
**File:** `server/src/services/search/route2/shared/shared-filters.tighten.ts`  
**LOC:** 307  
**Exported Symbols:** 1  
**Imports:** 3  
**Risk:** MEDIUM

**Current Responsibilities:**
- Language resolution (UI + provider)
- Region resolution (5-priority fallback)
- Region normalization and validation
- Language mapping (intent → UI/provider)
- Reverse geocoding (placeholder)
- Geocoding (placeholder)
- Disclaimer rules
- Logging

**Suggested Split:**

```
shared/
├── shared-filters.tighten.ts      // Main orchestrator (~150 LOC)
├── language-resolver.ts           // Language resolution logic
├── region-resolver.ts             // Region resolution fallback chain
├── region-validator.ts            // Region normalization
└── geocoding-utils.ts             // Geocoding wrappers
```

**Risk Level:** MEDIUM
- Complex fallback logic
- Needs careful testing

---

### 9. `nearby.mapper.ts` ⚠️ LOW
**File:** `server/src/services/search/route2/stages/route-llm/nearby.mapper.ts`  
**LOC:** 301  
**Exported Symbols:** 1  
**Imports:** 6  
**Risk:** LOW

**Current Responsibilities:**
- LLM-based nearby mapping
- Retry logic on timeout
- Fallback mapping without LLM
- Distance extraction from query
- Keyword cleaning
- Request body building
- Error handling

**Suggested Split:**

```
route-llm/
├── nearby.mapper.ts               // Main mapper (~150 LOC)
├── nearby-fallback.ts             // Fallback logic without LLM
├── nearby-distance-parser.ts      // Distance extraction
└── nearby-keyword-cleaner.ts      // Keyword cleaning
```

**Risk Level:** LOW
- Clear separation possible

---

### 10. `gate2.stage.ts` ⚠️ LOW
**File:** `server/src/services/search/route2/stages/gate2.stage.ts`  
**LOC:** 281  
**Exported Symbols:** 1  
**Imports:** 7  
**Risk:** LOW

**Current Responsibilities:**
- LLM-based gate classification
- Retry logic on timeout
- Deterministic routing rules
- Timeout error result creation
- Error handling
- Telemetry (stage timing)

**Suggested Split:**

```
stages/
├── gate2.stage.ts                 // Main stage (~150 LOC)
├── gate2-routing.ts               // Routing rules
└── gate2-errors.ts                // Error result builders
```

**Risk Level:** LOW
- Simple extraction

---

## Full Flagged Files Table

| # | File | LOC | Exports | Imports | Responsibilities | Risk | Priority |
|---|------|-----|---------|---------|------------------|------|----------|
| 1 | `google-maps.stage.old.ts` | 1298 | 12 | 8 | 11 | HIGH | P0 |
| 2 | `assistant-llm.service.ts` | 792 | 8 | 3 | 8 | MEDIUM | P0 |
| 3 | `websocket-manager.ts` | 612 | 2 | 15 | 11 | MEDIUM | P0 |
| 4 | `search.types.ts` | 520 | 50+ | 2 | 1 (types only) | LOW | P3 |
| 5 | `text-search.handler.ts` | 511 | 2 | 6 | 9 | LOW | P1 |
| 6 | `openai.provider.ts` | 492 | 1 | 8 | 11 | MEDIUM | P0 |
| 7 | `subscription-manager.ts` | 352 | 1 | 6 | 8 | MEDIUM | P1 |
| 8 | `assistant-llm-rewriter.service.ts` | 333 | 3 | 2 | 7 | LOW | P2 |
| 9 | `shared-filters.tighten.ts` | 307 | 1 | 3 | 8 | MEDIUM | P1 |
| 10 | `nearby.mapper.ts` | 301 | 1 | 6 | 7 | LOW | P2 |
| 11 | `nearby-search.handler.ts` | 298 | 2 | 6 | 7 | LOW | P2 |
| 12 | `gate2.stage.ts` | 281 | 1 | 7 | 6 | LOW | P2 |
| 13 | `orchestrator.guards.ts` | 268 | 4 | 6 | 4 | LOW | P2 |

---

## Common Anti-Patterns Found

### 1. **Cache + HTTP + Retry in One File**
**Pattern:** Cache initialization, HTTP calls, retry logic, and error handling all in one file  
**Examples:** `google-maps.stage.old.ts`, `text-search.handler.ts`, `nearby-search.handler.ts`  
**Fix:** Extract cache manager, HTTP client wrappers, retry strategies

### 2. **Validation + Business Logic + Fallbacks Mixed**
**Pattern:** Validation, invariant enforcement, and fallback generation in one service  
**Examples:** `assistant-llm.service.ts`, `subscription-manager.ts`  
**Fix:** Separate validators, enforcers, and fallback providers

### 3. **Multiple Search Methods in One File**
**Pattern:** Text search + nearby search + landmark plan in one orchestrator  
**Examples:** `google-maps.stage.old.ts`  
**Fix:** One handler per search method + thin orchestrator

### 4. **LLM Call + Prompt + Schema + Validation in One File**
**Pattern:** All LLM-related concerns in one place  
**Examples:** `openai.provider.ts`, `nearby.mapper.ts`, `gate2.stage.ts`  
**Fix:** Separate prompts, schemas, retry, telemetry

---

## Naming Conventions

### Service Naming
- **Orchestrators:** `*.orchestrator.ts` or `*.manager.ts` (thin, <250 LOC)
- **Handlers:** `*.handler.ts` (single operation, <200 LOC)
- **Services:** `*.service.ts` (reusable business logic, <300 LOC)
- **Utilities:** `*.utils.ts` or `*.helpers.ts` (pure functions, <150 LOC)

### Interface Naming
- Prefix with `I` for implementation abstraction: `IValidator`, `IMapper`, `IRetryStrategy`
- Use descriptive names: `IGoogleMapsHandler` not `IGoogleHandler`

### File Organization
```
feature/
├── feature.orchestrator.ts        // Main orchestrator
├── feature-handler-a.ts           // Handler A
├── feature-handler-b.ts           // Handler B
├── feature.service.ts             // Shared service
├── feature.types.ts               // Types
└── utils/
    ├── feature-validator.ts       // Validation
    ├── feature-mapper.ts          // Mapping
    └── feature-retry.ts           // Retry logic
```

---

## Implementation Strategy

### Phase 1: Extract Pure Helpers (Week 1)
**Goal:** Extract stateless, side-effect-free helpers  
**Files:** Language utils, validators, mappers, key builders  
**Risk:** LOW (no behavior change)

**Tasks:**
1. Extract `assistant-language-utils.ts` from `assistant-llm.service.ts`
2. Extract `subscription-key-builder.ts` from `subscription-manager.ts`
3. Extract `location-validator.ts` from `google-maps.stage.old.ts`
4. Extract `region-validator.ts` from `shared-filters.tighten.ts`
5. Extract `llm-error-classifier.ts` from `openai.provider.ts`

### Phase 2: Extract Services with Interfaces (Week 2)
**Goal:** Extract services with clear interfaces  
**Files:** Cache managers, retry strategies, validators  
**Risk:** MEDIUM (requires interface design)

**Tasks:**
1. Extract `rewriter-cache.ts` from `assistant-llm-rewriter.service.ts`
2. Extract `llm-retry.service.ts` from `openai.provider.ts`
3. Extract `subscription-validator.ts` from `subscription-manager.ts`
4. Extract `rate-limiter.ts` from `websocket-manager.ts`

### Phase 3: Split Large Files (Week 3-4)
**Goal:** Break down mega-files into handlers  
**Files:** `google-maps.stage.old.ts`, `assistant-llm.service.ts`  
**Risk:** HIGH (complex dependencies)

**Tasks:**
1. Extract handlers from `google-maps.stage.old.ts` (text/nearby/landmark)
2. Extract validators/invariants from `assistant-llm.service.ts`
3. Extract message router from `websocket-manager.ts`
4. Reduce orchestrators to <250 LOC

### Phase 4: Create Barrel Exports (Week 4)
**Goal:** Maintain backward compatibility  
**Files:** All refactored modules  
**Risk:** LOW (no behavior change)

**Tasks:**
1. Create `index.ts` barrel exports for each refactored module
2. Update imports in dependent files
3. Deprecate old imports with `@deprecated` JSDoc

---

## Testing Strategy

### Unit Tests (Required)
- **Pure Helpers:** 100% coverage (language-utils, validators, mappers)
- **Services:** 90% coverage (cache, retry, validators)
- **Orchestrators:** 80% coverage (main flows + error paths)

### Integration Tests (Required)
- **Google Maps Stage:** Test all 3 search methods end-to-end
- **WebSocket Manager:** Test subscribe/publish/cleanup flows
- **LLM Provider:** Test JSON completion + retry + streaming

### Regression Tests (Critical)
- **Before Refactor:** Capture current behavior with integration tests
- **After Refactor:** Run same tests, verify identical behavior
- **Use:** Jest snapshots for complex outputs

---

## Success Metrics

### File Size
- **Target:** No file > 300 LOC (excluding type definition files)
- **Current:** 13 files > 300 LOC
- **Goal:** Reduce to 0 files > 300 LOC

### Responsibilities
- **Target:** Max 3 responsibilities per file
- **Current:** `google-maps.stage.old.ts` has 11 responsibilities
- **Goal:** All files have ≤ 3 responsibilities

### Imports
- **Target:** Max 8 imports per file
- **Current:** `websocket-manager.ts` has 15 imports
- **Goal:** All files have ≤ 8 imports

### Test Coverage
- **Target:** 90% coverage for all refactored code
- **Current:** Unknown (run coverage report first)
- **Goal:** ≥ 90% line coverage

---

## Risk Mitigation

### High-Risk Files
**Files:** `google-maps.stage.old.ts`, `websocket-manager.ts`, `openai.provider.ts`  
**Mitigation:**
1. Write comprehensive integration tests BEFORE refactoring
2. Use feature flags for gradual rollout
3. Keep old implementation for 1 sprint as fallback
4. Monitor logs/metrics closely post-deploy

### Production Impact
**Concern:** Refactoring critical path code  
**Mitigation:**
1. Deploy to staging first, run load tests
2. Use canary deployment (5% → 50% → 100%)
3. Have rollback plan ready
4. Monitor error rates + latency

### Breaking Changes
**Concern:** Public API changes  
**Mitigation:**
1. Use barrel exports for backward compatibility
2. Deprecate old APIs with `@deprecated` JSDoc
3. Keep old APIs for 2 sprints minimum
4. Update documentation

---

## Next Steps

1. **Review this report** with team - get buy-in on priorities
2. **Run test coverage** analysis to establish baseline
3. **Start Phase 1** (extract pure helpers) - lowest risk, high value
4. **Create feature flags** for gradual rollout
5. **Set up monitoring** for refactored components

---

**End of Report**
