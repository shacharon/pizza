# Location Anchor Debug & Tests (2026-02-03)

## Summary

Added debug logging and tests to verify that TEXTSEARCH location anchors are strictly defined as `userLocation`, `cityText`, or `bias` - **NOT** `regionCode` or `regionCandidate`.

---

## 1. Debug Log Added

**Location:** `route2.orchestrator.ts:253-263`

**Purpose:** Show raw inputs before `google_parallel_start_decision` to debug location anchor logic

```typescript
logger.debug({
  requestId,
  event: "google_start_inputs",
  route: intentDecision.route,
  userLocationPresent: hasUserLocation,
  cityTextPresent: hasCityText,
  locationTextPresent: false,
  regionCode: earlyContext.regionCode,
  query: request.query,
});
```

**Fields:**

- `route`: Intent routing decision (TEXTSEARCH/NEARBY/LANDMARK)
- `userLocationPresent`: Boolean - GPS coordinates available
- `cityTextPresent`: Boolean - City/area text from user query
- `locationTextPresent`: Boolean - Always false (not in current schema)
- `regionCode`: Device/intent-derived region (IL, US, etc.) - **NOT a location anchor**
- `query`: Original user query

**Usage:** Enable debug logs and grep for `google_start_inputs` to see decision inputs

---

## 2. Tests Added

**File:** `__tests__/early-intent-guard.test.ts`

### Test 1: TEXTSEARCH with only device region → CLARIFY

```typescript
it(
  "Case 1: TEXTSEARCH with only device region (IL) → returns CLARIFY, blocks search"
);
```

**Setup:**

- Query: `"ציזבורגר"` (burger, no location)
- `userLocation`: null (no GPS)
- `userRegionCode`: `"IL"` (device region)
- `intentDecision.cityText`: undefined (no city)
- `intentDecision.regionCandidate`: `"IL"` (LLM suggestion)

**Expected:**

- ✅ Returns CLARIFY response
- ✅ `assist.type === 'clarify'`
- ✅ `meta.source === 'route2_early_textsearch_guard'`
- ✅ `meta.failureReason === 'LOCATION_REQUIRED'`
- ✅ No results returned
- ✅ Google API NOT called (blocked by guard)

**Key Point:** `regionCode` and `regionCandidate` are **NOT** treated as location anchors

---

### Test 2: regionCode is NOT a location anchor

```typescript
it("should NOT treat regionCode as location anchor");
```

**Setup:**

- `userLocation`: null
- `userRegionCode`: `"IL"` (device)
- `queryRegionCode`: `"IL"` (detected from query)
- `intentDecision.regionCandidate`: `"IL"` (LLM)
- `intentDecision.cityText`: undefined

**Expected:**

- ✅ Still returns CLARIFY despite having multiple region indicators
- ✅ Confirms `regionCode` is not a location anchor

---

### Test 3: cityText IS a location anchor

```typescript
it("should treat cityText as location anchor");
```

**Setup:**

- Query: `"ציזבורגר תל אביב"` (burger in Tel Aviv)
- `userLocation`: null (no GPS)
- `userRegionCode`: undefined (no device region)
- `intentDecision.cityText`: `"תל אביב"` (has city)
- `intentDecision.regionCandidate`: null (no region)

**Expected:**

- ✅ Returns null (continues)
- ✅ Google search allowed
- ✅ Confirms `cityText` is a valid location anchor even without `regionCode`

---

## 3. Running the Tests

```bash
cd server
node --test --import tsx src/services/search/route2/__tests__/early-intent-guard.test.ts
```

**Expected output:**

```
✔ Case 1: TEXTSEARCH with only device region (IL) → returns CLARIFY, blocks search
✔ Case 1b: TEXTSEARCH without location → returns CLARIFY, blocks search
✔ Case 1c: TEXTSEARCH with userLocation but no cityText → continues
✔ Case 2: TEXTSEARCH with cityText → continues
✔ Case 3: NEARBY route → continues (different guard)
✔ Case 4: LANDMARK route → continues
✔ should NOT treat regionCode as location anchor
✔ should treat cityText as location anchor
```

---

## 4. Debug Log Example

**Query:** `"ציזבורגר"` (no location)

**Expected debug log:**

```json
{
  "level": "debug",
  "requestId": "req-123",
  "event": "google_start_inputs",
  "route": "TEXTSEARCH",
  "userLocationPresent": false,
  "cityTextPresent": false,
  "locationTextPresent": false,
  "regionCode": "IL",
  "query": "ציזבורגר"
}
```

**Note:** Even though `regionCode: "IL"`, the guard will return CLARIFY because `userLocationPresent` and `cityTextPresent` are both false.

---

**Query:** `"ציזבורגר תל אביב"` (with location)

**Expected debug log:**

```json
{
  "level": "debug",
  "requestId": "req-456",
  "event": "google_start_inputs",
  "route": "TEXTSEARCH",
  "userLocationPresent": false,
  "cityTextPresent": true,
  "locationTextPresent": false,
  "regionCode": "IL",
  "query": "ציזבורגר תל אביב"
}
```

**Note:** `cityTextPresent: true` allows Google search to proceed.

---

## 5. Files Modified

1. **route2.orchestrator.ts**

   - Added debug log before `google_parallel_start_decision`
   - Shows raw inputs for location anchor decision

2. ****tests**/early-intent-guard.test.ts**

   - Added 3 new test cases
   - Verifies regionCode is NOT a location anchor
   - Verifies cityText IS a location anchor

3. **LOCATION_ANCHOR_VERIFICATION.md**
   - Updated with test documentation

---

## 6. Location Anchor Rules (Final)

### ✅ Valid Location Anchors for TEXTSEARCH:

1. `userLocation` - GPS coordinates (lat/lng)
2. `cityText` - Explicit city/area from user query
3. `bias` - Location bias with lat/lng center (from route-LLM)

### ❌ NOT Location Anchors:

1. `regionCode` - Derived region (e.g., "IL", "US")
2. `userRegionCode` - Device region setting
3. `queryRegionCode` - Region detected from query language
4. `regionCandidate` - LLM-suggested region

**Rationale:** Region codes indicate general market/language context, not specific search locations. A query like "burger" with device region "IL" should still require explicit location to avoid country-wide searches.

---

## 7. Verification Checklist

- ✅ Debug log added with raw inputs
- ✅ Test: TEXTSEARCH with only regionCode → CLARIFY
- ✅ Test: regionCode NOT treated as location anchor
- ✅ Test: cityText IS treated as location anchor
- ✅ No linter errors
- ✅ Minimal diff (14 lines added to orchestrator, 3 tests added)
- ✅ No type/refactor changes
- ✅ Documentation updated
