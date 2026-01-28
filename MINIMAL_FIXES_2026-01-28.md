# Minimal Fixes Summary - 2026-01-28

## A) Narrator Policy Compliance (NO_FOOD)

### Issue
- For `type=GATE_FAIL` with `reason=NO_FOOD`, the narrator must:
  - Set `suggestedAction = "ASK_FOOD"` (never ASK_LOCATION)
  - Always include exactly 1 question (hasQuestion=true, i.e., question !== null)
  - Max 2 short sentences in message (240 chars)

### Changes Made

#### 1. **narrator.prompt.ts** (lines 35-43)
- Updated the GATE_FAIL prompt to explicitly request a question when reason=NO_FOOD
- Added explicit instruction: "Include exactly 1 question to guide user. Set suggestedAction=ASK_FOOD."
- Clarified message requirement: "max 2 sentences"

#### 2. **narrator.types.ts** (lines 146-159)
- Updated `getFallbackMessage()` to return a non-null question for NO_FOOD cases
- NO_FOOD: `question = fallback[lang]` (uses message as question)
- UNCERTAIN_FOOD: `question = null` (no change)
- Both still correctly set `suggestedAction: 'ASK_FOOD'`

#### 3. **assistant-narrator.ts** (lines 110-117)
- Changed validation logic to allow questions for GATE_FAIL types
- Old: Removed questions for all non-CLARIFY types
- New: Only removes questions for SUMMARY types
- GATE_FAIL and CLARIFY can now have questions

#### 4. **assistant-narrator.ts** (lines 192-195)
- Updated `validateNarratorOutput()` constraint enforcement
- Old: `if (corrected.type !== 'CLARIFY') { corrected.question = null; }`
- New: `if (corrected.type === 'SUMMARY') { corrected.question = null; }`

#### 5. **narrator.test.ts** (lines 117-140)
- Updated existing test to expect question !== null for NO_FOOD
- **Added new test**: "should enforce NO_FOOD policy: ASK_FOOD + hasQuestion=true"
  - Asserts `suggestedAction === 'ASK_FOOD'`
  - Asserts `question !== null` and non-empty
  - Asserts `blocksSearch === true`
  - Asserts `message.length <= 240`

#### 6. **narrator.test.ts** (lines 264-276, 350-362)
- Updated 2 existing tests that expected GATE_FAIL to never have questions
- Changed to reflect new policy: GATE_FAIL can have questions (for NO_FOOD onboarding)

### Test Results
✅ All 35 narrator unit tests pass
- New test confirms: NO_FOOD → ASK_FOOD + question !== null

---

## B) RedisJobStore Init Singleton

### Issue
- Ensure JobStore/RedisJobStore initialization happens **once per process**, not per request
- Keep existing public interfaces unchanged
- Add clarity/logging to prove init is cached

### Changes Made

#### 1. **job-store/index.ts** (line 13)
- Added comment clarifying singleton behavior:
  ```typescript
  // Singleton instance - initialized once per process, reused across all requests
  let searchJobStoreInstance: ISearchJobStore | null = null;
  ```

#### 2. **job-store/index.ts** (lines 15-24)
- Enhanced JSDoc comment to explicitly state singleton behavior:
  - "IMPORTANT: This is a singleton - the store is initialized ONCE per process"
  - "Subsequent calls return the cached instance immediately"
- Added debug log when returning cached instance:
  ```typescript
  logger.debug({
    store: searchJobStoreInstance instanceof InMemorySearchJobStore ? 'inmemory' : 'redis',
    msg: '[JobStore] Returning cached singleton instance'
  });
  ```

#### 3. **job-store/index.ts** (lines 77-79)
- Enhanced comment for `cachedStorePromise` mechanism:
  - "Ensures only ONE initialization Promise is created, even with concurrent calls"
- Added info log when creating initialization promise:
  ```typescript
  logger.info({ msg: '[JobStore] Creating singleton initialization promise' });
  ```

### Verification
- Singleton pattern was already correctly implemented via:
  1. Module-level `searchJobStoreInstance` variable (initialized once)
  2. Early return check: `if (searchJobStoreInstance) return searchJobStoreInstance;`
  3. Promise caching via `cachedStorePromise` to prevent race conditions
- **Changes made**: Added comments and logs to make singleton behavior explicit and verifiable
- No functional changes to public interfaces
- Redis client sharing already handled by `getRedisClient()` in `redis-client.ts`

---

## Files Changed

### Narrator Policy (A)
1. `server/src/services/search/route2/narrator/narrator.prompt.ts`
2. `server/src/services/search/route2/narrator/narrator.types.ts`
3. `server/src/services/search/route2/narrator/assistant-narrator.ts`
4. `server/src/services/search/route2/narrator/narrator.test.ts`

### RedisJobStore Singleton (B)
5. `server/src/services/search/job-store/index.ts`

---

## Brief Notes

### A) Narrator NO_FOOD Policy
- **What**: NO_FOOD gate failures now include a question to guide users
- **Why**: Improve UX by making onboarding more interactive and directive
- **How**: Modified prompt, fallback, validation logic, and added test
- **Impact**: Assistant will now ask "What type of food are you looking for?" instead of just stating the query wasn't food-related

### B) JobStore Singleton
- **What**: Clarified that JobStore initializes once per process
- **Why**: Prevent redundant Redis connections and ensure consistent state
- **How**: Added explicit comments and debug logs
- **Impact**: No functional change; singleton was already working correctly. Now it's documented and logged for verification.

---

## Testing
- ✅ All narrator tests pass (35/35)
- ✅ No linter errors in any modified files
- ✅ New test explicitly validates NO_FOOD policy compliance
- ✅ JobStore singleton behavior verified via code review and added logging
