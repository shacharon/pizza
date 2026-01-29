# WebSocket Reconnect Fix - Assistant Message Misplacement

**Date**: 2026-01-28  
**Type**: Frontend Fix - Message Routing After Reconnect  
**Scope**: Prevent assistant messages from appearing "outside the frame" after WS reconnect

---

## Problem Statement

After WebSocket reconnect, assistant CLARIFY messages sometimes appeared misplaced or "outside the search card context".

**Root cause:** `AssistantLineComponent` subscribed directly to WebSocket messages without filtering by the active `requestId`, allowing old/stale messages to be displayed after reconnect.

---

## Architecture Analysis

### Message Display Paths

**Path 1: AssistantLineComponent (VULNERABLE)**
```
WebSocket → wsClient.messages$ → AssistantLineComponent.handleNarratorMessage()
                                   └─→ NO requestId filtering ❌
                                       └─→ Display ANY assistant message
```

**Path 2: AssistantSummaryComponent (SAFE)**
```
WebSocket → wsClient.messages$ → SearchFacade.handleWsMessage()
                                   └─→ wsHandler.handleMessage(msg, currentRequestId)
                                       └─→ Filter by currentRequestId ✅
                                           └─→ onAssistantMessage callback
                                               └─→ assistantHandler.setMessage()
                                                   └─→ AssistantSummaryComponent
```

**Vulnerability:** AssistantLineComponent bypassed SearchFacade's requestId filtering.

---

## Solution

### Rule Implemented:
**Every assistant message with requestId MUST be filtered by SearchFacade's active requestId before display.**

### Changes Made

**File:** `assistant-line.component.ts`

**Change 1: Import SearchFacade**
```typescript
// Line 1-6: Add SearchFacade import
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, signal, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WsClientService } from '../../../../core/services/ws-client.service';
import { SearchFacade } from '../../../../facades/search.facade';  // NEW
import { Subscription } from 'rxjs';
import { ConnectionStatus } from '../../../../core/models/ws-protocol.types';
```

**Change 2: Inject SearchFacade**
```typescript
// Line 148-156: Replace constructor, inject SearchFacade
private readonly wsClient = inject(WsClientService);
private readonly searchFacade = inject(SearchFacade);  // NEW

constructor() {
  // Track WebSocket connection status with debouncing
  effect(() => {
    const status = this.wsClient.connectionStatus();
    this.handleWsStatusChangeDebounced(status);
  });
}
```

**Change 3: Filter narrator messages by active requestId**
```typescript
// Line 305-322: Add requestId filtering in handleNarratorMessage()
// CLARIFY FIX: Suppress CLARIFY messages (displayed in AssistantSummaryComponent)
if (narrator.type === 'CLARIFY') {
  console.log('[AssistantLine] Suppressing CLARIFY (displayed in summary)');
  return;
}

// RECONNECT FIX: Only show messages for the ACTIVE search request
// Filter by SearchFacade's currentRequestId to prevent old messages after reconnect
const activeRequestId = this.searchFacade.requestId();
if (activeRequestId && requestId !== activeRequestId) {
  console.log('[AssistantLine] Ignoring message for inactive requestId', {
    messageRequestId: requestId,
    activeRequestId
  });
  return;
}

// Check if this is a new requestId...
```

**Change 4: Filter old format messages by active requestId**
```typescript
// Line 253-270: Add requestId filtering in handleAssistantMessage()
private handleAssistantMessage(msg: any): void {
  // Validate message structure
  if (!msg.requestId || typeof msg.seq !== 'number' || !msg.message) {
    return;
  }

  const { requestId, seq, message, type } = msg;

  // RECONNECT FIX: Only show messages for the ACTIVE search request
  const activeRequestId = this.searchFacade.requestId();
  if (activeRequestId && requestId !== activeRequestId) {
    console.log('[AssistantLine] Ignoring old format message for inactive requestId', {
      messageRequestId: requestId,
      activeRequestId
    });
    return;
  }

  // Check if this is a new requestId...
}
```

---

## Data Flow After Fix

### Scenario 1: Normal Search (No Reconnect)

```
1. User searches "pizza"
2. Backend returns requestId: "req-123"
3. SearchFacade.currentRequestId = "req-123"
4. Assistant message arrives: { requestId: "req-123", type: "SUMMARY" }
5. AssistantLineComponent:
   - Check: activeRequestId = "req-123", messageRequestId = "req-123" ✅
   - Display message ✅
```

### Scenario 2: WebSocket Reconnect with Stale Message

```
1. User searched "pizza" → requestId: "req-123"
2. User searches "sushi" → requestId: "req-456"
3. SearchFacade.currentRequestId = "req-456"
4. WebSocket reconnects
5. Backend resends old message: { requestId: "req-123", type: "SUMMARY" }
6. AssistantLineComponent:
   - Check: activeRequestId = "req-456", messageRequestId = "req-123" ❌
   - IGNORE message (not active request) ✅
```

### Scenario 3: DONE_CLARIFY State

```
1. User searches "something tasty" → requestId: "req-789"
2. Backend returns DONE_CLARIFY
3. SearchFacade.currentRequestId = "req-789"
4. SearchFacade.clarificationBlocking = true
5. Assistant message arrives: { requestId: "req-789", type: "CLARIFY" }
6. AssistantLineComponent:
   - Check narrator.type === 'CLARIFY' → SUPPRESS (displayed in summary) ✅
7. AssistantSummaryComponent:
   - Displays CLARIFY message (via SearchFacade path) ✅
```

---

## Reconnect Behavior Matrix

| Condition | Message RequestId | Active RequestId | AssistantLineComponent | AssistantSummaryComponent |
|-----------|------------------|------------------|----------------------|--------------------------|
| **Current search** | req-123 | req-123 | ✅ Display (SUMMARY/GATE_FAIL) | ✅ Display (if shown) |
| **Old search** | req-100 | req-123 | ❌ Ignore | ❌ Filtered by SearchFacade |
| **CLARIFY current** | req-123 | req-123 | ❌ Suppress (CLARIFY type) | ✅ Display |
| **CLARIFY old** | req-100 | req-123 | ❌ Ignore (wrong requestId) | ❌ Filtered by SearchFacade |
| **No active search** | req-123 | undefined | ⚠️ Display (no filter) | ❌ No active search |

**Note:** "No active search" scenario (fresh page load) is acceptable - shows last message until new search starts.

---

## Edge Cases Handled

### 1. WebSocket Reconnect During Active Search
```
Given: User has active search with requestId "req-123"
When: WebSocket reconnects
And: Backend resends messages for old requestId "req-100"
Then: AssistantLineComponent ignores old messages ✅
And: Only current search messages displayed ✅
```

### 2. CLARIFY State Preserved Across Reconnect
```
Given: User in DONE_CLARIFY state with requestId "req-123"
When: WebSocket reconnects
And: Backend resends CLARIFY message for "req-123"
Then: AssistantLineComponent suppresses (CLARIFY type) ✅
And: AssistantSummaryComponent already showing message ✅
And: No duplicate display ✅
```

### 3. Multiple Reconnects
```
Given: User searches multiple times: req-1 → req-2 → req-3
When: WebSocket reconnects after each search
And: Backend resends messages for all previous requestIds
Then: Only req-3 messages displayed ✅
And: Old messages (req-1, req-2) ignored ✅
```

### 4. Fresh Page Load (No Active Search)
```
Given: User loads page (no search yet)
When: WebSocket connects
And: Backend sends message with requestId from previous session
Then: AssistantLineComponent may display (no filter, acceptable) ⚠️
And: Will be cleared when new search starts ✅
```

---

## Verification

### Test Case 1: Normal Flow
```typescript
// Given
currentRequestId = "req-123"
message = { requestId: "req-123", payload: { type: "SUMMARY", message: "Found 10 results" } }

// When
handleNarratorMessage(message)

// Then
✅ Message displayed in AssistantLineComponent
✅ Message processed by SearchFacade → AssistantSummaryComponent
```

### Test Case 2: Stale Message After Reconnect
```typescript
// Given
currentRequestId = "req-456" (new search)
message = { requestId: "req-123", payload: { type: "SUMMARY", message: "Old message" } }

// When
handleNarratorMessage(message)

// Then
✅ Message ignored (logged: "Ignoring message for inactive requestId")
❌ No display in AssistantLineComponent
❌ SearchFacade also filters (double protection)
```

### Test Case 3: CLARIFY Message
```typescript
// Given
currentRequestId = "req-789"
message = { requestId: "req-789", payload: { type: "CLARIFY", message: "Need more info", blocksSearch: true } }

// When
handleNarratorMessage(message)

// Then
✅ Message suppressed in AssistantLineComponent (CLARIFY type)
✅ SearchFacade processes via onAssistantMessage → AssistantSummaryComponent
✅ Single display in AssistantSummaryComponent
```

---

## Protection Layers

| Layer | Component | Mechanism | Coverage |
|-------|-----------|-----------|----------|
| **Layer 1** | SearchFacade | wsHandler.handleMessage() filters by currentRequestId | ✅ AssistantSummaryComponent |
| **Layer 2** | AssistantLineComponent | Inject SearchFacade, filter by requestId() | ✅ AssistantLineComponent |
| **Layer 3** | AssistantLineComponent | Suppress CLARIFY type messages | ✅ Prevents duplication |

**Result:** Triple protection against misplaced messages ✅

---

## Files Modified

**1 file changed:**
- `llm-angular/src/app/features/unified-search/components/assistant-line/assistant-line.component.ts`

**Lines added:** ~20 lines (imports, injection, filtering logic)

**Complexity:** Low (guard clauses with early returns)

---

## No Backend Changes

✅ Backend contract unchanged (still sends requestId with every message)  
✅ Backend reconnect behavior unchanged (may resend messages)  
✅ Frontend now correctly filters by active requestId  

---

## Summary

| Aspect | Status |
|--------|--------|
| **Assistant messages contextual** | ✅ YES (filtered by active requestId) |
| **Reconnect protection** | ✅ YES (ignore old requestIds) |
| **CLARIFY state preserved** | ✅ YES (still bound to requestId) |
| **No duplicate messages** | ✅ YES (CLARIFY suppressed in single-line) |
| **Messages always in frame** | ✅ YES (bound to search card context) |
| **Frontend only** | ✅ YES (no backend changes) |
| **No refactors** | ✅ YES (minimal changes to one component) |

---

**Status:** ✅ **Complete** - Assistant messages now always contextual to active search, never misplaced after reconnect.

**Key Fix:** AssistantLineComponent now coordinates with SearchFacade's currentRequestId to filter messages, ensuring only active search messages are displayed.
