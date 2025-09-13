## Food Dialogue (LLM + Graph) — Design

### Goal

Natural ping‑pong dialogue for food search, with evidence‑only replies, fast latency, and no hallucinations.

### Orchestrator

- Deterministic graph: nlu → classify → policy → fetch → widen → reply
- Graph owns tools, budgets, retries, and caching. LLMs are used inside nodes for:
  - Slot extraction (low‑temp JSON, zod‑validated)
  - Follow‑up detection (NEW_QUERY | CORRECTION)
  - Conversational reply writer (evidence‑only)

### Inputs → Outputs

- Request: `{ sessionId, text, language?, nearMe?, userLocation? }`
- Response types:
  - `clarify`: `{ type, message, missing[], chips? }`
  - `results`: `{ type, restaurants[], meta, message, chips? }`

### Tools (deterministic)

- Geocoding: city/address → lat/lng
- Text Search (Places): geo‑first query with `{ location, radiusMeters }`
- Place Details: limited fields; enrichment (dietary/rating/types)
- Distance: Haversine
- Cache: textSearch 15m, details 24h

### Policy rules (freestyle, deterministic)

- Fetch if has anchor (city/address/userLocation) OR has filters + permission
- Near‑me default radius 2km; city 10km; widening 2→6→10km if empty
- Dietary‑only near‑me: broaden query to "restaurants" then filter after enrich

### LLM guardrails

- Slot extractor: temperature ≤0.2; timeout 2s; retries 1; fallback regex
- Reply writer: temperature ~0.6; timeout 0.9s; sees ONLY provider items; must refer to evidence ids

### Performance budgets

- Classify ≤150ms; Slots ≤2s; Fetch ≤1.8s; Reply ≤0.9s → FP ≤~3s

### API (new)

- POST `/api/food/dialogue`
  - Body: `{ text, language?, nearMe?, userLocation? }`
  - Headers: `x-session-id`
  - Returns `clarify` | `results` with evidence‑only `message` and optional `chips` (patch DTOs)

### Testing

- Contract tests for Hebrew/EN; ensure no invented venues; timing assertions; cache hit paths.
