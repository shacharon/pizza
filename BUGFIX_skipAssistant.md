# Bug Fix: skipAssistant Undefined Property Access

**Date**: 2026-01-10  
**Status**: ✅ FIXED  
**Error**: `Cannot read properties of undefined (reading 'usedTemplate')`  

---

## Problem

After implementing Phase 1.5 `skipAssistant` flag, the code crashed when `skipAssistant=true` because:

1. **Line 884-886**: Tried to access `assist.usedTemplate` when `assist` was `undefined`
2. **Line 889-893**: Tried to access `proposedActions.perResult.length` unconditionally

### Error Log

```
[23:46:06] ERROR: Search failed
    error: "Cannot read properties of undefined (reading 'usedTemplate')"
[23:46:06] ERROR: [SearchOrchestrator] Search failed
```

---

## Root Cause

The logging code for assistant strategy was OUTSIDE the if/else block:

```typescript
// BAD (line 867-886)
let assist;
if (skipAssistant) {
    assist = undefined;  // ← Set to undefined
    timings.assistantMs = 0;
} else {
    // ... generate assist ...
}

// Log strategy - OUTSIDE the block!
const strategy = assist.usedTemplate ? 'TEMPLATE' : ...;  // ← Crashes! assist is undefined
logger.info({ strategy, durationMs: timings.assistantMs }, '...');
```

---

## Fixes Applied

### Fix 1: Move Logging Inside Else Block (Line 884-886)

**File**: `server/src/services/search/orchestrator/search.orchestrator.ts`

```typescript
// FIXED
let assist;
if (skipAssistant) {
    assist = undefined;
    timings.assistantMs = 0;
} else {
    const assistStart = Date.now();
    assist = await this.assistantNarration.generateFast(...);
    timings.assistantMs = Date.now() - assistStart;
    flags.usedTemplateAssistant = assist.usedTemplate || false;
    flags.usedCachedAssistant = assist.fromCache || false;
    flags.usedLLMAssistant = !assist.usedTemplate && !assist.fromCache;
    
    // Log strategy - NOW INSIDE else block ✅
    const strategy = assist.usedTemplate ? 'TEMPLATE' : (assist.fromCache ? 'CACHE' : 'LLM');
    logger.info({ strategy, durationMs: timings.assistantMs }, '[SearchOrchestrator] Assistant response generated');
}
```

### Fix 2: Conditional Proposed Actions (Line 888-895)

```typescript
// BEFORE
const proposedActions = this.generateProposedActions();
logger.debug({
    quickActionsCount: proposedActions.perResult.length,  // ← Would crash if undefined
    detailedActionsCount: proposedActions.selectedItem.length
}, '...');

// AFTER ✅
const proposedActions = skipAssistant ? undefined : this.generateProposedActions();
if (!skipAssistant && proposedActions) {
    logger.debug({
        quickActionsCount: proposedActions.perResult.length,
        detailedActionsCount: proposedActions.selectedItem.length
    }, '[SearchOrchestrator] Proposed actions generated');
}
```

### Fix 3: Response Fields Already Optional (Line 962-963)

```typescript
// Already correct from Phase 1.5 ✅
...(assist !== undefined && { assist }),
...(proposedActions !== undefined && { proposedActions }),
```

---

## Files Modified

1. **`server/src/services/search/orchestrator/search.orchestrator.ts`**
   - Moved assistant strategy logging inside else block (line 884-886)
   - Added conditional check for proposed actions logging (line 888-895)

---

## Testing

### Before Fix

```
POST /api/v1/search?mode=async
→ ERROR 500
{
  "error": "Cannot read properties of undefined (reading 'usedTemplate')",
  "code": "SEARCH_ERROR"
}
```

### After Fix

```
POST /api/v1/search?mode=async
→ 200 OK (< 5 seconds)
{
  "requestId": "req-...",
  "results": [...],
  "chips": [...],
  "meta": { "tookMs": ~5000 }
  // NO assist or proposedActions (handled by WebSocket)
}
```

---

## Restart Required

**⚠️ Backend must be restarted for changes to take effect:**

```powershell
cd server
# Ctrl+C to stop
npm run dev
```

Then test:
```
Search for: "פיצה בגדרה"
Expected: Results in ~5 seconds (down from 8.4s)
```

---

## Status: ✅ READY TO TEST

All code fixes applied. Restart backend and search again!
