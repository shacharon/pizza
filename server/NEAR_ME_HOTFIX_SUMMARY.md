# ✅ Near-Me HOTFIX - Implementation Summary

## What Was Changed

Implemented a **deterministic override** in Route2 pipeline to handle "לידי/near me" queries when user location is missing.

---

## Files Modified

### 1. **NEW**: `server/src/services/search/route2/utils/near-me-detector.ts`
**Purpose**: Helper functions to detect near-me keywords

**Key Functions**:
```typescript
isNearMeQuery(query: string): boolean
getNearMePattern(query: string): string | null
```

**Detects**: לידי, לידיי, ממני, קרוב אליי, בסביבה, near me, nearby, around me, etc.

---

### 2. **MODIFIED**: `server/src/services/search/route2/route2.orchestrator.ts`
**Lines**: ~250-340 (after `executeIntentStage`)

**Changes**:
1. Import `isNearMeQuery` and `getNearMePattern`
2. Changed `const intentDecision` → `let intentDecision` (to allow override)
3. Added deterministic override logic:
   - **CASE 1**: `isNearMe && !userLocation` → Return CLARIFY (don't call Google)
   - **CASE 2**: `isNearMe && userLocation` → Force `route = 'NEARBY'`

**Code Snippet**:
```typescript
// HOTFIX: Deterministic "near me" location requirement
const isNearMe = isNearMeQuery(request.query);

if (isNearMe && !ctx.userLocation) {
  // Return CLARIFY response immediately
  return {
    requestId,
    results: [],
    assist: {
      type: 'clarify',
      message: "כדי לחפש מסעדות לידי אני צריך מיקום. תאפשר מיקום או כתוב עיר/אזור."
    },
    meta: {
      failureReason: 'LOCATION_REQUIRED',
      source: 'route2_near_me_clarify'
    }
  };
}

if (isNearMe && ctx.userLocation) {
  // Force NEARBY route
  if (intentDecision.route !== 'NEARBY') {
    logger.info({ event: 'intent_overridden', ... });
    intentDecision = { ...intentDecision, route: 'NEARBY', reason: 'near_me_keyword_override' };
  }
}
```

---

### 3. **MODIFIED**: `server/src/services/search/types/search.types.ts`
**Line**: ~273

**Changes**: Added `'LOCATION_REQUIRED'` to `FailureReason` type

```typescript
export type FailureReason =
  | 'NONE'
  | 'NO_RESULTS'
  | 'LOW_CONFIDENCE'
  | 'GEOCODING_FAILED'
  | 'GOOGLE_API_ERROR'
  | 'TIMEOUT'
  | 'QUOTA_EXCEEDED'
  | 'LIVE_DATA_UNAVAILABLE'
  | 'WEAK_MATCHES'
  | 'LOCATION_REQUIRED';  // ← NEW
```

---

### 4. **NEW**: `server/test-near-me-hotfix.js`
**Purpose**: Manual verification script

**Usage**:
```bash
cd server
npm run build
node test-near-me-hotfix.js
```

**Result**: ✅ All 13 tests passed

---

### 5. **NEW**: `server/docs/NEAR_ME_HOTFIX.md`
**Purpose**: Comprehensive documentation

**Contents**:
- Problem statement
- Implementation details
- Detection patterns (Hebrew + English)
- Pipeline behavior (CASE 1 & 2)
- Testing guide
- Monitoring & rollback plan

---

## Testing Results

### Manual Verification: ✅ PASSED

```
=== Testing Near-Me Detector ===

✅ PASS: "מסעדות לידי" → true (pattern: "לידי")
✅ PASS: "מה יש לידיי" → true (pattern: "לידי")
✅ PASS: "פיצה ממני" → true (pattern: "ממני")
✅ PASS: "קרוב אליי" → true (pattern: "קרוב אליי")
✅ PASS: "בסביבה שלי" → true (pattern: "בסביבה")
✅ PASS: "מסעדות פתוחות לידי" → true (pattern: "לידי")
✅ PASS: "restaurants near me" → true (pattern: "near me")
✅ PASS: "pizza nearby" → true (pattern: "nearby")
✅ PASS: "food around me" → true (pattern: "around me")
✅ PASS: "מסעדות בתל אביב" → false
✅ PASS: "פיצה ברעננה" → false
✅ PASS: "restaurants in london" → false
✅ PASS: "pizza downtown" → false

Passed: 13/13
```

### TypeScript Build: ✅ PASSED

```bash
npm run build
# Exit code: 0 (no errors)
```

---

## Behavior Examples

### Example 1: Near-Me WITHOUT Location

**Query**: `"מסעדות פתוחות לידי"`  
**User Location**: None  

**Result**:
```json
{
  "results": [],
  "assist": {
    "type": "clarify",
    "message": "כדי לחפש מסעדות לידי אני צריך מיקום. תאפשר מיקום או כתוב עיר/אזור."
  },
  "meta": {
    "failureReason": "LOCATION_REQUIRED",
    "source": "route2_near_me_clarify"
  }
}
```

**Logs**:
```json
{
  "event": "near_me_location_required",
  "pattern": "לידי",
  "hasUserLocation": false,
  "originalRoute": "TEXTSEARCH"
}
```

**Impact**: ✅ No Google API call, saves quota

---

### Example 2: Near-Me WITH Location

**Query**: `"מסעדות לידי"`  
**User Location**: `{ lat: 32.0853, lng: 34.7818 }`  
**LLM Intent**: `"TEXTSEARCH"` (wrong)  

**Override**:
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

**Result**: Google Nearby API called with user coordinates  
**Impact**: ✅ Correct search mode, better results

---

### Example 3: City-Based Query (No Change)

**Query**: `"מסעדות בתל אביב"`  
**User Location**: None  

**Result**: Normal TEXTSEARCH flow, no override  
**Impact**: ✅ No regression, existing behavior preserved

---

## Deployment Checklist

- [x] TypeScript build passes
- [x] Manual verification script passes
- [x] Documentation created
- [x] No breaking changes
- [x] Rollback plan documented
- [x] Minimal code changes (3 files modified, 2 new)
- [x] Logs structured for monitoring

---

## Next Steps

### Immediate (Production)
1. Deploy to staging
2. Monitor logs for:
   - `near_me_location_required` frequency
   - `intent_overridden` frequency
3. Verify user behavior after CLARIFY
4. Deploy to production if metrics look good

### Future Enhancements
1. Add ML-based location intent detection
2. Track user location permission patterns
3. Suggest popular cities in CLARIFY message
4. A/B test different CLARIFY message variants

---

## Risk Assessment

**Risk Level**: 🟢 LOW

**Why**:
- Deterministic logic (no LLM dependency)
- Isolated to one pipeline stage
- Early exit prevents downstream side effects
- Comprehensive detection patterns
- Easy rollback (comment out one block)

**Mitigation**:
- Conservative pattern list (avoids false positives)
- Explicit logging for monitoring
- User can rephrase if needed

---

## Success Metrics

Track in first week:
- `LOCATION_REQUIRED` responses: Should be < 5% of total searches
- `intent_overridden` count: Should match "near me" query volume
- User follow-up actions: Do they enable location or rephrase?
- Zero regression: City-based queries unaffected

---

**Status**: ✅ READY FOR DEPLOYMENT  
**Build**: ✅ PASSING  
**Tests**: ✅ PASSING  
**Docs**: ✅ COMPLETE  

**Implemented**: 2026-01-20  
**By**: Cursor AI Assistant
