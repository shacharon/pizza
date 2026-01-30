# ECS & Redis Sizing Guide

Resource recommendations based on expected traffic.

---

## Traffic Profiles

### Small (10k searches/day)
- **417 searches/hour**
- **7 searches/minute**
- Peak: ~20 searches/minute (3x average)

### Medium (100k searches/day)
- **4,167 searches/hour**
- **69 searches/minute**
- Peak: ~200 searches/minute

### Large (1M searches/day)
- **41,667 searches/hour**
- **694 searches/minute**
- Peak: ~2,000 searches/minute

---

## ECS Task Sizing

### Small Traffic (10k/day)
```
CPU: 0.5 vCPU (512)
Memory: 1 GB (1024)

Rationale:
- Single request ~100-200ms CPU time
- 0.5 vCPU = 500 compute units/sec
- Capacity: ~5 req/sec per task = 300 req/min
- 2 tasks = 600 req/min capacity (>> 20 req/min peak)

Cost: $59/month (2 tasks)
```

### Medium Traffic (100k/day)
```
CPU: 1 vCPU (1024)
Memory: 2 GB (2048)

Rationale:
- Higher throughput per task
- Better LLM response handling
- 1 vCPU = ~10 req/sec = 600 req/min per task
- 4 tasks baseline = 2,400 req/min capacity (>> 200 req/min peak)

Baseline: 4 tasks
Peak: 8 tasks (auto-scale)
Cost: $230/month (4 tasks baseline) + surge
```

### Large Traffic (1M/day)
```
CPU: 2 vCPU (2048)
Memory: 4 GB (4096)

Rationale:
- Minimize task count overhead
- Better cache hit rates per task
- 2 vCPU = ~20 req/sec = 1,200 req/min per task
- 10 tasks baseline = 12,000 req/min capacity (>> 2,000 req/min peak)

Baseline: 10 tasks
Peak: 20 tasks
Cost: $1,200/month (10 tasks) + surge
```

---

## Redis Sizing

### Node Types (ElastiCache)

| Node Type | Memory | vCPU | Cost/Month | Use Case |
|-----------|--------|------|------------|----------|
| **cache.t4g.micro** | 512 MB | 2 | $13 | Dev/small (< 10k/day) |
| **cache.t4g.small** | 1.5 GB | 2 | $26 | Medium (100k/day) |
| **cache.t4g.medium** | 3.2 GB | 2 | $52 | Medium-high (500k/day) |
| **cache.r7g.large** | 13 GB | 2 | $146 | Large (1M/day) |
| **cache.r7g.xlarge** | 26 GB | 4 | $292 | Very large (5M/day) |

### Memory Calculation

**Formula**: `maxmemory = node_memory × 0.8` (leave 20% for Redis overhead)

**Cache Data Estimates**:
```
Intent cache:
  - 200 entries × 2 KB = 400 KB

Places cache:
  - 1000 entries × 50 KB = 50 MB

JobStore:
  - 500 concurrent jobs × 5 KB = 2.5 MB

Rate limiter:
  - 1000 IPs × 0.5 KB = 500 KB

Total per 1000 users: ~55 MB
```

**Recommendations**:
- **10k/day**: cache.t4g.micro (512 MB) → 400 MB usable
- **100k/day**: cache.t4g.small (1.5 GB) → 1.2 GB usable
- **1M/day**: cache.r7g.large (13 GB) → 10 GB usable

---

## Auto-Scaling Policies

### CPU-Based Scaling
```
Target: 60% CPU utilization
Scale-out cooldown: 60s (fast response)
Scale-in cooldown: 180s (cautious, avoid thrashing)

Why 60%?
- Leaves 40% headroom for spikes
- Fast enough to avoid degradation
- Conservative enough to minimize cost
```

### Request-Based Scaling
```
Target: 80 requests/target (per minute)
Scale-out cooldown: 60s
Scale-in cooldown: 180s

Why 80?
- Each task can handle ~100-200 req/min
- 80 req/min = 80% utilization
- Ensures no single task overloaded
```

### Combination Strategy
```
ECS uses BOTH policies:
- Whichever triggers first causes scale-out
- Example: CPU at 70% OR req count at 90 → scale out
- This provides dual protection
```

---

## Capacity Planning

### Baseline Capacity
```
Desired tasks = (peak_req/min ÷ capacity_per_task) × 1.5 safety margin

Example (100k/day):
- Peak: 200 req/min
- Capacity per task: 100 req/min (conservative)
- Baseline: (200 ÷ 100) × 1.5 = 3 tasks
- Round up to 4 for redundancy
```

### Autoscaling Range
```
Min tasks = baseline
Max tasks = baseline × 2 (for 2x surge capacity)

Example:
- Baseline: 4 tasks
- Min: 4
- Max: 8

Never set Min=1 in production (no redundancy)
```

---

## Cost Optimization

### Fargate Savings Plans
```
Commitment: $X/month for 1 year
Savings: 20-50% off on-demand pricing

When to use:
- Predictable baseline traffic
- Long-term deployment (1+ year)

Example:
- Baseline 4 tasks = $230/month on-demand
- With Savings Plan: $160/month (30% savings)
```

### Spot Instances (Advanced)
```
Mix: 50% on-demand + 50% spot
Savings: ~70% on spot portion

Risk:
- Spot instances can be interrupted (2-min warning)
- Use for non-critical tasks only

Not recommended for initial deployment
```

### Right-Sizing Strategy
```
1. Start with conservative sizing (oversized)
2. Monitor for 1 week (CloudWatch Container Insights)
3. Analyze:
   - CPU: Should average 40-60% (peak 80%)
   - Memory: Should use 50-70%
4. Downsize if consistently under 40%
5. Upsize if peaks hit 90%+

Re-evaluate monthly
```

---

## Monitoring Thresholds

### P0 Alarms (Page On-Call)
```
ECS Service CPU > 80% for 10 minutes
Redis Memory > 90%
ALB 5xx error rate > 5% over 5 minutes
ALB target unhealthy count > 0 for 5 minutes
```

### P1 Alarms (Notify Team)
```
ECS Service CPU > 70% for 20 minutes
Redis CPU > 70% for 10 minutes
ALB 4xx error rate > 10% over 10 minutes
Redis eviction rate > 10/min
```

### P2 Metrics (Dashboard Only)
```
Average response time (p95)
Cache hit rate
WebSocket connection count
Request count per target
```

---

## Network Bandwidth Considerations

### Fargate Network Limits
```
0.5 vCPU: 1 Gbps
1 vCPU: 2 Gbps
2 vCPU: 4 Gbps
4+ vCPU: 10 Gbps

Typical request:
- Inbound: 2 KB (POST /search)
- Outbound: 50 KB (search results)
- Per request: ~52 KB

Bandwidth capacity per task (1 vCPU, 2 Gbps):
- 2 Gbps = 250 MB/sec = 250,000 KB/sec
- 250,000 KB/sec ÷ 52 KB/req = ~4,800 req/sec
- WAY above CPU limit (~10 req/sec)

Conclusion: Network is NOT the bottleneck (CPU is)
```

---

## Disaster Recovery

### Task Failure
```
Detection time: 60s (2 failed health checks × 30s)
Replacement time: 60-90s (task start + health grace)
Total recovery: ~2-3 minutes

Impact: None if min tasks ≥ 2
```

### AZ Failure
```
Tasks spread across 2+ AZs automatically
If AZ fails:
- ECS detects unhealthy tasks
- Replaces in healthy AZ
- Recovery: 2-3 minutes

Requirement: Min tasks ≥ 2 AND subnets in 2+ AZs
```

### Redis Failure
```
Single-node: Full outage until node replaced (~5-10 min)
Multi-node: Auto-failover to replica (~30 sec)

Mitigation:
- Enable Multi-AZ (automatic failover)
- Cost: 2x Redis price
- Recommended for production
```

---

## Load Testing Recommendations

### Tools
```
- ApacheBench (ab): Simple HTTP load testing
- Artillery: WebSocket + HTTP scenario testing
- Locust: Python-based, flexible scenarios
- k6: Modern, scriptable, Grafana integration
```

### Test Scenarios
```
1. Baseline Load (10 min):
   - 10 req/sec constant
   - Should be < 30% CPU

2. Ramp-Up Test (20 min):
   - Start 10 req/sec
   - Increase 10 req/sec every 2 min
   - Stop at CPU 80% or max tasks

3. Spike Test (5 min):
   - Instant jump to 10x baseline
   - Hold for 2 min
   - Drop back
   - Verify auto-scale triggers

4. Soak Test (1 hour):
   - Sustained load at 60% capacity
   - Check for memory leaks
   - Verify no degradation over time
```

---

## Summary

### Quick Reference
| Traffic | ECS CPU | ECS Mem | Tasks | Redis | Cost/Month |
|---------|---------|---------|-------|-------|------------|
| 10k/day | 0.5 vCPU | 1 GB | 2 | t4g.micro | $143 |
| 100k/day | 1 vCPU | 2 GB | 4 | t4g.small | $320 |
| 1M/day | 2 vCPU | 4 GB | 10 | r7g.large | $1,450 |

### Decision Tree
```
1. What's your traffic? (searches/day)
   → Choose row from table above

2. Do you need multi-AZ Redis?
   → Yes if: downtime > $1000/hour cost
   → Add 2x Redis cost

3. Do you have predictable baseline?
   → Yes: Buy Savings Plan (save 30%)
   → No: Stay on-demand

4. Start with recommended sizing
5. Monitor for 1 week
6. Adjust based on actual metrics
```
