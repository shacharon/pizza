# Assistant Message Deduplication Fix

**Date**: 2026-01-28  
**Type**: Frontend Fix - Strict Type Validation for Assistant Messages  
**Scope**: Prevent system notifications from rendering as assistant messages

---

## Problem Statement

Both **LLM assistant messages** and **system notifications** were being rendered as assistant UI bubbles, causing:
- Duplicate messages for the same search stage
- System events (e.g., notifications, hints) appearing as assistant messages
- Confusion about which messages are actual LLM-generated content

**Root Cause:** The WebSocket message handler was too permissive, accepting any message with `type: 'assistant'` without validating the payload type.

---

## Requirements

1. ✅ **Only LLM assistant messages** (CLARIFY | SUMMARY | GATE_FAIL) render as assistant bubbles
2. ✅ **System notifications** MUST NOT render as assistant messages
3. ✅ **Assistant messages with requestId** render only inside matching SearchCard
4. ✅ **Exactly one assistant message** per stage

---

## Solution: Strict Type Validation

### Valid Assistant Message Types

```typescript
const validTypes = ['CLARIFY', 'SUMMARY', 'GATE_FAIL'];
```

| Type | Purpose | Renders As |
|------|---------|-----------|
| **CLARIFY** | User clarification needed | Assistant bubble (contextual) |
| **SUMMARY** | Search results summary | Assistant bubble (contextual) |
| **GATE_FAIL** | Search failed at gate | Assistant bubble (contextual) |
| **Other** | System notifications, hints, etc. | ❌ Ignored / Non-assistant UI |

---

## Implementation

### Layer 1: WebSocket Handler Validation

**File:** `search-ws.facade.ts`

**Before (Too Permissive):**
```typescript
// Handle assistant messages (no channel field - inferred from type)
if ((msg as any).type === 'assistant' && 'payload' in (msg as any)) {
  console.log('[WS][assistant] received', { requestId: msg.requestId });
  if (handlers.onAssistantMessage) handlers.onAssistantMessage(msg);
  return true;
}
```

**After (Strict Validation):**
```typescript
// DEDUP FIX: Handle assistant messages with strict validation
// Only messages with type='assistant' AND valid payload.type should be processed
if ((msg as any).type === 'assistant' && 'payload' in (msg as any)) {
  const payload = (msg as any).payload;
  const validTypes = ['CLARIFY', 'SUMMARY', 'GATE_FAIL'];
  
  // Validate payload has proper assistant type
  if (payload && payload.type && validTypes.includes(payload.type)) {
    console.log('[WS][assistant] Valid LLM message:', payload.type, { requestId: msg.requestId });
    if (handlers.onAssistantMessage) handlers.onAssistantMessage(msg);
    return true;
  } else {
    console.log('[WS][assistant] Ignoring non-LLM message:', payload?.type || 'unknown');
    return true; // Consumed but not processed
  }
}
```

**Key Changes:**
- Extract `payload` from message
- Define `validTypes` whitelist
- Check `payload.type` is in whitelist
- Log and ignore non-LLM messages
- Still return `true` (consumed) to prevent fallthrough

---

**Legacy Channel Format (Same Validation):**
```typescript
// Handle assistant channel messages (legacy with channel field)
if ('channel' in (msg as any) && (msg as any).channel === 'assistant') {
  const payload = (msg as any).payload;
  const validTypes = ['CLARIFY', 'SUMMARY', 'GATE_FAIL'];
  
  // Validate legacy format also has proper type
  if (payload && payload.type && validTypes.includes(payload.type)) {
    console.log('[SearchWsHandler] Valid LLM assistant message on assistant channel');
    if (handlers.onAssistantMessage) handlers.onAssistantMessage(msg);
    return true;
  } else {
    console.log('[SearchWsHandler] Ignoring non-LLM message on assistant channel');
    return true; // Consumed but not processed
  }
}
```

---

### Layer 2: Facade Handler Validation

**File:** `search.facade.ts`

**Before (No Validation):**
```typescript
onAssistantMessage: (msg) => {
  const narratorMsg = msg as any;
  const narrator = narratorMsg.payload;
  console.log('[SearchFacade] Assistant message received:', narrator.type, narrator.message);

  // Directly process without type checking
  const assistMessage = narrator.message || narrator.question || '';
  if (assistMessage) {
    this.assistantHandler.setMessage(assistMessage, narratorMsg.requestId, ...);
  }
  // ...
}
```

**After (Strict Type Guard):**
```typescript
onAssistantMessage: (msg) => {
  const narratorMsg = msg as any;
  const narrator = narratorMsg.payload;
  
  // DEDUP FIX: Strict type validation - only LLM assistant messages
  // System notifications MUST NOT render as assistant messages
  const validTypes = ['CLARIFY', 'SUMMARY', 'GATE_FAIL'];
  if (!narrator || !narrator.type || !validTypes.includes(narrator.type)) {
    console.log('[SearchFacade] Ignoring non-LLM assistant message:', narrator?.type || 'unknown');
    return; // Early return - do not process
  }

  console.log('[SearchFacade] Valid LLM assistant message:', narrator.type, narrator.message);

  // Only process valid LLM messages
  const assistMessage = narrator.message || narrator.question || '';
  if (assistMessage) {
    this.assistantHandler.setMessage(assistMessage, narratorMsg.requestId, ...);
  }
  // ...
}
```

**Key Changes:**
- Define `validTypes` whitelist (defense in depth)
- Early return if type invalid
- Log ignored messages for debugging
- Only process valid LLM assistant messages

---

## Message Flow with Validation

### Valid LLM Assistant Message

```
1. Backend sends:
   {
     type: "assistant",
     requestId: "req-123",
     payload: {
       type: "CLARIFY", ✅ Valid type
       message: "Do you want pizza or pasta?",
       blocksSearch: true
     }
   }

2. WebSocket Handler (Layer 1):
   - Extract payload ✅
   - Check: type === "CLARIFY" in validTypes? YES ✅
   - Pass to onAssistantMessage handler ✅

3. Facade Handler (Layer 2):
   - Extract narrator ✅
   - Check: type === "CLARIFY" in validTypes? YES ✅
   - Process message ✅
   - setMessage() called ✅

4. Placement Logic:
   - assistantHasRequestId() = true ✅
   - showContextualAssistant() = true ✅
   
5. UI Rendering:
   - Renders INSIDE search-card ✅
   - Exactly one assistant message ✅
```

---

### System Notification (Filtered Out)

```
1. Backend sends:
   {
     type: "assistant",
     requestId: "req-456",
     payload: {
       type: "dietary_hint_sent", ❌ NOT a valid LLM type
       message: "Gluten-free hint added",
       metadata: { ... }
     }
   }

2. WebSocket Handler (Layer 1):
   - Extract payload ✅
   - Check: type === "dietary_hint_sent" in validTypes? NO ❌
   - Log: "Ignoring non-LLM message: dietary_hint_sent" ✅
   - Return true (consumed, not processed) ✅
   - Handler never calls onAssistantMessage ✅

3. Facade Handler (Layer 2):
   - Never invoked ✅

4. UI Rendering:
   - NOT rendered as assistant message ✅
   - System hint can be handled separately (future) ✅
```

---

### Invalid/Malformed Message

```
1. Backend sends:
   {
     type: "assistant",
     requestId: "req-789",
     payload: null ❌
   }

2. WebSocket Handler (Layer 1):
   - Extract payload: null ❌
   - Check: payload && payload.type? NO ❌
   - Log: "Ignoring non-LLM message: unknown" ✅
   - Return true (consumed) ✅

3. Result: Safely ignored ✅
```

---

## Defense in Depth

### Multi-Layer Validation

| Layer | Location | Purpose | Result |
|-------|----------|---------|--------|
| **Layer 1** | WebSocket Handler (`search-ws.facade.ts`) | Filter at entry point | Prevents invalid messages from reaching facade |
| **Layer 2** | Facade Handler (`search.facade.ts`) | Final validation before processing | Defense in depth, catches bypasses |
| **Layer 3** | Direct Subscribers (`assistant-line`, `assistant-panel`) | Validate at component level | Protects components that subscribe directly to WS |

**Benefit:** 
- Even if Layer 1 is bypassed (e.g., direct handler call), Layer 2 still protects
- Components that subscribe directly to WebSocket (bypassing facade) are also protected
- Complete coverage of all WebSocket message entry points

---

## Message Type Catalog

### Valid LLM Assistant Messages (Processed)

| Type | Trigger | blocksSearch | Card State | Renders |
|------|---------|-------------|-----------|---------|
| **CLARIFY** | DONE_CLARIFY | true | CLARIFY | Inside card ✅ |
| **SUMMARY** | Search results ready | false | RUNNING→STOP | Inside card ✅ |
| **GATE_FAIL** | Gate check failed | false | STOP | Inside card ✅ |

---

### System Notifications (Filtered Out)

| Type (Example) | Purpose | Should Render As |
|---------------|---------|-----------------|
| `dietary_hint_sent` | Gluten-free hint added | Badge/hint UI (not assistant) |
| `filter_applied` | Filter applied notification | System toast (not assistant) |
| `location_updated` | User location changed | System notification (not assistant) |
| `*_notification_sent` | Any system notification | Non-assistant UI |

**Rule:** If type is NOT in ['CLARIFY', 'SUMMARY', 'GATE_FAIL'], it's NOT an LLM assistant message.

---

## Edge Cases Handled

### 1. Message with Missing payload.type

```
Message: { type: "assistant", requestId: "req-123", payload: { message: "..." } }
         (no payload.type field)

Layer 1: payload.type is undefined
         → validTypes.includes(undefined) = false
         → Ignored ✅

Result: Safely filtered ✅
```

---

### 2. Message with Unexpected Type

```
Message: { type: "assistant", requestId: "req-456", payload: { type: "NEW_FEATURE", ... } }

Layer 1: "NEW_FEATURE" not in validTypes
         → Ignored ✅
         
Layer 2: Never reached (Layer 1 filtered)

Result: Forward-compatible - new types ignored until explicitly added to whitelist ✅
```

---

### 3. Case Sensitivity

```
Message: { type: "assistant", requestId: "req-789", payload: { type: "clarify", ... } }
         (lowercase)

Layer 1: "clarify" !== "CLARIFY"
         → validTypes.includes("clarify") = false
         → Ignored ✅

Result: Strict case matching prevents accidental inclusion ✅
```

**Note:** If backend sends lowercase, frontend must update whitelist OR backend must fix case.

---

### 4. Duplicate Messages with Same Type

```
Search "req-999" receives:
  1. SUMMARY message arrives → Processed ✅
  2. Another SUMMARY message arrives (duplicate) → Processed ✅ (overwrites previous)

Result:
  - Both pass validation (same type) ✅
  - setMessage() called twice
  - Last message wins (signal overwrite) ✅
  - UI shows latest message ✅
  - No visual duplication (single assistant bubble) ✅
```

**Note:** Duplicates of valid types are still allowed through validation, but signal state prevents UI duplication.

---

## Backward Compatibility

### Legacy Message Formats Still Supported

**Old Format 1: `assistant_message` with `narrator`**
```typescript
// Handled by legacy handler in AssistantLineComponent
if (message.type === 'assistant_message' && message.narrator) {
  // Still processed (not affected by this fix)
}
```

**Old Format 2: `assistant_progress` / `assistant_suggestion`**
```typescript
// Handled by legacy handler in AssistantLineComponent
if (message.type === 'assistant_progress' || message.type === 'assistant_suggestion') {
  // Still processed (different code path)
}
```

**New Format: `assistant` with `payload`**
```typescript
// NOW VALIDATED by this fix
if (message.type === 'assistant' && message.payload) {
  // Strict validation applied ✅
}
```

**Note:** Only the new `assistant` with `payload` format is affected by this fix. Legacy formats continue to work as before.

---

## Files Modified

**5 files changed:**

1. **`search-ws.facade.ts`** (~20 lines modified)
   - Added type validation to `handleMessage()` for modern format
   - Added type validation for legacy channel format
   - Log ignored messages

2. **`search.facade.ts`** (~10 lines added)
   - Added type validation to `onAssistantMessage` handler
   - Early return for invalid types
   - Log ignored messages

3. **`assistant-line.component.ts`** (~10 lines added)
   - Added type validation to `handleNarratorMessage()` (direct WS subscription)
   - Early return for invalid types
   - Log ignored messages
   - **Component is MOUNTED** (always visible)

4. **`assistant-panel.component.ts`** (~10 lines added)
   - Added type validation to `handleNarratorMessage()` (direct WS subscription)
   - Early return for invalid types
   - Log ignored messages
   - **Component is NOT MOUNTED** (defensive fix for future)

5. **Other assistant components checked:**
   - `assistant-desktop-panel.component.ts` - Presentational (no WS subscription) ✅
   - `assistant-strip.component.ts` - Presentational (no WS subscription) ✅

**Total:** ~50 lines of validation logic across all WS subscription points

---

## No Backend Changes

✅ Backend unchanged (continues to send all message types)  
✅ Frontend now filters system notifications  
✅ Only LLM assistant messages rendered as assistant bubbles  
✅ System notifications can be handled separately in future  

---

## Logging for Debugging

### Valid LLM Message

```
[WS][assistant] Valid LLM message: CLARIFY { requestId: "req-123" }
[SearchFacade] Valid LLM assistant message: CLARIFY Do you want pizza or pasta?
```

---

### Filtered System Notification

```
[WS][assistant] Ignoring non-LLM message: dietary_hint_sent
```

---

### Filtered Invalid Message

```
[WS][assistant] Ignoring non-LLM message: unknown
[SearchFacade] Ignoring non-LLM assistant message: undefined
```

---

## Verification

### Test Case 1: Valid CLARIFY Message

```typescript
// Input
message = {
  type: "assistant",
  requestId: "req-123",
  payload: {
    type: "CLARIFY",
    message: "Need clarification",
    blocksSearch: true
  }
}

// Layer 1
validTypes.includes("CLARIFY") = true ✅
→ Pass to onAssistantMessage ✅

// Layer 2
validTypes.includes("CLARIFY") = true ✅
→ Process message ✅

// Result
assistantText = "Need clarification" ✅
cardState = CLARIFY ✅
Renders inside search-card ✅
```

---

### Test Case 2: System Notification

```typescript
// Input
message = {
  type: "assistant",
  requestId: "req-456",
  payload: {
    type: "dietary_hint_sent",
    message: "Hint added"
  }
}

// Layer 1
validTypes.includes("dietary_hint_sent") = false ❌
→ Log and ignore ✅
→ Return true (consumed) ✅

// Layer 2
Never reached ✅

// Result
NOT rendered as assistant message ✅
UI remains unchanged ✅
```

---

### Test Case 3: Malformed Message

```typescript
// Input
message = {
  type: "assistant",
  requestId: "req-789",
  payload: {
    message: "Some message"
    // type field missing
  }
}

// Layer 1
payload.type = undefined
validTypes.includes(undefined) = false ❌
→ Log and ignore ✅

// Layer 2
Never reached ✅

// Result
Safely filtered ✅
```

---

## WebSocket Subscription Points

### Complete Coverage

| Component/Handler | Subscribes to WS? | Validation Added? | Mounted in UI? |
|-------------------|-------------------|-------------------|----------------|
| `search-ws.facade.ts` | ✅ YES (main handler) | ✅ YES | N/A (facade) |
| `search.facade.ts` | ➡️ Via search-ws | ✅ YES | N/A (facade) |
| `assistant-line.component.ts` | ✅ YES (direct) | ✅ YES | ✅ **MOUNTED** |
| `assistant-panel.component.ts` | ✅ YES (direct) | ✅ YES | ❌ Not mounted |
| `assistant-desktop-panel.component.ts` | ❌ NO (presentational) | N/A | ✅ MOUNTED |
| `assistant-strip.component.ts` | ❌ NO (presentational) | N/A | ✅ MOUNTED |
| `assistant-summary.component.ts` | ❌ NO (uses facade) | N/A | ✅ MOUNTED |

**Result:** All WebSocket subscription points now have strict type validation ✅

---

## Summary

| Requirement | Status |
|-------------|--------|
| **Only CLARIFY/SUMMARY/GATE_FAIL render** | ✅ YES (strict whitelist) |
| **System notifications filtered** | ✅ YES (not in whitelist) |
| **Assistant messages contextual** | ✅ YES (always have requestId) |
| **Exactly one message per stage** | ✅ YES (duplicates overwrite) |
| **Defense in depth** | ✅ YES (3-layer validation) |
| **All WS entry points protected** | ✅ YES (facade + direct subscribers) |
| **Forward compatible** | ✅ YES (new types ignored until added) |
| **Backward compatible** | ✅ YES (legacy formats unaffected) |
| **Frontend only** | ✅ YES (no backend changes) |

---

**Status:** ✅ **Complete** - Strict type validation ensures only LLM assistant messages (CLARIFY, SUMMARY, GATE_FAIL) render as assistant bubbles. System notifications are filtered and can be handled separately.

**Key Innovation:** Three-layer validation (WebSocket Handler + Facade Handler + Direct Subscribers) with explicit whitelist prevents any non-LLM messages from rendering as assistant content, regardless of how components consume WebSocket messages.
