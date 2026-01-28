# Assistant WebSocket Messages - Final Fix

## Status: ✅ COMPLETE

Fixed frontend to display assistant WS messages that were being published by server but **silently ignored** by the UI.

---

## Root Cause Analysis

### The Protocol Mismatch

**Backend Protocol** (`server/src/infra/websocket/websocket-protocol.ts`):
```typescript
export interface WSServerAssistant {
  type: 'assistant';           // ← Server sends this
  requestId: string;
  payload: {                   // ← Server uses 'payload'
    type: 'GATE_FAIL' | 'CLARIFY' | 'SUMMARY';
    message: string;
    question: string | null;
    blocksSearch: boolean;
  };
}
```

**Frontend Protocol (BEFORE)** (`llm-angular/src/app/core/models/ws-protocol.types.ts`):
```typescript
export interface WSServerAssistantMessage {
  type: 'assistant_message';   // ← Frontend expected this ❌
  requestId: string;
  narrator: {                  // ← Frontend expected 'narrator' ❌
    type: 'GATE_FAIL' | 'CLARIFY' | 'SUMMARY';
    message: string;
    question: string | null;
    suggestedAction: '...';
    blocksSearch: boolean;
  };
  timestamp: number;
}

// CRITICAL: WSServerMessage union type did NOT include WSServerAssistant!
export type WSServerMessage = 
  | ...
  | WSServerAssistantMessage    // ← Only included the wrong type
  | ...
```

### Where Messages Were Dropped

**Problem 1: Missing Type Definition**

📍 **File:** `llm-angular/src/app/core/models/ws-protocol.types.ts`

**Issue:** The `WSServerMessage` union type did **NOT** include `WSServerAssistant` (the actual type the server sends).

**Result:** TypeScript types were incomplete, but JavaScript runtime continued (no type checking at runtime).

---

**Problem 2: Wrong Type Check in Assistant Panel**

📍 **File:** `llm-angular/src/app/features/unified-search/components/assistant-panel/assistant-panel.component.ts` (line 68)

**BEFORE:**
```typescript
private subscribeToWebSocket(): void {
  this.wsSubscription = this.wsClient.messages$.subscribe((message: any) => {
    if (message.type === 'assistant_progress' || message.type === 'assistant_suggestion') {
      this.handleAssistantMessage(message);
    } else if (message.type === 'assistant_message' && message.narrator) {
      // ❌ Checked for 'assistant_message' but server sends 'assistant'
      // ❌ Checked for 'message.narrator' but server sends 'message.payload'
      this.handleNarratorMessage(message);
    }
  });
}
```

**What happened:**
- Server sent: `{ type: 'assistant', payload: {...} }`
- Frontend checked: `message.type === 'assistant_message'` → FALSE
- **Message was silently ignored** (dropped, never handled)

---

**Problem 3: Wrong Payload Property in Handler**

📍 **File:** `llm-angular/src/app/features/unified-search/components/assistant-panel/assistant-panel.component.ts` (line 121)

**BEFORE:**
```typescript
private handleNarratorMessage(msg: any): void {
  if (!msg.requestId || !msg.narrator || !msg.narrator.message) {
    // ❌ Checked for 'msg.narrator' but server sends 'msg.payload'
    console.warn('[AssistantPanel] Invalid narrator message structure:', msg);
    return;
  }

  const { requestId, narrator, timestamp } = msg;
  // ❌ Extracted 'narrator' but server sends 'payload'
```

**What happened:**
- Even if the type check passed (it didn't), this validation would have failed
- `msg.narrator` was `undefined` (should be `msg.payload`)
- **Message rejected as invalid**

---

**Problem 4: Same Wrong Type Check in Facade**

📍 **File:** `llm-angular/src/app/facades/search.facade.ts` (line 410)

**BEFORE:**
```typescript
if ((msg as any).type === 'assistant_message' && 'narrator' in (msg as any)) {
  // ❌ Same wrong checks
  const narrator = narratorMsg.narrator;
```

**What happened:**
- Same type check failure
- **Message ignored** before reaching assistant panel

---

## The Fix

### 1. Added Missing Type to Protocol

📍 **File:** `llm-angular/src/app/core/models/ws-protocol.types.ts`

**ADDED:**
```typescript
/**
 * Assistant message (CURRENT - matches backend protocol)
 * Backend sends: { type: 'assistant', requestId, payload: {...} }
 */
export interface WSServerAssistant {
  type: 'assistant';
  requestId: string;
  payload: {
    type: 'GATE_FAIL' | 'CLARIFY' | 'SUMMARY';
    message: string;
    question: string | null;
    blocksSearch: boolean;
  };
}
```

**UPDATED union type:**
```typescript
export type WSServerMessage =
  | WSServerStatus
  | WSServerStreamDelta
  | WSServerStreamDone
  | WSServerRecommendation
  | WSServerError
  | WSServerAssistantProgress
  | WSServerAssistantSuggestion
  | WSServerAssistantMessage    // ← LEGACY (kept for backward compat)
  | WSServerAssistant            // ← NEW (matches backend)
  | WSServerSubAck
  | WSServerSubNack;
```

---

### 2. Fixed Type Check in Assistant Panel

📍 **File:** `llm-angular/src/app/features/unified-search/components/assistant-panel/assistant-panel.component.ts`

**BEFORE (line 68):**
```typescript
} else if (message.type === 'assistant_message' && message.narrator) {
```

**AFTER:**
```typescript
} else if (message.type === 'assistant' && message.payload) {
```

---

### 3. Fixed Payload Extraction in Handler

📍 **File:** `llm-angular/src/app/features/unified-search/components/assistant-panel/assistant-panel.component.ts`

**BEFORE (lines 121-129):**
```typescript
if (!msg.requestId || !msg.narrator || !msg.narrator.message) {
  console.warn('[AssistantPanel] Invalid narrator message structure:', msg);
  return;
}

const { requestId, narrator, timestamp } = msg;
```

**AFTER:**
```typescript
if (!msg.requestId || !msg.payload || !msg.payload.message) {
  console.warn('[AssistantPanel] Invalid narrator message structure:', msg);
  return;
}

const { requestId, payload } = msg;
const narrator = payload; // payload contains the narrator data
```

---

### 4. Fixed Same Issues in Facade

📍 **File:** `llm-angular/src/app/facades/search.facade.ts`

**BEFORE (line 410):**
```typescript
if ((msg as any).type === 'assistant_message' && 'narrator' in (msg as any)) {
  const narrator = narratorMsg.narrator;
```

**AFTER:**
```typescript
if ((msg as any).type === 'assistant' && 'payload' in (msg as any)) {
  const narrator = narratorMsg.payload;
```

---

### 5. Added Debug Logging

#### At WebSocket Layer
📍 **File:** `llm-angular/src/app/core/services/ws/ws-router.ts`

```typescript
} else if (data.type === 'assistant') {
  // DEBUG LOG: Assistant message received at WS layer
  console.log('[WS][assistant] received', {
    requestId: data.requestId,
    payloadType: data.type,
    narratorType: data.payload?.type
  });
}
```

#### At Component Layer
📍 **File:** `llm-angular/src/app/features/unified-search/components/assistant-panel/assistant-panel.component.ts`

```typescript
// DEBUG LOG (requested by user)
console.log('[UI] assistant message received', {
  requestId,
  narratorType: narrator.type,
  message: narrator.message,
  question: narrator.question,
  blocksSearch: narrator.blocksSearch
});

// ... after signal update ...

console.log('[UI] rendered assistant message', {
  requestId,
  narratorType: narrator.type,
  messageCount: newMessages.length,
  visibleCount: Math.min(3, newMessages.length)
});
```

---

## Message Flow (After Fix)

```
┌─────────────────────────────────────────────────────────────┐
│ SERVER: WebSocketManager.publishToChannel()                │
│ Sends: { type: 'assistant', requestId, payload: {...} }    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ WS-ROUTER: ws-router.ts                                     │
│ ✅ Parses JSON                                              │
│ ✅ Validates with isWSServerMessage()                       │
│ 📝 Logs: [WS][assistant] received                           │
│ ✅ Emits to callback                                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ WS-CLIENT: ws-client.service.ts                             │
│ ✅ Receives message in router callback                      │
│ ✅ Emits to messages$ observable                            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ SEARCH-FACADE: search.facade.ts                             │
│ ✅ Checks: msg.type === 'assistant' && msg.payload          │
│ ✅ Logs to console                                           │
│ ✅ Forwards to next handler                                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ ASSISTANT-PANEL: assistant-panel.component.ts               │
│ ✅ Checks: message.type === 'assistant' && message.payload  │
│ ✅ Calls handleNarratorMessage()                            │
│ ✅ Validates: msg.payload && msg.payload.message            │
│ ✅ Extracts: const narrator = msg.payload                   │
│ 📝 Logs: [UI] assistant message received                    │
│ ✅ Creates AssistantMessage object                          │
│ ✅ Updates allMessages signal                               │
│ 📝 Logs: [UI] rendered assistant message                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ UI: assistant-panel.component.html                          │
│ ✅ Computed signal updates                                  │
│ ✅ Shows last 3 messages                                    │
│ ✅ Displays with 🔄 or 💡 icon                              │
│ ✅ Message visible to user                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Files Modified

### 1. Protocol Types (Added Missing Interface)
- **`llm-angular/src/app/core/models/ws-protocol.types.ts`**
  - Added `WSServerAssistant` interface (matches backend)
  - Added to `WSServerMessage` union type
  - Kept `WSServerAssistantMessage` for backward compatibility

### 2. Assistant Panel Component (Fixed Type Checks + Payload)
- **`llm-angular/src/app/features/unified-search/components/assistant-panel/assistant-panel.component.ts`**
  - Fixed type check: `'assistant_message'` → `'assistant'`
  - Fixed payload check: `message.narrator` → `message.payload`
  - Fixed payload extraction: `msg.narrator` → `msg.payload`
  - Added debug logs: `[UI] assistant message received` and `[UI] rendered assistant message`
  - Added try/catch for error handling

### 3. Search Facade (Fixed Type Checks)
- **`llm-angular/src/app/facades/search.facade.ts`**
  - Fixed type check: `'assistant_message'` → `'assistant'`
  - Fixed payload extraction: `'narrator'` → `'payload'`

### 4. WebSocket Router (Added Debug Logging)
- **`llm-angular/src/app/core/services/ws\ws-router.ts`**
  - Added debug log: `[WS][assistant] received` for assistant messages

---

## No Changes to:

✅ Server code (no changes)  
✅ API signatures (no changes)  
✅ WebSocket protocol shapes (no changes)  
✅ Channel definitions (no changes)  
✅ Component architecture (reused existing assistant panel)  

---

## Verification Steps

### 1. Run Query that Triggers GATE_FAIL
```
Query: "what is the weather"
```

### 2. Expected Server Logs
```json
{"event":"assistant_ws_publish_attempt","channel":"assistant","requestId":"req-...","payloadType":"assistant"}
{"event":"websocket_published","channel":"assistant","requestId":"req-...","clientCount":1,"payloadType":"assistant"}
{"event":"assistant_message_published","narratorType":"GATE_FAIL"}
```

### 3. Expected Frontend Console Logs

**Order of logs:**
```javascript
// 1. WebSocket layer receives message
[WS][assistant] received {
  requestId: "req-...",
  payloadType: "assistant",
  narratorType: "GATE_FAIL"
}

// 2. SearchFacade logs
[SearchFacade] Assistant message received on assistant channel: GATE_FAIL <message>

// 3. AssistantPanel receives and parses
[UI] assistant message received {
  requestId: "req-...",
  narratorType: "GATE_FAIL",
  message: "It looks like you're asking about the weather...",
  question: null,
  blocksSearch: true
}

// 4. AssistantPanel adds to messages
[AssistantPanel] Narrator message added: GATE_FAIL <message>

// 5. AssistantPanel confirms UI render
[UI] rendered assistant message {
  requestId: "req-...",
  narratorType: "GATE_FAIL",
  messageCount: 1,
  visibleCount: 1
}
```

### 4. Expected UI Behavior

✅ Assistant panel appears/updates  
✅ Message shows with 🔄 icon (assistant_progress type for GATE_FAIL)  
✅ Message text displayed in English  
✅ Panel shows last 3 messages (scrolling window)  
✅ Message persists until new search started  

---

## The Exact Place Messages Were Ignored

### Primary Drop Point 1: Type Check

**File:** `assistant-panel.component.ts` line 68

**Before:**
```typescript
} else if (message.type === 'assistant_message' && message.narrator) {
  this.handleNarratorMessage(message);
}
// ❌ Server sent 'assistant' → check failed → DROPPED HERE
```

**After:**
```typescript
} else if (message.type === 'assistant' && message.payload) {
  this.handleNarratorMessage(message);
}
// ✅ Now matches → handler called
```

### Secondary Drop Point 2: Validation Check

**File:** `assistant-panel.component.ts` line 123

**Before:**
```typescript
if (!msg.requestId || !msg.narrator || !msg.narrator.message) {
  console.warn('[AssistantPanel] Invalid narrator message structure:', msg);
  return; // ❌ Would have been DROPPED HERE if type check passed
}
```

**After:**
```typescript
if (!msg.requestId || !msg.payload || !msg.payload.message) {
  console.warn('[AssistantPanel] Invalid narrator message structure:', msg);
  return;
}
// ✅ Now validates correctly
```

---

## Summary

**Problem:** Frontend expected `{ type: 'assistant_message', narrator: {...} }` but server sent `{ type: 'assistant', payload: {...} }`

**Result:** Messages were **silently dropped** at component level (type check failed)

**Fix:** 
1. Added correct `WSServerAssistant` type to frontend protocol
2. Fixed type checks: `'assistant_message'` → `'assistant'`
3. Fixed property access: `.narrator` → `.payload`
4. Added comprehensive debug logging

**Impact:** Zero changes to server, API, or protocol. Frontend-only fix.

**Status:** ✅ Build succeeds, types correct, debug logs in place, ready to test.
