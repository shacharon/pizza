### New Google Places Flow — Architecture (LLM-first, SOLID, isolated)

This document defines the new, fully isolated Google Places flow. It introduces a new API route and a new folder with no reuse of the old code. The design is LLM-first, context-aware, SOLID/OOP-friendly, and aligned to the provided Google Places schema.

### What’s great

- Clear separation: intent → validate → resolve target → choose strategy → build params → search → normalize → persist.
- Strong DTOs + zod contracts and a strategy pattern per mode.
- Context store with pluggable backend and TTL — solid continuity for "me/nearby".
- Thoughtful metrics, retries, timeouts, and projection of output.fields.

### Gaps & refinements (encoded into Validation + Query Builder)

- Google rules/quirks
  - nearbysearch requires coords and one of keyword or type. If rankby=distance, omit radius and require keyword or type.
  - textsearch ignores rankby; do not pass it.
  - findplace: if the user wants details (e.g., website, opening_hours), ensure fields include them; otherwise Google returns a thin result.
  - opennow only applies to nearbysearch and (in newer APIs) sometimes textsearch; confirm mapping to avoid no-op flags.
  - region affects geocoding bias, not hard filtering; keep expectations clear in logs.
- Error handling & quotas
  - Distinguish user vs system errors: REQUEST_DENIED (key restrictions), OVER_QUERY_LIMIT, INVALID_REQUEST, ZERO_RESULTS.
  - Map to: 400 (bad input), 429 (rate/quotas), 502/503 (upstream), 504 (timeout). Include a redacted requestId.
  - Add a circuit-breaker (open for 30–60s on repeated upstream failures) to protect quota and latency SLOs.
- Security & key hygiene
  - Enforce server-side only API key; never accept a key in request.
  - Add allow-list on language (['he','en'] initially) and sanitize query before logs.
  - Per-IP / per-session rate limit (e.g., 10 req/min) + burst.
- Config & defaults (tighten)
  - Per-mode timeouts may differ (findplace often faster; nearby/textsearch can be slower).
  - Make PLACES_MAX_RADIUS_METERS and ALLOWED_TYPES explicit and validated at boot (zod on process.env).

---

## High-level goals

- New dedicated route and folder, no reuse of existing NLU/graph code paths.
- LLM-first intent resolution that returns the canonical schema.
- Deterministic chain with strict validation and Google-specific rules.
- Testable, replaceable components (SOLID), with a strategy per search mode.
- Persist minimal, relevant context for better UX (e.g., last location).

---

## New API Route

- Path: POST /api/places/search
- Controller: server/src/controllers/places/places.controller.ts
- Router: server/src/routes/places.routes.ts (mounted from the main router)

Request (LLM-first; server prompts LLM if only text is provided):

{
"text": "vegan pizza near me",
"language": "he",
"sessionId": "abc123",
"userLocation": { "lat": 32.08, "lng": 34.78 },
"schema": null
}

Alternatively, a client can directly send the structured schema (see below) in schema to skip LLM.

Response (normalized, projected by output.fields):

{
"query": { "mode": "nearbysearch", "language": "he" },
"restaurants": [
{
"placeId": "...",
"name": "...",
"address": "...",
"rating": 4.3,
"userRatingsTotal": 123,
"priceLevel": 2,
"photoUrl": "...",
"location": { "lat": 32.08, "lng": 34.78 },
"website": "https://...",
"openNow": true
}
],
"meta": { "source": "google", "mode": "nearbysearch", "nextPageToken": null, "cached": false, "tookMs": 532 }
}

---

## Canonical Schema (LLM output)

{
"intent": "find_food",
"provider": "google_places",
"search": {
"mode": "textsearch | nearbysearch | findplace",
"query": "free text (optional in nearby)",
"target": {
"kind": "city | place | coords | me",
"city": "string (optional)",
"place": "string (optional, e.g. 'Azrieli Tel Aviv' or 'Marina Tel Aviv')",
"coords": { "lat": 0, "lng": 0 }
},
"filters": {
"type": "restaurant | cafe | bar | ...",
"keyword": "pizza | vegan | gluten free | ...",
"price": { "min": 0, "max": 4 },
"opennow": true,
"radius": 1500,
"rankby": "prominence | distance",
"language": "he | en | ...",
"region": "il"
}
},
"output": {
"fields": [
"place_id","name","formatted_address","geometry",
"opening_hours","rating","user_ratings_total",
"price_level","website","photos"
],
"page_size": 20
}
}

---

## Folder structure (new, isolated)

server/src/
routes/
places.routes.ts
controllers/
places/
places.controller.ts
services/
places/
orchestrator/
places.langgraph.ts # LangGraph chain (LLM-first)
intent/
places-intent.service.ts # LLM → schema (zod-validated)
places-intent.schema.ts # zod schemas
query/
query-builder.service.ts # schema → Google params
strategy/
search-strategy.ts # interface
textsearch.strategy.ts
nearbysearch.strategy.ts
findplace.strategy.ts
client/
google-places.client.ts # fetch + retries + timeouts
normalize/
response-normalizer.service.ts # Google → domain; field projection
context/
context-store.ts # per-session store (pluggable)
models/
types.ts # domain DTOs
config/
places.config.ts # env + defaults (zod-validated)

---

## Orchestration (LangGraph chain)

Chain nodes (pure, stateless classes; typed I/O):

- IntentNode → calls LLM, returns structured schema.
- ValidateNode → zod validation + Google-specific rule checks.
- LocationNode → resolves target to coords when needed (me/city/place → coords).
- StrategyNode → select textsearch | nearbysearch | findplace (from schema; validate feasibility).
- QueryNode → build Google parameters per strategy.
- SearchNode → execute via strategy (client with timeouts/retries).
- NormalizeNode → field projection, page sizing, domain mapping.
- PersistNode → save minimal context (last target, language, last mode).

State keys (example): rawInput, context, schema, validated, resolvedTarget, mode, params, rawResponse, normalized, meta.

---

## Components (low level)

### Intent (LLM-first)

- LangChain JSON mode with zod schema for strict output.
- Prompt guidelines:
  - Use nearbysearch if explicit nearby/coords/me.
  - Use findplace for specific venue identification.
  - Use textsearch for discovery (e.g., "vegan pizza in Tel Aviv").
- Return: schema + confidence + rationale (for trace logs).

### Validation (zod + business rules)

- If mode=nearbysearch: require coords and one of keyword or type.
- If rankby=distance: omit radius and assert keyword or type present.
- If mode=textsearch: ignore rankby.
- If mode=findplace: require query and ensure output.fields include requested details (e.g., website/opening_hours) when needed.
- Allow-list language (e.g., he|en) and normalize region.

### Location resolver

- Target.kind me → session context (or request-provided userLocation).
- Target.kind city|place → geocode to coords (best-effort; bias with region).
- Target.kind coords → accept as-is (validate bounds).
- Default radius: 2000m (me/coords), 10000m (city/place) unless specified.

### Strategy selection

- Taken from schema; fallback only if validation fails.
- Implemented via Strategy interface: execute(params): Promise<GoogleResponse>.

### Query builder

- textsearch: build query from filters.keyword + search.query; pass location/radius only if coords exist; pass language/region/opennow/price where supported.
- nearbysearch: require location; use keyword or type; support rankby; omit radius for distance.
- findplace: input=textquery; map output.fields → Google fields list.

### Client

- Fetch wrapper with per-mode timeouts, retries (backoff), and structured errors.
- Never logs API key. Includes reqId/sessionId in structured logs.

### Normalizer

- Map Google fields → domain; compute photoUrl from reference if key exists.
- Apply output.fields projection and page_size limit.
- Emit meta with source, mode, nextPageToken, tookMs, cached.

### Context store

- Interface with in-memory default; pluggable (e.g., Redis) + per-session TTL.
- Persist: last target, last mode, last language, last successful coords.

---

## Error handling & quotas

- Map Google statuses:
  - REQUEST_DENIED → 502/503 (upstream/config), with guidance in logs.
  - OVER_QUERY_LIMIT → 429.
  - INVALID_REQUEST → 400.
  - ZERO_RESULTS → 200 with empty list.
- Timeouts → 504; include redacted requestId.
- Circuit-breaker: open for 30–60s on repeated upstream failures.

---

## Security & key hygiene

- API key only on server; never accept from client.
- Rate limit per IP/session (e.g., 10 req/min with burst).
- Sanitize user strings before logs.
- Enforce language allow-list; ignore unsupported values.

---

## Config & defaults

server/src/config/places.config.ts (zod-validated):

- GOOGLE_API_KEY (required)
- PLACES_TEXTSEARCH_TIMEOUT_MS (default 6000)
- PLACES_NEARBY_TIMEOUT_MS (default 6000)
- PLACES_FINDPLACE_TIMEOUT_MS (default 4000)
- PLACES_RETRY_ATTEMPTS (default 2)
- PLACES_RETRY_BACKOFF_MS (default [0,300])
- PLACES_DEFAULT_RADIUS_METERS (default 2000)
- PLACES_DEFAULT_CITY_RADIUS_METERS (default 10000)
- PLACES_MAX_RADIUS_METERS (default 30000)
- PLACES_PAGE_SIZE (default 20)
- ALLOWED_TYPES (e.g., restaurant,cafe,bar,...) validated at boot
- ALLOWED_LANGUAGES (e.g., he,en)

---

## Metrics & logging

- Count by mode, success/fail, timeout, retries, ZERO_RESULTS.
- Log chosen mode, resolved target kind, coords, radius, tookMs, resultCount.
- Do not log full responses; sample fields only.

---

## Testing

- Unit: intent service (prompt → schema), validation, query builder, strategies.
- Integration: strategy → client with mocked Google.
- E2E: /api/places/search with mocked LLM and Google; language and region paths.
- Contract tests: zod schemas for request/response.

---

## Implementation checklist

- [ ] Add route and controller.
- [ ] Implement LangGraph chain and nodes.
- [ ] Implement intent service (LLM) + zod validation.
- [ ] Implement location resolver (me/city/place/coords).
- [ ] Implement strategies (textsearch/nearbysearch/findplace).
- [ ] Implement query builder with Google rules enforced.
- [ ] Implement client with timeouts/retries and structured errors.
- [ ] Implement normalizer with projection and page sizing.
- [ ] Add context store (in-memory; pluggable).
- [ ] Add config with zod validation.
- [ ] Add logging/metrics and rate limiting.
- [ ] Add tests (unit/integration/E2E).

---

## Notes

- This flow is entirely separate from legacy NLU/routes; it can be toggled by router mounting.
- Future: add other providers by adding new strategies and clients under the same orchestrator.
