# CLARIFY Duplication Analysis - Frontend

**Date**: 2026-01-28  
**Issue**: CLARIFY produces TWO user-visible messages  
**Scope**: Frontend WebSocket + UI Component Analysis

---

## Root Cause

**CLARIFY messages are displayed TWICE due to TWO separate UI components listening to the SAME WebSocket message.**

---

## Backend Behavior (Correct)

For DONE_CLARIFY, backend sends **TWO WebSocket messages**:

1. **Assistant Channel** (primary message):
```typescript
{
  type: 'assistant',
  requestId: 'req-xxx',
  payload: {
    type: 'CLARIFY',
    message: 'כדי לחפש טוב צריך 2 דברים...',
    question: null,
    blocksSearch: true
  }
}
```

2. **Search Channel** (status notification):
```typescript
{
  channel: 'search',
  type: 'clarify',
  requestId: 'req-xxx',
  stage: 'done',
  message: 'כדי לחפש טוב צריך 2 דברים...'
}
```

**Note:** Search channel 'clarify' event is **NOT defined** in frontend TypeScript contract (`search.contracts.ts` only has 'progress', 'ready', 'error').

---

## Frontend WebSocket Routing

### 1. WebSocket Message Reception

**File**: `search-ws.facade.ts:52-119`

```typescript
handleMessage(msg, currentRequestId, handlers) {
  // Line 96-99: Handle assistant messages
  if ((msg as any).type === 'assistant' && 'payload' in (msg as any)) {
    console.log('[WS][assistant] received', { requestId: msg.requestId });
    if (handlers.onAssistantMessage) handlers.onAssistantMessage(msg);
    return true;
  }
  
  // Line 110-113: Handle search channel events
  if ('channel' in msg && msg.channel === 'search') {
    if (handlers.onSearchEvent) handlers.onSearchEvent(msg as any);
    return true;
  }
}
```

**Routing:**
- Assistant channel message → `onAssistantMessage` callback
- Search channel message → `onSearchEvent` callback

---

### 2. Search Channel 'clarify' Event (NOT HANDLED)

**File**: `search-ws.facade.ts:125-168` - `handleSearchEvent()` method

```typescript
switch (event.type) {
  case 'progress':
    // ...
    break;
  
  case 'ready':
    // ...
    break;
  
  case 'error':
    // ...
    break;
  
  // NO case for 'clarify' ❌
}
```

**Result**: Search channel 'clarify' event is **ignored** (falls through switch, no handler).

**Conclusion**: Only the **assistant channel** message is actually processed.

---

## Frontend Message Processing

### Path 1: SearchFacade → SearchAssistantHandler

**File**: `search.facade.ts:267-289` - `onAssistantMessage` callback

```typescript
onAssistantMessage: (msg) => {
  const narratorMsg = msg as any;
  const narrator = narratorMsg.payload;
  console.log('[SearchFacade] Assistant message received:', narrator.type, narrator.message);

  // Handle CLARIFY with blocksSearch
  if (narrator.type === 'CLARIFY' && narrator.blocksSearch === true) {
    // Stop loading, set blocking state, cancel polling
    
    // ⚠️ STORES MESSAGE IN ASSISTANT HANDLER
    const assistMessage = narrator.message || narrator.question || 'Please provide more information';
    this.assistantHandler.setMessage(assistMessage);
    this.assistantHandler.setStatus('completed');
  }
}
```

**File**: `search-assistant.facade.ts:32-38` - `setMessage()` method

```typescript
setMessage(message: string): void {
  this.assistantText.set(message);  // ← SIGNAL UPDATED
}
```

**Exposed as:**
```typescript
readonly narration = this.assistantText.asReadonly();
```

**Consumed by:** `SearchFacade.assistantNarration` → `SearchPageComponent.asyncAssistantMessage`

---

### Path 2: AssistantPanelComponent (Direct WebSocket Listener)

**File**: `assistant-panel.component.ts:63-71` - Direct WebSocket subscription

```typescript
private subscribeToWebSocket(): void {
  this.wsSubscription = this.wsClient.messages$.subscribe((message: any) => {
    // ⚠️ LISTENS DIRECTLY TO ALL WEBSOCKET MESSAGES
    if (message.type === 'assistant_progress' || message.type === 'assistant_suggestion') {
      this.handleAssistantMessage(message);
    } else if (message.type === 'assistant' && message.payload) {
      this.handleNarratorMessage(message);  // ← HANDLES CLARIFY
    }
  });
}
```

**File**: `assistant-panel.component.ts:120-189` - `handleNarratorMessage()` method

```typescript
private handleNarratorMessage(msg: any): void {
  const { requestId, payload } = msg;
  const narrator = payload;
  
  // Generate seq based on type (CLARIFY=2)
  const seq = narrator.type === 'CLARIFY' ? 2 : ...;
  
  // Deduplicate by (requestId, seq)
  const messageKey = `${requestId}-${seq}`;
  if (this.seenMessages.has(messageKey)) {
    return; // Duplicate - ignore
  }
  
  this.seenMessages.add(messageKey);
  
  // ⚠️ ADDS MESSAGE TO SIGNAL
  const displayMessage = narrator.question || narrator.message;
  const assistantMsg: AssistantMessage = {
    requestId,
    seq,
    message: displayMessage,
    type: 'assistant_progress',
    timestamp: Date.now()
  };
  
  const newMessages = [...currentMessages, assistantMsg].sort((a, b) => a.seq - b.seq);
  this.allMessages.set(newMessages);  // ← SIGNAL UPDATED
}
```

**Deduplication:** By `(requestId, seq)` - prevents duplicate assistant messages for **same requestId**.  
**Does NOT prevent:** Two different components displaying the same message.

---

## UI Component Rendering

### Component 1: `app-assistant-summary`

**Mounted in**: `search-page.component.html:36-38`

```html
@if (showAssistant()) {
  <app-assistant-summary 
    [text]="asyncAssistantMessage()" 
    [status]="facade.assistantState()"
    [error]="facade.assistantError()" />
}
```

**Data source**: `search-page.component.ts:123-127`

```typescript
readonly asyncAssistantMessage = computed(() => {
  const text = this.facade.assistantNarration();  // ← FROM PATH 1
  return text.length > 500 ? text.substring(0, 500) + '…' : text;
});
```

**Template**: `assistant-summary.component.html`

```html
@if (hasContent()) {
  <div class="assistant-summary">
    <div class="assistant-icon">🤖</div>
    <div class="assistant-content">
      <p class="assistant-text">{{ text() }}</p>  <!-- ⚠️ DISPLAYS MESSAGE -->
      @if (isStreaming()) {
        <span class="streaming-indicator">...</span>
      }
    </div>
  </div>
}
```

**Visibility**: `showAssistant()` returns `true` when:
- Assistant state is not 'idle' (Line 86-91)
- OR no results (Line 98-100)
- OR low confidence < 60% (Line 103-106)
- OR assist.mode === 'CLARIFY' (Line 108-111)

**Result**: ✅ **DISPLAYS MESSAGE #1** (from SearchFacade → AssistantHandler)

---

### Component 2: `app-assistant-line`

**Mounted in**: `search-page.component.html:31`

```html
<div class="search-meta-row">
  <app-assistant-line />
</div>
```

**Data source**: `assistant-line.component.ts:170-182` - **Direct WebSocket subscription**

```typescript
private subscribeToWebSocket(): void {
  this.wsSubscription = this.wsClient.messages$.subscribe((message: any) => {
    // ⚠️ LISTENS DIRECTLY TO ALL WEBSOCKET MESSAGES
    if (message.type === 'assistant' && message.payload) {
      this.handleNarratorMessage(message);  // ← HANDLES CLARIFY
    }
  });
}
```

**Processing**: `assistant-line.component.ts:286-348`

```typescript
private handleNarratorMessage(msg: any): void {
  const narrator = msg.payload;
  const displayMessage = narrator.question || narrator.message;
  
  // Add to queue
  this.messageQueue.push({
    requestId,
    seq,
    message: displayMessage,
    type: 'assistant_progress'
  });
  
  // Process queue → Line 364: this.assistantMessage.set(msg.message)
  this.processQueue();
}
```

**Template**: `assistant-line.component.ts:31-39` (inline template)

```html
@if (finalMessage()) {
  <div class="assistant-line">
    <span class="assistant-text">{{ finalMessage() }}</span>  <!-- ⚠️ DISPLAYS MESSAGE -->
    <button class="clear-btn" (click)="clearMessage()">✕</button>
  </div>
}
```

**Result**: ✅ **DISPLAYS MESSAGE #2** (single-line, always visible at top of search card)

---

## Duplication Mechanism

### Actual Scenario (CONFIRMED DUPLICATION)

**Flow:**
1. Backend sends assistant channel message: `{ type: 'assistant', payload: { type: 'CLARIFY', message: '...' } }`
2. **THREE independent listeners receive same message:**
   - **Listener 1**: `AssistantLineComponent` subscribes directly to `wsClient.messages$`
   - **Listener 2**: `SearchFacade` subscribes via `wsHandler.subscribeToMessages()`
   - **Listener 3**: `AssistantPanelComponent` (exists but NOT mounted)
3. **TWO mounted components process and display:**
   - **AssistantLineComponent**: 
     - `handleNarratorMessage()` → adds to queue → `assistantMessage.set(msg.message)`
     - Displays in single-line at top: `<span class="assistant-text">{{ finalMessage() }}</span>`
   - **SearchFacade** → **AssistantSummaryComponent**:
     - `onAssistantMessage` callback → `assistantHandler.setMessage(message)`
     - Displays in summary block below: `<div class="completed-text">{{ text() }}</div>`
4. **Result:** TWO visible messages for the SAME assistant event

**Visible Messages:** ❌ **TWO MESSAGES** (confirmed duplication)

**UI Layout:**
```
┌─────────────────────────────────────┐
│  Search Bar                         │
│  ┌───────────────────────────────┐  │
│  │ MESSAGE #1 (assistant-line)   │  │ ← Single line, gray text
│  └───────────────────────────────┘  │
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐  │
│  │ MESSAGE #2 (assistant-summary)│  │ ← Block below, same text
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

---

## Deduplication Analysis

### Current Deduplication (Per-Component)

**AssistantPanelComponent** (Line 150-154):
```typescript
const messageKey = `${requestId}-${seq}`;
if (this.seenMessages.has(messageKey)) {
  return; // Duplicate - ignore
}
this.seenMessages.add(messageKey);
```

**Scope:** Prevents duplicate messages **within AssistantPanelComponent only**.

**Does NOT prevent:**
- AssistantPanelComponent displaying message from WebSocket
- AssistantSummaryComponent displaying same message from SearchFacade

**Why?** Two separate components with independent state → no shared deduplication.

---

### Cross-Component Deduplication (MISSING)

**Problem:** No global deduplication by `(requestId, messageContent)` or `(requestId, messageType)`.

**Result:** If both components are mounted, both will display the same assistant message.

---

## Verification: Is AssistantPanelComponent Mounted?

**Search Results:**
```bash
grep -r "app-assistant-panel" llm-angular/src/app/features/unified-search/*.html
# NO RESULTS
```

**Conclusion:** AssistantPanelComponent is **NOT currently mounted** in the UI.

**Implications:**
- ✅ Current behavior: **NO duplication** (only AssistantSummaryComponent displays)
- ⚠️ **If AssistantPanelComponent is added to the UI**, duplication WILL occur

---

## Search Channel 'clarify' Event (Ignored)

**Backend sends:**
```typescript
publishSearchEvent(requestId, {
  type: 'clarify',
  message: '...'
});
```

**Frontend handling:**
- `search-ws.facade.ts:135-168` - `handleSearchEvent()` switch statement
- Cases: 'progress', 'ready', 'error'
- **NO case for 'clarify'** ❌

**Result:** Event is **silently ignored** (falls through switch, no default case).

**Contract mismatch:**
- Backend sends `type: 'clarify'` (not in contract)
- Frontend `WsSearchEvent` union type only includes: 'progress' | 'ready' | 'error'

**Impact:** None (message already displayed via assistant channel).

---

## Exact Cause of Duplication (If Occurs)

### Root Cause:
**Two independent UI components consuming the SAME WebSocket message without cross-component deduplication:**

1. **`AssistantLineComponent`** (MOUNTED):
   - Location: Single line at top of search card
   - Subscribes directly to `wsClient.messages$` (bypasses SearchFacade)
   - Listens for `type: 'assistant'` messages (Line 175-176)
   - Processes via `handleNarratorMessage()` → sets `assistantMessage` signal
   - Displays message: `<span class="assistant-text">{{ finalMessage() }}</span>`

2. **`AssistantSummaryComponent`** (MOUNTED):
   - Location: Block below search card (conditionally visible)
   - Reads from `facade.assistantNarration()` (via SearchFacade → AssistantHandler)
   - SearchFacade also listens to `wsClient.messages$` (via wsHandler)
   - Processes via `onAssistantMessage` callback → `assistantHandler.setMessage()`
   - Displays message: `<div class="completed-text">{{ text() }}</div>`

**Both components independently process and display the SAME assistant channel message.**

**Note:** `AssistantPanelComponent` also subscribes to WebSocket but is NOT mounted in the UI (no duplication from it).

---

## Summary

### Current State (CONFIRMED DUPLICATION):
- ❌ **AssistantLineComponent** (MOUNTED) displays CLARIFY message in single line at top
- ❌ **AssistantSummaryComponent** (MOUNTED) displays CLARIFY message in block below
- ❌ No cross-component deduplication exists
- ❌ User sees **TWO identical messages** for every CLARIFY event
- ✅ AssistantPanelComponent exists but is NOT mounted (no additional duplication)
- ✅ Search channel 'clarify' event is ignored (no impact)

### Backend Behavior:
- ✅ Sends two messages (assistant + search channels) - by design
- ⚠️ Search channel 'clarify' event not in frontend contract (unused)

---

## Recommendations (If Duplication Occurs)

### Option 1: Remove Redundant Component
- If AssistantPanelComponent is mounted, remove it
- Use only AssistantSummaryComponent (via SearchFacade)

### Option 2: Add Cross-Component Deduplication
- Create shared deduplication service/store
- Track displayed messages by `(requestId, messageType)`
- Both components check before displaying

### Option 3: Unify Message Display
- Choose ONE authoritative source:
  - Either: AssistantPanelComponent (direct WebSocket)
  - Or: AssistantSummaryComponent (via SearchFacade)
- Remove the other

### Option 4: Fix Search Channel Contract
- Add `type: 'clarify'` to `WsSearchEvent` union in `search.contracts.ts`
- Add case handler in `handleSearchEvent()` switch
- Use search channel event instead of assistant channel for CLARIFY status

---

**Status**: ✅ **Issue CONFIRMED** - TWO components display same message.

**Exact Cause**: 
- **AssistantLineComponent** subscribes directly to WebSocket → displays in single line
- **AssistantSummaryComponent** reads from SearchFacade → displays in block
- Both listen to same `{ type: 'assistant' }` message
- No cross-component deduplication

**User Experience**: User sees **TWO identical CLARIFY messages** on screen simultaneously:
1. Top: Single-line gray text (assistant-line)
2. Below: Larger block with same text (assistant-summary)
