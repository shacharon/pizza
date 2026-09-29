---
name: going2eat-deploy
description: >-
  Deploy Going2Eat (pizza / angular-piza / cook / food-backend) to AWS. Use when
  the user says push to aws, cook, deploy, or upload Going2Eat. Git push main,
  Docker API image, ECR, ECS, Amplify. Never dating resources.
---

# Going2Eat deploy (pizza only)

Same flow as personal skill `going2eat-cook`. Bind to **this repo only**.

## Required reading (in order)

1. This skill
2. Shared HOW: `~/.cursor/skills/deploy-aws-app/SKILL.md`
3. [`.cursor/aws-deploy.json`](../aws-deploy.json)

## Cook when they say `push to aws`

1. Consent (target summary). Wait for yes.
2. Git: commit intended files if shipping; `git push` to **main** (no force). Frontend = Amplify on that push.
3. Docker: **only** `server/Dockerfile` → ECR `food-backend` (SHA + `latest`). There is no UI image.
4. ECS: new task definition → `food-backend-service` on `food-cluster` → wait stable.
5. Confirm Amplify job SUCCEED; CloudWatch `/ecs/food-backend`; URLs in `aws-deploy.json`.

## Hard rules

- Profile `pizza`, region `eu-north-1`
- Never dating ECS/ECR/VPC names
- Never `--force` to main
- Never desiredCount 0 unless they ask
- Ask consent before push; shell hook may ask again on `docker push` / `ecs update-service`

## Typical user phrases

- "push to aws" / "cook" / "deploy backend" / "deploy frontend" / "upload to aws"
