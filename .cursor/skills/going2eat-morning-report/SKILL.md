---
name: going2eat-morning-report
description: >-
  Connects to Going2Eat (food / pizza) AWS CloudWatch and prints the morning
  report: week total searches, daily unique searches, and errors. Use when the
  user says morning report, daily report, food logs, Going2Eat searches, or
  search_audit. Never Dating AWS.
---

# Going2Eat morning report

**Food only.** Profile `pizza`, region `eu-north-1`, log group `/ecs/food-backend`.
Never `dating-*`, never `eu-central-1` dating cluster.

Config: `C:/dev/piza/angular-piza/.cursor/aws-deploy.json`

## When to run

User says **morning report**, **daily report**, **food searches this week**, or asks how many Going2Eat searches.

Run the script; do not guess counts.

```powershell
node "$env:USERPROFILE/.cursor/skills/going2eat-morning-report/scripts/morning-report.js"
```

If that path is missing, use the copy in `C:/dev/piza/angular-piza/.cursor/skills/going2eat-morning-report/scripts/morning-report.js`.

## Report (required sections)

1. **Week** — last 7 days, timezone `Asia/Jerusalem`: total `search_audit` lines (tries), unique `queryHash`, unique `sessionId`.
2. **Daily** — each day: tries, unique searches (`queryHash`), then the unique query texts with counts.
3. **QR card** — searches with `entry` = `qr` (opened from `https://app.going2eat.food/q`): count, sessions, and the query texts. If none, say none.
4. **Errors** — `search_audit` `kind` in `error` / `timeout`, plus CloudWatch `"level":"error"` and `pipeline_failed`. If none, say none.

`search_audit` started 2026-09-20. Older searches are not in this event.

## Details (when they ask to elaborate)

The summary script does not print every field. If they ask about a try, run Insights for that query / requestId and show:

query, queryHash, requestId, sessionId, clientIp, hasGps, region, gate, intent, cityText, good, kind, reason, resultCount, durationMs, timings.

Do not dump provider_job_* spam unless they ask.

Restaurant names and delivery URLs are **not** on `search_audit`.

## Empty logs

If Insights returns 0 and `describe-log-streams` on `/ecs/food-backend` is empty while ECS is running: the task is writing to a deleted stream. `aws ecs update-service --force-new-deployment` on `food-backend-service`, wait stable, then they must search **again**.

## Rules

- Confirm identity: `aws sts get-caller-identity --profile pizza --region eu-north-1`
- Write Insights JSON with Node (PowerShell quoting breaks queries)
- Do not print secrets, JWT, cookies, or full session tokens
- Query preview is already truncated in logs; paste it as-is
- This skill does not deploy and does not delete logs
