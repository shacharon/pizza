# Going2Eat — Documentation

> Snapshot of the codebase as of **2026-10-05** (branch `refactor/phase-1-hygiene`, HEAD `2c11e9c`).
> Written from the actual code and config; where older docs (`docs/`, `new-docs/`, root `*.md`) disagree with the code, these files follow the code and say so.

Going2Eat (app.going2eat.food) is a natural-language food search ("food orchestrator"): users type what they want in Hebrew/English, an OpenAI pipeline classifies and structures the query, Google Places finds restaurants, results are ranked and enriched with delivery links (Wolt, 10bis, Mishloha), and an AI assistant narrates the results over SSE.

| # | Document | Read it if you want… |
|---|---|---|
| 01 | [Product](./01-product.md) | what the product does, user journeys, feature inventory, real usage numbers, KPIs, roadmap ideas |
| 02 | [System architecture](./02-system-architecture.md) | the big picture: C4 diagrams, end-to-end search lifecycle, protocols (REST/WS/SSE), data stores, ADRs, architectural risks |
| 03 | [Frontend](./03-frontend.md) | the Angular 19 app: routes, components, signal stores/facades, API contracts, PWA, i18n/RTL, tests |
| 04 | [Backend](./04-backend.md) | the Express 5 API: endpoint reference, route2 search pipeline, LLM layer, Redis/DynamoDB, auth, realtime, logging |
| 05 | [AWS infrastructure & DevOps](./05-aws-infrastructure-and-devops.md) | Amplify + ECS Fargate/ALB topology, deploy flow, config/secrets, observability, cost and cost plans |
| 06 | [Tech issues & debt](./06-tech-issues-and-debt.md) | prioritized (P0–P3) issue register with evidence and a 3-sprint remediation plan |

## Stack at a glance

| Layer | Tech |
|---|---|
| Frontend | Angular 19.2 (standalone, signals), SCSS (+ minimal Tailwind), Jest |
| Backend | Node + TypeScript, Express 5, ws (WebSocket), SSE, zod, pino |
| AI | OpenAI (gate → intent → route → assistant), per-session LLM budget |
| Data | Redis (sidecar in ECS task), DynamoDB (optional audit), SES (feedback email) |
| External | Google Places, Brave Search, Wolt / 10bis / Mishloha enrichment |
| Hosting | AWS Amplify (front), ECS Fargate + ALB in eu-north-1 (API), ECR, SSM, CloudWatch, Route 53 |

## Top priorities found (details in 06)

1. **Rotate leaked keys** — Google API key in two `new-docs/` files, Brave key in `server/test-brave-providers.js`.
2. **Fix two session-takeover bugs** — cookie auto-refresh re-signs unverified claims; `/auth/token` signs client-chosen `sessionId`.
3. **Untrack `server/logs/`** — contains raw user queries, coordinates and session IDs.
4. **Fix client-IP trust** (`X-Forwarded-For` / `trust proxy`) — rate limits and the LLM cost cap are bypassable.
5. **Get a green test baseline + real CI** — most suites fail or never run; Bitbucket pipeline is dead (repo is on GitHub).
6. **Delete the stale server copy in `llm-angular/src/`** (Phase 1 hygiene).
