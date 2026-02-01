# Language Propagation Regression Test

## Purpose

Validates language propagation fixes for Route2 pipeline by running 3 fixed queries and asserting from logs + result JSON.

## Test Cases

1. **Arabic CLARIFY** - `"🇸🇦 مطعم قريب مني"` (no userLocation)
   - Assert: `status=DONE_STOPPED`, `assistantType=CLARIFY`, `language=ar`

2. **Hebrew GATE_FAIL** - `"'יwhat is the wehaerjer usfiond"` (not food)
   - Assert: `status=DONE_STOPPED`, `assistantType=GATE_FAIL`, `language=he`, no `abort_timeout`

3. **Short Arabic Snapshot** - `"ب مني 🇸🇦"`
   - Snapshot only (no assertions): records `gate2.foodSignal`, `gate2.language`, `assistant.type`, `assistant.language`

## Prerequisites

1. **Server running** on `http://localhost:3000` (or set `SERVER_URL` env var)
2. **Log file** at `server/logs/server.log` (default location)

## Run

```bash
cd server
npm run test:lang-propagation
```

Or directly with tsx:

```bash
tsx server/test-language-propagation.ts
```

## Output

The test will:
1. Run 3 queries sequentially
2. Poll for results (max 15s per query)
3. Parse logs to extract:
   - `gate2_lang_snapshot` → Gate2 language
   - `assistant_publish_lang_snapshot` → Assistant enforced language
   - `abort_timeout` errors
4. Print summary table with pass/fail status
5. Exit with code `0` only if tests 1 and 2 pass

### Example Output

```
====================================================================================================================
LANGUAGE PROPAGATION REGRESSION TEST SUMMARY
====================================================================================================================
| Test | Name                           | Status         | AssistantType  | Language  | Result |
|--------------------------------------------------------------------------------------------------------------------|
|   1  | Arabic - NEARBY without location| DONE_STOPPED   | CLARIFY        | ar        | ✓ PASS |
|   2  | Hebrew - Not food related       | DONE_STOPPED   | GATE_FAIL      | he        | ✓ PASS |
|   3  | Short Arabic - Snapshot         | DONE_STOPPED   | GATE_FAIL      | ar        | SNAPSHOT|
|      └─ Gate2: foodSignal=MAYBE language=ar                                                                       |
|--------------------------------------------------------------------------------------------------------------------|
| RESULT: 2/2 tests passed                                                                                          |
====================================================================================================================
✓ All assertion tests PASSED
```

## What It Validates

### Test 1: Arabic CLARIFY
- ✅ Gate2 detects Arabic (`gate2_lang_snapshot.gateAssistantLanguage=ar`)
- ✅ Intent stage receives Arabic from Gate2 (`intent_clarify_payload_from_intent.assistantLanguage=ar`)
- ✅ Assistant publishes with enforced Arabic (`assistant_publish_lang_snapshot.enforcedLanguage=ar`)
- ✅ CLARIFY message in WebSocket has `language=ar`

### Test 2: Hebrew GATE_FAIL + Timeout Fix
- ✅ Gate2 detects Hebrew (`gate2_lang_snapshot.gateAssistantLanguage=he`)
- ✅ Assistant timeout increased to 4000ms prevents `abort_timeout`
- ✅ GATE_FAIL message in WebSocket has `language=he`

### Test 3: Short Arabic (Snapshot)
- Records Gate2 decision (foodSignal, language) for manual review
- Does not fail test - used to verify edge case behavior

## Exit Codes

- `0` - All assertion tests (1, 2) passed
- `1` - One or more assertion tests failed OR test runner error

## Debugging Failed Tests

If tests fail, check:

1. **Server logs** (`server/logs/server.log`) for:
   - `gate2_lang_snapshot` - Did Gate2 detect correct language?
   - `assistant_publish_lang_snapshot` - Was correct language enforced at publish time?
   - `abort_timeout` - Did assistant LLM timeout?

2. **Result JSON** via API:
   ```bash
   curl http://localhost:3000/api/v1/result/{requestId} \
     -H "x-session-id: test-session-123"
   ```

3. **Language propagation chain**:
   ```
   Gate2 → langCtx → Intent → Assistant Publisher → WebSocket
   ```

## Related Files

- `server/src/services/search/route2/route2.orchestrator.ts` - langCtx initialization
- `server/src/services/search/route2/assistant/assistant-publisher.ts` - Language enforcement
- `server/src/lib/llm/llm-config.ts` - Assistant timeout configuration
- `LANGUAGE_PROPAGATION_FIX.md` - Full technical details
