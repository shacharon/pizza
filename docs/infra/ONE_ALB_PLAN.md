# Plan: one ALB for Going2Eat + dating (PLAN ONLY - nothing applied)

Date: 2026-10-04. Account 907390934996 (profile `pizza`). Goal: delete `food-alb` (eu-north-1) and serve the Going2Eat API through `dating-dev-alb` (eu-central-1). Saving about 25 USD/month (ALB about 18 + public IPv4 about 7).

## Why a migration is needed
An ALB only reaches targets in its own region/VPC. Dating runs in eu-central-1 (VPC `vpc-0c6e32b971b76b4eb`, 10.20.0.0/16), Going2Eat in eu-north-1 (VPC `food-vpc` 10.0.0.0/16). So the Going2Eat API service moves to Frankfurt, into the dating VPC. Going2Eat is the easy one: no database, Redis is a sidecar, UI is on Amplify.

## Existing (inventory, read-only)
- Going2Eat API: ECS `food-cluster` / `food-backend-service`, task def `food-backend:42` (0.25 vCPU / 0.5 GB, app + redis sidecar), min1/max1, night schedule 23:00-08:00, public IP, 2 subnets in `food-vpc`, SGs `sg-020eea8e5402fc7ac` + `sg-03c449c80930a0b14`, `enableExecuteCommand=true`, circuit breaker on, health grace 30 s.
- ALB `food-alb`: listener 80 -> redirect, 443 (TLS13 policy) -> `food-backend-tg` (ip, port 3000, health `/healthz`, deregistration delay 300 s, idle timeout 60 s). Cert `api.going2eat.food` (ACM eu-north-1).
- DNS: `api.going2eat.food` A-alias -> `food-alb`. UI = Amplify app `d2vbnmlocd4i9u` (branch main, `going2eat.food` app/www via CloudFront). The UI calls `api.going2eat.food`, so the hostname stays and no UI change is needed.
- Secrets: task `secrets` use SSM names `/pizza/prod/{BRAVE_SEARCH_API_KEY,GOOGLE_API_KEY,JWT_SECRET,OPENAI_API_KEY}` in eu-north-1 (SecureString). Other config is plain env (COOKIE_DOMAIN, CORS_ALLOWED_ORIGINS, SESSION_COOKIE_SECRET, ...).
- Roles: execution `ecsTaskExecutionRole` (AmazonECSTaskExecutionRolePolicy + AmazonSSMReadOnlyAccess + inline), task `ElasticContainerfoodServiceTask` (IAM is global).
- Image: ECR `food-backend` in eu-north-1 (tag in use `2c11e9c`), log group `/ecs/food-backend` (5.7 MB, no retention).
- Dating ALB (Terraform, `infra/terraform/modules/alb`): listeners 80 redirect / 443; default -> UI TG, `/health` + `/socket.io/*` -> API TG; SG `sg-0d621361a03780429`; certs `findyouraidate.com` (+ www). Public subnets `subnet-08702ce87ad2a209c` (1a), `subnet-0b93dbcd01f2e6cce` (1b).

## Change (target state)
1. Image stays in the eu-north-1 ECR and is pulled cross-region (small data-transfer cost; the deploy flow `going2eat-deploy` keeps working). Move ECR later if wanted.
2. Secrets: task def references the four SSM params by full eu-north-1 ARN (supported cross-region), no copy needed.
3. ACM certificate for `api.going2eat.food` in eu-central-1 (DNS validation in the existing Route53 zone), added to the dating 443 listener as an extra certificate.
4. Dating ALB: new target group `g2e-api` (ip, 3000, `/healthz`) + listener rule host-header `api.going2eat.food` -> `g2e-api` (priority 20). Defined in the dating Terraform (`infra/terraform/dev`, new small file) so the shared ALB has no hand-made drift. New SG for the Going2Eat tasks: ingress 3000 from the ALB SG.
5. New ECS cluster + service in eu-central-1 in the dating public subnets (public IP, no NAT), task def cloned from live (`food-backend:42`) with new log group `/ecs/food-backend` and updated secret ARNs; min1/max1; scheduled actions `g2e-night-off` 23:00 / `g2e-morning-on` 08:00 (Asia/Jerusalem).
6. Cutover: change Route53 alias `api.going2eat.food` from `food-alb` to `dating-dev-alb`.
7. After 1-2 stable days: delete the eu-north-1 service, cluster, `food-alb`, target group, SGs, then `food-vpc` leftovers.

## Risks / things to know
- Shared ALB: a mistake in listener rules could affect dating. Mitigation: rule priority 20 only, plan reviewed before apply, dating checked after.
- Going2Eat runs in two regions for 1-2 days (extra cost about 1-2 USD) so rollback stays instant.
- WebSocket / SSE / cookies: same hostname, same ALB idle timeout (60 s), `TRUST_PROXY`, cookie domain unchanged. Test search + WebSocket + login before cutover.
- Sessions/jobs (Redis sidecar) are lost at cutover - accepted (demo).
- Terraform coupling: the dating repo state will contain the Going2Eat rule/TG/cert. Alternative: separate Terraform root. Decide before step 4.
- Dating ALB DNS name stays; alias switch is quick (alias records have no TTL).

## To-do (baby steps, approval at each)
1. Request ACM cert in eu-central-1, add validation CNAME, wait ISSUED.
2. Terraform (dating): SG, TG `g2e-api`, listener certificate, host rule. Plan -> approve -> apply. Check dating unaffected.
3. Create log group, ECS cluster, task def (cloned from live), service behind `g2e-api` + scheduled actions. Verify healthy targets.
4. Test via `curl --resolve api.going2eat.food:443:<ALB IP>`: `/healthz`, a search, WebSocket, login.
5. Cutover: Route53 alias to `dating-dev-alb`. Verify UI end to end (app.going2eat.food), logs, dating still 200.
6. Watch 1-2 days. Then cleanup of eu-north-1 stack (with approval). Update docs and the `going2eat-deploy` skill (new region/cluster/service names).

## Rollback
- Until cleanup: set the Route53 alias back to `food-alb`; scale the Frankfurt service to 0. Old stack is untouched and still running.
- After cleanup: recreate from the task definition history (`food-backend:41/42`) and the Frankfurt service config.

## Open questions
- Terraform in dating repo vs separate root (see risks).
- Skill `going2eat-deploy` must be updated (cluster/service/region) after cutover.
- Check `food-feedback-ses` inline policy region (SES) - expected unchanged.
