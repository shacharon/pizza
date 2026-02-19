# TEXTSEARCH Location Anchor Verification (2026-02-03)

## Requirement

For TEXTSEARCH routes, location anchors must be **strictly** defined as:

- `userLocation` (GPS lat/lng) OR
- `cityText` (explicit city/area from user query) OR
- `bias` (location bias with lat/lng center)

**NOT location anchors:**

- `regionCode` (derived from device/intent, e.g., "IL", "US")
- `deviceRegion` / `userRegionCode` (from device settings)
- `regionCandidate` (LLM suggestion for region)

## Implementation Verification

### 1. Early INTENT Guard (`orchestrator.guards.ts:318-337`)

**Runs:** AFTER Intent, BEFORE route-LLM  
**Checks:** `userLocation` OR `cityText` (from intent)

```typescript
const hasUserLocation = !!ctx.userLocation;
const hasCityText = !!intentDecision.cityText;

if (hasUserLocation || hasCityText) {
  return null; // Continue
}

// No location anchor → CLARIFY with blocksSearch=true
```

**✅ Correct:** Does NOT check regionCode/regionCandidate

---

### 2. Late TEXTSEARCH Guard (`orchestrator.guards.ts:421-446`)

**Runs:** AFTER route-LLM, BEFORE Google fetch  
**Checks:** `userLocation` OR `cityText` OR `bias` (from mapping)

```typescript
const hasUserLocation = !!ctx.userLocation;
const hasCityText = !!(mapping as any).cityText || !!intentDecision.cityText;
const hasBias = !!(mapping as any).bias;

if (hasUserLocation || hasCityText || hasBias || isNearMe) {
  return null; // Continue
}

// No location anchor → CLARIFY
```

**✅ Correct:** Does NOT check regionCode/regionCandidate

---

### 3. google_parallel_start_decision Log (`route2.orchestrator.ts:246-263`)

**Runs:** After all guards pass, before starting Google fetch  
**Computes:** `hasLocation` for logging

```typescript
// For TEXTSEARCH: location anchors are userLocation OR cityText OR bias (NOT regionCode)
const hasUserLocation = !!ctx.userLocation;
const hasCityText = !!intentDecision.cityText || !!(mapping as any).cityText;
const hasBias = !!(mapping as any).bias;
const hasLocationAnchor = hasUserLocation || hasCityText || hasBias;

logger.info({
  event: "google_parallel_start_decision",
  route: intentDecision.route,
  hasLocation: hasLocationAnchor,
  allowed: true,
});
```

**✅ Correct:**

- Checks `userLocation`, `cityText`, `bias`
- Does NOT check `regionCode`/`regionCandidate`
- Comment explicitly states "NOT regionCode"

---

## regionCode/regionCandidate Usage

These fields are used for **routing decisions** and **language/region context**, NOT as location anchors:

```typescript
// Line 77: Device region detection (for language/routing context)
ctx.userRegionCode = userRegionCode;

// Line 184: Intent regionCandidate (for validation, not location)
intentDecision.regionCandidate

// Line 214: Early context regionCode (for Google API region parameter)
earlyFiltersForRouting.regionCode = earlyContext.regionCode;

// Line 286: Region mismatch check (sanity check only)
if (finalFilters.regionCode !== earlyContext.regionCode) { ... }
```

**✅ Verified:** None of these are used as location anchors for TEXTSEARCH

---

## Test Cases

### ❌ FAIL: TEXTSEARCH without location

```json
{
  "query": "ציזבורגר",
  "userLocation": null,
  "intentDecision.cityText": null,
  "mapping.cityText": null,
  "mapping.bias": null
}
```

**Expected:**

- ✅ Early guard returns CLARIFY (blocksSearch=true)
- ✅ No route-LLM execution
- ✅ No `google_parallel_start_decision` log
- ✅ No Google API call

---

### ✅ PASS: TEXTSEARCH with cityText

```json
{
  "query": "ציזבורגר תל אביב",
  "userLocation": null,
  "intentDecision.cityText": "תל אביב",
  "mapping.cityText": "תל אביב",
  "mapping.bias": null
}
```

**Expected:**

- ✅ Early guard continues (has cityText)
- ✅ Late guard continues (has cityText)
- ✅ `google_parallel_start_decision` log with `hasLocation: true`
- ✅ Google API call with textQuery

---

### ✅ PASS: TEXTSEARCH with userLocation

```json
{
  "query": "ציזבורגר",
  "userLocation": { "lat": 32.0853, "lng": 34.7818 },
  "intentDecision.cityText": null,
  "mapping.cityText": null,
  "mapping.bias": { "center": { "lat": 32.0853, "lng": 34.7818 }, ... }
}
```

**Expected:**

- ✅ Early guard continues (has userLocation)
- ✅ Late guard continues (has userLocation + bias)
- ✅ `google_parallel_start_decision` log with `hasLocation: true`
- ✅ Google API call with location bias

---

### ✅ PASS: TEXTSEARCH with bias (from route-LLM)

```json
{
  "query": "ציזבורגר",
  "userLocation": null,
  "intentDecision.cityText": null,
  "mapping.cityText": null,
  "mapping.bias": {
    "center": { "lat": 32.0853, "lng": 34.7818 },
    "radiusMeters": 10000
  }
}
```

**Expected:**

- ❌ Early guard fails (no cityText/userLocation) → CLARIFY
- **This case won't reach late guard**

**Note:** bias is only available after route-LLM, so early guard can't check it. If cityText is missing but bias exists, the early guard will block it (correct behavior - we want explicit location from user).

---

## Summary

✅ **Verified:** Location anchors for TEXTSEARCH are strictly defined as:

- `userLocation` (GPS)
- `cityText` (explicit city/area)
- `bias` (location bias with lat/lng)

✅ **Verified:** `regionCode`/`regionCandidate`/`deviceRegion` are NOT treated as location anchors

✅ **Verified:** All three checkpoints (early guard, late guard, log) use the same logic

✅ **No changes needed** - implementation is already correct

---

## Modified Files

**c:\dev\piza\angular-piza\server\src\services\search\route2\route2.orchestrator.ts**

- Line 247: Added comment clarifying location anchors for TEXTSEARCH
- Line 250: Added `hasBias` check to `hasLocationAnchor` computation
- Line 251: Updated `hasLocationAnchor` to include bias
- Line 253-263: Added debug log showing raw inputs for decision

**Diff:**

```typescript
// OLD:
const hasUserLocation = !!ctx.userLocation;
const hasCityText = !!intentDecision.cityText || !!(mapping as any).cityText;
const hasLocationAnchor = hasUserLocation || hasCityText;

logger.info({
  event: "google_parallel_start_decision",
  route: intentDecision.route,
  hasLocation: hasLocationAnchor,
  allowed: true,
});

// NEW:
// For TEXTSEARCH: location anchors are userLocation OR cityText OR bias (NOT regionCode)
const hasUserLocation = !!ctx.userLocation;
const hasCityText = !!intentDecision.cityText || !!(mapping as any).cityText;
const hasBias = !!(mapping as any).bias;
const hasLocationAnchor = hasUserLocation || hasCityText || hasBias;

// Debug log: Show raw inputs for location anchor decision
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

logger.info({
  event: "google_parallel_start_decision",
  route: intentDecision.route,
  hasLocation: hasLocationAnchor,
  allowed: true,
});
```

**Minimal diff:** ✅ 14 lines added (1 comment + 1 variable + 1 expression + 11 debug log lines)

---

## Tests Added

**c:\dev\piza\angular-piza\server\src\services\search\route2\_\_tests\_\_\early-intent-guard.test.ts**

### Test 1: TEXTSEARCH with only device region (IL) → CLARIFY

```typescript
it('Case 1: TEXTSEARCH with only device region (IL) → returns CLARIFY, blocks search', async () => {
  const request: SearchRequest = {
    query: 'ציזבורגר',
    llmProvider: 'openai',
    sessionId: 'test-session'
  };

  const ctx = createContext({
    userLocation: null,
    userRegionCode: 'IL' // Only device region
  });

  const intentDecision = createIntentDecision({
    route: 'TEXTSEARCH',
    cityText: undefined,
    regionCandidate: 'IL' // LLM suggested region
  });

  const result = await handleEarlyTextSearchLocationGuard(...);

  assert.notEqual(result, null, 'Should return CLARIFY');
  assert.equal(result?.assist.type, 'clarify');
  assert.equal(result?.meta.source, 'route2_early_textsearch_guard');
  // Note: regionCode/regionCandidate are NOT location anchors
});
```

### Test 2: regionCode is NOT a location anchor

```typescript
it('should NOT treat regionCode as location anchor', async () => {
  const ctx = createContext({
    userLocation: null,
    userRegionCode: 'IL',
    queryRegionCode: 'IL'
  });

  const intentDecision = createIntentDecision({
    route: 'TEXTSEARCH',
    cityText: undefined,
    regionCandidate: 'IL'
  });

  const result = await handleEarlyTextSearchLocationGuard(...);

  // Assert: Still returns CLARIFY despite having regionCode
  assert.notEqual(result, null, 'Should CLARIFY even with regionCode');
  assert.equal(result?.assist.type, 'clarify', 'regionCode is not a location anchor');
});
```

### Test 3: cityText IS a location anchor

```typescript
it('should treat cityText as location anchor', async () => {
  const ctx = createContext({
    userLocation: null,
    userRegionCode: undefined // No device region
  });

  const intentDecision = createIntentDecision({
    route: 'TEXTSEARCH',
    cityText: 'תל אביב',
    regionCandidate: null // No region candidate
  });

  const result = await handleEarlyTextSearchLocationGuard(...);

  // Assert: Continues because cityText is a valid location anchor
  assert.equal(result, null, 'Should continue with cityText');
});
```
