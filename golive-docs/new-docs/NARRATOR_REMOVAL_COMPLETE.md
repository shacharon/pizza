# Narrator Removal - Complete Implementation

**Date:** 2026-01-28  
**Status:** ✅ COMPLETE

## Summary

Successfully removed the "Narrator" layer and made Assistant 100% LLM-first-and-only for all assistant messages (GATE_FAIL, CLARIFY, RESULT/SUMMARY, SEARCH_FAILED). The system now has no deterministic policy logic besides strict JSON parsing and a single generic fallback when LLM fails.

---

## A) DELETED NARRATOR LAYER ✅

### Files Deleted
1. **`server/src/config/narrator.flags.ts`** - Removed narrator feature flags
2. **`server/src/config/assistant.flags.ts`** - Removed old assistant mode flags

### Files Modified
1. **`server/src/server.ts`**
   - Removed imports of `logNarratorFlags` and `logAssistantMode`
   - Added log: `ASSISTANT_MODE = ENABLED (always on, LLM-first)`
   - Verified: `shutdown()` function only runs on SIGTERM/SIGINT (forced shutdown bug already fixed)

2. **`server/src/services/search/route2/assistant/assistant-integration.ts`**
   - Removed `ASSISTANT_MODE_ENABLED` feature flag checks
   - Assistant now always enabled (no opt-in required)
   - Simplified control flow: direct LLM call → fallback on error

3. **`server/src/controllers/search/search.async-execution.ts`**
   - Removed `ASSISTANT_MODE` checks
   - Removed old progress narration hooks (`publishAssistantProgress`)
   - Note: Old progress system remains in `assistant-ws.publisher.ts` but is disabled by default

4. **`server/src/infra/websocket/assistant-ws.publisher.ts`**
   - Replaced import of deleted `assistant.flags.ts` with inline constant
   - Legacy progress narration remains disabled (`ASSISTANT_MODE = 'OFF'`)

---

## B) ASSISTANT FLOW (LLM ONLY) ✅

### Core Implementation
**File:** `server/src/services/search/route2/assistant/assistant-llm.service.ts`

#### System Prompt Updated
- **Before:** Prescriptive rules like "CLARIFY must set blocksSearch=true"
- **After:** LLM decides everything based on context
  ```typescript
  Rules:
  - Be friendly, concise (1-2 sentences max), helpful
  - Output English only
  - YOU decide blocksSearch and suggestedAction based on context
  - NO HARD RULES - use your judgment to help the user
  ```

#### User Prompts Simplified
- **GATE_FAIL:** "Generate friendly message. Help user understand and guide them. Decide blocksSearch and suggestedAction."
- **CLARIFY:** "Ask a question to get the missing info. Decide blocksSearch and suggestedAction."
- **SEARCH_FAILED:** "Tell user search failed. Decide what to suggest and whether to block. Be helpful and honest."
- **SUMMARY:** "Summarize results briefly (1-2 sentences). Decide blocksSearch and suggestedAction."

#### Fallback Strategy
When LLM fails (timeout, provider error, invalid schema):
- **One generic fallback per type** (4 total)
- **No reason-based branching** (no policy tables)
- **No truncation rules** (LLM decides length)
- **No enforcement logic** (e.g., "NO_FOOD must block search")

### Integration Points
All hook points now follow same pattern:
1. Build minimal context (type, reason, query, language, etc.)
2. Call `generateAssistantMessage()` with strict schema
3. On failure → use generic fallback (max 2 sentences)
4. Publish to WS channel "assistant" for that requestId

**Files Using Assistant:**
- `orchestrator.guards.ts` - GATE_FAIL, CLARIFY (missing food/location)
- `orchestrator.nearme.ts` - CLARIFY (missing location for near-me)
- `orchestrator.response.ts` - SUMMARY (results received)
- `orchestrator.error.ts` - SEARCH_FAILED (pipeline errors)

---

## C) FORCED SHUTDOWN BUG ✅

### Status: Already Fixed ✅
The "Forced shutdown after timeout" bug was already resolved in the current codebase.

### Root Cause (Historical)
Unhandled promise rejections during normal HTTP requests triggered `unhandledRejection` handler, which called `shutdown()` and killed the entire server.

### Fix (Already Applied)
**File:** `server/src/server.ts` (lines 109-134)

- ❌ Removed: `shutdown()` calls from error handlers
- ❌ Removed: `isShuttingDown` flag (no longer needed)
- ✅ Changed: Error handlers now LOG but DON'T kill process
- ✅ Preserved: Graceful shutdown for SIGTERM/SIGINT signals

### Verification
- LLM timeout → logs error → returns fallback → server stays up ✅
- Request errors → fail gracefully → other requests unaffected ✅
- SIGTERM/SIGINT → graceful shutdown → process exits cleanly ✅

---

## D) RENAMED SYMBOLS ✅

### Function Renames
- `toNarratorLanguage()` → `toAssistantLanguage()` (still returns 'en' always)

### Comment Updates
- "narrator summary" → "assistant summary"
- "narrator message" → "assistant message"
- "failure narrator message" → "failure assistant message"

### Files Updated
- `orchestrator.helpers.ts` - function rename + comment
- `orchestrator.response.ts` - import + call + comment
- `orchestrator.guards.ts` - import + calls (3 places)
- `orchestrator.nearme.ts` - import + call
- `orchestrator.error.ts` - comment only

---

## E) REGRESSION TEST ✅

### New Test File
**`server/tests/assistant-llm-timeout-no-shutdown.test.ts`**

#### Test Coverage
1. **LLM Timeout Fallback** - Verifies fallback message returned on timeout
2. **No Process Exit** - Mocks `process.exit()` and verifies it's never called
3. **All Types Have Fallback** - Tests GATE_FAIL, CLARIFY, SEARCH_FAILED, SUMMARY

#### Test Results
```
✅ LLM Timeout Fallback: PASS
✅ No Process Exit: PASS
✅ All Types Fallback: PASS

Overall: ✓ ALL TESTS PASSED

✅ VERIFIED: Assistant LLM timeouts handled gracefully without server shutdown
```

#### Run Command
```bash
cd server && npx tsx tests/assistant-llm-timeout-no-shutdown.test.ts
```

---

## F) VERIFICATION CHECKLIST ✅

### Code Quality
- [x] No linter errors in modified files
- [x] All imports resolved correctly
- [x] Deleted files removed from all imports
- [x] Feature flags removed/simplified
- [x] Comments updated to reflect changes

### Functionality
- [x] Assistant always enabled (no feature flag)
- [x] LLM generates all messages (no policy tables)
- [x] Generic fallback on LLM failure (no branching)
- [x] Server stays up on LLM timeout (no process.exit)
- [x] All 4 assistant types tested (GATE_FAIL, CLARIFY, SUMMARY, SEARCH_FAILED)

### Testing
- [x] Regression test created
- [x] All regression tests pass
- [x] No unit test failures related to changes

---

## G) FILES CHANGED SUMMARY

### Deleted (2)
- `server/src/config/narrator.flags.ts`
- `server/src/config/assistant.flags.ts`

### Modified (9)
1. `server/src/server.ts` - Removed feature flag imports, simplified startup
2. `server/src/services/search/route2/assistant/assistant-integration.ts` - Removed feature flag checks
3. `server/src/services/search/route2/assistant/assistant-llm.service.ts` - Made prompts LLM-first
4. `server/src/services/search/route2/orchestrator.guards.ts` - Fixed broken code, renamed functions
5. `server/src/services/search/route2/orchestrator.helpers.ts` - Renamed function
6. `server/src/services/search/route2/orchestrator.response.ts` - Renamed function calls, updated comments
7. `server/src/services/search/route2/orchestrator.nearme.ts` - Renamed function call
8. `server/src/services/search/route2/orchestrator.error.ts` - Updated comment
9. `server/src/controllers/search/search.async-execution.ts` - Removed feature flag checks
10. `server/src/infra/websocket/assistant-ws.publisher.ts` - Inlined disabled flag

### Created (2)
1. `server/tests/assistant-llm-timeout-no-shutdown.test.ts` - Regression test
2. `NARRATOR_REMOVAL_COMPLETE.md` - This document

---

## H) ARCHITECTURE SUMMARY

### Before (Narrator System)
```
Query → Gate/Intent → Narrator Logic (policy tables) → Message
                         ↓
        Deterministic rules: "NO_FOOD → ASK_FOOD"
        Truncation rules: max 240 chars
        Enforcement: "CLARIFY must block search"
```

### After (LLM-First Assistant)
```
Query → Gate/Intent → LLM (strict JSON schema) → Message
                         ↓
        LLM decides: message, question, action, blocksSearch
        Fallback: Generic message (on LLM failure only)
        No rules: LLM uses judgment
```

### Key Differences
| Aspect | Before (Narrator) | After (Assistant) |
|--------|------------------|------------------|
| **Message Generation** | Policy tables + rules | LLM-only |
| **Feature Flag** | `ASSISTANT_MODE_ENABLED` | Always enabled |
| **Fallback Logic** | Reason-based branching | Single generic per type |
| **Message Rules** | Truncate to 240 chars | LLM decides |
| **Search Blocking** | Hard-coded per reason | LLM decides |
| **Question Logic** | "CLARIFY must ask" | LLM decides when to ask |

---

## I) MANUAL VERIFICATION GUIDE

### Test 1: Gate Fail (Not Food Related)
```bash
# Query: "what is the weather"
# Expected: Assistant message via LLM, server stays up
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "what is the weather"}'
```

**Expected Result:**
- Status: 200 OK
- `assist.type`: "guide"
- `assist.message`: LLM-generated message (e.g., "This doesn't look like a food search...")
- Server: Still running (no crash)

### Test 2: Force LLM Timeout (Mock)
```typescript
// In assistant-llm.service.ts, temporarily change timeout to 1ms
llmOpts.timeout = 1; // Force timeout
```

**Expected Result:**
- Fallback message used
- No server shutdown
- Error logged: "assistant_llm_failed"

### Test 3: CLARIFY Flow
```bash
# Query: "pizza" (missing location)
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "pizza"}'
```

**Expected Result:**
- Status: 200 OK
- `assist.type`: "clarify"
- `assist.message`: LLM-generated clarification question

---

## J) DELIVERABLES ✅

1. ✅ **Code Changes** - All narrator files deleted, assistant simplified
2. ✅ **Bug Fix** - Forced shutdown already fixed (verified)
3. ✅ **Regression Test** - Created and passing
4. ✅ **Documentation** - This summary document
5. ✅ **Verification** - Tests pass, linter clean

---

## K) NEXT STEPS (Optional)

### If Needed
1. **Monitor Production** - Watch for LLM fallback rates
2. **Tune Prompts** - Adjust system/user prompts based on real usage
3. **Add Metrics** - Track LLM success/failure rates per type
4. **Performance** - Consider caching common fallback scenarios

### Not Needed
- ❌ No rollback plan required (changes are improvements)
- ❌ No migration needed (feature flags removed, always enabled)
- ❌ No backward compatibility concerns (internal changes only)

---

## L) COMMIT MESSAGE

```
feat: Remove Narrator layer, make Assistant LLM-first-and-only

BREAKING CHANGE: Removed narrator.flags.ts and assistant.flags.ts
- Assistant mode is now always enabled (no feature flag)
- All assistant messages generated via LLM (no policy tables)
- Minimal fallback only when LLM fails (no branching logic)

Changes:
- Delete narrator.flags.ts and assistant.flags.ts
- Remove ASSISTANT_MODE_ENABLED checks (always on)
- Simplify LLM prompts: let LLM decide everything
- Rename toNarratorLanguage → toAssistantLanguage
- Verify forced shutdown bug already fixed
- Add regression test: assistant-llm-timeout-no-shutdown

Test: All tests pass, no linter errors
Verify: Server stays up on LLM timeout, fallback works
```

---

## M) CONCLUSION

The Narrator layer has been **completely removed**. The assistant system is now:

1. **LLM-First** - All messages generated by LLM, no deterministic logic
2. **Resilient** - Graceful fallback on LLM failure, no server crashes
3. **Simple** - One entrypoint (`generateAndPublishAssistant`), clean architecture
4. **Tested** - Regression test verifies no shutdown on LLM timeout

**Status:** ✅ COMPLETE AND VERIFIED
