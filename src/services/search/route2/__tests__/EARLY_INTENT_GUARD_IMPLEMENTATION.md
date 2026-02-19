# Early INTENT Guard Implementation (2026-02-03)

## Summary

Added early INTENT guard to block Google API calls for TEXTSEARCH queries without location anchors, preventing wasted API calls and improving efficiency.

## Changes Made

### 1. New Guard Function (`orchestrator.guards.ts`)

```typescript
export async function handleEarlyTextSearchLocationGuard(
  request: SearchRequest,
  gateResult: Gate2StageOutput,
  intentDecision: IntentResult,
  ctx: Route2Context,
  wsManager: WebSocketManager
): Promise<SearchResponse | null>;
```

**Logic:**

- Triggers ONLY for `intentDecision.route === 'TEXTSEARCH'`
- Checks for location anchors: `userLocation` OR `cityText`
- If NO location → returns CLARIFY response with `blocksSearch: true`
- If location exists → returns `null` (continues pipeline)

### 2. Pipeline Integration (`route2.orchestrator.ts`)

**Flow:**

```
Gate2 → Gate guards → Fire parallel tasks → Intent →
**Early INTENT guard** ← NEW (line 192-194) →
Near-me checks → Route-LLM → NEARBY/TEXTSEARCH guards →
google_parallel_start_decision log → Start Google fetch
```

**Key Changes:**

- Guard called immediately after Intent stage (line 192-194)
- Removed `google_parallel_started` log from early context (old line 207-217)
- Added `google_parallel_start_decision` log AFTER guards (line 251-261)
- Log includes: `{ route, hasLocation, allowed: true }`

### 3. Test Coverage (`__tests__/early-intent-guard.test.ts`)

**Test Cases:**

1. **TEXTSEARCH without location → CLARIFY**

   - No `userLocation`, no `cityText`
   - Returns CLARIFY response
   - Source: `route2_early_textsearch_guard`
   - FailureReason: `LOCATION_REQUIRED`

2. **TEXTSEARCH with cityText → continues**

   - Has `cityText` from intent
   - Returns `null` (continues)

3. **NEARBY route → continues**
   - Different route, not affected by this guard
   - Returns `null` (continues)

## Expected Behavior

### Case 1: TEXTSEARCH without location (BLOCKED)

**Query:** "ציזבורגר" (just burger, no location)

**Expected Logs:**

```json
{
  "event": "pipeline_clarify",
  "reason": "early_textsearch_no_location",
  "blocksSearch": true,
  "route": "TEXTSEARCH",
  "hasUserLocation": false,
  "hasCityText": false
}
```

**Expected Response:**

```json
{
  "assist": { "type": "clarify" },
  "meta": {
    "source": "route2_early_textsearch_guard",
    "failureReason": "LOCATION_REQUIRED"
  },
  "results": []
}
```

**Verification:**

- ✅ NO `google_parallel_start_decision` log
- ✅ Google API NOT called
- ✅ User sees clarify message

### Case 2: TEXTSEARCH with location (CONTINUES)

**Query:** "ציזבורגר תל אביב" (burger in Tel Aviv)

**Expected Logs:**

```json
{
  "event": "google_parallel_start_decision",
  "route": "TEXTSEARCH",
  "hasLocation": true,
  "allowed": true
}
```

**Expected Response:**

```json
{
  "results": [
    /* array of restaurants */
  ],
  "meta": { "source": "route2" }
}
```

**Verification:**

- ✅ `google_parallel_start_decision` log present
- ✅ Google API called
- ✅ User sees results

### Case 3: NEARBY with userLocation (CONTINUES)

**Query:** "ציזבורגר לידי" (burger near me)

**Expected Logs:**

```json
{
  "event": "google_parallel_start_decision",
  "route": "NEARBY",
  "hasLocation": true,
  "allowed": true
}
```

**Expected Response:**

```json
{
  "results": [
    /* array of nearby restaurants */
  ],
  "meta": { "source": "route2" }
}
```

**Verification:**

- ✅ `google_parallel_start_decision` log present
- ✅ Google API called
- ✅ User sees nearby results

## Manual Verification Steps

### 1. Start Server

```bash
cd server
npm run dev
```

### 2. Test Case 1: TEXTSEARCH without location

```bash
# Query: "ציזבורגר" (no location, no GPS)
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "ציזבורגר", "llmProvider": "openai"}'
```

**Check Logs:**

- ✅ `pipeline_clarify` with `blocksSearch: true`
- ❌ NO `google_parallel_start_decision`
- ✅ Response has `assist.type: "clarify"`

### 3. Test Case 2: TEXTSEARCH with city

```bash
# Query: "ציזבורגר תל אביב"
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "ציזבורגר תל אביב", "llmProvider": "openai"}'
```

**Check Logs:**

- ✅ `google_parallel_start_decision` with `route: "TEXTSEARCH", hasLocation: true`
- ✅ `google_parallel_completed`
- ✅ Response has results array

### 4. Test Case 3: NEARBY with GPS

```bash
# Query: "ציזבורגר לידי" with userLocation
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "ציזבורגר לידי",
    "llmProvider": "openai",
    "userLocation": {"lat": 32.0853, "lng": 34.7818}
  }'
```

**Check Logs:**

- ✅ `google_parallel_start_decision` with `route: "NEARBY", hasLocation: true`
- ✅ `google_parallel_completed`
- ✅ Response has nearby results

## Benefits

1. **Prevents Wasted API Calls**: No Google search for queries without location
2. **Better UX**: Immediate clarify message instead of empty/irrelevant results
3. **Cost Savings**: Reduces unnecessary Google Places API calls
4. **Cleaner Logs**: Single decision log shows when/why Google search started

## Files Modified

- `server/src/services/search/route2/orchestrator.guards.ts` (+88 lines)
- `server/src/services/search/route2/route2.orchestrator.ts` (+16 lines, -10 lines)
- `server/src/services/search/route2/__tests__/early-intent-guard.test.ts` (new file, +272 lines)

## Backward Compatibility

✅ No breaking changes
✅ Existing guards still work
✅ Only affects TEXTSEARCH without location
✅ NEARBY and LANDMARK routes unchanged
