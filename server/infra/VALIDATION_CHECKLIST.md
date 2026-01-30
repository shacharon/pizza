# ECS Autoscaling Validation Checklist

Post-deployment testing procedures to verify production readiness.

---

## Phase 1: Basic Health ✅

### 1.1 Service Health
```bash
# Check ECS service status
aws ecs describe-services \
  --cluster angular-piza-cluster \
  --services angular-piza-service \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount,Health:healthCheckGracePeriodSeconds}'

# Expected:
# Status: ACTIVE
# Running: 2
# Desired: 2
```

### 1.2 Task Health
```bash
# List running tasks
aws ecs list-tasks \
  --cluster angular-piza-cluster \
  --service-name angular-piza-service

# Describe task health
aws ecs describe-tasks \
  --cluster angular-piza-cluster \
  --tasks <task-arn> \
  --query 'tasks[0].{Health:healthStatus,LastStatus:lastStatus,Connectivity:connectivity}'

# Expected for EACH task:
# Health: HEALTHY
# LastStatus: RUNNING
# Connectivity: CONNECTED
```

### 1.3 ALB Target Health
```bash
# Check target group health
aws elbv2 describe-target-health \
  --target-group-arn <target-group-arn>

# Expected for EACH target:
# State: healthy
# Reason: (none)
```

### 1.4 Redis Health
```bash
# Test Redis connectivity from ECS task
aws ecs execute-command \
  --cluster angular-piza-cluster \
  --task <task-arn> \
  --container angular-piza-container \
  --interactive \
  --command "/bin/sh"

# Inside container:
curl -f http://localhost:3000/healthz

# Expected response:
# {"status":"UP","ready":true,"checks":{"server":"UP","redis":"UP"}}
```

---

## Phase 2: API Functionality ✅

### 2.1 Health Check Endpoint
```bash
# Test via ALB (public)
curl -i https://api.yourdomain.com/healthz

# Expected:
# HTTP/1.1 200 OK
# {"status":"UP","ready":true,"timestamp":"...","checks":{"server":"UP","redis":"UP"}}
```

### 2.2 Search API (Synchronous)
```bash
# Test search endpoint
curl -X POST https://api.yourdomain.com/api/v1/search?mode=async \
  -H "Content-Type: application/json" \
  -d '{
    "query": "pizza in tel aviv",
    "sessionId": "test-session-123",
    "locale": "en"
  }'

# Expected:
# HTTP/1.1 202 Accepted
# {"requestId":"req-...","resultUrl":"/api/v1/search/req-.../result"}
```

### 2.3 Search Result Polling
```bash
# Poll result (wait 5 seconds after POST)
curl https://api.yourdomain.com/api/v1/search/<requestId>/result

# Expected (if ready):
# HTTP/1.1 200 OK
# {"requestId":"...","results":[...],"meta":{...}}

# Expected (if pending):
# HTTP/1.1 202 Accepted
# {"status":"PENDING","progress":50}
```

### 2.4 WebSocket Connection
```bash
# Test WS endpoint (use wscat)
npm install -g wscat
wscat -c wss://api.yourdomain.com/ws

# Expected:
# Connected (shown as [1])
# Can send/receive messages
```

---

## Phase 3: Scale Events ✅

### 3.1 Manual Scale-Out Test
```bash
# Increase desired count
aws ecs update-service \
  --cluster angular-piza-cluster \
  --service angular-piza-service \
  --desired-count 4

# Monitor deployment
watch -n 5 'aws ecs describe-services \
  --cluster angular-piza-cluster \
  --services angular-piza-service \
  --query "services[0].{Running:runningCount,Desired:desiredCount,Events:events[0:3]}"'

# Wait for:
# Running: 4, Desired: 4
# No error events

# Verify: Search during scale-out
# Run 10 concurrent searches (should all succeed)
for i in {1..10}; do
  curl -X POST https://api.yourdomain.com/api/v1/search?mode=async \
    -H "Content-Type: application/json" \
    -d '{"query":"pizza","sessionId":"test-'$i'","locale":"en"}' &
done
wait

# Expected: 10 x 202 responses, no errors
```

### 3.2 Manual Scale-In Test
```bash
# Decrease desired count
aws ecs update-service \
  --cluster angular-piza-cluster \
  --service angular-piza-service \
  --desired-count 2

# Start long-running search BEFORE scale-in completes
curl -X POST https://api.yourdomain.com/api/v1/search?mode=async \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza in tel aviv","sessionId":"test-drain","locale":"en"}'

# Note requestId, monitor:
watch -n 2 'curl -s https://api.yourdomain.com/api/v1/search/<requestId>/result | jq .status'

# Expected:
# - Search completes successfully (DONE)
# - No 503 errors during drain
# - Tasks terminate gracefully after 60s
```

### 3.3 Auto-Scale CPU Test
```bash
# Generate CPU load (run from client)
# Use Apache Bench or similar
ab -n 1000 -c 50 https://api.yourdomain.com/api/v1/search

# Monitor auto-scaling
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=angular-piza-service Name=ClusterName,Value=angular-piza-cluster \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average

# Expected:
# - CPU spikes above 60%
# - ECS service scales out to 3-4 tasks within 2 minutes
# - CPU stabilizes below 60%
```

### 3.4 Auto-Scale Request Count Test
```bash
# Generate request load
ab -n 5000 -c 100 https://api.yourdomain.com/api/v1/search

# Monitor target group metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name RequestCountPerTarget \
  --dimensions Name=TargetGroup,Value=<target-group-arn-suffix> \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average

# Expected:
# - Request count spikes above 80/target
# - Service scales out within 2 minutes
```

---

## Phase 4: Failure Scenarios ✅

### 4.1 Task Failure Recovery
```bash
# Kill a running task
TASK_ARN=$(aws ecs list-tasks --cluster angular-piza-cluster --service-name angular-piza-service --query 'taskArns[0]' --output text)

aws ecs stop-task \
  --cluster angular-piza-cluster \
  --task $TASK_ARN \
  --reason "Manual failure test"

# Monitor replacement
watch -n 2 'aws ecs describe-services \
  --cluster angular-piza-cluster \
  --services angular-piza-service \
  --query "services[0].{Running:runningCount,Desired:desiredCount}"'

# Expected:
# - Running drops to 1 briefly
# - New task starts within 30 seconds
# - Running returns to 2 within 90 seconds
# - No 503 errors to clients (other task handles traffic)
```

### 4.2 Redis Failover Test
```bash
# Simulate Redis unavailability (stop Redis temporarily)
# DON'T DO THIS IN PROD - use test environment

# Expected:
# - Health checks fail (503 from /healthz)
# - ALB marks tasks unhealthy
# - ECS replaces tasks (won't help if Redis is down)
# - Once Redis restored, tasks become healthy automatically
```

### 4.3 ALB Health Check Failure
```bash
# Simulate unhealthy task (exec into container, kill health check)
aws ecs execute-command \
  --cluster angular-piza-cluster \
  --task <task-arn> \
  --container angular-piza-container \
  --interactive \
  --command "/bin/sh"

# Inside container:
pkill -9 node

# Monitor from outside:
watch -n 2 'aws elbv2 describe-target-health --target-group-arn <tg-arn>'

# Expected:
# - Target marked unhealthy after 2 failed checks (60 seconds)
# - ECS detects unhealthy task
# - ECS replaces task with new one
# - New task becomes healthy within 90 seconds
```

### 4.4 Deployment Failure Rollback
```bash
# Deploy broken image (wrong port or crash on startup)
# Update task definition with bad config
aws ecs register-task-definition --cli-input-json file://bad-task-def.json

# Update service
aws ecs update-service \
  --cluster angular-piza-cluster \
  --service angular-piza-service \
  --task-definition angular-piza-task:2

# Monitor deployment
watch -n 5 'aws ecs describe-services \
  --cluster angular-piza-cluster \
  --services angular-piza-service \
  --query "services[0].deployments"'

# Expected (ECS Circuit Breaker enabled):
# - New tasks fail health checks
# - After 3 failures, deployment stops
# - Service rolls back to previous task definition
# - Running count returns to 2 healthy tasks
```

---

## Phase 5: Performance Validation ✅

### 5.1 Response Time (P95)
```bash
# Load test with ApacheBench
ab -n 1000 -c 10 https://api.yourdomain.com/api/v1/search

# Check results:
# Time per request (95%): < 3000ms (target)
```

### 5.2 WebSocket Latency
```bash
# Measure WS message roundtrip
# Use custom script or tool like:
node scripts/test-ws-latency.js

# Expected:
# Average latency: < 200ms
# P95 latency: < 500ms
```

### 5.3 Concurrent Users
```bash
# Simulate 100 concurrent users
artillery quick --count 100 --num 10 https://api.yourdomain.com/api/v1/search

# Monitor:
# - No 5xx errors
# - Auto-scaling triggers if needed
# - All requests complete successfully
```

---

## Phase 6: Monitoring & Alerts ✅

### 6.1 CloudWatch Logs
```bash
# Check logs are flowing
aws logs tail /ecs/angular-piza --follow

# Expected:
# - Structured JSON logs
# - No ERROR or FATAL entries
# - Search requests logged with requestId
```

### 6.2 CloudWatch Alarms
```bash
# List all alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix angular-piza

# Expected:
# - All alarms in OK state
# - Redis memory < 80%
# - Redis CPU < 70%
# - ECS CPU < 80%
# - ALB 5xx errors < 10
```

### 6.3 Container Insights
```bash
# Check Container Insights metrics
# Go to CloudWatch Console → Container Insights → ECS Services

# Verify dashboards show:
# - CPU utilization
# - Memory utilization
# - Network I/O
# - Task count
```

---

## Phase 7: Security Validation ✅

### 7.1 Security Group Rules
```bash
# Verify ECS tasks can't be accessed directly
curl http://<ecs-task-private-ip>:3000/healthz

# Expected: Timeout (no direct access)

# Verify Redis can't be accessed from internet
redis-cli -h <redis-endpoint> ping

# Expected: Timeout or connection refused
```

### 7.2 Secrets Manager
```bash
# Verify secrets are NOT in environment variables
aws ecs describe-tasks \
  --cluster angular-piza-cluster \
  --tasks <task-arn> \
  --query 'tasks[0].containers[0].environment'

# Expected:
# - JWT_SECRET, GOOGLE_API_KEY, OPENAI_API_KEY NOT present
# - Only non-sensitive env vars shown
```

### 7.3 HTTPS Enforcement
```bash
# Test HTTP redirect
curl -I http://api.yourdomain.com/healthz

# Expected:
# HTTP/1.1 301 Moved Permanently
# Location: https://api.yourdomain.com/healthz
```

---

## Phase 8: Cost Validation 💰

### 8.1 Estimate Monthly Cost
```
# Expected costs (us-east-1):

ECS Fargate (2 tasks @ 0.5 vCPU, 1GB):
  - $0.04048/hour per task
  - 2 tasks × 730 hours = $59/month

ElastiCache Redis (cache.t4g.micro):
  - $0.017/hour
  - 730 hours = $12/month

ALB:
  - $0.0225/hour = $16/month
  - Data processing: ~$8/month (1 TB)

CloudWatch Logs (7-day retention):
  - ~$5/month

NAT Gateway (for private subnets):
  - $0.045/hour = $33/month
  - Data processing: ~$10/month

Total: ~$143/month (2 tasks, light traffic)

Auto-scaling to 6 tasks:
  - Peak cost: ~$230/month
```

### 8.2 Cost Optimization
- [ ] Enable Savings Plans for Fargate (20-50% savings)
- [ ] Use Reserved Capacity for baseline tasks
- [ ] Monitor CloudWatch Logs size (consider log filtering)
- [ ] Review NAT Gateway usage (consider VPC endpoints)

---

## Acceptance Criteria Summary

### P0 (Must Pass)
- [x] All 2 tasks running and healthy
- [x] ALB health checks passing (200 OK)
- [x] Redis connectivity confirmed
- [x] Search API returns results
- [x] WebSocket connections work
- [x] Auto-scaling policies active
- [x] No 5xx errors during normal operation
- [x] Graceful shutdown during scale-in (no dropped requests)

### P1 (Should Pass)
- [x] Task failure recovered within 90s
- [x] Auto-scale triggers at 60% CPU
- [x] Auto-scale triggers at 80 req/target
- [x] CloudWatch alarms configured
- [x] Logs flowing to CloudWatch
- [x] Secrets stored in Secrets Manager

### P2 (Nice to Have)
- [ ] Container Insights dashboards configured
- [ ] SNS notifications for alarms
- [ ] X-Ray tracing enabled
- [ ] Cost alerts configured

---

## Troubleshooting

### Tasks Won't Start
```bash
# Check task stopped reason
aws ecs describe-tasks \
  --cluster angular-piza-cluster \
  --tasks <task-arn> \
  --query 'tasks[0].stoppedReason'

# Common issues:
# - "CannotPullContainerError" → Check ECR permissions
# - "Essential container exited" → Check CloudWatch logs for errors
# - "Task failed to start" → Check security group rules
```

### Health Checks Failing
```bash
# Exec into task
aws ecs execute-command \
  --cluster angular-piza-cluster \
  --task <task-arn> \
  --container angular-piza-container \
  --interactive \
  --command "/bin/sh"

# Test health endpoint
curl -v http://localhost:3000/healthz

# Common issues:
# - Redis connection failed → Check security groups
# - JWT_SECRET missing → Check Secrets Manager ARN
# - Port 3000 not listening → Check logs for startup errors
```

### Auto-Scaling Not Triggering
```bash
# Check scaling policies
aws application-autoscaling describe-scaling-policies \
  --service-namespace ecs

# Check recent scaling activities
aws application-autoscaling describe-scaling-activities \
  --service-namespace ecs \
  --resource-id service/angular-piza-cluster/angular-piza-service

# Common issues:
# - Cooldown period not elapsed
# - Metric not above threshold for 2 consecutive periods
# - Max capacity already reached
```

---

## Sign-Off

- [ ] All P0 tests passed
- [ ] All P1 tests passed
- [ ] No critical alarms
- [ ] Team notified of deployment
- [ ] Monitoring dashboards reviewed
- [ ] Rollback plan confirmed

**Deployment approved by**: _______________  
**Date**: _______________
