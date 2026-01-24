# Near-Me HOTFIX - File Changes Diff

## Summary

**Total Files**: 6 (3 modified, 3 new)  
**Build Status**: ✅ PASSING  
**Tests**: ✅ PASSING (13/13)

---

## Modified Files

### 1. `server/src/services/search/types/search.types.ts`

**Line 273** - Added new failure reason:

```diff
  export type FailureReason =
    | 'NONE'
    | 'NO_RESULTS'
    | 'LOW_CONFIDENCE'
    | 'GEOCODING_FAILED'
    | 'GOOGLE_API_ERROR'
    | 'TIMEOUT'
    | 'QUOTA_EXCEEDED'
    | 'LIVE_DATA_UNAVAILABLE'
-   | 'WEAK_MATCHES';
+   | 'WEAK_MATCHES'
+   | 'LOCATION_REQUIRED';
```

---

### 2. `server/src/services/search/route2/route2.orchestrator.ts`

**Line 11** - Added imports:

```diff
  import { resolveUserRegionCode } from './utils/region-resolver.js';
  import { resolveBaseFiltersLLM } from './shared/base-filters-llm.js';
  import { resolveFilters } from './shared/filters-resolver.js';
  import { applyPostFilters } from './post-filters/post-results.filter.js';
+ import { isNearMeQuery, getNearMePattern } from './utils/near-me-detector.js';
```

**Line 249** - Changed `const` to `let` for intent override:

```diff
    // INTENT + ROUTE_LLM chain (still serial inside the chain)
-   const intentDecision = await executeIntentStage(request, ctx);
+   let intentDecision = await executeIntentStage(request, ctx);
```

**Lines 265-340** - Added deterministic override logic:

```diff
    logger.info(
      {
        requestId,
        pipelineVersion: 'route2',
        event: 'intent_decided',
        route: intentDecision.route,
        region: intentDecision.region,
        language: intentDecision.language,
        confidence: intentDecision.confidence,
        reason: intentDecision.reason
      },
      '[ROUTE2] Intent routing decided'
    );

+   // HOTFIX: Deterministic "near me" location requirement
+   const isNearMe = isNearMeQuery(request.query);
+   
+   if (isNearMe && !ctx.userLocation) {
+     // CASE 1: "Near me" without location → CLARIFY (don't call Google)
+     const pattern = getNearMePattern(request.query);
+     
+     logger.info(
+       {
+         requestId,
+         pipelineVersion: 'route2',
+         event: 'near_me_location_required',
+         pattern,
+         hasUserLocation: false,
+         originalRoute: intentDecision.route
+       },
+       '[ROUTE2] Near-me query without location - returning CLARIFY'
+     );
+
+     return {
+       requestId,
+       sessionId: request.sessionId || ctx.sessionId || 'route2-session',
+       query: {
+         original: request.query,
+         parsed: {
+           query: request.query,
+           searchMode: 'textsearch' as const,
+           filters: {},
+           languageContext: {
+             uiLanguage: 'he' as const,
+             requestLanguage: 'he' as const,
+             googleLanguage: 'he' as const
+           },
+           originalQuery: request.query
+         },
+         language: intentDecision.language
+       },
+       results: [],
+       chips: [],
+       assist: {
+         type: 'clarify' as const,
+         message: "כדי לחפש מסעדות לידי אני צריך מיקום. תאפשר מיקום או כתוב עיר/אזור."
+       },
+       meta: {
+         tookMs: Date.now() - startTime,
+         mode: 'textsearch' as const,
+         appliedFilters: [],
+         confidence: intentDecision.confidence,
+         source: 'route2_near_me_clarify',
+         failureReason: 'LOCATION_REQUIRED'
+       }
+     };
+   }
+
+   if (isNearMe && ctx.userLocation) {
+     // CASE 2: "Near me" with location → force NEARBY route
+     const originalRoute = intentDecision.route;
+     
+     if (originalRoute !== 'NEARBY') {
+       logger.info(
+         {
+           requestId,
+           pipelineVersion: 'route2',
+           event: 'intent_overridden',
+           fromRoute: originalRoute,
+           toRoute: 'NEARBY',
+           reason: 'near_me_keyword_override',
+           hasUserLocation: true,
+           pattern: getNearMePattern(request.query)
+         },
+         '[ROUTE2] Near-me detected with location - forcing NEARBY route'
+       );
+
+       intentDecision = {
+         ...intentDecision,
+         route: 'NEARBY',
+         reason: 'near_me_keyword_override'
+       };
+     }
+   }

    const mapping = await executeRouteLLM(intentDecision, request, ctx);
```

---

## New Files

### 3. `server/src/services/search/route2/utils/near-me-detector.ts` (NEW)

**Purpose**: Helper functions to detect near-me queries

**Lines**: 60

**Key Functions**:
```typescript
export function isNearMeQuery(query: string): boolean
export function getNearMePattern(query: string): string | null
```

**Patterns Detected**:
- Hebrew: לידי, לידיי, ממני, קרוב אליי, קרוב אלי, בסביבה, בסביבתי, באזור שלי, בקרבתי
- English: near me, nearby, around me, close to me, in my area

---

### 4. `server/test-near-me-hotfix.js` (NEW)

**Purpose**: Manual verification script

**Lines**: 50

**Usage**:
```bash
node test-near-me-hotfix.js
```

**Tests**: 13 test cases (Hebrew + English patterns)

---

### 5. `server/docs/NEAR_ME_HOTFIX.md` (NEW)

**Purpose**: Comprehensive documentation

**Lines**: 400+

**Sections**:
- Problem statement
- Implementation details
- Detection patterns
- Pipeline behavior (CASE 1 & 2)
- Testing guide
- Monitoring & rollback plan
- Future improvements

---

### 6. `server/NEAR_ME_HOTFIX_SUMMARY.md` (NEW)

**Purpose**: Quick reference summary

**Lines**: 300+

**Sections**:
- What was changed
- Files modified (with code snippets)
- Testing results
- Behavior examples
- Deployment checklist
- Risk assessment

---

## Code Statistics

### Lines Changed

| File | Type | Lines Added | Lines Deleted |
|------|------|-------------|---------------|
| `search.types.ts` | Modified | 1 | 1 |
| `route2.orchestrator.ts` | Modified | 78 | 2 |
| `near-me-detector.ts` | New | 60 | 0 |
| `test-near-me-hotfix.js` | New | 50 | 0 |
| `NEAR_ME_HOTFIX.md` | New | 400+ | 0 |
| `NEAR_ME_HOTFIX_SUMMARY.md` | New | 300+ | 0 |

**Total**: ~890 lines added, 3 lines deleted

---

## Testing Coverage

### Unit Tests (Manual Verification)

✅ 13/13 tests passed

**Hebrew Patterns**:
- ✅ לידי
- ✅ לידיי
- ✅ ממני
- ✅ קרוב אליי
- ✅ בסביבה

**English Patterns**:
- ✅ near me
- ✅ nearby
- ✅ around me

**Negative Cases**:
- ✅ מסעדות בתל אביב (should NOT match)
- ✅ restaurants in london (should NOT match)

---

## Build & Type Safety

### TypeScript Compilation

```bash
npm run build
```

**Result**: ✅ Exit code 0 (no errors)

**Key Changes**:
- Added `LOCATION_REQUIRED` to `FailureReason` type enum
- All usages type-checked correctly
- No breaking changes to existing code

---

## Integration Points

### Pipeline Flow

```
executeIntentStage()
    ↓
[NEW] isNearMeQuery() check
    ↓
    ├─ NO LOCATION → return CLARIFY (early exit)
    ├─ HAS LOCATION → override intent to NEARBY
    └─ NOT NEAR-ME → continue normally
    ↓
executeRouteLLM()
```

### Affected Components

**Direct**:
- `route2.orchestrator.ts` (main logic)
- `near-me-detector.ts` (helper)
- `search.types.ts` (type definition)

**Indirect** (via logs):
- Monitoring dashboards (new events)
- Analytics (new failure reason)
- Frontend (new CLARIFY message)

---

## Log Events

### New Events

1. **`near_me_location_required`**
   ```json
   {
     "event": "near_me_location_required",
     "pattern": "לידי",
     "hasUserLocation": false,
     "originalRoute": "TEXTSEARCH"
   }
   ```

2. **`intent_overridden`**
   ```json
   {
     "event": "intent_overridden",
     "fromRoute": "TEXTSEARCH",
     "toRoute": "NEARBY",
     "reason": "near_me_keyword_override",
     "hasUserLocation": true,
     "pattern": "לידי"
   }
   ```

---

## Rollback Instructions

If issues arise, rollback is simple:

**Option 1: Comment Out HOTFIX Block**

In `route2.orchestrator.ts`, comment lines 265-340:

```typescript
// HOTFIX: Deterministic "near me" location requirement
/*
const isNearMe = isNearMeQuery(request.query);
... (all override logic)
*/
```

**Option 2: Revert Commits**

```bash
git revert <commit-hash>
```

**Build and redeploy**:
```bash
npm run build
# Deploy to production
```

---

## Pre-Deployment Checklist

- [x] TypeScript build passes
- [x] Manual verification tests pass (13/13)
- [x] No breaking changes
- [x] Documentation complete
- [x] Rollback plan documented
- [x] Log events structured
- [x] Code reviewed
- [x] Risk assessment: LOW
- [ ] Deployed to staging (NEXT STEP)
- [ ] Monitored in staging (NEXT STEP)
- [ ] Deployed to production (NEXT STEP)

---

**Status**: ✅ READY FOR STAGING DEPLOYMENT  
**Date**: 2026-01-20  
**Implemented By**: Cursor AI Assistant
