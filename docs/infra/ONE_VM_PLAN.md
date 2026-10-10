# Plan B: run dating + Going2Eat API on ONE small EC2 server (PLAN ONLY - nothing built)

Date: 2026-10-04. Account 907390934996 (profile `pizza`). Decision by owner: both apps are demos, so a single server without high availability is acceptable. Supersedes the parked `ONE_ALB_PLAN.md` (Plan A).

## Goal
Replace 2 ALBs + Fargate + RDS + public IPs with one EC2 instance in eu-central-1 running containers. Estimated spend: about 100 -> about 20 USD/month (saving about 75-80).

## Existing (inventory, read-only)
- Dating (eu-central-1): ECS Fargate API (`dating-dev-api`, 0.5 vCPU / 1 GB + redis sidecar) and UI (`dating-dev-ui`, 0.25 vCPU / 0.5 GB), RDS Postgres 16.13 `db.t4g.micro` (20 GB gp3, 7-day backups), ALB `dating-dev-alb`, S3 `dating-dev-photos` (2 objects, 842 KiB), 10 Secrets Manager secrets, IAM task role `dating-dev-task`, night schedule 23:00-08:00. Repo already has `infra/docker-compose.yml` (postgres:16, redis:7, api, ui, migrate) and Dockerfiles for api and ui.
- Going2Eat (eu-north-1): ECS API (`food-backend:42`, 0.25 vCPU / 0.5 GB + redis sidecar), ALB `food-alb`, UI on Amplify (`app.going2eat.food`, calls `api.going2eat.food`), secrets in SSM `/pizza/prod/*`, image in ECR eu-north-1.
- DNS (Route53): `findyouraidate.com` and `www` -> dating ALB; `api.going2eat.food` -> food ALB; zones `going2eat.food`, `findyouraidate.com`, private `internal`.
- Measured use (7 days): dating API memory about 110 MB, UI about 110 MB, Going2Eat about 70 MB, CPU about 1 percent. Database is tiny.
- Current cost about 100 USD/month: ALBs about 33, public IPv4 about 26, Fargate about 16, RDS about 11, Secrets Manager about 4, Route53/Amplify/tax about 9.

## Target design
- One EC2 `t4g.small` (2 vCPU ARM, 2 GB) in eu-central-1, Amazon Linux 2023, 30 GB gp3 encrypted EBS, one Elastic IP. Start small; resize = stop, change type, start.
- Security group: inbound 80 and 443 only. No SSH; access through SSM Session Manager.
- IAM instance role (no access keys): ECR pull (eu-central-1 and eu-north-1), S3 photos bucket, Rekognition, SSM parameter read, CloudWatch logs.
- Docker Compose stack: `caddy` (HTTPS via Let's Encrypt, host routing: `findyouraidate.com`/`www` -> dating UI + API paths incl. `/socket.io`, `/health`; `api.going2eat.food` -> Going2Eat API), `dating-ui`, `dating-api`, `g2e-api`, `postgres:16`, `redis-dating` (noeviction, needed by Bull), `redis-g2e` (allkeys-lru). Memory budget about 1 GB of 2 GB, plus 2 GB swap.
- Secrets: SSM Parameter Store SecureString (free) rendered to env files at deploy. Secrets Manager secrets removed (about 4 USD/month).
- Backups: daily EBS snapshots (7 retained) + nightly `pg_dump` to S3; restore tested once.
- Night schedule: EventBridge Scheduler stops the instance 23:00 and starts 08:00 (Asia/Jerusalem). Compute about 8-9 USD instead of 13-14. Elastic IP bills the same running or stopped.
- Going2Eat UI stays on Amplify. Photos stay on S3 (CDN not used today).

## Estimated cost after (USD/month)
EC2 t4g.small about 8.5 (with night schedule; 13.5 always on) + EBS 30 GB about 3 + public IPv4 3.65 + snapshots/S3 about 1 + Route53 about 2 + Amplify 0.5 + tax = about 18-22. Bigger instance (t4g.medium 4 GB) adds about 10.

## Risks / trade-offs
- Single point of failure: instance or AZ failure = both apps down (add EC2 auto-recovery alarm). Accepted (demo).
- You maintain the OS: unattended security updates on, Docker disk cleanup, Caddy/Docker upgrades.
- Database is now a container on EBS: backups are our job (see above). Data loss window = last snapshot / dump.
- Deploys change: no ECS. Deploy = build/push image (as now) + SSM Run Command `docker compose pull && docker compose up -d`. Skills `dating-push` and `going2eat-deploy` must be rewritten.
- Memory pressure with 2 GB: watch; swap and easy resize mitigate.
- TLS: Caddy HTTP-01 needs DNS to point at the server first (about 1 minute of TLS error at cutover), or pre-issue certs with DNS-01. Decide at step 6.
- Cutover downtime: DB dump/restore of a tiny database = minutes; DNS switch is quick. Both apps lose Redis data (accepted).

## To-do (baby steps, approval and a report at each)
1. Confirm decisions (open questions below). Snapshot everything first (RDS manual snapshot, Redis not needed).
2. Terraform (dating repo, new `modules/vm`): EC2, EIP, SG, IAM role/profile, EBS, snapshot lifecycle (DLM), SSM parameters. Plan -> approve -> apply. Nothing changes for users.
3. Bootstrap the server (user data): Docker + Compose, swap, unattended upgrades, Caddyfile, compose file (`infra/vm/docker-compose.yml` in the dating repo, reusing the existing compose services).
4. Copy config: SSM params (from Secrets Manager / task definitions of both apps), env files. Pull images (dating ECR eu-central-1, Going2Eat ECR eu-north-1).
5. Load data: `pg_dump` from RDS, restore into the Postgres container, run migrations (`docker-migrate.sh`). Smoke-test through `curl --resolve` for each hostname: dating login as a new user, photo upload, socket.io, Going2Eat search + WebSocket.
6. Cutover: Route53 `findyouraidate.com`, `www`, `api.going2eat.food` -> Elastic IP. Verify certs, UI, logins. Scale old ECS services to 0, stop RDS (keep as fallback).
7. Soak 2-3 days. Then cleanup (with approval): dating Terraform destroy of ALB/ECS/RDS (final snapshot), Secrets Manager; Going2Eat stack in eu-north-1 (service, cluster, ALB, VPC), private zone `internal`.
8. Night schedule for the instance; backup/restore drill; rewrite deploy skills; update all docs.

## Rollback
- Until step 7: Route53 records back to the ALBs, scale ECS services back up, start RDS. Old stack untouched except scaled down.
- After step 7: recreate from Terraform + RDS final snapshot; Going2Eat from task definitions `food-backend:41/42`.

## Open questions
- t4g.small (default) vs t4g.medium.
- EC2 (default, instance role for S3/Rekognition) vs Lightsail (simpler, needs access keys).
- TLS method (Caddy HTTP-01 after DNS vs pre-issued DNS-01).
- Keep a stopped RDS as fallback during the soak (about 3 USD/month storage) - yes by default.
- Night schedule on the instance: yes by default.
