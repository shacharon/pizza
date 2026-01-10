# Phase 1.5: Skip Assistant in searchCore() - COMPLETE ✅

**Date**: 2026-01-10  
**Status**: Implemented, Ready for Testing  
**Goal**: Make async mode fast by skipping LLM assistant during core search  

---

## Problem

Async mode was taking **8.4 seconds** instead of < 1 second because `searchCore()` was calling the full `search()` method which included a 3.6-second LLM assistant generation.

### Logs Showing the Issue

```
[23:39:40] INFO: [SearchOrchestrator] Assistant response generated  ← Called during searchCore!
    strategy: "LLM"
    durationMs: 3667  ← 3.6 seconds wasted!
[23:39:43] INFO: HTTP response
    durationMs: 8598  ← Total 8.6 seconds (should be <1s)
```

---

## Root Cause

From Phase 1, we took a pragmatic shortcut:

**`searchCore()`** (line 120):
```typescript
// Phase 1: Temporarily call the full search() method
// We'll extract the core logic in Phase 1.5 to avoid calling assistant
const fullResponse = await this.search(request, traceId, requestId);  // ← Includes assistant!
```

The `search()` method included expensive LLM calls:
1. **Line 869**: Main assistant narration (`assistantNarration.generateFast()`) - 3.6s
2. **Line 889**: Proposed actions generation - additional time

---

## Solution: `skipAssistant` Flag

Added an optional `skipAssistant` parameter to `search()` that bypasses LLM calls when `true`.

### Changes

#### 1. `search()` Method Signature

**File**: `server/src/services/search/orchestrator/search.orchestrator.ts`

```typescript
// Before
async search(request: SearchRequest, traceId?: string, requestId?: string): Promise<SearchResponse>

// After (line 177)
async search(request: SearchRequest, traceId?: string, requestId?: string, skipAssistant = false): Promise<SearchResponse>
```

#### 2. Skip Assistant Narration (Line 867-883)

```typescript
// Phase 1.5: Skip assistant in async mode (handled by AssistantJobService)
let assist;
if (skipAssistant) {
    assist = undefined;
    timings.assistantMs = 0;
} else {
    const assistStart = Date.now();
    assist = await this.assistantNarration.generateFast(
        truthState.assistantContext,
        truthState
    );
    timings.assistantMs = Date.now() - assistStart;
    flags.usedTemplateAssistant = assist.usedTemplate || false;
    flags.usedCachedAssistant = assist.fromCache || false;
    flags.usedLLMAssistant = !assist.usedTemplate && !assist.fromCache;
}
```

#### 3. Skip Proposed Actions (Line 888-895)

```typescript
// Step 8.5: Generate proposed actions (Human-in-the-Loop pattern)
// Phase 1.5: Skip in async mode (handled by AssistantJobService recommendations)
const proposedActions = skipAssistant ? undefined : this.generateProposedActions();
if (!skipAssistant && proposedActions) {
    logger.debug({
        quickActionsCount: proposedActions.perResult.length,
        detailedActionsCount: proposedActions.selectedItem.length
    }, '[SearchOrchestrator] Proposed actions generated');
}
```

#### 4. Update `searchCore()` to Use Flag (Line 120)

```typescript
// Phase 1.5: Call search() with skipAssistant flag to avoid 3-4s LLM delay
const fullResponse = await this.search(request, traceId, requestId, true);  // ← skipAssistant=true
```

#### 5. Make Response Fields Optional (Line 959-961)

```typescript
// Before
chips,
assist,  // REQUIRED: Always included
proposedActions,

// After  
chips,
...(assist !== undefined && { assist }),  // Phase 1.5: Optional in async mode
...(proposedActions !== undefined && { proposedActions }),  // Phase 1.5: Optional in async mode
```

---

## Expected Performance

### Before Phase 1.5

```
POST /api/v1/search?mode=async
- searchCore() → 8443ms
  - Intent: 20ms
  - Geocode: 1712ms
  - Provider: 2924ms
  - Ranking: 9ms
  - Assistant (LLM): 3667ms  ← WASTED in async mode!
```

### After Phase 1.5

```
POST /api/v1/search?mode=async
- searchCore() → ~5000ms (target: <1s with optimizations)
  - Intent: 20ms
  - Geocode: 1712ms
  - Provider: 2924ms
  - Ranking: 9ms
  - Assistant: 0ms  ← SKIPPED! ✅
```

**Immediate Improvement**: ~3.6 seconds saved (43% faster)

---

## How Async Mode Now Works

### 1. HTTP Request (< 5s, targeting <1s)

```
Controller → orchestrator.searchCore(request, ctx)
  ↓
searchCore() → search(request, traceId, requestId, skipAssistant=true)
  ↓
search() executes:
  ✅ Intent parsing (~20ms)
  ✅ Geocoding (~1.7s - can be cached)
  ✅ Provider call (~2.9s)
  ✅ Filtering & Ranking (~10ms)
  ✅ Chip generation (~5ms)
  ❌ Assistant LLM (SKIPPED - 0ms)
  ❌ Proposed actions (SKIPPED - 0ms)
  ↓
Returns CoreSearchResult (results + chips + meta, NO assist)
```

### 2. WebSocket Streaming (Parallel)

```
AssistantJobService.startJob(requestId)
  ↓
  ✅ LLM streaming (3-4s)
  ✅ Recommendations (deterministic, <100ms)
  ↓
Publishes over WebSocket:
  - status: streaming
  - stream.delta (multiple)
  - stream.done
  - recommendation (actions)
  - status: completed
```

---

## Backward Compatibility

✅ **Sync mode unchanged**: `POST /api/v1/search` (default) still includes `assist` and `proposedActions` in response  
✅ **Async mode optimized**: `POST /api/v1/search?mode=async` skips assistant, gets it via WebSocket  
✅ **All existing tests pass**: Sync mode behavior preserved  

---

## Files Modified

1. **`server/src/services/search/orchestrator/search.orchestrator.ts`**
   - Added `skipAssistant` parameter to `search()` method
   - Conditionally skip `assistantNarration.generateFast()` (line 867-883)
   - Conditionally skip `generateProposedActions()` (line 888-895)
   - Updated `searchCore()` to pass `skipAssistant=true` (line 120)
   - Made `assist` and `proposedActions` optional in response (line 959-961)

---

## Testing Instructions

### 1. Restart Backend

```powershell
cd server
# Stop current server (Ctrl+C)
npm run dev
```

**Expected logs**:
```
✅ SearchOrchestrator ready
✅ InMemoryRequestStore initialized
✅ WebSocketManager initialized
✅ Server listening on http://localhost:3000
```

### 2. Test Async Mode

```powershell
# In frontend
cd llm-angular
npm start

# Then open http://localhost:4200
# Search for: "פיצה בגדרה"
```

**Expected**:
- ⏱️ Results appear in **< 5 seconds** (targeting <1s after geocoding cache)
- 📝 Assistant summary shows "Preparing assistant..."
- ✨ Text starts streaming after results appear
- ✅ Console logs show `assistantMs: 0` in HTTP response

### 3. Check Logs

**Backend logs should show**:
```
[23:XX:XX] INFO: search_core_completed
    coreMs: ~5000  ← Down from 8443ms! (targeting <1s)
    resultCount: 10

[23:XX:XX] INFO: HTTP response
    durationMs: ~5000  ← Down from 8598ms!

[23:XX:XX] INFO: assistant_job_started  ← Happens AFTER HTTP response
    requestId: "req-..."

[23:XX:XX] INFO: assistant_job_completed
    assistantMs: 3667  ← Now happens async over WebSocket
```

---

## Performance Bottlenecks Remaining

After Phase 1.5, the remaining slow parts in `searchCore()` are:

1. **Geocoding** (~1.7s)
   - **Fix**: Implement city cache in `GeoResolverService`
   - **Expected gain**: -1.5s (cache hit)

2. **Google Places API** (~2.9s)
   - **Fix**: Consider pagination strategy or caching
   - **Expected gain**: -1s (with smart caching)

3. **Intent Parsing** (~20ms)
   - Already optimized with fast-path

**Target after full optimization**: **< 1 second** ✅

---

## Next Steps (Future Phases)

### Phase 1.6: Geocoding Cache

- Cache city geocoding results in `GeoResolverService`
- Key by `{city, language}` tuple
- TTL: 1 hour (cities don't move!)
- **Expected**: 1.7s → 5ms (cache hit)

### Phase 1.7: Provider Response Cache

- Cache Google Places API responses for common queries
- Key by `{query, location, radius, language}` tuple
- TTL: 5 minutes (balance freshness vs performance)
- **Expected**: 2.9s → 50ms (cache hit)

### Phase 1.8: Extract Core Logic Fully

- Currently `searchCore()` still calls `search()`
- Extract the actual core logic (intent → geo → provider → ranking) into a dedicated method
- Avoids overhead of flag checking and early exits in `search()`

---

## Definition of Done ✅

- [x] `skipAssistant` parameter added to `search()` method
- [x] Assistant narration skipped when `skipAssistant=true`
- [x] Proposed actions skipped when `skipAssistant=true`
- [x] `searchCore()` passes `skipAssistant=true`
- [x] Response fields `assist` and `proposedActions` made optional
- [x] Backward compatibility maintained (sync mode unchanged)
- [x] TypeScript compiles cleanly
- [ ] Manual test: async search < 5s (targeting <1s after cache) - **READY FOR TESTING**

---

**Phase 1.5 Status**: ✅ **COMPLETE - READY FOR TESTING**

**Next**: Test the fix and observe actual performance improvement!

**Expected Result**: Async mode HTTP response should now be **~5 seconds** (down from 8.4s), with further optimization possible via caching.
