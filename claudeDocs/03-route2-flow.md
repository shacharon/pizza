# 03 — route2 search flow (low level)

route2 = the production search pipeline, `server/src/services/search/route2/`.
Entry: `searchRoute2()` in `route2.orchestrator.ts:638`.

## 1. From HTTP to pipeline

```
Client ──POST /api/v1/search (mode=async)──► search.controller.ts
          │  creates requestId, job in Redis job store (non-fatal if Redis fails)
          │  replies 202 { requestId, resultUrl }            (controller.ts:126)
          ▼
   executeBackgroundSearch()  (search.async-execution.ts)
          │  job RUNNING 10% → WS progress "accepted"
          │  job RUNNING 50% → WS progress "route_llm"   (published BEFORE the pipeline runs)
          ▼
   searchRoute2(request, ctx)   ── withTimeout(PIPELINE_TIMEOUT_MS = 45s) ──► searchRoute2Internal
          ▼
   result → job store setResult + DONE_SUCCESS | DONE_CLARIFY | DONE_STOPPED | DONE_FAILED
          → WS event: ready | clarify | ready(stop) | error
Client ◄── WS "search:<requestId>" channel  /  GET resultUrl (polling)
```

A sync mode also exists (`controller.ts:140` calls `searchRoute2` inline).

## 2. Pipeline stages (`searchRoute2Internal`)

```
 0. setup ─ sanitizeQuery (hash/len only), audit init, detectQueryLanguage (deterministic)
           resolveUserRegionCode (best effort → 'OTHER' on failure)
 1. GATE2 (LLM) ──────────── STOP ──────► GATE_STOP assistant msg + terminal → return
           │                └ ASK_CLARIFY ► CLARIFY → return
           ▼ CONTINUE
 2. INTENT (LLM) → route: TEXTSEARCH | NEARBY | LANDMARK, language, regionCandidate, cityText
           ├ early TEXTSEARCH location guard (may CLARIFY)
           ├ checkGenericFoodQuery ("what to eat") → flag
           ├ near-me check: near-me phrase without GPS → CLARIFY (ask location)
           └ applyNearMeRouteOverride (near-me + GPS → NEARBY)
 3. early routing context: region (intent.regionCandidate → device region → 'IL', sanitized),
                           providerLanguage (he/en/ar/ru/fr/es, else 'he'), uiLanguage
 4. ROUTE_LLM (LLM) → mapping: textSearch {textQuery, bias, cityText} | nearbySearch {keyword, radius} | landmark plan
           ├ NEARBY without userLocation → CLARIFY
           └ TEXTSEARCH anchor check: cityText | bias | GPS
                 • no anchor & not near-me → continue, attach "where?" question to the response
                 • no anchor & near-me     → CLARIFY (3 fallbacks, ends deterministic)
 ─── all guards passed ───
 5. fire in parallel (none awaited yet):
       a. base_filters LLM   (openState/openAt/openBetween, price)  → default on error
       b. post_constraints LLM (open, price, kosher, gluten-free, accessible, parking) → default on error
       c. early SUMMARY assistant LLM (timeout 1.5s, results never wait for it)
       d. GOOGLE MAPS stage (text / nearby / landmark handler, Redis cache)
 6. BARRIER
       await base_filters → resolveFilters() → finalFilters (region/lang sanity check vs early ctx)
       await Google
       await post_constraints
 7. POST-FILTER  applyPostFilters(results, merged filters)  (open-now, price, kosher, GF, city…)
 8. RANKING      resolveRankingWeights(intent, filters, constraints) → applyBaselineRanking
                 score = rating + reviewSocial + distance + open + priceFit (weighted); reorders, never removes
 9. PROVIDER ENRICHMENT  top MAX_RESULTS_TO_ENRICH (10): Wolt + 10bis + Mishloha in parallel
                 Redis cache hit → FOUND/NOT_FOUND; miss → PENDING + background job → later WS RESULT_PATCH
10. place-details policy (decision + log only, no API call yet)
11. BUILD RESPONSE (orchestrator.response.ts)
       final assistant SUMMARY: deterministic fallback text, or MESSAGE_ONLY LLM if SATURATED (awaited!)
       optional GENERIC_QUERY_NARRATION (deferred)
       WS: status completed + SEARCH_RESULTS {results}
       return SearchResponse (HTTP assist.message is empty; real text comes over WS)
 error → handlePipelineError: classify → WS terminal SEARCH_FAILED + SEARCH_FAILED assistant → rethrow
 finally → drain base_filters / post_constraints promises
```

## 3. LLM calls per successful search

| # | Call | Blocks results? |
|---|---|---|
| 1 | gate2 | yes (sequential) |
| 2 | intent | yes (sequential) |
| 3 | route_llm | yes (sequential) |
| 4 | base_filters | yes (barrier) |
| 5 | post_constraints | yes (barrier) |
| 6 | early SUMMARY | no |
| 7 | MESSAGE_ONLY (SATURATED only) | **yes, up to 1.2s** |

The critical path is 3 sequential LLM calls (gate2 → intent → route_llm), then max(Google, base_filters, post_constraints). Google cannot start before route_llm.

## 4. Terminal outcomes

| Outcome | Where | Job status | WS search channel |
|---|---|---|---|
| Results | buildFinalResponse | DONE_SUCCESS | `SEARCH_RESULTS` + `ready` |
| Not food | handleGateStop | DONE_STOPPED | `GATE_STOP` + `ready(stop)` |
| Need info | guards / near-me / nearby | DONE_CLARIFY | `CLARIFY` + `clarify` |
| Error | handlePipelineError | DONE_FAILED | `SEARCH_FAILED` + `error` |
| Timeout 45s | withTimeout in searchRoute2 | DONE_FAILED | `error` |

Note: clarify does **not** resume the same search. The client sends a new query (product rule "clarification resumes the same search" is not implemented in route2).

## 5. Observations on the flow (details in 06)
- The controller's 30s `AbortController` is put on `ctx.signal`, but route2 only reads `ctx.abortSignal` (`types.ts:27`), which it overwrites with its own controller. So the 30s timeout never cancels anything. The real limit is 45s (`route2.config.ts:6`).
- The "route_llm 50%" progress event is fake. It is sent before the pipeline starts (`search.async-execution.ts:~60-83`).
- Debug-stop responses after gate2/intent are built with many `as any` casts (`route2.orchestrator.ts:167-244`).
- `wsManager` is imported from `server.ts` (`route2.orchestrator.ts:23`), a service locator with a circular import. Tests override it via `deps`.
- `buildFinalResponse` publishes `SEARCH_RESULTS` over WS **and** the async controller publishes `ready` and stores the result, so the same results are delivered twice.

---

## 6. Stage internals (reference)

All LLM calls go through `OpenAiProvider.completeJSON`: OpenAI structured outputs (`strict:true`) with a **hand-written JSON schema**, then a zod `parse`. Default model `gpt-4o-mini`; per-purpose env override (`GATE_MODEL`, `INTENT_MODEL`, `BASE_FILTERS_MODEL`, `ROUTE_MAPPER_MODEL`, `ASSISTANT_MODEL`). Each call consumes one unit of the session budget (40/day). The query is wrapped with `frameSearchAsData(truncateWordsForLlm(q))`.

| Stage | File | LLM (prompt ver, temp, timeout) | Output | On failure |
|---|---|---|---|---|
| Gate2 | `stages/gate2.stage.ts` | `gate`, `gate2_v9`, t=0. Regex pre-check for profanity first | `foodSignal NO/UNCERTAIN/YES` → `route STOP/ASK_CLARIFY/CONTINUE`, `language` (always `'other'`) | 1 retry on timeout, then the **pipeline throws** |
| Intent | `stages/intent/intent.stage.ts` | `intent`, `intent_v4`, t=0.1 | `route TEXTSEARCH/NEARBY/LANDMARK`, reason, language, regionCandidate, cityText, landmarkText | TEXTSEARCH, conf 0.3, region IL |
| Route mapper — text | `route-llm/textsearch.mapper.ts` | `routeMapper`, `textsearch_mapper_v2` | `{textQuery ≤80, region, language, cityText}`; `bias` always undefined | deterministic: query minus open words, plus city |
| Route mapper — nearby | `route-llm/nearby.mapper.ts` | default model, 4.5s hard-coded | `{location, radiusMeters, keyword}` | regex distance (default 2000m) |
| Route mapper — landmark | `route-llm/landmark.mapper.ts` | `routeMapper`, `landmark_mapper_v3` | `{geocodeQuery, afterGeocode, radius, keyword}` | **throws (no fallback)** |
| base_filters | `shared/base-filters-llm.ts` | `baseFilters`, `base_filters_v1` | openState/openAt/openBetween, priceIntent, priceLevels | all-null defaults |
| post_constraints | `stages/post-constraints/*` | default model, 4.5s | openState…, priceLevel, isKosher, isGlutenFree, accessible, parking | all-null defaults |

### Google stage (`stages/google-maps/*`)
- **Text search:** `POST places:searchText`, `languageCode` **he or en only**, `regionCode`. With a cityText, it calls the legacy Geocoding API, applies a 20km bias, then a hard distance filter at 12/20/30km tiers until at least 5 results remain. Up to 20 results, 8s timeout, 3 tries on 429/5xx.
- **Nearby:** a generic keyword uses `searchNearby` (type=restaurant, DISTANCE rank); otherwise `searchText` with a rectangle restriction.
- **Landmark:** geocode → `searchNearby` (keyword ignored) or `searchText` with bias.
- **Field mask** includes rating, hours, phone and website, so every call is Enterprise SKU.
- **Cache:** L0 in-flight dedupe → L1 memory (500 entries, ≤60s) → L2 Redis (900s; 300s if the query contains "open/now"; 120s for empty results). Keys are md5 of region+lang+query+bias+fieldmask.

### Filtering (all after Google; nothing is sent to Google as a filter)
`post_constraints` wins over `base_filters` in the merge. `post-results.filter.ts` then applies, in order:
1. openState (unknown is kept)
2. priceLevelRange (never set, so never runs)
3. price re-sort (later overwritten by ranking)
4. not-kosher name drop
5. `list-shape` dish/city regex drops (skipped if they would empty the list)
6. gluten-free soft hints

Never applied: minimum rating, kosher=true, accessible/parking, post_constraints `priceLevel`.

### Ranking (`ranking/*`)
- Baseline weights: rating .45, reviews/social .25, distance .15, open .10, priceFit .05.
- Boosts: +.06 open when openState is set, +.05 price when there is a price signal, +.06 distance for NEARBY/near-me. Weights are renormalized to sum to 1.
- Distance is always measured from the user GPS (0.5 if none), never from the city/landmark anchor. Google's relevance order is discarded.

### Language / region
- Language is decided in 5 places: gate (always `other`), intent LLM, deterministic script detector, intent fallback, early-context/resolver.
- Google receives only he/en, so Arabic/Russian users get English place data.
- Device region is `IL|OTHER`. Region priority: intent candidate → device → IL, then sanitized.
