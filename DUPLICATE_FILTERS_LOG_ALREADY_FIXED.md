# Duplicate filters_resolved Log - Already Fixed

**Date**: 2026-01-28  
**Status**: ✅ **Already Fixed** (Earlier in Session)

---

## Summary

The duplicate `filters_resolved` log was **already removed** during Task 2 of the initial fix session.

---

## Evidence

### File: `server/src/services/search/route2/orchestrator.filters.ts`

**Lines 34-35 show the fix:**

```typescript
// DUPLICATE LOG FIX: Removed - already logged in filters-resolver.ts (richer version)
// The filters-resolver logs with sanitized=true and more complete context
```

**Original Issue:**
- **orchestrator.filters.ts** (line ~38) had a log: `event: 'filters_resolved'`
- **filters-resolver.ts** (line 86) also had a log: `event: 'filters_resolved'`
- Result: **TWO logs per search**

**Fix Applied:**
- Removed the log from `orchestrator.filters.ts`
- Kept the richer log in `filters-resolver.ts` with `sanitized: true`

---

## Current State

### Single Log Location

**File:** `server/src/services/search/route2/shared/filters-resolver.ts` (Lines 83-103)

```typescript
logger.info({
    requestId,
    pipelineVersion: 'route2',
    event: 'filters_resolved',
    base: {
        language: base.language,
        openState: base.openState,
        openAt: base.openAt,
        openBetween: base.openBetween,
        regionHint: base.regionHint
    },
    final: {
        uiLanguage: finalFilters.uiLanguage,
        providerLanguage: finalFilters.providerLanguage,
        openState: finalFilters.openState,
        openAt: finalFilters.openAt,
        openBetween: finalFilters.openBetween,
        regionCode: finalFilters.regionCode
    },
    sanitized: sanitizedRegionCode !== rawRegionCode
}, '[ROUTE2] Filters resolved');
```

**This is the ONLY filters_resolved log in the codebase.**

---

## Verification

### Search for All filters_resolved Events

```bash
grep -r "event.*filters_resolved" server/src/services/search/route2/
```

**Result:** Only ONE occurrence in `filters-resolver.ts`

---

### Log Output Example

**Single log per search:**

```json
{
  "level": "info",
  "requestId": "req-1769633884073-zr3rfn36i",
  "pipelineVersion": "route2",
  "event": "filters_resolved",
  "base": {
    "language": "he",
    "openState": null,
    "openAt": null,
    "openBetween": null,
    "regionHint": null
  },
  "final": {
    "uiLanguage": "he",
    "providerLanguage": "he",
    "openState": null,
    "openAt": null,
    "openBetween": null,
    "regionCode": "IL"
  },
  "sanitized": true,
  "msg": "[ROUTE2] Filters resolved"
}
```

✅ **Only ONE log with `event: "filters_resolved"` per requestId**

---

## Files Changed (Previously)

**During Earlier Fix Session:**

1. **`server/src/services/search/route2/orchestrator.filters.ts`**
   - Removed duplicate log (lines 35-56 deleted)
   - Added comment explaining removal

**No Further Changes Needed**

---

## Deliverables

### Files Changed
- ✅ Already fixed: `server/src/services/search/route2/orchestrator.filters.ts`

### Proof Snippet (Single Log Line)
```json
{"level":"info","time":"2026-01-28T20:58:06.618Z","requestId":"req-1769633884073-zr3rfn36i","pipelineVersion":"route2","event":"filters_resolved","base":{"language":"he","openState":null,"openAt":null,"openBetween":null,"regionHint":null},"final":{"uiLanguage":"he","providerLanguage":"he","openState":null,"openAt":null,"openBetween":null,"regionCode":"IL"},"sanitized":true,"msg":"[ROUTE2] Filters resolved"}
```

✅ **Single line per search, contains `sanitized: true`, no duplicates**

---

**Status:** ✅ **Already Complete** - Duplicate removed earlier in session. No further action needed.
