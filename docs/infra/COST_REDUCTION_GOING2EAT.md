# Going2Eat AWS cost reduction

**Status: PLANNED. Nothing has been applied. Documentation only.**
Written: 2026-10-03. Account `907390934996` (profile `pizza`), region `eu-north-1`.
Scope: Going2Eat only. Never dating resources.

---

## Step 1: right-size the API container (1 vCPU / 2 GB is far too big)

### 1. Existing (verified read-only on 2026-10-03)

- Service `food-backend-service` on cluster `food-cluster`, 1 task, capacity provider `FARGATE` (on-demand),
  public IP enabled, health check grace 30 s, rolling deploy min healthy 100% / max 200%.
- Running task definition: `food-backend:38`.
  - Task: **cpu 1024 (1 vCPU), memory 2048 (2 GB)**.
  - Container `food-backend`: cpu 1024, **memory (hard limit) 2048, memoryReservation 1024**, 22 env vars, 4 secrets.
- CPU and memory are **not defined in this repo** (no task definition file). The deploy flow (`going2eat-deploy`) copies the
  live task definition, so a new size carries forward to future deploys.

### Measured usage (CloudWatch `AWS/ECS`, service `food-backend-service`)

| Metric | Last 7 days | Last 14 days, top hourly peaks |
|---|---|---|
| CPU | average 0.03%, peak 12.6% of 1 vCPU (about 0.13 vCPU) | 12.6%, 12.1%, 7.6% |
| Memory | average 3.7%, peak 5.3% of 2 GB (about 107 MB) | 5.2%, 5.2%, 5.1% |
| Traffic | about 14,100 ALB requests/week (about 2,000/day) | |

Caveat: CloudWatch ECS metrics are 1-minute averages, so very short spikes are not visible. Traffic is low today.
If traffic grows (more users, more concurrent WebSockets), re-measure.

### Current cost of the container (estimate, pre-tax)
Fargate 1 vCPU / 2 GB: **about $39/month** (vCPU $32 + memory $7).

### 2. Planned change

Register a new task definition revision from `food-backend:38` that changes ONLY resources (same image, env, secrets, roles):

| | Now | Step 1a (recommended first) | Step 1b (optional, later) |
|---|---|---|---|
| Task cpu / memory | 1024 / 2048 | **512 / 1024** | 256 / 512 |
| Container `memory` (hard limit) | 2048 | 1024 | 512 |
| Container `memoryReservation` | 1024 | 512 | 256 |
| Container `cpu` | 1024 | 512 | 256 |
| Cost per month | ~$39 | **~$19.5** | ~$9.8 |
| Saving | | **~$19.5** | **~$29** |

Container-level limits must be lowered with the task size; AWS rejects a container hard limit above the task memory.

### 3. Reason
The container uses about 5% of its memory and almost no CPU. Fargate bills for the size, not the usage.

### 4. Risks and how they are handled
- **Out of memory kill** if memory spikes above the new limit: peak is 107 MB vs 1 GB limit (about 10x headroom at step 1a, about 5x at 1b).
- **Slow startup / CPU throttling** under 0.5 or 0.25 vCPU: watch health checks during the rollout (grace period 30 s). Deploy is rolling with min healthy 100%, so the old task keeps serving until the new one is healthy.
- **Node heap**: if the image sets `--max-old-space-size` or `NODE_OPTIONS` above the new limit, raise or lower it. Check env before registering (env names with HEAP/MEM/NODE are `NODE_ENV` only; no heap option found among visible names).
- **Future traffic growth**: re-measure after a week; step 1a can be reverted in minutes.
- **Production**: this is the live API (`api.going2eat.food`). Follow `going2eat-deploy` consent flow.

### 5. To-do (each step needs explicit approval)
- [ ] 1. Show target summary (account, cluster, service, current `food-backend:38`, new size) and get a "yes".
- [ ] 2. Save the current task definition JSON (rollback copy) outside the repo.
- [ ] 3. Register a new revision with step 1a values (same image tag as rev 38, same env/secrets).
- [ ] 4. `update-service` to the new revision, wait `services-stable`.
- [ ] 5. Verify: running 1/1, ALB target healthy, `https://api.going2eat.food` health OK, `https://app.going2eat.food` loads, no errors in `/ecs/food-backend` (OOM / ETIMEDOUT / restarts).
- [ ] 6. Watch for 7 days: memory peak, CPU peak, task restarts. Then decide on step 1b.
- [ ] 7. Daily cost check: Fargate line should drop from about $1.30/day to about $0.65/day (step 1a).

### 6. Rollback
`aws ecs update-service --cluster food-cluster --service food-backend-service --task-definition food-backend:38 --profile pizza --region eu-north-1`
Revision 38 stays registered (ECS keeps old revisions), so rollback is one command and a rolling restart.

---

## Other Going2Eat ideas (not started)
- Redis (cache.t4g.micro, about $14/month): uses 8 MB, 6 connections. Could run as a sidecar container in the same task; state would be lost on each redeploy. Needs a code check of what is stored in Redis (job store, WebSocket state).
- ECR: 177 images (11.8 GB, about $1.2/month). Lifecycle policy to keep the last 10 images saves about $1.
- Redesign (no ALB / Fargate / ElastiCache; one small server): about $55/month saving, high effort.

---

## Step 1a: DONE 2026-10-03 (applied with user consent: "its demo, go ahead")

- Rollback copy of `food-backend:38` saved outside the repo (temp folder; revision 38 also remains registered in ECS).
- Registered `food-backend:39`: task 512 / 1024, container cpu 512 / memory 1024 / reservation 512. Image unchanged (`food-backend:b491958`), env and secrets unchanged.
- `update-service` to `food-backend:39`; `services-stable` OK; rollout COMPLETED, running 1/1.
- Verified: ALB target healthy (old target drained), `https://api.going2eat.food/healthz` 200, `https://app.going2eat.food` 200, `https://www.going2eat.food` 200,
  0 matches for ERROR / ETIMEDOUT / ECONNREFUSED / heap in `/ecs/food-backend` in the 12 minutes after, no OOM stop (previous task stopped only by the deployment).
- Live right after: memory about 5% of the new 1 GB (peak 5.5%), CPU about 0.02% (peak 0.1%).
- Expected saving: about $19.5/month. Check Fargate cost in the next days (about $1.30/day to about $0.65/day).
- Note: `https://api.going2eat.food/health` returns 404; `/healthz` is the real health path.

Still open: watch 7 days (memory peak, CPU peak, restarts), then decide on step 1b (256 / 512).

Rollback:
`aws ecs update-service --cluster food-cluster --service food-backend-service --task-definition food-backend:38 --profile pizza --region eu-north-1`

---

## Step 2: nightly shutdown, 23:00 to 08:00 Israel time (PLANNED, nothing applied)

Written: 2026-10-03. Account `907390934996`, `eu-north-1`. Requested by the user (demo environment). Companion plan for dating: `dating/docs/infra/COST_REDUCTION_DEV.md` (Phase 5).
This step explicitly asks for the API to be stopped at night, which the `going2eat-deploy` skill otherwise forbids ("never desiredCount 0 unless they ask"): the user asked.

### Existing (verified read-only)
- `food-backend-service` runs 1 task 24/7 (now `food-backend:39`, 0.5 vCPU / 1 GB). No autoscaling target, no CloudWatch alarms, no EventBridge rules, no Route 53 health checks.
- The server has only internal timers (WebSocket heartbeat, cache and job-store sweeps). **No external cron or background jobs**, so nothing is missed while it is off.
- Redis (ElastiCache) and the ALB cannot be stopped; they keep billing at night. Amplify (the UI) stays up.
- Deploy flow copies the live task definition (so settings carry forward); the Terraform is not used for Going2Eat.

### Planned design
Application Auto Scaling scheduled actions on the ECS service (supports a timezone, works with CLI 2.6.3, no Lambda needed):

| Time (`Asia/Jerusalem`) | Action |
|---|---|
| (once) | `register-scalable-target` for `service/food-cluster/food-backend-service`, min 1, max 1 |
| 23:00 daily | scheduled action `g2e-night-off`: min 0, max 0 |
| 08:00 daily | scheduled action `g2e-morning-on`: min 1, max 1 |

Created with the AWS CLI (Going2Eat has no Terraform), documented here; names are `g2e-night-off` and `g2e-morning-on`.

### Cost (pre-tax, per month; Going2Eat after step 1a = about $64 running 24/7)
| Item | 24/7 | 23:00-08:00 off |
|---|---|---|
| Fargate 0.5 vCPU / 1 GB | 19.5 | 12.2 |
| Task public IPv4 | 3.7 | 2.3 |
| ALB + ALB IPv4 | 24.5 | 24.5 |
| Redis | 14.4 | 14.4 |
| Amplify builds | 1.9 | 1.9 |
| **Total** | **~64** | **~55** |
| **Saving** | | **~9** |

### Risks
- **The API is down 23:00-08:00**: `https://api.going2eat.food` answers 503. The Amplify UI still loads but cannot search. Fine for a demo; not for real users at night.
- **Cold start at 08:00**: about 1-2 minutes until healthy.
- **A deploy at night** (via `going2eat-deploy`) registers the new revision and "succeeds" with 0 tasks; it only starts in the morning. Prefer deploying during the day.
- **In-memory state** (search jobs, caches inside the process) is lost every night; Redis keeps its data.
- **Morning report** (CloudWatch search counts) simply shows no searches at night.

### To-do (each step needs explicit approval)
- [ ] 1. Approve this plan (23:00-08:00, 7 days a week unless told otherwise).
- [ ] 2. `register-scalable-target` (min 1, max 1); verify the service is unchanged (1/1).
- [ ] 3. Create the two scheduled actions; verify with `describe-scheduled-actions` (next run times in Israel time).
- [ ] 4. Verify at the first 23:00 (running 0, ALB targets none) and the next 08:00 (running 1/1, target healthy, `/healthz` 200, app URL 200).
- [ ] 5. Update this document; next day check the Fargate line.

### Rollback
Delete the two scheduled actions and deregister the scalable target (`aws application-autoscaling delete-scheduled-action`, `deregister-scalable-target`), then set the service back to desired count 1 if it is at 0.

## Status update 2026-10-04 09:11
- Step 2 DONE: scalable target food-backend-service (min1/max1) + scheduled actions g2e-night-off (23:00, 0/0) and g2e-morning-on (08:00, 1/1), timezone Asia/Jerusalem. Rollback: delete both actions with aws application-autoscaling delete-scheduled-action; keep min/max 1.

## Step 3 (PLAN, not applied): Redis as sidecar container instead of ElastiCache  [2026-10-04]

### Existing
- ElastiCache `food-redis-cluster` (cache.t4g.micro, 1 node, no snapshots), about $14/month. Uses 8 MB, 6 connections.
- Task: 0.5 vCPU / 1 GB, `food-backend:39`.
- Code (server/src/lib/redis/redis-client.ts): supports `redis://` (no TLS) and `rediss://`; if Redis is not reachable the services degrade gracefully (no crash). Used for: search job store, sessions, WebSocket tickets, rate limiting, enrichment locks, Google/provider cache.

### Change
1. New task definition revision cloned from live: add container `redis` (`public.ecr.aws/docker/library/redis:7-alpine`, `--maxmemory 64mb --maxmemory-policy allkeys-lru --save ""`).
2. Set the Redis URL env var on the app container to `redis://localhost:6379` (exact variable name to confirm from the live task definition).
3. Keep the service at exactly 1 task (already min1/max1).
4. After a few safe days: delete ElastiCache (snapshot first).

### Reason
- Saves about $14/month. Demo only.

### Risks
- Users are logged out and running search jobs are lost on each deploy/restart/nightly shutdown; cache refills (a few extra provider calls).
- Deploy flow `going2eat-deploy` clones the live task definition, so the sidecar stays.

### Rollback
- Register/choose the previous task definition revision (REDIS URL back to ElastiCache) while the node still exists; afterwards restore from snapshot.

### Step 3 status 2026-10-04 11:21 - sidecar DEPLOYED (ElastiCache still exists)
- Task definition food-backend:41 (cloned from live :40) = food-backend (hard memory 896) + redis sidecar (redis:7-alpine, maxmemory 64mb, allkeys-lru); REDIS_URL=redis://localhost:6379.
- Verified: rollout COMPLETED, target healthy, log REDIS_CONNECTED, no connection failures.
- ElastiCache food-redis-cluster kept for now; snapshot food-redis-before-sidecar-20261004 taken. Delete it after a few safe hours/days (about 14 USD/month).
- Rollback: update service to food-backend:40 (old rediss:// URL) while the node exists.

### Step 3b 2026-10-04 12:27 - ElastiCache DELETED (Going2Eat)
- food-redis-cluster deleted (about 14 USD/month saved). Verified after deletion: food-backend:41 1/1, target healthy, no Redis connection failures.
- Rollback: restore a new node from snapshot food-redis-before-sidecar-20261004 (eu-north-1), then run food-backend:40 (old rediss:// URL points at the old endpoint, so use a new task definition with the new endpoint).

## Step 4 (PLAN, not applied): container 0.5 vCPU / 1 GB -> 0.25 vCPU / 0.5 GB  [2026-10-04]
### Existing
- Task food-backend:41: 0.5 vCPU / 1 GB, app hard memory 896 + redis sidecar (64 MB). 7-day usage: memory peak 7 percent, CPU average under 0.1 percent, peak about 12 percent.
### Change
- New task definition revision cloned from live: task cpu 256, memory 512; app container hard memory 400, redis sidecar unchanged. Update service, verify, keep :41 for rollback.
### Reason
- Fargate on-demand saving about 10 USD/month, about 6-7 USD with the nightly shutdown.
### Risks
- Slower startup and less headroom for traffic spikes; easy to revert (service back to :41).
### Decision
- Dating API/UI not changed: API already on Spot (saving only 2-3 USD), UI already 0.25 vCPU / 0.5 GB.

### Step 4 status 2026-10-04 - DONE
- food-backend:42 = 0.25 vCPU / 0.5 GB (app hard memory 400, container cpu units 0, redis sidecar). Verified: rollout COMPLETED, target healthy, REDIS_CONNECTED, no errors. Rollback: update service to food-backend:41.

## Step 5 (reviewed, NO CHANGE): load balancer  [2026-10-04]
- food-alb (eu-north-1): HTTPS 443 + HTTP 80 redirect, about 550-2800 requests/day, about 25 USD/month including public IPv4. Needed for HTTPS and WebSocket to the API (UI is on Amplify). Alternatives (direct task IP, API Gateway HTTP API) either break stable HTTPS or WebSocket. Kept.

## Sprint summary  [2026-10-04]
| Change | Status | Est. saving / month |
|---|---|---|
| Container 1 vCPU/2 GB -> 0.5/1 GB -> 0.25/0.5 GB | done | 25-30 |
| Night schedule 23:00-08:00 (g2e-night-off / g2e-morning-on) | done, first night 2026-10-04 | 8-10 |
| Redis as sidecar, ElastiCache deleted | done | 14 |
| ALB | reviewed, kept | 0 |
Rollback snapshot: food-redis-before-sidecar-20261004 (eu-north-1). Task definition history: :39 resized, :41 sidecar, :42 smaller.
