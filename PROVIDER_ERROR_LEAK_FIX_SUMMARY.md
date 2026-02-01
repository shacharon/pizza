# Provider Error Leak Fix - Summary

## Overview
Fixed OpenAI schema validation error and prevented provider error message leakage to the UI.

**Date:** 2026-02-01
**Branch:** p0-4-remove-temp-guards

## TASK A: Fix OpenAI Strict Schema Error (LANDMARK)

### Issue
OpenAI was rejecting the LANDMARK_JSON_SCHEMA with error:
```
400 Invalid schema for response_format 'response': In context=('properties', 'resolvedLatLng', 'type', '0'), 'additionalProperties' is required to be supplied and to be false.
```

### Root Cause
When using type unions like `type: ['object', 'null']` in OpenAI strict mode, the `additionalProperties: false` constraint must be defined within the object variant, not at the union level. OpenAI requires using `anyOf` for nullable objects.

### Fix
Updated `LANDMARK_JSON_SCHEMA` in `static-schemas.ts`:

**Before:**
```typescript
resolvedLatLng: {
    type: ['object', 'null'] as const,
    properties: { lat, lng },
    required: ['lat', 'lng'],
    additionalProperties: false
}
```

**After:**
```typescript
resolvedLatLng: {
    anyOf: [
        {
            type: 'object' as const,
            properties: { lat, lng },
            required: ['lat', 'lng'],
            additionalProperties: false
        },
        { type: 'null' as const }
    ]
}
```

Also confirmed `keyword` field is correctly defined as `type: ['string', 'null']` and is in the required array.

### Files Modified
- `server/src/services/search/route2/stages/route-llm/static-schemas.ts`

---

## TASK B: Prevent Provider Error Leakage to UI

### Issue
Raw provider error messages (containing OpenAI API details, schema errors, etc.) were being sent directly to:
1. WebSocket clients via the `search` channel error events
2. HTTP responses via `/result` endpoint
3. Job store error messages

**Example leaked message:**
```
"400 Invalid schema for response_format 'response': In context=('properties', 'resolvedLatLng', 'type', '0'), 'additionalProperties' is required to be supplied and to be false."
```

### Fix

#### 1. Added Sanitization Utility
Created `sanitizeErrorMessage()` in `pipeline-error-kinds.ts` that:
- Returns generic message "An internal error occurred" for INTERNAL_ERROR, PROVIDER_ERROR, etc.
- Returns safe, classified messages for client-actionable errors (e.g., "Location required for nearby search")
- Ensures raw provider details NEVER reach the client
- Logs raw errors server-side for debugging

#### 2. Updated Error Publishing in Async Execution
Modified `search.async-execution.ts` to:
- Classify errors using `classifyPipelineError()`
- Sanitize messages using `sanitizeErrorMessage()` before:
  - Storing in Redis job store
  - Publishing to WebSocket
- Log raw error messages with `requestId` for server-side debugging

#### 3. HTTP Response Already Sanitized
The `/result` endpoint already uses error messages from the job store, so sanitizing at the storage point automatically protects HTTP responses.

### Files Modified
- `server/src/services/search/route2/pipeline-error-kinds.ts` (added `sanitizeErrorMessage()`)
- `server/src/controllers/search/search.async-execution.ts` (sanitize before publish/store)

---

## TASK C: UI Hardening

### Issue
UI was displaying raw error messages from WebSocket and HTTP responses without sanitization.

### Fix

#### 1. WebSocket Error Handler
Modified `search-ws.facade.ts` to:
- Never display `event.message` directly
- Replace with generic user-facing message: "Something went wrong. Please try again."
- Log raw error code and message for debugging

#### 2. Assistant Panel SEARCH_FAILED Support
Updated `assistant-panel.component.ts` to:
- Include 'SEARCH_FAILED' in valid assistant message types
- Assign seq=4 for SEARCH_FAILED messages
- Display SEARCH_FAILED messages as progress indicators

#### 3. WebSocket Message Routing
Updated `search-ws.facade.ts` to:
- Include 'SEARCH_FAILED' in assistant message type validation
- Allow SEARCH_FAILED messages through to UI (with sanitized content from backend)

### Files Modified
- `llm-angular/src/app/facades/search-ws.facade.ts`
- `llm-angular/src/app/features/unified-search/components/assistant-panel/assistant-panel.component.ts`

---

## TESTS (Minimal Coverage)

### Test 1: Provider Error Sanitization
**File:** `server/src/services/search/route2/__tests__/provider-error-sanitization.test.ts`

**Tests (5/5 passing):**
1. ✅ Should sanitize OpenAI schema errors for client
2. ✅ Should sanitize provider timeout errors
3. ✅ Should sanitize generic provider errors
4. ✅ Should allow safe error messages for client-actionable errors
5. ✅ Should sanitize LLM provider errors

**Key Assertions:**
- Verifies INTERNAL_ERROR returns "An internal error occurred"
- Verifies raw error messages are NOT in sanitized output
- Verifies provider names (OpenAI, etc.) are NOT leaked
- Verifies API keys and schema details are NOT exposed

### Test 2: Landmark Schema Validation
**File:** `server/src/services/search/route2/stages/route-llm/__tests__/landmark-schema-validation.test.ts`

**Tests (5/5 passing):**
1. ✅ Should have additionalProperties: false for resolvedLatLng object type
2. ✅ Should have keyword as nullable string
3. ✅ Should pass OpenAI strict schema validation
4. ✅ Should have all properties in required array
5. ✅ Should have resolvedLatLng in required array

**Key Assertions:**
- Verifies `anyOf` structure for nullable resolvedLatLng
- Verifies object variant has `additionalProperties: false`
- Verifies `lat` and `lng` properties and required fields
- Verifies schema passes `assertStrictSchema()` validation

---

## Changed Files Summary

### Backend (Server)
1. `server/src/services/search/route2/stages/route-llm/static-schemas.ts` - Fixed LANDMARK_JSON_SCHEMA
2. `server/src/services/search/route2/pipeline-error-kinds.ts` - Added sanitizeErrorMessage()
3. `server/src/controllers/search/search.async-execution.ts` - Sanitize errors before publish/store

### Frontend (UI)
1. `llm-angular/src/app/facades/search-ws.facade.ts` - Sanitize error display, support SEARCH_FAILED
2. `llm-angular/src/app/features/unified-search/components/assistant-panel/assistant-panel.component.ts` - Support SEARCH_FAILED messages

### Tests (New)
1. `server/src/services/search/route2/__tests__/provider-error-sanitization.test.ts`
2. `server/src/services/search/route2/stages/route-llm/__tests__/landmark-schema-validation.test.ts`

---

## Verification

### 1. Schema Error Fixed ✅
The OpenAI schema validation error is resolved. The LANDMARK_JSON_SCHEMA now correctly uses `anyOf` for nullable objects.

### 2. Provider Error Leak Blocked ✅
- WebSocket error messages are sanitized: generic message instead of raw provider details
- HTTP responses use sanitized messages from job store
- UI displays generic "Something went wrong. Please try again." for errors
- Raw errors logged server-side with requestId for debugging

### 3. Tests Pass ✅
- All 5 provider error sanitization tests pass
- All 5 landmark schema validation tests pass

---

## Security Impact

**BEFORE:**
- Raw OpenAI API errors exposed to clients
- Schema validation details leaked to UI
- Potential information disclosure vulnerability

**AFTER:**
- All provider errors sanitized before reaching client
- Generic user-facing messages only
- Raw errors preserved in server logs for debugging
- Defense-in-depth: sanitization at multiple layers (backend, frontend)

---

## Next Steps (Recommendations)

1. **Monitor Production Logs:** Watch for new error patterns that may need sanitization
2. **Update Error Taxonomy:** Add new error kinds as needed to `PipelineErrorKind`
3. **Client-Side Tracking:** Consider adding error tracking with sanitized error codes (not messages)
4. **Documentation:** Update API documentation to reflect error response format

---

## Notes

- No refactors performed (as requested)
- No architecture changes
- Minimal files touched (only what was necessary)
- All changes are backward compatible
- Existing error handling flow preserved
