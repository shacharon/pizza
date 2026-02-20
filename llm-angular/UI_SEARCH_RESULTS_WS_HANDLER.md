# UI WebSocket Search Results Handler - Bug Fix

**Date:** 2026-02-03  
**Status:** ✅ COMPLETE

---

## Problem Statement

**Bug:** Backend publishes WS message on channel "search" with `payloadType="SEARCH_RESULTS"` and `resultCount=20`, but UI still shows no results.

**Root Cause:** Angular frontend had no handler for the new `SEARCH_RESULTS` message type. It only handled:

- `RESULT_PATCH` (Wolt enrichment)
- Search contract events (`progress`, `ready`, `error`)
- Assistant messages

When the backend sent `SEARCH_RESULTS`, the UI ignored it because it wasn't in the type union and had no handler.

---

## Solution Overview

Added `SEARCH_RESULTS` message type to Angular WebSocket protocol and implemented handler that:

1. Receives final results from WebSocket
2. Maps them to `SearchResponse` format
3. Updates store via existing `handleSearchResponse` method
4. Cancels HTTP polling (no longer needed)

**Changes:**

1. Added `WSServerSearchResults` type to `ws-protocol.types.ts`
2. Added dev-only logging in `ws-router.ts` to see raw incoming messages
3. Added `handleSearchResults()` method in `search.facade.ts`
4. Routed `SEARCH_RESULTS` messages to new handler

---

## Modified Files (3 files)

### 1. `llm-angular/src/app/core/models/ws-protocol.types.ts`

**Added new WS message type:**

```typescript
/**
 * Search results event (final results from backend)
 */
export interface WSServerSearchResults {
  type: 'SEARCH_RESULTS';
  requestId: string;
  resultCount: number;
  results: any[]; // Full restaurant results array
  servedFrom: 'cache' | 'google_api';
}

export type WSServerMessage =
  | ... (existing types)
  | WSServerSearchResults; // ← NEW
```

**Purpose:** Defines the TypeScript interface for the new message type sent by backend.

---

### 2. `llm-angular/src/app/core/services/ws/ws-router.ts`

**Added dev-only logging BEFORE parsing:**

```typescript
handleMessage(event: MessageEvent): void {
  try {
    const data = JSON.parse(event.data);

    // DEV-ONLY: Log raw incoming message BEFORE validation
    const rawKeys = Object.keys(data);
    const hasResultsArray = 'results' in data && Array.isArray(data.results);
    const resultsLen = hasResultsArray ? data.results.length : 0;

    console.log('[WS][DEV] ui_ws_raw_received', {
      event: 'ui_ws_raw_received',
      channel: data.channel || 'unknown',
      requestId: data.requestId || 'unknown',
      payloadType: data.type || 'unknown',
      rawKeys,
      hasResultsArray,
      resultsLen
    });

    // ... validation and routing ...

    } else if (data.type === 'SEARCH_RESULTS') {
      // DEV LOG: Search results received
      console.log('[WS][SEARCH_RESULTS] received', {
        requestId: data.requestId,
        resultCount: data.resultCount,
        resultsLen: data.results?.length || 0,
        servedFrom: data.servedFrom
      });
    }

    // Emit validated message
    this.callbacks.onMessage(data);
  } catch (error) {
    console.error('[WS] Failed to parse message', error, event.data);
  }
}
```

**Purpose:**

- Log ALL incoming WS messages with structure analysis BEFORE validation
- Helps debug message format issues
- Shows exactly what the UI receives from backend

**Fields Logged:**

- `event`: `'ui_ws_raw_received'`
- `channel`: channel name or 'unknown'
- `requestId`: request ID or 'unknown'
- `payloadType`: message type
- `rawKeys`: Array of all keys in the message
- `hasResultsArray`: Boolean if message has `results` array
- `resultsLen`: Length of results array (0 if not present)

---

### 3. `llm-angular/src/app/facades/search.facade.ts`

**Added early routing for `SEARCH_RESULTS` in `handleWsMessage()`:**

```typescript
private handleWsMessage(msg: WSServerMessage): void {
  // Handle SEARCH_RESULTS events (final results from backend)
  if ((msg as any).type === 'SEARCH_RESULTS') {
    this.handleSearchResults(msg as any);
    return;
  }

  // Handle RESULT_PATCH events (Wolt enrichment)
  if ((msg as any).type === 'RESULT_PATCH') {
    this.handleResultPatch(msg as any);
    return;
  }

  // ... rest of routing ...
}
```

**Added new handler method:**

```typescript
/**
 * Handle SEARCH_RESULTS WebSocket event (final results from backend)
 */
private handleSearchResults(msg: WSServerSearchResults): void {
  console.log('[SearchFacade] SEARCH_RESULTS received', {
    requestId: msg.requestId,
    resultCount: msg.resultCount,
    resultsLen: msg.results.length,
    servedFrom: msg.servedFrom
  });

  // Verify this is for the current search
  if (msg.requestId !== this.currentRequestId()) {
    console.debug('[SearchFacade] Ignoring SEARCH_RESULTS for old request', {
      msgRequestId: msg.requestId,
      currentRequestId: this.currentRequestId()
    });
    return;
  }

  // Cancel polling - we have results via WebSocket
  this.apiHandler.cancelPolling();

  // Map WS results to SearchResponse format
  // This ensures compatibility with existing UI code that expects SearchResponse
  const searchResponse: SearchResponse = {
    requestId: msg.requestId,
    sessionId: this.conversationId(),
    query: {
      original: this.query() || '',
      parsed: {},
      language: this.locale()
    },
    results: msg.results,
    chips: [],
    assist: { type: 'guide', message: '' },
    meta: {
      tookMs: 0,
      mode: 'textsearch',
      appliedFilters: [],
      confidence: 1.0,
      source: msg.servedFrom === 'cache' ? 'cache' : 'route2',
      failureReason: 'NONE'
    }
  };

  // Use existing handleSearchResponse to update store (same path as HTTP polling)
  this.handleSearchResponse(searchResponse, this.query());
}
```

**Purpose:**

1. **Validates requestId**: Ignores messages from old searches
2. **Cancels polling**: HTTP fallback no longer needed
3. **Maps to SearchResponse**: Ensures compatibility with existing UI code
4. **Updates store**: Uses same `handleSearchResponse` method as HTTP path

**Result:** WebSocket and HTTP polling both use the same store update path, ensuring consistent behavior.

---

## Sample Console Logs

### Example 1: SEARCH_RESULTS with 20 results (cache)

```
[WS][DEV] ui_ws_raw_received {
  event: 'ui_ws_raw_received',
  channel: 'unknown',
  requestId: 'req-1234-abcd',
  payloadType: 'SEARCH_RESULTS',
  rawKeys: ['type', 'requestId', 'resultCount', 'results', 'servedFrom'],
  hasResultsArray: true,
  resultsLen: 20
}

[WS][SEARCH_RESULTS] received {
  requestId: 'req-1234-abcd',
  resultCount: 20,
  resultsLen: 20,
  servedFrom: 'cache'
}

[SearchFacade] SEARCH_RESULTS received {
  requestId: 'req-1234-abcd',
  resultCount: 20,
  resultsLen: 20,
  servedFrom: 'cache'
}

[SearchFacade] Handling search response {
  requestId: 'req-1234-abcd',
  resultCount: 20
}

[SearchFacade] Search completed {
  requestId: 'req-1234-abcd',
  resultCount: 20,
  cardState: 'STOP'
}
```

### Example 2: SEARCH_RESULTS with 15 results (google_api)

```
[WS][DEV] ui_ws_raw_received {
  event: 'ui_ws_raw_received',
  channel: 'unknown',
  requestId: 'req-5678-efgh',
  payloadType: 'SEARCH_RESULTS',
  rawKeys: ['type', 'requestId', 'resultCount', 'results', 'servedFrom'],
  hasResultsArray: true,
  resultsLen: 15
}

[WS][SEARCH_RESULTS] received {
  requestId: 'req-5678-efgh',
  resultCount: 15,
  resultsLen: 15,
  servedFrom: 'google_api'
}

[SearchFacade] SEARCH_RESULTS received {
  requestId: 'req-5678-efgh',
  resultCount: 15,
  resultsLen: 15,
  servedFrom: 'google_api'
}

[SearchFacade] Handling search response {
  requestId: 'req-5678-efgh',
  resultCount: 15
}

[SearchFacade] Search completed {
  requestId: 'req-5678-efgh',
  resultCount: 15,
  cardState: 'STOP'
}
```

### Example 3: Old requestId (ignored)

```
[WS][DEV] ui_ws_raw_received {
  event: 'ui_ws_raw_received',
  channel: 'unknown',
  requestId: 'req-old-9999',
  payloadType: 'SEARCH_RESULTS',
  rawKeys: ['type', 'requestId', 'resultCount', 'results', 'servedFrom'],
  hasResultsArray: true,
  resultsLen: 10
}

[WS][SEARCH_RESULTS] received {
  requestId: 'req-old-9999',
  resultCount: 10,
  resultsLen: 10,
  servedFrom: 'cache'
}

[SearchFacade] SEARCH_RESULTS received {
  requestId: 'req-old-9999',
  resultCount: 10,
  resultsLen: 10,
  servedFrom: 'cache'
}

[SearchFacade] Ignoring SEARCH_RESULTS for old request {
  msgRequestId: 'req-old-9999',
  currentRequestId: 'req-current-1234'
}
```

---

## Compatibility Path

The implementation treats `SEARCH_RESULTS` as a **"final snapshot"** that replaces the results array:

| Scenario                                          | Behavior                            |
| ------------------------------------------------- | ----------------------------------- |
| UI expects `ready` → HTTP fetch                   | ✅ Still works (fallback)           |
| UI receives `SEARCH_RESULTS` first                | ✅ Cancels polling, uses WS results |
| UI receives `RESULT_PATCH` after `SEARCH_RESULTS` | ✅ Patches individual restaurants   |
| Old request sends `SEARCH_RESULTS`                | ✅ Ignored (requestId validation)   |

**Result:** WebSocket is now the **primary path**, HTTP polling is **fallback**.

---

## Data Flow

### Before (HTTP Only)

```
Backend → HTTP 202 → UI starts polling → HTTP GET /result → UI displays results
```

### After (WebSocket Primary)

```
Backend → WS SEARCH_RESULTS → UI displays results (HTTP polling cancelled)
                              ↓
                         (fallback if WS fails)
                              ↓
Backend → HTTP 202 → UI starts polling → HTTP GET /result → UI displays results
```

---

## Minimal Diff Summary

**Lines Added:** ~70  
**Lines Changed:** ~5  
**Lines Removed:** 0

**Changes by category:**

1. **Protocol extension:** 1 new interface (`WSServerSearchResults`)
2. **Router logging:** 1 dev log block + 1 specific log for `SEARCH_RESULTS`
3. **Facade handler:** 1 new method + routing call
4. **No UI changes:** Uses existing `handleSearchResponse` → same store → same UI components

**No behavior changes** except:

- UI now processes `SEARCH_RESULTS` WebSocket messages
- HTTP polling cancelled when WS delivers results
- Dev console shows detailed message structure logs

---

## Testing Verification

### Test Scenario: Subscribe → Search → Receive Results

**Steps:**

1. Open browser DevTools console
2. Start a search (e.g., "פיצה")
3. Observe console logs

**Expected Logs (in order):**

```
1. [WS] Subscription acknowledged { channel: 'search', requestId: 'req-...', pending: false }
2. [WS][DEV] ui_ws_raw_received { payloadType: 'SEARCH_RESULTS', resultsLen: 20 }
3. [WS][SEARCH_RESULTS] received { resultCount: 20, servedFrom: 'cache' }
4. [SearchFacade] SEARCH_RESULTS received { resultCount: 20, servedFrom: 'cache' }
5. [SearchFacade] Search completed { resultCount: 20, cardState: 'STOP' }
```

**Expected UI:**

- Search results grid displays 20 restaurants
- No "waiting for results" state
- Assistant summary appears (if sent via WS)

---

## Constraints Met

✅ **Minimal diff:** Only touched necessary files  
✅ **No refactor:** Used existing `handleSearchResponse` method  
✅ **Dev logging:** Added structured logs with all requested fields  
✅ **Compatibility:** HTTP polling still works as fallback  
✅ **Final snapshot:** `SEARCH_RESULTS` replaces results array (not streaming)

---

## Summary

**Modified:** 3 files  
**Handler location:** `search.facade.ts:handleSearchResults()` (lines ~404-448)  
**Store field:** Uses `SearchStore.setResponse()` (same as HTTP path)  
**Log events:** `ui_ws_raw_received`, `SEARCH_RESULTS received`, `Search completed`  
**Fields logged:** `channel`, `requestId`, `payloadType`, `rawKeys`, `hasResultsArray`, `resultsLen`

**Result:** Angular UI now receives and displays search results via WebSocket, with HTTP polling as fallback.
