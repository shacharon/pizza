# Multi-Message Assistant Container Implementation

**Date**: 2026-01-28  
**Type**: Feature Enhancement - Accumulate Multiple Assistant Messages  
**Scope**: Frontend - Message Collection, Timestamp Ordering, Single Container Rendering

---

## Problem Statement

**Before:**
- Assistant messages (CLARIFY, SUMMARY, DIETARY_HINT) **overwrote** each other
- Only the **last message** was visible
- No way to see multiple assistant communications in one search session
- DIETARY_HINT would replace SUMMARY, losing information

---

## Solution: Multi-Message Container

### Requirements

| Requirement | Implementation |
|-------------|----------------|
| **All types in same container** | ✅ Single `<app-assistant-summary>` component |
| **Timestamp ordering** | ✅ Messages sorted by `timestamp` (epoch ms) |
| **No messages outside container** | ✅ Strict `requestId` filtering |
| **Multiple messages accumulate** | ✅ Array-based storage, no overwrites |
| **Dietary hints inside container** | ✅ DIETARY_HINT is valid LLM type |

---

## Architecture

### Data Flow

```
Backend sends:
  SUMMARY (timestamp: 1000)
  ↓
  DIETARY_HINT (timestamp: 1050)
  ↓
  (both messages stored)

SearchFacade receives:
  → assistantHandler.addMessage(SUMMARY, ...)
  → assistantHandler.addMessage(DIETARY_HINT, ...)

SearchAssistantHandler:
  → _messages.update([SUMMARY, DIETARY_HINT])
  → messages() computed → sorted by timestamp
  → Exposes: [SUMMARY, DIETARY_HINT]

SearchPageComponent:
  → contextualMessages() → filters by requestId
  → Passes filtered array to <app-assistant-summary>

AssistantSummaryComponent:
  → Renders ALL messages in timestamp order
  → Each message has icon, text, type-specific styling
```

---

## Implementation Details

### 1. AssistantMessage Interface

**File:** `search-assistant.facade.ts`

```typescript
export interface AssistantMessage {
  id: string;               // Unique: requestId-type-timestamp
  type: 'CLARIFY' | 'SUMMARY' | 'GATE_FAIL' | 'DIETARY_HINT';
  message: string;
  question: string | null;
  blocksSearch: boolean;
  requestId: string;
  timestamp: number;        // Epoch ms for ordering
}
```

**Key Fields:**
- **id**: Ensures uniqueness, prevents duplicates
- **type**: Message type for icon/styling
- **timestamp**: Sorting key (oldest first)
- **requestId**: Scoping key (prevents cross-contamination)

---

### 2. SearchAssistantHandler Refactor

**Before (Single Message):**
```typescript
private readonly assistantText = signal<string>(''); // Last message only
```

**After (Message Array):**
```typescript
private readonly _messages = signal<AssistantMessage[]>([]); // All messages

readonly messages = computed(() => {
  return this._messages().sort((a, b) => a.timestamp - b.timestamp);
});
```

---

### 3. Adding Messages (No Overwrites)

**Method:** `addMessage()`

```typescript
addMessage(
  type: 'CLARIFY' | 'SUMMARY' | 'GATE_FAIL' | 'DIETARY_HINT',
  message: string,
  requestId: string,
  question: string | null = null,
  blocksSearch: boolean = false
): void {
  const timestamp = Date.now();
  const id = `${requestId}-${type}-${timestamp}`;
  
  const newMessage: AssistantMessage = {
    id, type, message, question, blocksSearch, requestId, timestamp
  };
  
  // Check for duplicate (same requestId + type)
  const existing = this._messages().find(
    msg => msg.requestId === requestId && msg.type === type
  );
  
  if (existing) {
    // Replace existing message of same type
    this._messages.update(msgs => 
      msgs.map(msg => (msg.requestId === requestId && msg.type === type) ? newMessage : msg)
    );
  } else {
    // Append new message
    this._messages.update(msgs => [...msgs, newMessage]);
  }
}
```

**Deduplication Logic:**
- If `requestId` + `type` already exists → **replace** (same type updated)
- Otherwise → **append** (new type added)

**Example:**
```
Search req-123:
  1. SUMMARY arrives → [SUMMARY]
  2. DIETARY_HINT arrives → [SUMMARY, DIETARY_HINT]
  3. SUMMARY arrives again → [SUMMARY (updated), DIETARY_HINT]
```

---

### 4. SearchFacade Integration

**Before (Overwrites):**
```typescript
this.assistantHandler.setMessage(
  assistMessage, 
  narratorMsg.requestId,
  narrator.blocksSearch || false
);
```

**After (Accumulates):**
```typescript
this.assistantHandler.addMessage(
  narrator.type as 'CLARIFY' | 'SUMMARY' | 'GATE_FAIL' | 'DIETARY_HINT',
  assistMessage,
  narratorMsg.requestId,
  narrator.question || null,
  narrator.blocksSearch || false
);
```

**Result:** Each new message is **added** to the array, not replacing the previous one.

---

### 5. Message Filtering by RequestId

**SearchPageComponent:**

```typescript
// Contextual messages (inside search-card)
readonly contextualMessages = computed(() => {
  const activeRequestId = this.facade.requestId();
  const allMessages = this.facade.assistantMessages();
  
  if (!activeRequestId) {
    return [];
  }
  
  // Return only messages for current search
  return allMessages.filter(msg => msg.requestId === activeRequestId);
});

// Global messages (outside search-card)
readonly globalMessages = computed(() => {
  const activeRequestId = this.facade.requestId();
  const allMessages = this.facade.assistantMessages();
  
  if (activeRequestId) {
    return []; // No global messages when search is active
  }
  
  // Return messages without requestId (system messages)
  return allMessages.filter(msg => !msg.requestId);
});
```

**Guarantee:** Messages are **strictly scoped** to their `requestId`.

---

### 6. Template Rendering

**search-page.component.html:**

```html
<!-- Contextual Assistant (inside search-card) -->
@if (showContextualAssistant()) {
  <app-assistant-summary 
    [messages]="contextualMessages()"
    [text]="asyncAssistantMessage()" 
    [status]="facade.assistantState()"
    [error]="facade.assistantError()" />
}

<!-- Global Assistant (outside search-card) -->
@if (showGlobalAssistant()) {
  <app-assistant-summary 
    [messages]="globalMessages()"
    [text]="asyncAssistantMessage()" 
    [status]="facade.assistantState()"
    [error]="facade.assistantError()" />
}
```

**Key:** `contextualMessages()` and `globalMessages()` are **mutually exclusive**.

---

### 7. AssistantSummaryComponent Multi-Message Mode

**Component:**

```typescript
// Accept array of messages
readonly messages = input<AssistantMessage[]>([]);

// Determine display mode
readonly useMultiMessage = computed(() => this.messages().length > 0);

readonly hasContent = computed(() => {
  if (this.useMultiMessage()) {
    return this.messages().length > 0;
  }
  return !this.isIdle() && (this.text().length > 0 || this.isFailed());
});
```

**Template:**

```html
<!-- MULTI-MESSAGE MODE -->
@if (useMultiMessage()) {
  <div class="messages-container">
    @for (msg of messages(); track msg.id) {
      <div class="assistant-message" [ngClass]="getMessageClass(msg.type)">
        <span class="message-icon">{{ getMessageIcon(msg.type) }}</span>
        <div class="message-content">
          <div class="message-text">{{ msg.message }}</div>
          @if (msg.question && msg.question !== msg.message) {
            <div class="message-question">{{ msg.question }}</div>
          }
        </div>
      </div>
    }
  </div>
}

<!-- LEGACY MODE (single message) -->
@if (!useMultiMessage()) {
  <!-- Existing single-message rendering -->
}
```

**Behavior:**
- If `messages.length > 0` → Multi-message mode (render all)
- Otherwise → Legacy mode (single text)

---

### 8. Message Icons

| Type | Icon | Color |
|------|------|-------|
| **CLARIFY** | ❓ | Amber (`#ffc107`) |
| **SUMMARY** | ✨ | Green (`#28a745`) |
| **GATE_FAIL** | ⚠️ | Red (`#dc3545`) |
| **DIETARY_HINT** | 🍽️ | Blue (`#17a2b8`) |

**CSS:**

```scss
.assistant-message {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem;
  background: white;
  border-radius: 4px;

  &.message-type-clarify {
    border-left: 3px solid #ffc107;
  }

  &.message-type-summary {
    border-left: 3px solid #28a745;
  }

  &.message-type-gate_fail {
    border-left: 3px solid #dc3545;
    background: #fff5f5;
  }

  &.message-type-dietary_hint {
    border-left: 3px solid #17a2b8;
    background: #f0f9ff;
  }
}
```

---

## Timestamp Ordering

### Ordering Logic

**Computed Signal:**
```typescript
readonly messages = computed(() => {
  return this._messages().sort((a, b) => a.timestamp - b.timestamp);
});
```

**Sort:** Ascending by `timestamp` (oldest → newest)

---

### Example Timeline

```
Search req-abc-123 starts:
  t=1000ms → CLARIFY arrives
  t=1050ms → User provides clarification, new search
  t=2000ms → SUMMARY arrives
  t=2100ms → DIETARY_HINT arrives

Display Order:
  1. CLARIFY (t=1000)
  2. SUMMARY (t=2000)
  3. DIETARY_HINT (t=2100)
```

**Visual:**
```
┌──────────────────────────────────┐
│ Assistant Messages (req-abc-123) │
├──────────────────────────────────┤
│ ❓ Need clarification about X    │  ← CLARIFY (oldest)
├──────────────────────────────────┤
│ ✨ Found 5 great pizza places    │  ← SUMMARY (middle)
├──────────────────────────────────┤
│ 🍽️ Found possible gluten-free   │  ← DIETARY_HINT (newest)
│    options - please confirm      │
└──────────────────────────────────┘
```

---

## Container Guarantee

### Rules

| Condition | Rendering Location |
|-----------|-------------------|
| **Message has `requestId`** | ✅ **Inside** search-card (contextual) |
| **Message has NO `requestId`** | Outside search-card (global/system) |
| **`activeRequestId` exists** | Contextual messages shown, global hidden |
| **No `activeRequestId`** | Contextual hidden, global shown |

---

### Verification

**Contextual Messages Filter:**
```typescript
readonly contextualMessages = computed(() => {
  const activeRequestId = this.facade.requestId();
  const allMessages = this.facade.assistantMessages();
  
  if (!activeRequestId) {
    return []; // ← No contextual messages when no active search
  }
  
  return allMessages.filter(msg => msg.requestId === activeRequestId);
  // ← Strict match: only messages for THIS search
});
```

**Global Messages Filter:**
```typescript
readonly globalMessages = computed(() => {
  const activeRequestId = this.facade.requestId();
  const allMessages = this.facade.assistantMessages();
  
  if (activeRequestId) {
    return []; // ← No global messages when search is active
  }
  
  return allMessages.filter(msg => !msg.requestId);
  // ← Only messages with NO requestId
});
```

**Mutual Exclusion:**
- If `activeRequestId` exists → `contextualMessages()` populated, `globalMessages()` = []
- If NO `activeRequestId` → `contextualMessages()` = [], `globalMessages()` populated

**Result:** **Impossible** for messages to render in both places.

---

### Edge Cases Handled

#### 1. Message Arrives Before Search Card Mounted

```
Timeline:
  1. User initiates search (req-123)
  2. SUMMARY message arrives via WS
  3. addMessage() called
  4. SearchCard not yet rendered

Result:
  - Message stored in _messages signal
  - When SearchCard renders, contextualMessages() includes SUMMARY
  - No message loss ✅
```

---

#### 2. Multiple Messages Same Type

```
Search req-456:
  1. SUMMARY arrives: "Looking for pizza..."
  2. SUMMARY arrives again: "Found 5 places"

Result:
  - First SUMMARY stored
  - Second SUMMARY replaces first (same requestId + type)
  - Only latest SUMMARY shown ✅
  - No duplicates ✅
```

---

#### 3. Messages From Different Searches

```
Active search: req-123
  - Messages: [SUMMARY (req-123), DIETARY_HINT (req-123)]

Old search: req-456
  - Messages: [CLARIFY (req-456)]

contextualMessages() filters by req-123:
  → Returns: [SUMMARY, DIETARY_HINT]
  → CLARIFY (req-456) NOT shown ✅

Result: Only current search messages visible ✅
```

---

#### 4. New Search Starts (Cleanup)

```
User starts new search:
  1. search() called
  2. assistantHandler.resetIfGlobal() called
  3. Filters messages: keeps card-bound, removes global
  4. New requestId set

Result:
  - Old search messages preserved (have requestId)
  - Filtered out by contextualMessages() (different requestId)
  - New search starts with empty contextual display ✅
```

---

## Backward Compatibility

### Legacy Single-Message Mode

**Still Supported:**

```typescript
// Legacy single message state (for backward compatibility)
private readonly assistantText = signal<string>('');

readonly narration = this.assistantText.asReadonly();
```

**Fallback Rendering:**
```html
@if (!useMultiMessage()) {
  @if (isCompleted()) {
    <div class="completed-text">
      {{ text() }}
    </div>
  }
}
```

**Why Keep:**
- Smooth migration path
- Components not yet updated still work
- No breaking changes to existing code

---

## Files Modified

### Backend (0 files)
No backend changes required. Backend already sends:
- `type: 'assistant'`
- `payload: { type: 'SUMMARY' | 'CLARIFY' | 'DIETARY_HINT', ... }`

---

### Frontend (5 files)

1. **`search-assistant.facade.ts`**
   - Added `AssistantMessage` interface
   - Changed from single message to message array
   - Added `addMessage()` method with deduplication
   - Added timestamp-ordered `messages()` computed signal
   - Updated `reset()` and `resetIfGlobal()` to handle arrays

2. **`search.facade.ts`**
   - Exposed `assistantMessages` signal
   - Changed `setMessage()` call to `addMessage()` in `onAssistantMessage` handler

3. **`assistant-summary.component.ts`**
   - Added `messages` input (array)
   - Added `useMultiMessage()` computed (mode detection)
   - Added `getMessageIcon()` and `getMessageClass()` methods
   - Updated `hasContent()` to support both modes

4. **`assistant-summary.component.html`**
   - Added multi-message mode rendering
   - Iterate with `@for` over messages
   - Each message: icon + content + type-specific class
   - Legacy mode still functional

5. **`assistant-summary.component.scss`**
   - Added `.multi-message` styles
   - `.messages-container` (vertical stack)
   - `.assistant-message` (individual message card)
   - Type-specific border colors (clarify/summary/gate_fail/dietary_hint)

6. **`search-page.component.ts`**
   - Added `contextualMessages()` computed (filters by requestId)
   - Added `globalMessages()` computed (no requestId)
   - Both ensure mutual exclusion

7. **`search-page.component.html`**
   - Pass `[messages]="contextualMessages()"` to contextual assistant
   - Pass `[messages]="globalMessages()"` to global assistant

---

## Testing Scenarios

### Scenario 1: Multiple Messages Arrive

```
1. User searches "pizza near me"
2. Backend sends:
   - SUMMARY: "Found 8 pizza places"
   - DIETARY_HINT: "Found possible gluten-free options"

Expected:
  ✅ Both messages visible in assistant container
  ✅ SUMMARY first (earlier timestamp)
  ✅ DIETARY_HINT second (later timestamp)
  ✅ Both have correct icons and colors
```

---

### Scenario 2: CLARIFY Then SUMMARY

```
1. User searches "pasta"
2. Backend sends CLARIFY: "Do you want gluten-free?"
3. User clicks "No"
4. Backend sends SUMMARY: "Found 12 restaurants"

Expected:
  ✅ CLARIFY visible (with ❓ icon)
  ✅ After clarification: SUMMARY added below CLARIFY
  ✅ Both messages stay visible
  ✅ Timestamp order preserved
```

---

### Scenario 3: New Search Clears Old Messages

```
1. Search A completes → SUMMARY + DIETARY_HINT visible
2. User starts new Search B
3. Search B completes → new SUMMARY

Expected:
  ✅ Search A messages NOT visible (different requestId)
  ✅ Only Search B SUMMARY visible
  ✅ No cross-contamination
```

---

### Scenario 4: No Messages (Empty State)

```
1. User searches
2. Backend sends no assistant messages (success without narration)

Expected:
  ✅ Assistant container hidden (hasContent() = false)
  ✅ No empty box shown
  ✅ Results display normally
```

---

## Summary

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| **All types in same container** | ✅ YES | Single `<app-assistant-summary>` |
| **Timestamp ordering** | ✅ YES | `sort((a, b) => a.timestamp - b.timestamp)` |
| **No messages outside container** | ✅ YES | Strict `requestId` filtering |
| **Multiple messages accumulate** | ✅ YES | Array storage with `addMessage()` |
| **CLARIFY + SUMMARY + DIETARY_HINT** | ✅ YES | All types supported |
| **No overwrites** | ✅ YES | Deduplication by type, not replacement |
| **Contextual binding** | ✅ YES | Filtered by `activeRequestId` |
| **Backward compatible** | ✅ YES | Legacy single-message mode preserved |

---

**Status:** ✅ **Complete** - All assistant messages (SUMMARY, CLARIFY, DIETARY_HINT) now accumulate in a single container, ordered by timestamp. No messages render outside this container. Dietary hints and all other assistant types are displayed together in the same assistant summary component.

**Key Achievement:** Transformed from a single-message overwrite system to a multi-message accumulation system with proper scoping, ordering, and visual differentiation.
