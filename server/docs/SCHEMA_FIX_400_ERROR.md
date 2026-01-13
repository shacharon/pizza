# Fix: OpenAI 400 Error - Invalid Schema Type "None"

**Date**: 2026-01-13  
**Status**: ✅ Fixed  
**Build**: ✅ Passing

---

## Problem

IntentGateService OpenAI calls were failing with:
```
400 Invalid schema for response_format 'response': 
schema must be a JSON Schema of 'type: "object"', got 'type: "None"'.
```

---

## Root Cause

The issue was in `server/src/llm/openai.provider.ts` line 73:

```typescript
// WRONG: Second parameter should be options object, not a string
const jsonSchema = zodToJsonSchema(schema as any, "response") as any;
```

**Why this caused 'type: "None"':**
- `zodToJsonSchema(schema, "response")` treats `"response"` as the schema name
- But the function signature is: `zodToJsonSchema(schema, options?)`
- Passing a string where an options object is expected caused the library to generate an invalid schema
- The resulting schema had `type: "None"` instead of `type: "object"`

---

## Solution

### 1. Fixed `zodToJsonSchema` Call

**File**: `server/src/llm/openai.provider.ts`

```typescript
// CORRECT: Pass options object with proper configuration
const jsonSchema = zodToJsonSchema(schema as any, {
    target: 'openApi3',
    $refStrategy: 'none'
}) as any;
```

### 2. Added Schema Validation Guards

Added strict validation BEFORE calling OpenAI:

```typescript
// Validate schema is an object
if (!jsonSchema || typeof jsonSchema !== 'object') {
    logger.error({
        traceId: opts?.traceId,
        schemaType: typeof jsonSchema,
        schemaValue: jsonSchema
    }, '[LLM] Invalid JSON Schema: schema is null or not an object');
    throw new Error('Invalid JSON Schema generated from Zod schema');
}

// Validate root type is "object"
if (jsonSchema.type !== 'object') {
    logger.error({
        traceId: opts?.traceId,
        schemaType: jsonSchema.type,
        promptVersion: opts?.promptVersion
    }, '[LLM] Invalid JSON Schema: root type must be "object"');
    throw new Error(`Invalid JSON Schema: root type is "${jsonSchema.type}", expected "object"`);
}

// Ensure additionalProperties is false for strict mode
if (jsonSchema.additionalProperties !== false) {
    jsonSchema.additionalProperties = false;
}
```

### 3. Improved Error Logging

**File**: `server/src/services/intent/intent-gate.service.ts`

Added detailed failure reasons:

```typescript
let reason = 'gate_failed';
if (errorMsg.includes('Invalid JSON Schema')) {
    reason = 'invalid_schema';
} else if (errorMsg.includes('timeout') || errorMsg.includes('AbortError')) {
    reason = 'timeout';
} else if (errorMsg.includes('parse') || errorMsg.includes('JSON')) {
    reason = 'parse_error';
}

logger.error({ 
    requestId, 
    query, 
    error: errorMsg,
    reason,
    durationMs
}, 'intent_gate_failed');
```

**File**: `server/src/services/intent/intent-full.service.ts`

Same improvement for full intent service.

---

## Files Changed

### Modified (3 files)

1. **`server/src/llm/openai.provider.ts`**
   - Fixed `zodToJsonSchema` call (line 73-76)
   - Added schema validation guards (lines 78-99)
   - Ensures `additionalProperties: false` for strict mode

2. **`server/src/services/intent/intent-gate.service.ts`**
   - Moved `startTime` to function start for proper scope
   - Added detailed error reason detection
   - Emits `intent_gate_failed` with reason (invalid_schema/timeout/parse_error)

3. **`server/src/services/intent/intent-full.service.ts`**
   - Moved `startTime` to function start for proper scope
   - Added detailed error reason detection
   - Emits `intent_full_failed` with reason

---

## Expected Behavior After Fix

### Test Query: "pizza in ashdod"

**Expected Logs**:
```
[INFO] search_started requestId=req-123 query="pizza in ashdod" mode=async
[INFO] provider_call provider=openai operation=completeJSON success=true
[INFO] intent_gate_completed route=CORE confidence=0.92 hasFood=true hasLocation=true
[INFO] provider_call provider=google_places operation=textsearch
[INFO] search_core_completed coreMs=1200 resultCount=10
```

**No Errors**:
- ✅ No 400 schema errors
- ✅ No "type: None" errors
- ✅ Gate completes successfully

### If Schema Error Occurs (Defensive)

```
[ERROR] intent_gate_failed requestId=req-123 reason=invalid_schema durationMs=50
[INFO] intent_gate_completed route=FULL_LLM confidence=0 routeReason=invalid_schema
```

The system will:
1. Log the error with clear reason
2. Fallback to FULL_LLM (safe default)
3. Continue processing (no crash)

---

## Why This Happened

The `zod-to-json-schema` library API changed or we misunderstood the signature:

```typescript
// Library signature:
function zodToJsonSchema(
  schema: ZodSchema,
  options?: {
    name?: string,
    target?: 'jsonSchema7' | 'openApi3',
    $refStrategy?: 'root' | 'relative' | 'none',
    // ... other options
  }
): JSONSchema
```

We were passing:
```typescript
zodToJsonSchema(schema, "response")  // WRONG: string instead of options
```

This caused the library to misinterpret the parameters and generate invalid JSON Schema.

---

## Verification Steps

### 1. Build
```bash
cd server && npm run build
# Expected: Success, no errors
```

### 2. Test Gate Call
```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "pizza in ashdod", "mode": "async"}'
```

### 3. Check Logs
```bash
# Should see gate success
grep "intent_gate_completed" logs/server.log | tail -1

# Should NOT see 400 errors
grep "400" logs/server.log | grep "schema"
```

---

## Additional Safeguards

### Schema Validation
- ✅ Checks schema is not null
- ✅ Checks schema is an object
- ✅ Checks root type is "object"
- ✅ Sets `additionalProperties: false`

### Error Handling
- ✅ Categorizes errors (invalid_schema/timeout/parse_error)
- ✅ Logs with requestId for tracing
- ✅ Fallback to FULL_LLM (safe default)
- ✅ Never crashes the search flow

### Logging
- ✅ Clear event names (intent_gate_failed)
- ✅ Structured reason field
- ✅ Duration tracking
- ✅ RequestId correlation

---

## References

- zod-to-json-schema docs: https://github.com/StefanTerdell/zod-to-json-schema
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- JSON Schema spec: https://json-schema.org/

---

**Fixed by**: AI Assistant  
**Date**: 2026-01-13  
**Status**: Production Ready ✅
