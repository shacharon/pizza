# 01 — Backend tech stack

## Runtime
| Item | Value |
|---|---|
| Language | TypeScript 5.9 (strict), ESM (`"type": "module"`) |
| Runtime | Node.js; dev via `tsx` + `nodemon`, prod `node dist/server/src/server.js` |
| Web framework | Express 5 (`express@^5.1`) |
| Realtime | `ws` WebSocket server (search + assistant channels); optional SSE for the assistant |
| Validation | `zod@4` + `zod-to-json-schema` (LLM structured output) |
| Logging | `pino`, `pino-http`, `rotating-file-stream` |
| Security middleware | `helmet`, `cors`, `compression`, `jsonwebtoken` (JWT sessions) |

## Data / infra
| Item | Used for |
|---|---|
| Redis (`ioredis`) | Search job store, Google result cache, provider-link cache + locks, SSE assistant lock, rate limits |
| DynamoDB (`@aws-sdk/lib-dynamodb`) | Persistent data (see platform section in 02) |
| AWS SES v2 | Email |
| In-process queues | `ProviderJobQueue` (enrichment background jobs) |

## AI / LLM
| Item | Notes |
|---|---|
| `openai@6` | Main provider (`src/llm/openai.provider.ts`) |
| Anthropic provider | `src/llm/anthropic.provider.ts` (hand-written, no SDK dependency) |
| `langchain@0.3`, `@langchain/openai` | Installed but **never imported**; `src/llm/langchain/` is empty. **LangGraph is not installed** |
| Model resolution | `src/lib/llm/llm-resolver.ts` + `llm-config.ts` — per-purpose model (gate, intent, route, base_filters, post_constraints, assistant); default `gpt-4o-mini` |
| Budget | `src/lib/llm/session-model-budget.ts` — per-session model budget → `ModelBudgetExceededError` |

## External APIs
| API | Used for |
|---|---|
| Google Places API (New) — Text Search, Nearby Search | Restaurant results |
| Brave Search API (preferred) / Google Custom Search (fallback) | Finding Wolt / 10bis / Mishloha deep links |

## Testing
- `node:test` + `tsx` (`node --test --import tsx <file>`), tests next to code (`__tests__/`, `*.test.ts`) and in `server/tests/`.
