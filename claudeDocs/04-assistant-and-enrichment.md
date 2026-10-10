# 04 — Assistant (AI text) and provider enrichment

## A. Assistant messages

Code: `route2/assistant/*`, plus `controllers/stream/assistant-sse/*` for the SSE alternative. `route2/narrator/` is empty.

| Type | When | Blocks results? |
|---|---|---|
| `GATE_FAIL` | gate2 says not food / uncertain | n/a (no results) |
| `CLARIFY` | missing location / missing food, near-me without GPS, NEARBY without GPS | n/a |
| `CLARIFY` (deterministic, no LLM) | TEXTSEARCH missing anchor fallback | n/a |
| `SUMMARY` early | after guards, in parallel with Google, built with `resultCount:0, top:[]` | no (1.5s cap, not awaited) |
| `SUMMARY` final, non-SATURATED | after results, deterministic template | no |
| `SUMMARY` final, SATURATED (≥15 results) | `generateAndPublishMessageOnly` LLM | **yes, awaited (≤1.2s)** |
| `GENERIC_QUERY_NARRATION` | generic query + GPS | no (deferred) |
| `SEARCH_FAILED` | pipeline error | awaited in error path |

- **Transport:** WS channel `assistant` sends `{type:'assistant', payload:{type,message,question,blocksSearch,language}}`. With `FEATURE_SSE_ASSISTANT=true`, all WS assistant paths are skipped and `GET /stream/assistant/:id` sends `meta → narration template → message|delta → done`, polling the job store every 400ms and using a Redis lock to dedupe.
- **LLM:** purpose `assistant`, default `gpt-4o-mini`, timeout 4s, temperature 0.7, `completeJSON` with a strict zod schema. The query is framed as data (prompt-injection mitigation).
- **Validation:** `enforceInvariants` fixes blocksSearch/suggestedAction per type. Format violations replace the text with the deterministic fallback (he/en/ar/ru/fr/es). A language mismatch is only logged. `generateAssistantMessage` never throws.

## B. Provider enrichment (order links)

```
orchestrator (top 10 results) ──► enrichWith{Wolt,Tenbis,Mishloha}Links  (awaited, Redis only)
   flag ENABLE_<P>_ENRICHMENT + REDIS_URL required
   per place: GET provider:<p>:<placeId>
     hit  → providers[p] = FOUND|NOT_FOUND (+url)
     miss → PENDING, SET provider:<p>:lock:<placeId> NX EX 60 → enqueue job
response goes out with PENDING
ProviderJobQueue (in-process, 1 job at a time per provider) → ProviderWorker
   resolver.resolve (20s) inside 30s job timeout, retries ×2
     Brave Search (preferred) – 4 relax levels: site:host "name" "city" → … → unquoted
     or Google CSE (only if Brave not configured)
     strategy: host allow-list + path pattern, name token match on top 5, Wolt city slug
   SETEX FOUND 14d / NOT_FOUND 7d → WS RESULT_PATCH {placeId, providers:{p:{status,url}}} → DEL lock
```

The per-provider `*.verifier.ts` classes are no-ops (`accept:true`). Large parts of `wolt/`, `tenbis/` and `provider-verifier-utils.ts` (665 lines) are dead code that only tests import.

## Issues
See `06-review-findings.md` sections B and C.
