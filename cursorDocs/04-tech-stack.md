# 04 — Tech stack

Verified against `server/package.json` on 2026-10-10. Other details come from `Dockerfile`, `tsconfig.json` and `documentation/04-backend.md`.

## 1. Runtime and language
| Item | Choice |
|---|---|
| Runtime | Node 24 (`node:24-alpine`), ESM (`"type": "module"`) |
| Language | TypeScript ^5.9, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `module/moduleResolution: nodenext` |
| Dev runner | `tsx` through `nodemon` (`--enable-source-maps`), `predev` refuses a `JWT_SECRET` shorter than 32 characters |
| Build | `tsc -p .` then `tsc-alias`. Output `dist/server/src/server.js` because the shared `@api` types live in `llm-angular/shared/api`. |

## 2. Libraries
| Area | Package | Version | Used? |
|---|---|---|---|
| HTTP | express | ^5.1 | yes |
| | helmet, cors, compression | ^8.1, ^2.8, ^1.8 | yes |
| Realtime | ws | ^8.19 | yes (SSE is hand-written) |
| LLM | openai | ^6.22 | yes, the only provider in use |
| | zod | ^4.2 | yes |
| | zod-to-json-schema | ^3.25 | partly (not compatible with zod 4, so static schemas are used) |
| | langchain, @langchain/openai | ^0.3, ^0.6 | **installed, never imported** |
| Data | ioredis | ^5.9 | yes (`@types/ioredis` is not needed) |
| | @aws-sdk/client-dynamodb, lib-dynamodb | ^3.705 | provider audit only |
| | @aws-sdk/client-sesv2 | ^3.1141 | feedback mail |
| | @aws-sdk/credential-provider-ini | ^3.967 | local AWS profile |
| Auth | jsonwebtoken | ^9.0 | yes (HS256) |
| Logging | pino, pino-pretty, rotating-file-stream | ^10, ^13, ^3.2 | yes |
| | pino-http | ^11 | **unused** (request logging is custom) |
| Misc | uuid, dotenv, seedrandom | ^13, ^17, ^3 | seedrandom likely unused |
| Dev | tsx, nodemon, typescript, ts-node | | ts-node unused |
| Tests | `node:test` | built in | |

`@langchain/langgraph` is **not** installed, so the LangGraph v2 engine described in `CLAUDE.md` has no dependency here yet.

## 3. External services
| Service | Purpose | Auth / config |
|---|---|---|
| OpenAI | Every LLM stage (`gpt-4o-mini` default, per-purpose overrides) | `OPENAI_API_KEY` |
| Google Places (New) | `places:searchText`, `places:searchNearby`, place details, photos | `GOOGLE_API_KEY` |
| Google Geocoding (legacy) | City and landmark coordinates | same key, in the query string |
| Brave Search | Find Wolt / 10bis / Mishloha pages | `BRAVE_SEARCH_API_KEY` |
| Google Custom Search | Fallback for the same | `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_ENGINE_ID` |
| AWS SES v2 | Feedback email | region and addresses hard-coded |
| AWS DynamoDB | Provider audit (90-day TTL) | `PROVIDER_AUDIT_TABLE_NAME` |
| Redis | Everything shared | `REDIS_URL` |
| CloudWatch | Logs from stdout, `search_audit` and `result_action` events | via ECS |

## 4. Infrastructure and delivery
- Docker, two-stage `Dockerfile`, non-root user, health check on `/healthz`, port 3000.
- AWS: ECS Fargate behind an ALB, ElastiCache Redis, Amplify for the frontend. Deployed through the `going2eat-deploy` skill after explicit consent. See `docs/infra/*` for cost and consolidation plans.
- No CI workflow in the repo.

## 5. Conventions in force
- Layering: routes → controllers → services → repos/clients → infra (`backend.mdc`), with the violations listed in doc 03.
- zod at the boundaries. Strict structured outputs for LLM calls.
- pino structured logs with `requestId` and `traceId`.
- Timeouts and `AbortSignal` on external calls.
- Env-only secrets, fail fast on missing secrets in prod and staging.

## 6. Commands
```bash
cd server && npm run dev                          # needs .env with JWT_SECRET >= 32 chars
cd server && npx tsc --noEmit -p .                # typecheck
cd server && node --test --import tsx <file>      # one test file
cd server && npm run build && npm start
```
`npm test` currently fails (it points at tests for removed modules), and the `qa` script points at a missing file.
