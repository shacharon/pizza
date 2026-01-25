# Pre-Deployment Checklist

## ✅ Code Changes Complete

- [x] Updated `server/src/app.ts` with explicit CORS headers
- [x] Added `allowedHeaders`: Content-Type, Authorization, X-Session-Id
- [x] Added `methods`: GET, POST, PUT, DELETE, OPTIONS
- [x] Added OPTIONS preflight support (204 response)
- [x] Updated `server/.env` with FRONTEND_ORIGINS (for local testing)
- [x] No linter errors

## ✅ Documentation Created

- [x] `CORS_FIX_DEPLOYMENT.md` - Comprehensive deployment guide
- [x] `CORS_FIX_SUMMARY.md` - Quick reference summary
- [x] `PRODUCTION_ENV_CORS.txt` - Environment variable template
- [x] `verify-cors.sh` - Automated verification script
- [x] `test-cors.html` - Browser-based test page

## ⏳ Pre-Deployment Tasks

### 1. Local Testing (Optional)

```bash
# Start local server with FRONTEND_ORIGINS
cd server
npm install
npm run dev

# In another terminal, run verification
chmod +x verify-cors.sh
./verify-cors.sh http://localhost:3000
```

Expected: All tests should pass locally.

### 2. Code Review

- [ ] Review changes in `server/src/app.ts`
- [ ] Confirm CORS configuration is correct
- [ ] Verify no changes to WebSocket logic
- [ ] Verify no changes to JWT logic

### 3. Security Review

- [ ] Confirm FRONTEND_ORIGINS contains only authorized domains
- [ ] Verify no wildcard (*) in production origins
- [ ] Confirm HTTPS required for production domains
- [ ] Verify credentials: true is appropriate

## 🚀 Deployment Tasks

### 1. Update ECS Environment Variables

**CRITICAL - Do this first!**

```bash
FRONTEND_ORIGINS=https://www.going2eat.food,https://app.going2eat.food
```

Methods:
- [ ] AWS Console: ECS → Task Definitions → Create new revision
- [ ] AWS CLI: Update task definition JSON
- [ ] Terraform: Update infrastructure code

**Verification:**
```bash
# Check environment variable is set
aws ecs describe-task-definition \
  --task-definition YOUR_TASK \
  --query 'taskDefinition.containerDefinitions[0].environment'
```

Look for:
```json
{
  "name": "FRONTEND_ORIGINS",
  "value": "https://www.going2eat.food,https://app.going2eat.food"
}
```

### 2. Build and Deploy Code

```bash
cd server
npm install
npm run build

# Verify build succeeded
ls dist/server/src/app.js  # Should exist
```

Deploy to ECS:
- [ ] Push code to repository
- [ ] Trigger CI/CD pipeline, OR
- [ ] Build Docker image, OR
- [ ] Manually update ECS service

**Verification:**
```bash
# Check deployment status
aws ecs describe-services \
  --cluster YOUR_CLUSTER \
  --services YOUR_SERVICE \
  --query 'services[0].deployments'
```

Look for:
- Primary deployment with desired count
- Running count matches desired count
- No errors in deployment

### 3. Wait for Deployment to Complete

- [ ] Monitor ECS service until deployment is complete
- [ ] Check CloudWatch logs for startup
- [ ] Look for log message: "CORS: Initialized" with originsCount: 2

**Expected Log:**
```json
{
  "msg": "CORS: Initialized",
  "env": "production",
  "originsCount": 2,
  "originsSummary": "https://www.going2eat.food, https://app.going2eat.food",
  "credentialsEnabled": true
}
```

## ✅ Post-Deployment Verification

### 1. Quick Smoke Test (Browser Console)

Open https://www.going2eat.food or https://app.going2eat.food in browser.

**Test 1: From www.going2eat.food**
```javascript
fetch('https://your-api-domain.com/api/v1/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
  credentials: 'include'
})
.then(r => r.json())
.then(data => console.log('✅ Success:', data))
.catch(err => console.error('❌ Error:', err));
```

Expected:
- [ ] HTTP 200 OK response
- [ ] Response contains `token` and `sessionId`
- [ ] No CORS errors in console

**Test 2: From app.going2eat.food**

Repeat the same test from https://app.going2eat.food

Expected:
- [ ] HTTP 200 OK response
- [ ] Response contains `token` and `sessionId`
- [ ] No CORS errors in console

### 2. Network Tab Verification

Open DevTools → Network tab, then make the request.

Check Response Headers:
- [ ] `Access-Control-Allow-Origin: https://www.going2eat.food` (or app.going2eat.food)
- [ ] `Access-Control-Allow-Credentials: true`
- [ ] `Access-Control-Allow-Headers: Content-Type, Authorization, X-Session-Id`
- [ ] `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`

### 3. OPTIONS Preflight Test

```bash
curl -X OPTIONS https://your-api-domain.com/api/v1/auth/token \
  -H "Origin: https://www.going2eat.food" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -i
```

Expected:
- [ ] HTTP 204 No Content
- [ ] `Access-Control-Allow-Origin: https://www.going2eat.food`
- [ ] `Access-Control-Allow-Methods` includes POST
- [ ] `Access-Control-Allow-Headers` includes Content-Type

### 4. Unauthorized Origin Test (Should Fail)

```javascript
// Test from a different domain (e.g., GitHub Pages, CodePen, etc.)
fetch('https://your-api-domain.com/api/v1/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
  credentials: 'include'
})
.then(r => r.json())
.catch(err => console.log('✅ Expected CORS error:', err));
```

Expected:
- [ ] CORS error in console
- [ ] Request blocked by browser

### 5. Automated Verification Script

```bash
cd server
./verify-cors.sh https://your-api-domain.com
```

Expected:
- [ ] All tests pass (15/15)
- [ ] No failures

### 6. Check Logs

```bash
# Check for CORS validation logs
aws logs tail /aws/ecs/YOUR_LOG_GROUP --follow | grep -i cors

# Check for auth token generation
aws logs tail /aws/ecs/YOUR_LOG_GROUP --follow | grep "JWT token generated"
```

Expected:
- [ ] See "Origin validation: Allowed" for www.going2eat.food
- [ ] See "Origin validation: Allowed" for app.going2eat.food
- [ ] See "JWT token generated" for successful auth requests

## 📊 Monitoring (First 24 Hours)

### Metrics to Watch

1. **Auth Token Endpoint**
   - [ ] Request rate stable or increased (expected)
   - [ ] Error rate < 1%
   - [ ] No spike in 403/CORS errors

2. **CORS Rejections**
   - [ ] Monitor logs for "Origin validation: Rejected"
   - [ ] Investigate any rejections from expected origins
   - [ ] Confirm rejections are from unauthorized origins only

3. **User Reports**
   - [ ] No user complaints about login issues
   - [ ] No frontend errors related to auth
   - [ ] App functions normally

### Alert Thresholds

- **Critical**: Error rate > 5% for 5 minutes
- **Warning**: Unexpected origin rejections > 10/hour
- **Info**: New origins attempting access

## 🔄 Rollback Criteria

Rollback if ANY of these occur:

- [ ] Auth token endpoint error rate > 10%
- [ ] Users unable to login from www.going2eat.food or app.going2eat.food
- [ ] Widespread CORS errors reported
- [ ] Production app is down or unusable

**Rollback Command:**
```bash
aws ecs update-service \
  --cluster YOUR_CLUSTER \
  --service YOUR_SERVICE \
  --task-definition YOUR_TASK:PREVIOUS_REVISION
```

## ✅ Success Criteria

Consider deployment successful when:

- [ ] All post-deployment verification tests pass
- [ ] No CORS errors from authorized origins
- [ ] Auth token endpoint responding normally
- [ ] No increase in error rate
- [ ] Users can access app from both domains
- [ ] Monitoring shows normal patterns for 24 hours

## 📝 Post-Deployment Checklist

After 24 hours of stable operation:

- [ ] Update runbook with new CORS configuration
- [ ] Document FRONTEND_ORIGINS in infrastructure docs
- [ ] Close deployment ticket
- [ ] Notify team of successful deployment
- [ ] Archive deployment artifacts

## 📞 Contacts

- **On-Call Engineer**: [Your contact]
- **DevOps Lead**: [Your contact]
- **Security Team**: [Your contact]

## 📚 References

- Full Guide: `CORS_FIX_DEPLOYMENT.md`
- Quick Summary: `CORS_FIX_SUMMARY.md`
- Env Template: `PRODUCTION_ENV_CORS.txt`
- Test Script: `verify-cors.sh`
- Browser Test: `test-cors.html`

---

**Deployment Date**: ________________
**Deployed By**: ________________
**Task Definition Revision**: ________________
**Status**: ☐ Pending ☐ In Progress ☐ Complete ☐ Rolled Back
