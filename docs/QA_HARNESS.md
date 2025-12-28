# QA Harness Documentation

**Phase:** 6 (Milestone F)  
**Status:** Implemented  
**Version:** 1.0.0

---

## Overview

The QA Harness is a repeatable, deterministic testing system for the unified search experience. It validates system behavior against a canonical dataset of queries to detect regressions and ensure stability as the system evolves.

**Key Principle:** QA logic is deterministic and repeatable. Assertions check structural invariants, not LLM creativity or provider-specific data.

---

## Quick Start

### Run QA Harness

```bash
cd server
npm run qa
```

### Watch Mode (Re-run on changes)

```bash
npm run qa:watch
```

### Expected Output

```
🧪 Starting QA Harness...

Phase 6: Regression Detection & Confidence Testing
============================================================

📊 Loaded 41 test queries
📍 Dataset: qa.dataset.json

🤖 LLM initialized (OpenAI)
🔧 Initializing services...
✅ Services initialized

🚀 Starting QA execution...
------------------------------------------------------------

🧪 Running 41 test queries...

✅ pizza_tel_aviv_he                         1234ms
✅ pizza_open_now_he                          987ms
✅ sushi_jerusalem_he                        1056ms
...

💾 Snapshot saved: server/src/services/search/qa/snapshots/qa-2025-12-27T15-30-00.json

============================================================
QA HARNESS SUMMARY
============================================================
Total Queries:    41
Passed:           41 ✅
Failed:           0 ❌
Pass Rate:        100.0%
Execution Time:   45678ms
Avg Time/Query:   1114ms
Timestamp:        2025-12-27T15:30:00.000Z
============================================================

🎉 All tests passed! System behavior is stable.
```

---

## Architecture

### Components

```
qa/
├── qa.types.ts           # TypeScript type definitions
├── qa.dataset.json       # 41 canonical test queries
├── qa.assertions.ts      # Assertion engine (validation rules)
├── qa-runner.ts          # Test executor
├── run-qa.ts            # CLI entry point
└── snapshots/           # JSON snapshots of QA runs
    └── qa-2025-12-27T15-30-00.json
```

### Data Flow

```
Dataset → Runner → Orchestrator → Response → Assertions → Results → Snapshot
```

1. **Dataset** provides test queries
2. **Runner** executes each query through SearchOrchestrator
3. **Orchestrator** processes query (normal search flow)
4. **Assertions** validate response against expectations
5. **Results** captured with pass/fail status
6. **Snapshot** saved as JSON for comparison

---

## Test Dataset

### Coverage (41 queries)

| Category | Count | Description |
|----------|-------|-------------|
| NORMAL | 27 | Strong matches across languages & locations |
| RECOVERY | 7 | NO_RESULTS, overly specific queries |
| CLARIFY | 5 | Ambiguous queries, low confidence |
| EDGE_CASE | 5 | Empty, long, special chars, mixed language |

### Multilingual Distribution

- **Hebrew (he):** 14 queries
- **English (en):** 18 queries
- **Arabic (ar):** 4 queries
- **Russian (ru):** 4 queries
- **Mixed:** 1 query

### Example Entries

```json
{
  "id": "pizza_tel_aviv_he",
  "query": "פיצה בתל אביב",
  "language": "he",
  "category": "NORMAL",
  "expectedMode": "NORMAL",
  "expectedFailureReason": "NONE",
  "notes": "Basic pizza search in Hebrew",
  "assertions": {
    "hasResults": true,
    "minResults": 1,
    "hasChips": true,
    "minChips": 3,
    "hasAssist": true,
    "languageMatch": true,
    "modeMatch": true
  }
}
```

---

## Assertion Rules

### Philosophy

**DO:**
- ✅ Check structural invariants (mode logic, chip presence)
- ✅ Validate contracts (SearchResponse shape, required fields)
- ✅ Verify language correctness (request → intent language match)
- ✅ Test mode computation (NORMAL/RECOVERY/CLARIFY)

**DON'T:**
- ❌ Check exact LLM phrasing or creative content
- ❌ Assert on provider-specific data (Google Places results change)
- ❌ Validate unverified live data (hours, open/closed status)
- ❌ Test aesthetic preferences (UI layout, emoji choices)

### Contract Invariants (Always Checked)

These assertions run for **every** query:

1. **SearchResponse has required fields:**
   - `intent` (object)
   - `meta` (object with failureReason)
   - `assist` (object with message and mode)

2. **Intent is valid:**
   - Has `query` field (string, can be empty)
   - Has `language` field (string)

3. **Chips are valid (if present):**
   - Each chip has `id`, `label`, `action`
   - Action is one of: `filter`, `sort`, `map`

### Entry-Specific Assertions

These are configured per-query in the dataset:

| Assertion | Type | Description |
|-----------|------|-------------|
| `hasResults` | boolean | Response must/must not have results |
| `minResults` | number | Minimum number of results |
| `maxResults` | number | Maximum number of results |
| `hasChips` | boolean | Response must have chips |
| `minChips` | number | Minimum number of chips |
| `maxChips` | number | Maximum number of chips (useful for CLARIFY mode) |
| `hasAssist` | boolean | Response must have assistant payload |
| `requiresLiveData` | boolean | Parsed intent must require live data |
| `languageMatch` | boolean | Intent language must match request language |
| `modeMatch` | boolean | Mode must match expectedMode |

---

## Snapshots

### Format

Snapshots are saved as JSON files in `server/src/services/search/qa/snapshots/`:

```json
{
  "totalQueries": 41,
  "passed": 41,
  "failed": 0,
  "executionTimeMs": 45678,
  "timestamp": "2025-12-27T15:30:00.000Z",
  "results": [
    {
      "entry": { /* QAEntry */ },
      "response": { /* SearchResponse */ },
      "passed": true,
      "failures": [],
      "executionTimeMs": 1234
    }
    // ... more results
  ]
}
```

### Comparing Snapshots

To compare two QA runs:

```bash
# Run QA and note the snapshot file
npm run qa

# Make code changes...

# Run QA again
npm run qa

# Manually compare snapshots
diff snapshots/qa-2025-12-27T15-00-00.json \
     snapshots/qa-2025-12-27T15-30-00.json
```

**What to look for:**
- New failures (tests that were passing now fail)
- Changed pass rates by category
- Significant execution time changes
- Changes in response structure (intent, chips, assist)

---

## Adding New Test Cases

### 1. Add Entry to Dataset

Edit `server/src/services/search/qa/qa.dataset.json`:

```json
{
  "id": "new_test_case",
  "query": "your search query",
  "language": "en",
  "category": "NORMAL",
  "expectedMode": "NORMAL",
  "expectedFailureReason": "NONE",
  "notes": "Description of what this tests",
  "assertions": {
    "hasResults": true,
    "minResults": 1,
    "hasChips": true,
    "hasAssist": true,
    "languageMatch": true,
    "modeMatch": true
  }
}
```

### 2. Run QA

```bash
npm run qa
```

### 3. Review Results

- If test passes: ✅ Great! Commit the new test case.
- If test fails: ❌ Either fix the code or adjust assertions.

### Best Practices

1. **ID naming:** Use descriptive IDs: `{category}_{location}_{language}`
2. **Coverage:** Ensure new features have corresponding test cases
3. **Balance:** Don't add too many similar queries
4. **Edge cases:** Add tests for boundary conditions
5. **Multilingual:** Cover all supported languages

---

## Interpreting Failures

### Example Failure Output

```
❌ pizza_tel_aviv_he                         1234ms
   ⚠️  assertion.minResults: Expected at least 3 results but got 2

...

FAILURES DETAILS:

1. ❌ pizza_tel_aviv_he
   Query: "פיצה בתל אביב"
   Language: he
   Category: NORMAL
   Failures:
     • assertion.minResults
       Message: Expected at least 3 results but got 2
       Expected: 3
       Actual: 2
```

### Common Failure Reasons

| Rule | Meaning | Action |
|------|---------|--------|
| `contract.intent` | SearchResponse missing intent | Fix orchestrator response |
| `contract.assist` | SearchResponse missing assist | Fix orchestrator response |
| `assertion.hasResults` | Expected results but got none | Check provider, geocoding |
| `assertion.minChips` | Not enough chips generated | Check SuggestionService |
| `assertion.languageMatch` | Language mismatch | Check intent detection |
| `assertion.modeMatch` | Wrong mode computed | Check mode logic, failure detection |
| `execution.error` | Query threw exception | Fix bug in orchestrator |

### Debugging Steps

1. **Check snapshot:** Review full response in snapshot JSON
2. **Run single query:** Isolate and test the failing query manually
3. **Check logs:** Enable debug mode for detailed execution logs
4. **Update expectations:** If behavior changed intentionally, update assertions
5. **Fix code:** If regression detected, fix the root cause

---

## Updating Expectations

When system behavior changes **intentionally**, update test expectations:

### Scenario: Chip generation logic changed

**Before:** Recovery mode generated 5 chips  
**After:** Recovery mode now generates 3 chips  

**Action:** Update assertions in dataset:

```json
{
  "id": "no_results_remote_village",
  "assertions": {
    "hasChips": true,
    "minChips": 3  // Changed from 5
  }
}
```

### When to Update vs Fix

| Situation | Action |
|-----------|--------|
| Intentional feature change | Update expectations |
| New behavior is better | Update expectations + document |
| Regression (behavior got worse) | Fix the code |
| Contract violation | Fix the code (never update) |
| Provider data changed | Update expectations if needed |

---

## CI/CD Integration (Future)

The QA harness is designed to be CI/CD-friendly:

### GitHub Actions Example

```yaml
name: QA Harness

on: [push, pull_request]

jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd server && npm install
      - run: cd server && npm run qa
        env:
          GOOGLE_MAPS_API_KEY: ${{ secrets.GOOGLE_MAPS_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Exit Codes

- `0`: All tests passed ✅
- `1`: One or more tests failed ❌

---

## Performance Benchmarks

### Expected Performance

- **Total time:** ~40-60 seconds for 41 queries
- **Avg per query:** ~1000-1500ms
- **Variation:** ±20% is normal (network, provider latency)

### Red Flags

- ⚠️ **Execution time > 90s:** Possible timeout issues
- ⚠️ **Individual query > 5s:** Check slow query, provider lag
- ⚠️ **High failure rate:** Regression likely introduced

---

## Troubleshooting

### QA Harness Won't Start

**Error:** `Dataset not found`

**Solution:** Ensure you're running from the `server` directory:
```bash
cd server
npm run qa
```

### LLM Not Available

**Warning:** `LLM not available - using fallback mode`

**Impact:** QA still runs, but LLM Pass A and Pass B will use fallbacks. Most contract invariants still checked.

**Solution (optional):** Add OpenAI API key to `.env`:
```
OPENAI_API_KEY=sk-...
```

### All Tests Failing

**Possible causes:**
1. Missing API keys (Google Places)
2. Network issues
3. Major regression introduced

**Debug steps:**
1. Check API key configuration
2. Test internet connectivity
3. Review recent code changes
4. Check logs for exceptions

### Snapshots Directory Missing

**Error:** Cannot save snapshot

**Solution:** Directory is auto-created. If permission issues:
```bash
mkdir -p server/src/services/search/qa/snapshots
chmod 755 server/src/services/search/qa/snapshots
```

---

## Phase 0 Compliance

The QA Harness maintains 100% compliance with Phase 0 principles:

| Principle | How QA Maintains It |
|-----------|-------------------|
| Two-Pass LLM Only | QA doesn't add new LLM calls |
| Deterministic Truth | Assertions check deterministic outputs only |
| Assistant as Helper | No assertions on LLM creativity |
| Single Source of Truth | QA validates SearchResponse contract |
| Language Invariants | Language matching is asserted |
| Live Data Policy | No assertions on unverified live data |

---

## Future Enhancements

### Planned (Not in Phase 6)

- [ ] Snapshot diffing tool (automated comparison)
- [ ] Performance regression detection
- [ ] CI/CD integration examples
- [ ] Test coverage metrics
- [ ] Parallel query execution
- [ ] Mock mode (no real API calls)

---

## References

- [Phase 6 Plan](../plans/phase_6_qa_harness.plan.md)
- [Phase 0 System Definition](./PHASE_0_SYSTEM_DEFINITION.md)
- [Backend Architecture](./BACKEND_ARCHITECTURE.md)
- [Definition of Done](./definition-of-done.md)

---

**Document Version:** 1.0.0  
**Last Updated:** December 27, 2025  
**Maintained by:** Development Team





