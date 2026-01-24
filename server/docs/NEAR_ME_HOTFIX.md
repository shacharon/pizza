# Near-Me Location Requirement HOTFIX

## Problem Statement

Queries containing "לידי" (near me) or similar keywords were sometimes triggering generic text searches when user location was missing, leading to poor results or irrelevant suggestions.

## Solution

Implemented a **deterministic override** in the Route2 pipeline that:
1. **Detects** "near me" keywords in Hebrew and English
2. **Blocks** the search if location is missing → returns CLARIFY response
3. **Forces** NEARBY route if location is present (overriding LLM intent)

---

## Implementation

### Files Changed

| File | Type | Changes |
|------|------|---------|
| `server/src/services/search/route2/utils/near-me-detector.ts` | **NEW** | Helper to detect near-me queries |
| `server/src/services/search/route2/route2.orchestrator.ts` | **MODIFIED** | Added deterministic override logic |
| `server/src/services/search/types/search.types.ts` | **MODIFIED** | Added `LOCATION_REQUIRED` to `FailureReason` |
| `server/test-near-me-hotfix.js` | **NEW** | Manual verification script |

---

## Detection Logic

### Supported Patterns

**Hebrew**:
- לידי
- לידיי
- ממני
- קרוב אליי
- קרוב אלי
- בסביבה
- בסביבתי
- באזור שלי
- בקרבתי

**English**:
- near me
- nearby
- around me
- close to me
- in my area

### Helper Functions

```typescript
// Check if query contains near-me keywords
isNearMeQuery(query: string): boolean

// Get matched pattern for logging
getNearMePattern(query: string): string | null
```

**Example**:
```typescript
isNearMeQuery('מסעדות לידי')  // → true
getNearMePattern('מסעדות לידי') // → 'לידי'

isNearMeQuery('מסעדות בתל אביב') // → false
```

---

## Pipeline Behavior

### CASE 1: Near-Me WITHOUT Location → CLARIFY

**Trigger**: `isNearMeQuery(query) && !userLocation`

**Flow**:
1. Detect near-me keyword
2. **Skip Google API call** (no wasted API quota)
3. Return early with CLARIFY response

**Response**:
```json
{
  "requestId": "req-123",
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

---

### CASE 2: Near-Me WITH Location → Force NEARBY

**Trigger**: `isNearMeQuery(query) && userLocation`

**Flow**:
1. Detect near-me keyword
2. Check if LLM intent returned `TEXTSEARCH` or other non-NEARBY route
3. **Override** to `NEARBY` route
4. Continue normal flow with user coordinates

**Before Override**:
```json
{
  "route": "TEXTSEARCH",
  "reason": "text_search_detected"
}
```

**After Override**:
```json
{
  "route": "NEARBY",
  "reason": "near_me_keyword_override"
}
```

**Logs**:
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

### CASE 3: Non Near-Me Queries (No Change)

Queries without near-me keywords proceed normally:
- Text searches with city names: `"מסעדות בתל אביב"` → TEXTSEARCH
- Location-based without keywords: `"פיצה ברעננה"` → TEXTSEARCH
- Generic searches: `"italian food"` → TEXTSEARCH

---

## Code Location

### Orchestrator Integration

File: `server/src/services/search/route2/route2.orchestrator.ts`

**Placement**: After `executeIntentStage()`, before `executeRouteLLM()`

```typescript
// STAGE 2: INTENT
let intentDecision = await executeIntentStage(request, ctx);

logger.info(...); // intent_decided

// HOTFIX: Deterministic "near me" location requirement
const isNearMe = isNearMeQuery(request.query);

if (isNearMe && !ctx.userLocation) {
  // CASE 1: Return CLARIFY (no Google call)
  return {
    requestId,
    results: [],
    assist: {
      type: 'clarify',
      message: "כדי לחפש מסעדות לידי אני צריך מיקום..."
    },
    meta: {
      failureReason: 'LOCATION_REQUIRED',
      source: 'route2_near_me_clarify'
    }
  };
}

if (isNearMe && ctx.userLocation) {
  // CASE 2: Force NEARBY route
  if (intentDecision.route !== 'NEARBY') {
    logger.info({ event: 'intent_overridden', ... });
    
    intentDecision = {
      ...intentDecision,
      route: 'NEARBY',
      reason: 'near_me_keyword_override'
    };
  }
}

// STAGE 3: ROUTE_LLM (continues with overridden intent)
const mapping = await executeRouteLLM(intentDecision, request, ctx);
```

---

## Testing

### Manual Verification

Run the verification script:

```bash
cd server
npm run build
node test-near-me-hotfix.js
```

**Expected Output**:
```
=== Testing Near-Me Detector ===

✅ PASS: "מסעדות לידי" → true (pattern: "לידי")
✅ PASS: "מה יש לידיי" → true (pattern: "לידי")
✅ PASS: "פיצה ממני" → true (pattern: "ממני")
...
✅ All tests passed!
```

### Test Scenarios

| Query | Has Location | Expected Behavior |
|-------|--------------|-------------------|
| `"מסעדות לידי"` | ❌ No | CLARIFY response, no Google call |
| `"מסעדות לידי"` | ✅ Yes | Force NEARBY, call Google Nearby API |
| `"pizza near me"` | ❌ No | CLARIFY response |
| `"pizza near me"` | ✅ Yes | Force NEARBY |
| `"מסעדות בתל אביב"` | ❌ No | TEXTSEARCH (no change) |
| `"מסעדות בתל אביב"` | ✅ Yes | TEXTSEARCH (no change) |

---

## Production Impact

### Benefits

✅ **Better UX**: Clear guidance when location is needed  
✅ **Cost Savings**: No wasted Google API calls for unresolvable queries  
✅ **Accuracy**: Forces correct search mode (NEARBY) for proximity queries  
✅ **Deterministic**: Rule-based logic (not LLM-dependent)  
✅ **Safe**: Minimal code changes, isolated to orchestrator  

### Risks

⚠️ **False Positives**: Rare case where "לידי" appears in non-location context  
   - Mitigation: Pattern list is conservative (common phrases only)

⚠️ **Override Conflict**: LLM may have good reason for TEXTSEARCH  
   - Mitigation: User can rephrase query without "near me" keywords

---

## Monitoring

### Key Events

Track these log events in production:

```json
// Location requirement triggered
{
  "event": "near_me_location_required",
  "pattern": "לידי",
  "hasUserLocation": false,
  "originalRoute": "TEXTSEARCH"
}

// Intent overridden
{
  "event": "intent_overridden",
  "fromRoute": "TEXTSEARCH",
  "toRoute": "NEARBY",
  "reason": "near_me_keyword_override",
  "hasUserLocation": true
}
```

### Metrics to Watch

- **CLARIFY Rate**: % of "near me" queries returning `LOCATION_REQUIRED`
- **Override Rate**: % of intents overridden from TEXTSEARCH → NEARBY
- **User Follow-up**: Do users enable location or rephrase after CLARIFY?

---

## Rollback Plan

If issues arise, simply comment out the HOTFIX block in `route2.orchestrator.ts`:

```typescript
// HOTFIX: Deterministic "near me" location requirement
// const isNearMe = isNearMeQuery(request.query);
// ... (rest of logic)
```

Rebuild and redeploy. The helper module can remain (harmless if unused).

---

## Future Improvements

1. **ML-Based Detection**: Train a classifier to detect location intent beyond keywords
2. **User Preferences**: Remember user's location permission state
3. **Fallback Suggestions**: Suggest popular cities if location unavailable
4. **Analytics**: Track which patterns trigger most often

---

## Related Documentation

- [Architecture Overview](./ARCHITECTURE_OVERVIEW.md)
- [Filters Explained](./FILTERS_EXPLAINED.md)
- [Backend Flow](./BACKEND_FLOW.md)

---

**Last Updated**: 2026-01-20  
**Status**: ✅ Deployed  
**Version**: Route2 v1.0
