# Assistant Message Deduplication Implementation Summary

**Date**: 2026-01-28  
**Type**: Bug Fix - Eliminate Double Assistant Messages  
**Status**: ✅ **Complete**

---

## Problem

Assistant SUMMARY messages appeared **twice** in the UI for the same `requestId`.

**Root Cause:**
- **WebSocket** sends assistant message → `addMessage()` → displays in UI
- **HTTP Response** contains `response.assist` field → potentially creates duplicate

---

## Solution Implemented

### Hard Deduplication Guard with MessageKey Set

**Strategy:** WebSocket is the single source of truth. Use Set-based tracking to prevent any duplicate for same `requestId + type`.

---

## Files Modified

### `llm-angular/src/app/facades/search-assistant.facade.ts`

**1. Added Private Set for Dedupe Tracking**
```typescript
// DEDUPLICATION FIX: Track seen messages to prevent duplicates (WS + HTTP race)
// MessageKey format: "${requestId}:ASSISTANT:${type}"
private readonly seenMessageKeys = new Set<string>();
```

---

**2. Updated `addMessage()` - Added Hard Guard**

**Before:**
```typescript
addMessage(...): void {
  const newMessage = { id, type, message, ... };
  
  // Check for duplicate (same requestId + type)
  const existing = this._messages().find(...);
  
  if (existing) {
    // Replace existing
    this._messages.update(msgs => msgs.map(...));
  } else {
    // Append new
    this._messages.update(msgs => [...msgs, newMessage]);
  }
}
```

**After:**
```typescript
addMessage(...): void {
  // DEDUPLICATION FIX: Hard guard - skip if already seen
  const messageKey = `${requestId}:ASSISTANT:${type}`;
  
  if (this.seenMessageKeys.has(messageKey)) {
    console.log('[SearchAssistantHandler] Duplicate assistant message blocked', {
      requestId,
      type,
      messageKey,
      source: 'dedupe_guard'
    });
    return; // Skip duplicate - already processed
  }
  
  // Mark as seen
  this.seenMessageKeys.add(messageKey);
  
  const newMessage = { id, type, message, ... };
  
  console.log('[SearchAssistantHandler] Adding new assistant message', {
    requestId,
    type,
    timestamp,
    messageKey,
    totalMessages: this._messages().length + 1
  });
  
  // Append new message (dedupe guard ensures no duplicates)
  this._messages.update(msgs => [...msgs, newMessage]);
  
  // Legacy state sync...
}
```

**Key Changes:**
- ✅ Check `seenMessageKeys` Set BEFORE processing
- ✅ Return early if duplicate detected
- ✅ Add `messageKey` to Set to track
- ✅ Simplified logic (no more replace/append branching)

---

**3. Updated `reset()` - Clear Dedupe Set**

```typescript
reset(): void {
  this._messages.set([]);
  this.seenMessageKeys.clear(); // Clear dedupe tracking
  this.assistantText.set('');
  // ... other resets
}
```

---

**4. Updated `resetIfGlobal()` - Prune Dedupe Set**

**Before:**
```typescript
resetIfGlobal(): void {
  const cardBoundMessages = this._messages().filter(msg => !!msg.requestId);
  
  if (cardBoundMessages.length < this._messages().length) {
    this._messages.set(cardBoundMessages);
  }
  // ...
}
```

**After:**
```typescript
resetIfGlobal(): void {
  const cardBoundMessages = this._messages().filter(msg => !!msg.requestId);
  
  if (cardBoundMessages.length < this._messages().length) {
    this._messages.set(cardBoundMessages);
    
    // DEDUPLICATION: Remove keys for cleared messages
    const remainingKeys = new Set(
      cardBoundMessages.map(msg => `${msg.requestId}:ASSISTANT:${msg.type}`)
    );
    for (const key of this.seenMessageKeys) {
      if (!remainingKeys.has(key)) {
        this.seenMessageKeys.delete(key);
      }
    }
  }
  // ...
}
```

**Why:** When global messages are cleared, their dedupe keys must also be removed to allow re-use of those keys for future searches.

---

**5. Added Documentation Comment**

```typescript
/**
 * Search Assistant State Handler
 * Manages assistant narration and state
 * 
 * SOURCE OF TRUTH: WebSocket only
 * - Assistant messages come ONLY from WS channel="assistant"
 * - HTTP response.assist field is legacy and NOT used for UI messages
 * - Dedupe guard prevents any duplicate messages for same requestId+type
 * 
 * MULTI-MESSAGE: Supports accumulating multiple assistant messages with timestamps
 */
```

---

## No Changes Needed (Verified)

### `llm-angular/src/app/state/search.store.ts`
- ✅ `assist` computed signal exists but NOT used to create assistant UI messages
- ✅ WebSocket is already the source

### `llm-angular/src/app/facades/search.facade.ts`
- ✅ `handleSearchResponse()` calls `searchStore.setResponse(response)`
- ✅ Does NOT extract `response.assist` to create messages
- ✅ WebSocket handlers are correct

### `llm-angular/src/app/features/unified-search/components/assistant-desktop-panel/*`
- ✅ Component uses `assist` input but is NOT mounted in current UI
- ✅ No action needed

---

## Behavior After Fix

### Scenario 1: WS Message Arrives First (Normal Flow)

```
1. WS message arrives: { type: "SUMMARY", requestId: "req-123" }
2. messageKey = "req-123:ASSISTANT:SUMMARY"
3. seenMessageKeys.has(messageKey) → false
4. seenMessageKeys.add(messageKey)
5. Message added to _messages array ✅
6. UI displays ONE message

7. HTTP response arrives: { assist: { message: "..." }, results: [...] }
8. searchStore.setResponse(response)
9. assist signal updated BUT not used for UI
10. NO duplicate created ✅
```

**Result:** ONE assistant message ✅

---

### Scenario 2: WS Reconnect (Replay Edge Case)

```
1. WS message arrives (first): { type: "SUMMARY", requestId: "req-123" }
2. messageKey = "req-123:ASSISTANT:SUMMARY"
3. seenMessageKeys.add(messageKey)
4. Message added ✅

5. WS reconnects and replays same message
6. messageKey = "req-123:ASSISTANT:SUMMARY"
7. seenMessageKeys.has(messageKey) → true
8. return; // Skip duplicate ❌ Blocked

9. Console log: "Duplicate assistant message blocked"
```

**Result:** ONE assistant message ✅

---

### Scenario 3: HTTP Arrives First (Unlikely)

```
1. HTTP response arrives: { assist: { message: "..." }, results: [...] }
2. searchStore.setResponse(response)
3. assist signal updated BUT not used for UI
4. NO message created

5. WS message arrives (later): { type: "SUMMARY", requestId: "req-123" }
6. messageKey = "req-123:ASSISTANT:SUMMARY"
7. seenMessageKeys.has(messageKey) → false
8. seenMessageKeys.add(messageKey)
9. Message added ✅
```

**Result:** ONE assistant message ✅

---

## Edge Cases Handled

| Scenario | messageKey | Dedupe Result | UI Result |
|----------|-----------|---------------|-----------|
| WS arrives once | `req-123:ASSISTANT:SUMMARY` | Added to Set | ✅ One message |
| WS arrives twice (replay) | Same key | Blocked by Set | ✅ One message |
| HTTP + WS (WS first) | WS added, HTTP ignored | WS in Set | ✅ One message |
| HTTP + WS (HTTP first) | HTTP ignored, WS added | WS in Set | ✅ One message |
| Different requestId | `req-456:ASSISTANT:SUMMARY` | New key, allowed | ✅ One message per search |
| Different type (CLARIFY) | `req-123:ASSISTANT:CLARIFY` | Different key, allowed | ✅ Two messages (expected) |

---

## Verification

### Manual Test

```typescript
// 1. Perform search
await facade.search("pizza near me");

// 2. Wait for completion
await new Promise(resolve => setTimeout(resolve, 3000));

// 3. Check messages
const messages = facade.assistantMessages();
console.log('Message count:', messages.length);
console.log('Messages:', messages);

// Expected: messages.length === 1
// Expected: messages[0].type === 'SUMMARY'
```

### Console Logs (Expected)

```
[SearchAssistantHandler] Adding new assistant message {
  requestId: "req-123",
  type: "SUMMARY",
  timestamp: 1738012345678,
  messageKey: "req-123:ASSISTANT:SUMMARY",
  totalMessages: 1
}
```

**If duplicate attempted:**
```
[SearchAssistantHandler] Duplicate assistant message blocked {
  requestId: "req-123",
  type: "SUMMARY",
  messageKey: "req-123:ASSISTANT:SUMMARY",
  source: "dedupe_guard"
}
```

---

## Summary of Changes

| File | Changes | Lines Modified |
|------|---------|---------------|
| `search-assistant.facade.ts` | Added dedupe Set, updated 4 methods | ~45 lines |

**Total:** 1 file, ~45 lines

---

## Key Achievements

1. ✅ **Hard Dedupe Guard** - Set-based tracking prevents any duplicate
2. ✅ **WebSocket Source of Truth** - HTTP `assist` field not used for UI
3. ✅ **Graceful Edge Cases** - WS replay, HTTP race conditions handled
4. ✅ **Clear Logging** - Duplicate blocks are logged for debugging
5. ✅ **Backward Compatible** - Legacy state still maintained
6. ✅ **Clean State Management** - Dedupe Set cleared/pruned appropriately

---

## Where Duplication Was

**Source 1 (Active):** WebSocket `assistant` channel → `addMessage()` → `_messages` array → UI display

**Source 2 (Inactive but Potential):** HTTP response → `setResponse()` → `assist` computed signal → ~~Could be displayed~~ (not currently used)

**Fix:** Ensured only Source 1 creates UI messages + added dedupe guard to prevent any race conditions.

---

**Status:** ✅ **Complete** - Duplicate assistant messages eliminated via Set-based dedupe guard. WebSocket is the single source of truth.
