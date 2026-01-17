# Fix Summary: Google Places API (New) - NEARBY 400 + Error Handling

**Date:** January 2026  
**Status:** ✅ COMPLETE

---

## Issues Fixed

### 1. ✅ NEARBY Search HTTP 400 Error

**Problem:** Google Places API (New) returned `HTTP 400: Unknown name includedType`

**Root Cause:** Used `includedType` (singular, string) instead of `includedTypes` (plural, array)

**Solution:** Changed all 4 instances in `google-maps.stage.ts`:
- Line 208: Text Search request builder
- Line 290: Nearby Search request builder  
- Line 652: Landmark Plan - Nearby path
- Line 670: Landmark Plan - Text Search with bias

**Change:**
```typescript
// BEFORE (❌ Wrong)
includedType: 'restaurant'

// AFTER (✅ Correct)
includedTypes: ['restaurant']
```

---

### 2. ✅ Enhanced Error Logging

**Problem:** When Google API failed, error details were minimal

**Solution:** Added comprehensive error logging to both API call functions:

```typescript
logger.error({
  requestId,
  provider: 'google_places_new',
  endpoint: 'searchText' | 'searchNearby',
  status: response.status,
  errorBody: errorText,
  requestBody: body
}, '[GOOGLE] API error');
```

**Benefits:**
- Full error context in logs
- Request body logged for debugging
- HTTP status and error message captured
- Easy to trace issues in production

---

### 3. ✅ Error Propagation (Verified Working)

**Verification:** Confirmed existing error handling correctly propagates provider failures:

**Flow:**
1. Google API throws error in `google-maps.stage.ts`
2. Error propagates through `route2.orchestrator.ts`
3. Caught in `search.controller.ts` async job handler
4. Job marked as `FAILED` (not `DONE_SUCCESS`)
5. WebSocket error event published with `type: 'error'`
6. Client can show "temporary failure" instead of "no results"

**No changes needed** - error handling was already correct!

---

## Files Modified

| File | Changes | Purpose |
|------|---------|---------|
| `google-maps.stage.ts` | 4 field name fixes | Fix HTTP 400 error |
| `google-maps.stage.ts` | 2 error logging enhancements | Better debugging |
| `google-places-new.test.ts` | **NEW** - 177 lines | Prevent regression |
| `GOOGLE_PLACES_FIX.md` | **NEW** - Documentation | Complete fix details |
| `FIX_SUMMARY.md` | **NEW** - This file | Quick reference |

---

## Validation

### ✅ Grep Validation
```bash
grep -r "includedType" server/src
```
**Result:** All 4 instances use `includedTypes` (plural, array) ✅

### ✅ Test Suite
```bash
npx tsx tests/google-places-new.test.ts
```
**Result:** 7/7 tests passed ✅

### ✅ Build Check
```bash
npm run build
```
**Result:** No errors in `google-maps.stage.ts` ✅

---

## Testing Checklist

### Manual Testing Required

- [ ] **Nearby Search:** "pizza near me" with GPS coords
  - Expected: Results returned, no HTTP 400
  
- [ ] **Text Search:** "pizza in tel aviv"
  - Expected: Results returned, no HTTP 400
  
- [ ] **Landmark Search:** "pizza at azrieli center"
  - Expected: Two-phase search works, no HTTP 400

- [ ] **Error Handling:** Test with invalid API key
  - Expected: Job marked FAILED, WebSocket error event sent

- [ ] **Log Verification:** Check logs for error details
  - Expected: Full error context logged on failures

---

## Key Takeaways

1. **Google API field names matter:** `includedTypes` (plural, array) is required
2. **Error logging is critical:** Always log request body on API errors
3. **Error propagation works:** Existing error handling was already correct
4. **Tests prevent regression:** Unit tests catch field name mistakes

---

## Next Steps

1. ✅ Code changes complete
2. ✅ Tests written and passing
3. ✅ Documentation created
4. ⏳ **Deploy to staging**
5. ⏳ **Manual testing**
6. ⏳ **Monitor logs for 24h**
7. ⏳ **Deploy to production**

---

## Quick Reference

### Correct Request Format

**Text Search:**
```json
{
  "textQuery": "pizza restaurant",
  "languageCode": "en",
  "regionCode": "IL",
  "includedTypes": ["restaurant"]  // ✅ Plural, array
}
```

**Nearby Search:**
```json
{
  "locationRestriction": {
    "circle": {
      "center": {"latitude": 32.0853, "longitude": 34.7818},
      "radius": 500
    }
  },
  "languageCode": "en",
  "regionCode": "IL",
  "includedTypes": ["restaurant"],  // ✅ Plural, array
  "rankPreference": "DISTANCE"
}
```

---

**Fix Complete! 🎉**

All changes are minimal, localized, and tested. Ready for deployment.
