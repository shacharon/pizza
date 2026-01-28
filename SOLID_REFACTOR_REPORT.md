# SOLID Split Refactoring Report

**Date**: 2026-01-28  
**Goal**: Split oversized files (>350 LOC) into smaller, SOLID-compliant modules  
**Scope**: Server-side and Angular client code

## Executive Summary

Identified **6 critical files** requiring refactoring:
- **3 files > 1000 LOC** (critical)
- **3 files 350-1000 LOC** (high priority)

Total LOC to refactor: **5,372 lines** across 6 files.

---

## 1. Flagged Files

### Critical Priority (>1000 LOC)

#### 1.1 `websocket-manager.ts`
- **Location**: `server/src/infra/websocket/websocket-manager.ts`
- **Size**: 1,592 LOC
- **Exports**: 2 (WebSocketManager class, WebSocketManagerConfig interface)
- **Reason**: Single file handles connection management, subscriptions, authentication, backlog, and pending subscriptions
- **Risk**: High complexity, multiple responsibilities

#### 1.2 `google-maps.stage.ts`
- **Location**: `server/src/services/search/route2/stages/google-maps.stage.ts`
- **Size**: 1,444 LOC
- **Exports**: 1 (executeGoogleMapsStage function)
- **Reason**: Handles 3 different Google API methods, caching, retries, and mapping
- **Risk**: Multiple API client logic mixed with business logic

#### 1.3 `route2.orchestrator.ts`
- **Location**: `server/src/services/search/route2/route2.orchestrator.ts`
- **Size**: 959 LOC
- **Exports**: 1 (searchRoute2 function)
- **Reason**: Main pipeline orchestrator with inline helpers, narrator logic, and error handling
- **Risk**: God function anti-pattern

### High Priority (350-1000 LOC)

#### 1.4 `search.facade.ts`
- **Location**: `llm-angular/src/app/facades/search.facade.ts`
- **Size**: 724 LOC
- **Exports**: 1 (SearchFacade class)
- **Reason**: Orchestrates search, WebSocket, polling, state management, and chip handling
- **Risk**: Angular facade doing too much, hard to test

#### 1.5 `search.controller.ts`
- **Location**: `server/src/controllers/search/search.controller.ts`
- **Size**: 482 LOC
- **Exports**: 1 (router)
- **Reason**: HTTP controller with embedded async execution, polling setup, and security checks
- **Risk**: Mixed concerns (HTTP + business logic)

#### 1.6 `assistant-line.component.ts`
- **Location**: `llm-angular/src/app/features/unified-search/components/assistant-line/assistant-line.component.ts`
- **Size**: 371 LOC
- **Exports**: 1 (AssistantLineComponent class)
- **Reason**: Component with complex message queue processing and WebSocket debouncing
- **Risk**: UI component with too much business logic

---

## 2. Split Plans

### 2.1 `websocket-manager.ts` → 8 files

**New Structure**:
```
server/src/infra/websocket/
├── websocket-manager.ts (thin orchestrator, ~250 LOC)
├── websocket.types.ts (interfaces, ~80 LOC)
├── websocket.config.ts (config validation, ~100 LOC)
├── connection-handler.ts (connection lifecycle, ~200 LOC)
├── subscription-manager.ts (sub/unsub logic, ~300 LOC)
├── backlog-manager.ts (message backlog, ~150 LOC)
├── pending-subscriptions.ts (pending sub logic, ~180 LOC)
└── auth-verifier.ts (ticket verification, ~200 LOC)
```

**Responsibilities**:
- `websocket-manager.ts`: Orchestrate lifecycle, expose public API
- `websocket.types.ts`: All interfaces (WebSocketContext, PendingSubscription, BacklogEntry)
- `websocket.config.ts`: Config validation and origin checking
- `connection-handler.ts`: Handle connection, close, error, heartbeat
- `subscription-manager.ts`: Subscribe/unsubscribe, sub_ack/sub_nack
- `backlog-manager.ts`: Enqueue, drain, cleanup expired backlogs
- `pending-subscriptions.ts`: Pending sub registration and activation
- `auth-verifier.ts`: Ticket verification with Redis

**Public API** (unchanged):
- `class WebSocketManager` with same constructor signature
- `subscribe()`, `publish()`, `publishToChannel()`, `activatePendingSubscriptions()`, `shutdown()`, `getStats()`

---

### 2.2 `google-maps.stage.ts` → 7 files

**New Structure**:
```
server/src/services/search/route2/stages/google-maps/
├── google-maps.stage.ts (orchestrator, ~100 LOC)
├── google-maps.types.ts (interfaces, ~50 LOC)
├── cache-manager.ts (cache initialization, ~150 LOC)
├── text-search.handler.ts (textSearch logic, ~400 LOC)
├── nearby-search.handler.ts (nearbySearch logic, ~300 LOC)
├── landmark-plan.handler.ts (landmarkPlan logic, ~300 LOC)
└── result-mapper.ts (Google → internal mapping, ~150 LOC)
```

**Responsibilities**:
- `google-maps.stage.ts`: Route to correct handler based on `providerMethod`
- `google-maps.types.ts`: All types (GoogleMapsResult, RouteLLMMapping subtypes)
- `cache-manager.ts`: Cache service initialization and `raceWithCleanup` helper
- `text-search.handler.ts`: Execute text search with retries and bias fallback
- `nearby-search.handler.ts`: Execute nearby search with pagination
- `landmark-plan.handler.ts`: Execute two-phase landmark geocode + search
- `result-mapper.ts`: Map Google Place API responses to internal format

**Public API** (unchanged):
- `export async function executeGoogleMapsStage(mapping, request, ctx): Promise<GoogleMapsResult>`

---

### 2.3 `route2.orchestrator.ts` → 5 files

**New Structure**:
```
server/src/services/search/route2/
├── route2.orchestrator.ts (pipeline orchestrator, ~400 LOC)
├── orchestrator.types.ts (internal types, ~50 LOC)
├── orchestrator.helpers.ts (pure helpers, ~100 LOC)
├── narrator.integration.ts (narrator logic, ~250 LOC)
└── failure-messages.ts (fallback messages, ~100 LOC)
```

**Responsibilities**:
- `route2.orchestrator.ts`: Main `searchRoute2` function, stage sequencing
- `orchestrator.types.ts`: Internal types (NarratorBaseOpts, etc.)
- `orchestrator.helpers.ts`: Pure helpers (shouldDebugStop, toNarratorLanguage, resolveSessionId)
- `narrator.integration.ts`: `maybeNarrateAndPublish` function and related logic
- `failure-messages.ts`: `generateFailureFallbackMessage` and default constants

**Public API** (unchanged):
- `export async function searchRoute2(request, ctx): Promise<SearchResponse>`

---

### 2.4 `search.facade.ts` → 5 files

**New Structure**:
```
llm-angular/src/app/facades/
├── search.facade.ts (main facade, ~250 LOC)
├── search-polling.handler.ts (polling logic, ~150 LOC)
├── search-ws.handler.ts (WebSocket message handling, ~150 LOC)
├── search-chip.handler.ts (chip click logic, ~120 LOC)
└── search.facade.types.ts (internal types, ~50 LOC)
```

**Responsibilities**:
- `search.facade.ts`: Public API, expose signals, coordinate handlers
- `search-polling.handler.ts`: `startPolling`, `cancelPolling`, jitter logic
- `search-ws.handler.ts`: `handleWsMessage`, `handleSearchEvent`, message routing
- `search-chip.handler.ts`: `onChipClick`, filter/sort mapping, `buildSearchFilters`
- `search.facade.types.ts`: Internal types if needed

**Public API** (unchanged):
- `@Injectable() export class SearchFacade` with all current public methods and signals

---

### 2.5 `search.controller.ts` → 4 files

**New Structure**:
```
server/src/controllers/search/
├── search.controller.ts (HTTP routes only, ~150 LOC)
├── search.async-execution.ts (background execution, ~120 LOC)
├── search.security.ts (IDOR checks, ~100 LOC)
└── search.validation.ts (request validation, ~100 LOC)
```

**Responsibilities**:
- `search.controller.ts`: Express routes (POST, GET endpoints)
- `search.async-execution.ts`: `executeBackgroundSearch` function
- `search.security.ts`: Session validation, ownership checks
- `search.validation.ts`: Request parsing and validation helpers

**Public API** (unchanged):
- `export default router` (Express Router with same endpoints)

---

### 2.6 `assistant-line.component.ts` → 4 files

**New Structure**:
```
llm-angular/src/app/features/unified-search/components/assistant-line/
├── assistant-line.component.ts (component, ~150 LOC)
├── assistant-line.types.ts (interfaces, ~30 LOC)
├── message-queue.handler.ts (queue processing, ~100 LOC)
└── ws-status.handler.ts (WebSocket status debouncing, ~100 LOC)
```

**Responsibilities**:
- `assistant-line.component.ts`: Angular component, template, lifecycle hooks
- `assistant-line.types.ts`: Interfaces (AssistantMessage, WSStatusMessage)
- `message-queue.handler.ts`: Queue management, stagger logic, delay helpers
- `ws-status.handler.ts`: WS status debouncing, throttling, message updates

**Public API** (unchanged):
- `@Component() export class AssistantLineComponent` with same inputs/outputs

---

## 3. Quality Checklist

### Pre-Refactor
- [x] Identified all oversized files (>350 LOC)
- [x] Analyzed responsibilities and exports
- [x] Proposed split plans with file responsibilities
- [ ] Reviewed with team (if applicable)

### During Refactor
- [ ] Extract types/interfaces first (no logic changes)
- [ ] Extract pure helpers (no dependencies)
- [ ] Extract stateful modules (preserve behavior)
- [ ] Update imports in consuming files
- [ ] Ensure original exports still exist
- [ ] No changes to public APIs

### Post-Refactor
- [ ] Build passes (`npm run build` or `tsc`)
- [ ] All tests pass (`npm test`)
- [ ] Grep for changed exports - verify no breaking changes
- [ ] Run linter (`npm run lint`)
- [ ] Verify no route/controller signature changes
- [ ] Smoke test critical paths

---

## 4. Implementation Order

### Phase 1: Backend Infrastructure (Low Risk)
1. `search.controller.ts` → 4 files
2. `route2.orchestrator.ts` → 5 files

### Phase 2: Backend API Layer (Medium Risk)
3. `google-maps.stage.ts` → 7 files

### Phase 3: Backend WebSocket (High Risk)
4. `websocket-manager.ts` → 8 files

### Phase 4: Frontend (Medium Risk)
5. `assistant-line.component.ts` → 4 files
6. `search.facade.ts` → 5 files

---

## 5. Risk Mitigation

### High-Risk Areas
1. **WebSocket Manager**: Many runtime dependencies, careful with lifecycle
2. **Google Maps Stage**: External API calls, cache logic must be tested
3. **Search Facade**: State management, race conditions in polling/WS

### Safety Measures
- Commit after each file split (granular rollback)
- Run tests after each phase
- Keep original files as `.old.ts` until verified (then delete)
- Monitor logs for runtime errors after deployment

---

## 6. Metrics

### Before Refactor
- **Files flagged**: 6
- **Total LOC**: 5,372
- **Avg LOC per file**: 895
- **Files >1000 LOC**: 3

### After Refactor (Target)
- **New files created**: ~33 files
- **Avg LOC per file**: ~163
- **Max LOC per file**: <400
- **Improved testability**: ✓
- **Improved readability**: ✓
- **SOLID compliance**: ✓

---

## 7. Next Steps

1. ✅ **Report Created** (this document)
2. ⏳ **Begin Phase 1**: Refactor `search.controller.ts`
3. ⏳ **Continue with remaining phases**
4. ⏳ **Verify and test after each phase**
5. ⏳ **Final verification** (build, tests, smoke tests)
6. ⏳ **Commit and document changes**

---

**End of Report**
