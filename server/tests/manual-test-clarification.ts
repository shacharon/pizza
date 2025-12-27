/**
 * Manual Test Script for Clarification System
 * Run with: npm run dev (in server directory)
 * Then test with: curl -X POST http://localhost:3000/api/search -H "Content-Type: application/json" -d '{"query":"חניה"}'
 */

console.log(`
🧪 Manual Test Guide for Clarification System
=============================================

Prerequisites:
1. Start server: cd server && npm run dev
2. Server should be running on http://localhost:3000

Test Cases:
-----------

✅ Test 1: Single-token constraint (Hebrew)
curl -X POST http://localhost:3000/api/search \\
  -H "Content-Type: application/json" \\
  -d '{"query":"חניה","sessionId":"test-1"}'

Expected: requiresClarification=true, 2 choices (constraint or name)


✅ Test 2: Single-token constraint (English)
curl -X POST http://localhost:3000/api/search \\
  -H "Content-Type: application/json" \\
  -d '{"query":"parking","sessionId":"test-2"}'

Expected: requiresClarification=true, 2 choices


✅ Test 3: Kosher constraint
curl -X POST http://localhost:3000/api/search \\
  -H "Content-Type: application/json" \\
  -d '{"query":"כשר","sessionId":"test-3"}'

Expected: requiresClarification=true, kosher question


✅ Test 4: Multi-token query (should NOT clarify)
curl -X POST http://localhost:3000/api/search \\
  -H "Content-Type: application/json" \\
  -d '{"query":"pizza with parking","sessionId":"test-4"}'

Expected: requiresClarification=undefined, normal search results


✅ Test 5: Cuisine keyword (should NOT clarify)
curl -X POST http://localhost:3000/api/search \\
  -H "Content-Type: application/json" \\
  -d '{"query":"pizza","sessionId":"test-5"}'

Expected: requiresClarification=undefined, normal search results


✅ Test 6: Invalid city (requires geocoding validation - if API key present)
curl -X POST http://localhost:3000/api/search \\
  -H "Content-Type: application/json" \\
  -d '{"query":"restaurant in InvalidCityXYZ","sessionId":"test-6"}'

Expected: requiresClarification=true (if geocoding enabled)


PowerShell Commands:
-------------------

# Test 1 (Hebrew parking)
Invoke-WebRequest -Uri "http://localhost:3000/api/search" -Method POST -ContentType "application/json" -Body '{"query":"חניה","sessionId":"test-1"}' | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 10

# Test 2 (English parking)
Invoke-WebRequest -Uri "http://localhost:3000/api/search" -Method POST -ContentType "application/json" -Body '{"query":"parking","sessionId":"test-2"}' | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 10

# Test 3 (Kosher)
Invoke-WebRequest -Uri "http://localhost:3000/api/search" -Method POST -ContentType "application/json" -Body '{"query":"kosher","sessionId":"test-3"}' | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 10

# Test 4 (Multi-token - should search)
Invoke-WebRequest -Uri "http://localhost:3000/api/search" -Method POST -ContentType "application/json" -Body '{"query":"pizza with parking","sessionId":"test-4"}' | Select-Object -ExpandProperty Content | ConvertFrom-Json | Select-Object requiresClarification, @{N='resultsCount';E={$_.results.length}}

# Test 5 (Pizza - should search)
Invoke-WebRequest -Uri "http://localhost:3000/api/search" -Method POST -ContentType "application/json" -Body '{"query":"pizza in tel aviv","sessionId":"test-5"}' | Select-Object -ExpandProperty Content | ConvertFrom-Json | Select-Object requiresClarification, @{N='resultsCount';E={$_.results.length}}


Frontend Testing:
----------------

1. Navigate to: http://localhost:4200/search-preview
2. Type single tokens:
   - "חניה" (parking)
   - "parking"
   - "kosher"
   - "vegan"
3. Verify clarification block appears with purple gradient
4. Click a choice button
5. Verify search re-runs with selected constraint

Success Criteria:
----------------
✅ Single constraint tokens trigger clarification
✅ Multi-token queries proceed normally
✅ Cuisine keywords proceed normally
✅ Clarification UI displays correctly
✅ Choice buttons re-run search with correct constraints
✅ City validation works (if API key present)
`);








