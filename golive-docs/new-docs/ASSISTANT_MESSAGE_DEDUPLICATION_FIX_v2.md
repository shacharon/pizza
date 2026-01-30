# Assistant Message Deduplication Fix (v2)

**Date**: 2026-01-28  
**Type**: Bug Fix - Double Assistant Messages (WS + HTTP)  
**Scope**: Frontend Angular - Assistant Message Management  

---

## Problem Statement

**Issue:** Assistant SUMMARY messages appear **twice** in the UI for the same `requestId`.

### Root Cause

**Two Sources Creating Assistant Messages:**

1. **WebSocket** (`assistant` channel) → `addMessage()` → displayed via `assistantMessages()` array
2. **HTTP Response** (`GET /api/v1/search/:requestId/result`) → `response.assist` → potentially displayed via `SearchStore.assist()` computed signal

### Duplication Flow

```
Search Request (requestId: "req-123")
  ↓
Backend sends:
  1. WS message: { channel: "assistant", payload: { type: "SUMMARY", message: "..." } }
  2. HTTP response: { assist: { type: "guide", message: "..." }, results: [...] }
  ↓
Frontend:
  1. WS handler → addMessage(SUMMARY) → messages[0] = { type: SUMMARY, message: "..." }
  2. HTTP handler → setResponse() → assist() = { type: "guide", message: "..." }
  ↓
UI Rendering:
  - app-assistant-summary displays messages[0]  ← WebSocket source
  - [POTENTIAL] app-assistant-desktop-panel displays assist.message  ← HTTP source
  ↓
Result: TWO assistant bubbles for same requestId ❌
```

---

## Solution Strategy

### Policy: WebSocket is Single Source of Truth

1. **WebSocket** = Authoritative source for assistant messages
2. **HTTP Response** `assist` field = Ignore for UI messages (legacy field, not used)
3. **Hard Dedupe Guard** = Set-based tracking to prevent any duplicates

---

## Implementation

### 1. Add Dedupe Guard with MessageKey Set

**File:** `llm-angular/src/app/facades/search-assistant.facade.ts`

**Add Private Set:**
```typescript
// DEDUPLICATION: Track seen messages to prevent duplicates (WS + HTTP)
private readonly seenMessageKeys = new Set<string>();
```

**Update `addMessage()` Method:**
```typescript
addMessage(
  type: 'CLARIFY' | 'SUMMARY' | 'GATE_FAIL',
  message: string,
  requestId: string,
  question: string | null = null,
  blocksSearch: boolean = false
): void {
  // DEDUPLICATION FIX: Hard guard - skip if already seen
  const messageKey = `${requestId}:ASSISTANT:${type}`;
  
  if (this.seenMessageKeys.has(messageKey)) {
    console.log('[SearchAssistantHandler] Duplicate assistant message blocked', {
      requestId,
      type,
      messageKey
    });
    return; // Skip duplicate
  }
  
  // Mark as seen
  this.seenMessageKeys.add(messageKey);
  
  const timestamp = Date.now();
  const id = `${requestId}-${type}-${timestamp}`;
  
  const newMessage: AssistantMessage = {
    id, type, message, question, blocksSearch, requestId, timestamp
  };
  
  console.log('[SearchAssistantHandler] Adding new assistant message', {
    requestId,
    type,
    timestamp,
    totalMessages: this._messages().length + 1
  });
  
  // Append new message (dedupe ensures no duplicates)
  this._messages.update(msgs => [...msgs, newMessage]);
  
  // Legacy: Also update single message state
  this.setMessage(message, requestId, blocksSearch);
}
```

**Update `reset()` Method:**
```typescript
reset(): void {
  this._messages.set([]);
  this.seenMessageKeys.clear(); // Clear dedupe set
  this.assistantText.set('');
  this.assistantStatus.set('pending');
  this.wsRecommendations.set([]);
  this.wsError.set(undefined);
  this.messageRequestId.set(undefined);
  this._blocksSearch.set(false);
}
```

**Update `resetIfGlobal()` Method:**
```typescript
resetIfGlobal(): void {
  // Filter messages: keep only those with requestId (card-bound)
  const cardBoundMessages = this._messages().filter(msg => !!msg.requestId);
  
  if (cardBoundMessages.length < this._messages().length) {
    console.log('[SearchAssistantHandler] Clearing global/system assistant messages', {
      before: this._messages().length,
      after: cardBoundMessages.length
    });
    this._messages.set(cardBoundMessages);
    
    // DEDUPLICATION: Remove keys for cleared messages
    const remainingKeys = new Set(cardBoundMessages.map(msg => `${msg.requestId}:ASSISTANT:${msg.type}`));
    for (const key of this.seenMessageKeys) {
      if (!remainingKeys.has(key)) {
        this.seenMessageKeys.delete(key);
      }
    }
  }
  
  // Legacy state cleanup...
}
```

---

### 2. Ensure HTTP Response Assist Field is NOT Used

**File:** `llm-angular/src/app/state/search.store.ts`

**No Changes Needed** - The `assist` computed signal exists but is only used by:
1. `assistant-desktop-panel` component (NOT mounted in current UI)
2. `search-page.component.ts` for mode checking (not for message display)

**Verification:** Confirm that NO component creates assistant UI messages from `response.assist`.

---

### 3. Document WebSocket as Single Source

**File:** `llm-angular/src/app/facades/search-assistant.facade.ts`

**Add Comment:**
```typescript
/**
 * Search Assistant State Handler
 * Manages assistant narration and state
 * 
 * SOURCE OF TRUTH: WebSocket only
 * - Assistant messages come ONLY from WS channel="assistant"
 * - HTTP response.assist field is legacy and NOT used for UI messages
 * - Dedupe guard prevents any duplicate messages for same requestId+type
 */
```

---

## Files Modified

### 1. Assistant Handler (Main Fix)

**`llm-angular/src/app/facades/search-assistant.facade.ts`**

**Changes:**
- Added `seenMessageKeys: Set<string>` for hard dedupe
- Updated `addMessage()` to check Set before adding
- Updated `reset()` to clear Set
- Updated `resetIfGlobal()` to prune Set
- Added documentation comment

**Lines changed:** ~30

---

### 2. No Changes Needed (Verification)

**`llm-angular/src/app/state/search.store.ts`**
- `assist` computed signal exists but not used for message creation
- ✅ Already correct (WebSocket is source)

**`llm-angular/src/app/facades/search.facade.ts`**
- `handleSearchResponse()` calls `searchStore.setResponse(response)`
- Does NOT extract `response.assist` for assistant messages
- ✅ Already correct (WebSocket is source)

**`llm-angular/src/app/features/unified-search/components/assistant-desktop-panel/*`**
- Component uses `assist` input but is NOT mounted in current UI
- ✅ No action needed (component not in use)

---

## Behavior After Fix

### Scenario: Normal Search with SUMMARY

**Input:** User searches "pizza near me"

**Backend Sends:**
1. WS: `{ channel: "assistant", payload: { type: "SUMMARY", message: "Found 5 pizza places" } }`
2. HTTP: `{ assist: { type: "guide", message: "Found 5 pizza places" }, results: [...] }`

**Frontend Processing:**

```typescript
// WS arrives first
messageKey = "req-123:ASSISTANT:SUMMARY"
seenMessageKeys.has(messageKey) → false
seenMessageKeys.add(messageKey) → Set { "req-123:ASSISTANT:SUMMARY" }
messages.push({ type: SUMMARY, message: "Found 5 pizza places", ... })
✅ Displayed

// HTTP arrives later
setResponse(response) → assist = { type: "guide", message: "..." }
// NO code extracts assist.message for UI
// assist signal is exposed but not used for message creation
✅ Ignored

Result: ONE assistant message ✅
```

---

### Scenario: WS Message Arrives Twice (Reconnect Edge Case)

**Input:** WebSocket reconnects and replays messages

**Backend Sends:**
1. WS (first): `{ type: "SUMMARY", requestId: "req-123" }`
2. WS (replay): `{ type: "SUMMARY", requestId: "req-123" }`

**Frontend Processing:**

```typescript
// First message
messageKey = "req-123:ASSISTANT:SUMMARY"
seenMessageKeys.has(messageKey) → false
seenMessageKeys.add(messageKey)
messages.push({ type: SUMMARY, ... })
✅ Displayed

// Replay message
messageKey = "req-123:ASSISTANT:SUMMARY"
seenMessageKeys.has(messageKey) → true
return; // Skip duplicate
❌ Blocked

Result: ONE assistant message ✅
```

---

### Scenario: HTTP Arrives First (Unlikely but Possible)

**Input:** HTTP response completes before WebSocket connects

**Backend Sends:**
1. HTTP: `{ assist: { message: "..." }, results: [...] }`
2. WS (later): `{ type: "SUMMARY", message: "..." }`

**Frontend Processing:**

```typescript
// HTTP arrives first
setResponse(response) → assist = { type: "guide", message: "..." }
// NO code creates message from assist
✅ Ignored (not used)

// WS arrives later
messageKey = "req-123:ASSISTANT:SUMMARY"
seenMessageKeys.has(messageKey) → false
seenMessageKeys.add(messageKey)
messages.push({ type: SUMMARY, ... })
✅ Displayed

Result: ONE assistant message ✅
```

---

## Verification

### Test 1: Normal Search

```typescript
// Perform search
facade.search("pizza near me");

// Wait for completion
await new Promise(resolve => setTimeout(resolve, 3000));

// Check messages array
const messages = facade.assistantMessages();
console.log('Messages count:', messages.length);
console.log('Messages:', messages);

// Expected: ONE SUMMARY message
// messages.length === 1
// messages[0].type === 'SUMMARY'
```

---

### Test 2: Page Refresh (Resubscribe)

```typescript
// Search completes
// User refreshes page
// Frontend resubscribes to WebSocket

// Check if duplicate appears
const messagesAfterRefresh = facade.assistantMessages();

// Expected: Still ONE message (dedupe prevents replay)
```

---

### Test 3: Check HTTP Assist Field

```typescript
// After search completes
const response = facade.response();
console.log('HTTP assist field:', response?.assist);

// Verify: assist field exists BUT is not used for UI
// No component should render assist.message as assistant bubble
```

---

## Edge Cases Handled

| Scenario | Behavior | Result |
|----------|----------|--------|
| WS arrives before HTTP | WS message added, HTTP assist ignored | ✅ One message |
| HTTP arrives before WS | HTTP assist ignored, WS message added | ✅ One message |
| WS message replayed (reconnect) | Dedupe blocks second message | ✅ One message |
| Same requestId, different types (SUMMARY + CLARIFY) | Both allowed (different messageKeys) | ✅ Two messages (expected) |
| New search (different requestId) | New messageKey, allowed | ✅ One message per search |

---

## Rollback Plan

If issues arise:

```bash
git revert <commit-sha>
```

Changes are isolated to `search-assistant.facade.ts` only. No other components modified.

---

## Future Enhancements

### Remove HTTP `assist` Field Entirely

Since WebSocket is the source of truth, consider removing `assist` from HTTP response in future API version:

```typescript
// Backend: search.controller.ts
// Remove: assist: { type: 'guide', message: assistMessage }
// Frontend will rely solely on WebSocket
```

### Add Metrics

Track dedupe hits to monitor if duplicates are being blocked:

```typescript
if (this.seenMessageKeys.has(messageKey)) {
  metrics.increment('assistant.message.duplicate_blocked');
  return;
}
```

---

**Status:** ✅ **Ready for Implementation** - Hard dedupe guard with Set-based messageKey tracking ensures WebSocket is the single source of truth for assistant messages.

**Key Achievement:** Eliminates duplicate assistant messages by implementing a fail-safe dedupe mechanism that prevents any message from being added twice, regardless of source (WS or HTTP).
