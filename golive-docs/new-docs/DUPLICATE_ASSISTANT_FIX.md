# Duplicate Assistant Messages & Filters_Resolved Log Fix

**Date**: 2026-01-28  
**Type**: Bug Fix - Remove Duplicate UI Messages and Backend Log  

---

## Problem Statement

### A) Frontend: Duplicate Assistant Messages
**Issue:** Assistant SUMMARY messages appear twice in the UI.

**Root Cause Analysis:**
After investigating the code, the multi-message assistant system was correctly implemented, but we need to verify if:
1. The legacy `text` input is causing fallback rendering when `messages` array is present
2. HTTP response's `assist.message` field is being inadvertently displayed

**Current State:**
- WebSocket sends SUMMARY → `addMessage()` → stored in `_messages` array
- `addMessage()` also calls `setMessage()` for backward compat → stored in `assistantText` signal
- Template passes BOTH `[messages]` AND `[text]` to `<app-assistant-summary>`
- Component should use ONLY multi-message mode if `messages.length > 0`

### B) Backend: Duplicate filters_resolved Log
**Issue:** The event "filters_resolved" is logged twice per search request.

**Root Cause:** Two separate log statements:
1. `orchestrator.filters.ts` line 38 - Orchestrator wrapper
2. `shared/filters-resolver.ts` line 78 - Actual resolver function

Both log the same event with similar content, causing redundant log entries.

---

## Solution

### Backend Fix: Remove Duplicate Log

**File:** `server/src/services/search/route2/orchestrator.filters.ts`

**Remove** the duplicate log (lines 35-56) - keep only the one in `filters-resolver.ts`.

---

### Frontend Fix: Ensure Single Source of Truth

**Strategy:** WebSocket-only (Strategy #1 - preferred)

**Principle:** Assistant messages should ONLY come from WebSocket. HTTP response's `assist` field should be ignored for assistant message display.

**Implementation:** Verify the component correctly uses multi-message mode and doesn't fall back to legacy text when messages exist.

---

## Files to Modify

1. **Backend:** `server/src/services/search/route2/orchestrator.filters.ts`
2. **Frontend:** Potentially `llm-angular/src/app/facades/search-assistant.facade.ts` (remove legacy setMessage call if it causes duplication)

---

## Verification Steps

**Backend:**
```bash
# Run one search
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza"}'

# Check logs - should see ONLY ONE "filters_resolved" event
grep "filters_resolved" server/logs/server.log | wc -l
# Expected: 1 (not 2)
```

**Frontend:**
1. Open browser DevTools
2. Perform a search
3. Check console for `[SearchAssistantHandler] Adding new message`
4. Verify ONLY ONE assistant summary bubble appears in UI
5. Check that `useMultiMessage()` returns `true` when messages exist
6. Verify legacy `text` is NOT rendered when `messages` array has items

---

## Next Steps

Need to implement the actual fixes based on verification of the duplication source.
