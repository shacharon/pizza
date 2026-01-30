# P0 Scale Readiness — Quick Verification Commands

## Local Verification (Pre-Deploy)

### 1. Build Verification
```bash
cd llm-angular
npm run build:prod
```
**Expected**: 
- Build succeeds
- Initial bundle < 600 kB
- Output shows chunk-*.js files (automatic code splitting)

### 2. Check Bundle Sizes
```bash
# PowerShell
cd llm-angular/dist/llm-angular
Get-ChildItem -Recurse -Filter "*.js" | Select-Object Name, @{Name="Size(KB)";Expression={[math]::Round($_.Length/1KB,2)}}

# Bash
ls -lh llm-angular/dist/llm-angular/browser/*.js
```
**Expected**:
- main-*.js: ~80-100 kB
- chunk-*.js (vendor): ~150-180 kB
- polyfills-*.js: ~35 kB

---

## Post-Deploy Verification (AWS Amplify)

### 3. CDN Cache Headers (Critical)
```bash
# Test index.html (should NOT cache)
curl -I https://app.going2eat.food/index.html | findstr "Cache-Control"
# Expected: Cache-Control: no-cache, no-store, must-revalidate

# Test JS bundle (should cache 1 year)
curl -I https://app.going2eat.food/main-ABC123.js | findstr "Cache-Control"
# Expected: Cache-Control: public, max-age=31536000, immutable

# Test CSS bundle (should cache 1 year)
curl -I https://app.going2eat.food/styles-ABC123.css | findstr "Cache-Control"
# Expected: Cache-Control: public, max-age=31536000, immutable
```

### 4. Security Headers
```bash
curl -I https://app.going2eat.food/index.html | findstr "X-Frame-Options X-Content-Type"
# Expected:
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
```

### 5. WebSocket Backpressure Test
Open browser DevTools Console:
```javascript
// Connect to app and trigger WS connection
// Then simulate message burst (use test endpoint or mock)
const ws = /* get WS connection from app */;

// Monitor memory before
console.memory.usedJSHeapSize;

// Simulate 2000 messages (replace with actual test endpoint call)
for (let i = 0; i < 2000; i++) {
  // trigger message event
}

// Monitor memory after (should be stable, not growing)
console.memory.usedJSHeapSize;

// Check UI is still responsive
```
**Expected**: 
- Memory growth < 10 MB
- UI remains responsive
- Last message processed correctly

### 6. Polling Overlap Test
Manual test in browser:
1. Open DevTools → Network tab
2. Search "pizza"
3. Wait 2 seconds (polling should start)
4. Search "burger" (new search, should abort old poll)
5. Check Network tab
   
**Expected**:
- Only 1 active polling request at a time
- Previous "pizza" poll requests stop when "burger" search starts
- Filter by `/result` endpoint to see polling requests

---

## Automated Tests

### 7. Load Test (Optional)
```bash
# Install Apache Bench
# Test homepage
ab -n 100 -c 10 https://app.going2eat.food/

# Expected:
# - 0 failed requests
# - Average response time < 500ms (with CDN caching)
```

### 8. Lighthouse Score
```bash
# Chrome DevTools → Lighthouse
# Run audit for "Performance"
```
**Expected**:
- Performance score > 90
- First Contentful Paint < 1.5s
- Largest Contentful Paint < 2.5s

---

## CloudFront Metrics (AWS Console)

After 24 hours of production traffic:
1. Go to CloudFront → Distributions → Metrics
2. Check "Cache Hit Rate"
   - **Expected**: > 90% (vs ~60% before)
3. Check "Origin Requests"
   - **Expected**: 90% reduction vs. baseline

---

## Rollback Commands (If Issues Found)

```bash
# Revert all changes
git revert <commit-hash>
git push origin main

# Or selectively revert:
# 1. amplify.yml (remove customHeaders section)
# 2. angular.json (remove optimization object)
# 3. ws-client.service.ts (remove throttleTime operator)
# 4. search-api.facade.ts (remove AbortController logic)
```

---

## Success Criteria Summary

| Check | Pass Criteria |
|-------|---------------|
| Build | Succeeds, bundle < 600 kB |
| CDN Headers | JS/CSS cached 1yr, index.html no-cache |
| Security Headers | X-Frame-Options, X-Content-Type-Options present |
| WS Memory | Stable during 2000-message burst |
| Polling Overlap | Only 1 active poll visible in Network tab |
| Lighthouse | Performance score > 90 |
| CloudFront | Cache hit rate > 90% |

All checks should pass before marking as production-ready.
