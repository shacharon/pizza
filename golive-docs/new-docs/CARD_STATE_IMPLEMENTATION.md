# SearchCardState Implementation

**Date**: 2026-01-28  
**Type**: Frontend State Machine - Terminal vs Non-Terminal States  
**Scope**: Explicit card lifecycle state tracking

---

## Problem Statement

The frontend needed explicit differentiation between:
- **Terminal states** (DONE_SUCCESS, GATE_FAIL) → Search complete, card shows final result
- **Non-terminal states** (DONE_CLARIFY) → Search paused, card stays active awaiting user input

Previously used a boolean `clarificationBlocking` which didn't clearly represent the full state machine.

---

## Solution: SearchCardState Enum

### State Definitions

```typescript
export type SearchCardState = 'RUNNING' | 'CLARIFY' | 'STOP';
```

| State | Meaning | Terminal? | Card Behavior |
|-------|---------|-----------|---------------|
| **RUNNING** | Search in progress | No | Active, loading indicators |
| **CLARIFY** | Needs user clarification | No | Active, shows assistant message, awaits input |
| **STOP** | Search complete or failed | Yes | Shows final results/error, no further processing |

---

## State Transitions

```
┌──────────┐
│  START   │
└────┬─────┘
     │
     ▼
┌──────────┐        DONE_CLARIFY         ┌──────────┐
│ RUNNING  │────────(blocksSearch)──────>│ CLARIFY  │
└────┬─────┘                              └────┬─────┘
     │                                          │
     │ DONE_SUCCESS                             │ User provides
     │ GATE_FAIL                                │ clarification
     │ Error                                    │
     │                                          │
     ▼                                          ▼
┌──────────┐<────────(new search)──────────────┘
│   STOP   │
└──────────┘
```

### Transition Rules

1. **START → RUNNING**
   - New search initiated
   - `search()` method called

2. **RUNNING → CLARIFY**
   - Backend: `DONE_CLARIFY` (assistant message with `blocksSearch=true`)
   - Backend: WebSocket ready event with `decision: "ASK_CLARIFY"` or `ready: "ask"`
   - Non-terminal: card stays active

3. **RUNNING → STOP**
   - Backend: `DONE_SUCCESS` (results ready)
   - Backend: `GATE_FAIL` (assistant message type `GATE_FAIL`)
   - Backend: WebSocket ready event with `decision: "STOP"` or `ready: "stop"`
   - Backend: WebSocket error event
   - Terminal: no further processing

4. **CLARIFY → RUNNING**
   - User provides clarification (new search request)
   - `search()` called with clarifying input

---

## Implementation

### 1. Type Definition

**File:** `search-card-state.types.ts` (NEW)

```typescript
export type SearchCardState = 'RUNNING' | 'CLARIFY' | 'STOP';
```

---

### 2. State Signal in SearchFacade

**File:** `search.facade.ts`

**Added:**
```typescript
// CARD STATE: Explicit state machine for search lifecycle
private readonly _cardState = signal<SearchCardState>('RUNNING');
readonly cardState = this._cardState.asReadonly();

// Derived state queries (for backward compatibility)
readonly isWaitingForClarification = computed(() => this.cardState() === 'CLARIFY');
readonly isTerminalState = computed(() => this.cardState() === 'STOP');
```

**Replaced:**
```typescript
// OLD (removed):
private readonly clarificationBlocking = signal<boolean>(false);
readonly isWaitingForClarification = this.clarificationBlocking.asReadonly();
```

---

### 3. State Transitions Mapping

#### Transition 1: New Search → RUNNING

**Location:** `search()` method

```typescript
// CARD STATE: Reset to RUNNING for fresh search
this._cardState.set('RUNNING');
```

---

#### Transition 2: Assistant Message → CLARIFY or STOP

**Location:** `onAssistantMessage` handler

**CLARIFY (non-terminal):**
```typescript
if (narrator.type === 'CLARIFY' && narrator.blocksSearch === true) {
  console.log('[SearchFacade] DONE_CLARIFY - stopping search, waiting for user input');
  
  // Stop loading immediately
  this.searchStore.setLoading(false);
  
  // CARD STATE: Set to CLARIFY (non-terminal, card stays active)
  this._cardState.set('CLARIFY');
  
  // Cancel any pending polling
  this.apiHandler.cancelPolling();
  
  // Set status for CLARIFY
  this.assistantHandler.setStatus('completed');
}
```

**GATE_FAIL (terminal):**
```typescript
else if (narrator.type === 'GATE_FAIL') {
  // CARD STATE: GATE_FAIL is terminal (STOP)
  console.log('[SearchFacade] GATE_FAIL - terminal state');
  this._cardState.set('STOP');
  this.searchStore.setLoading(false);
  this.apiHandler.cancelPolling();
  this.assistantHandler.setStatus('completed');
}
```

**SUMMARY (keep RUNNING):**
```typescript
else {
  // SUMMARY or other types - keep RUNNING, will transition to STOP on results
  this.assistantHandler.setStatus('completed');
}
```

---

#### Transition 3: WebSocket Events → CLARIFY or STOP

**Location:** `handleSearchEvent()` method

```typescript
// CARD STATE: Map backend event to card state
if (event.type === 'ready') {
  if (event.decision === 'STOP' || event.ready === 'stop') {
    // Terminal state: search stopped/failed
    this._cardState.set('STOP');
  } else if (event.decision === 'ASK_CLARIFY' || event.ready === 'ask') {
    // Non-terminal: needs clarification (handled by assistant message)
    this._cardState.set('CLARIFY');
  }
  // 'results' ready with 'CONTINUE' decision stays RUNNING until response processed
} else if (event.type === 'error') {
  // Errors are terminal
  this._cardState.set('STOP');
}
```

**Guard for CLARIFY state:**
```typescript
// CARD STATE: Ignore search events if in CLARIFY state (non-terminal)
if (this.cardState() === 'CLARIFY') {
  console.log('[SearchFacade] Ignoring search event - waiting for clarification');
  return;
}
```

---

#### Transition 4: Search Response → STOP

**Location:** `handleSearchResponse()` method

```typescript
// Update store with full response
this.searchStore.setResponse(response);
this.searchStore.setLoading(false);

// CARD STATE: Successful results = terminal STOP state
if (this.cardState() !== 'CLARIFY') {
  // Don't override CLARIFY state - it's explicitly non-terminal
  this._cardState.set('STOP');
}
```

**Protection:** Don't override CLARIFY → The user may still be in clarification flow even if results arrive.

---

## Backend Status Mapping

### Assistant Messages

| Backend Type | `blocksSearch` | Card State | Terminal? |
|-------------|---------------|-----------|-----------|
| CLARIFY | true | CLARIFY | No ❌ |
| GATE_FAIL | - | STOP | Yes ✅ |
| SUMMARY | - | (keep current) | - |

### WebSocket Search Events

| Event Type | `decision` | `ready` | Card State | Terminal? |
|-----------|-----------|---------|-----------|-----------|
| ready | STOP | stop | STOP | Yes ✅ |
| ready | ASK_CLARIFY | ask | CLARIFY | No ❌ |
| ready | CONTINUE | results | RUNNING → STOP (after response) | Yes ✅ |
| error | - | - | STOP | Yes ✅ |
| progress | - | - | RUNNING | No ❌ |

---

## State Machine Invariants

### Invariant 1: CLARIFY is Non-Terminal

```typescript
// Always true when in CLARIFY state:
cardState() === 'CLARIFY' → isTerminalState() === false
```

**Enforcement:**
- Search events ignored while in CLARIFY
- User input required to transition out
- New search resets to RUNNING

---

### Invariant 2: STOP is Terminal

```typescript
// Always true when in STOP state:
cardState() === 'STOP' → isTerminalState() === true
```

**Enforcement:**
- No further state transitions (except new search)
- Loading indicators stopped
- Polling cancelled

---

### Invariant 3: RUNNING May Transition to Either

```typescript
// From RUNNING:
cardState() === 'RUNNING' → can transition to CLARIFY OR STOP
```

**Determined by:** Backend response type

---

## Backward Compatibility

### isWaitingForClarification

**Before:**
```typescript
private readonly clarificationBlocking = signal<boolean>(false);
readonly isWaitingForClarification = this.clarificationBlocking.asReadonly();
```

**After:**
```typescript
readonly isWaitingForClarification = computed(() => this.cardState() === 'CLARIFY');
```

**Compatible:** ✅ Same interface, derived from cardState

---

### isTerminalState (NEW)

```typescript
readonly isTerminalState = computed(() => this.cardState() === 'STOP');
```

**Usage:** Components can query if search is in terminal state

---

## Data Flow Examples

### Example 1: Successful Search Flow

```
1. User: "pizza near me"
2. search() called → cardState = RUNNING ✅
3. Backend: 202 Accepted { requestId: "req-123" }
4. WebSocket: progress events → cardState stays RUNNING ✅
5. Assistant: SUMMARY message → assistantStatus = completed, cardState stays RUNNING ✅
6. WebSocket: ready { decision: "CONTINUE", ready: "results" }
7. HTTP: Results arrive
8. handleSearchResponse() → cardState = STOP ✅ (terminal)
9. UI: Shows results, no further processing ✅
```

---

### Example 2: CLARIFY Flow (Non-Terminal)

```
1. User: "something tasty"
2. search() called → cardState = RUNNING ✅
3. Backend: 202 Accepted { requestId: "req-456" }
4. Backend processes → ambiguous query detected
5. Assistant: CLARIFY { blocksSearch: true }
6. onAssistantMessage() → cardState = CLARIFY ✅ (non-terminal)
7. Loading stopped, polling cancelled ✅
8. UI: Shows clarification question inside card ✅
9. Subsequent search events IGNORED (guarded) ✅
10. User provides clarification: "tasty pizza"
11. search() called → cardState = RUNNING ✅
12. Flow continues normally...
```

---

### Example 3: GATE_FAIL Flow (Terminal)

```
1. User: "restaurants in Mars"
2. search() called → cardState = RUNNING ✅
3. Backend: 202 Accepted { requestId: "req-789" }
4. Backend: Gate check fails (no API key / rate limit / etc.)
5. Assistant: GATE_FAIL message
6. onAssistantMessage() → cardState = STOP ✅ (terminal)
7. Loading stopped, polling cancelled ✅
8. UI: Shows error message inside card ✅
9. No further processing ✅
```

---

### Example 4: WebSocket Error (Terminal)

```
1. User: "sushi"
2. search() called → cardState = RUNNING ✅
3. Backend: 202 Accepted { requestId: "req-999" }
4. Backend encounters error during processing
5. WebSocket: error { code: "INTERNAL_ERROR", message: "..." }
6. handleSearchEvent() → cardState = STOP ✅ (terminal)
7. onError handler called ✅
8. UI: Shows error state ✅
```

---

## Files Modified

**2 files changed, 1 file created:**

1. **`search-card-state.types.ts`** (NEW)
   - Type definition + documentation

2. **`search.facade.ts`** (MODIFIED)
   - Added cardState signal
   - Replaced clarificationBlocking with derived computed
   - Added state transitions in 4 locations:
     - `search()` → RUNNING
     - `onAssistantMessage()` → CLARIFY or STOP
     - `handleSearchEvent()` → CLARIFY or STOP
     - `handleSearchResponse()` → STOP

---

## No Backend Changes

✅ Backend contract unchanged (still sends same messages)  
✅ Frontend now interprets backend messages with explicit state machine  
✅ Clear terminal vs non-terminal differentiation  

---

## UI Integration (Future)

Components can now use:

```typescript
// Check card state
readonly cardState = facade.cardState();

// Derived queries
readonly isWaitingForClarification = facade.isWaitingForClarification();
readonly isTerminalState = facade.isTerminalState();

// Conditional rendering
@if (cardState() === 'RUNNING') {
  <loading-spinner />
}

@if (cardState() === 'CLARIFY') {
  <clarification-prompt />
}

@if (cardState() === 'STOP') {
  <final-results-or-error />
}
```

---

## Summary

| Aspect | Status |
|--------|--------|
| **Explicit state enum** | ✅ YES (RUNNING | CLARIFY | STOP) |
| **Terminal states identified** | ✅ YES (STOP for SUCCESS + GATE_FAIL) |
| **Non-terminal state** | ✅ YES (CLARIFY stays active) |
| **Deterministic mapping** | ✅ YES (backend → cardState rules) |
| **State machine enforced** | ✅ YES (invariants + guards) |
| **Backward compatible** | ✅ YES (isWaitingForClarification preserved) |
| **Frontend only** | ✅ YES (no backend changes) |

---

**Status:** ✅ **Complete** - SearchCardState provides explicit, deterministic mapping of backend outcomes to frontend card lifecycle, with clear terminal vs non-terminal differentiation.

**Key Innovation:** Single enum replaces boolean flag, enabling richer state machine with multiple terminal/non-terminal states.
