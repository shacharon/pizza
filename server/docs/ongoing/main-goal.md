## Main goal — Google Places search modes, intent, and schema alignment

### 1) The three Google Places search options

- Nearby Search

  - Purpose: find places around a point.
  - Two rank modes:
    - rankby=distance: strictly ordered by distance. Google rule: radius must be omitted; requires keyword or type.
    - rankby=prominence: popularity/relevance within a radius; radius is allowed (and recommended to bound the area).
  - Inputs: location (coords required), optional keyword/type, radius (prominence only), language, opennow, price.

- Text Search

  - Purpose: free‑text discovery (query phrase) with optional geographic bias.
  - Supports: location + radius (bias/bounding), region, language, opennow, price.
  - Notes: good for “food around a landmark” and city‑level discovery; not strictly distance‑ordered.

- Find Place (from text)
  - Purpose: identify a single venue from text (name/address) and fetch selected fields.
  - Inputs: input=textquery, fields=subset (e.g., geometry for coords, details if needed), language.
  - Notes: we often use it internally to geocode landmarks/streets to coords.

### 2) Our intention: when and why to use each

- Nearby + rankby=distance

  - Use when: user explicitly asks “near me / closest / walking distance” and we do not need a hard maximum distance.
  - Why: strict distance ordering best matches the user’s intent.
  - Rules: omit radius; require keyword or type; requires user coords (or resolved coords).

- Nearby + rankby=prominence

  - Use when: we need to keep results inside a bounded area (esp. city anchoring) and ordering by popularity/relevance is OK.
  - Why: enforces a practical geographic boundary via radius while still surfacing known places.
  - Rules: provide location + radius; add keyword from the topic when available.

- Text Search (default for discovery)
  - Use when: “topic in <city>”, “food at <landmark/street>” → discovery around a city/landmark with clear topic.
  - Why: best relevance for free‑text topics; combine with location + radius + region to behave like Maps.
  - Landmark/street: geocode “<place> <city>” to coords, then Text Search with tight radius (e.g., 500 m).
  - City: geocode city center, radius ~5 km; optional follow‑up Nearby+prominence pass to further reduce spillover.

Summary routing

- Explicit “near me/closest” → Nearby + distance.
- City + topic/dietary → Text Search (location+radius+region); optional Nearby + prominence for bounding.
- Landmark/street + topic → Text Search anchored to place coords with tight radius.
- Venue identity/details only → Find Place.

### 3) Canonical schema and coordination plan

Canonical intent (LLM output; zod‑validated)

```json
{
  "intent": "find_food",
  "provider": "google_places",
  "search": {
    "mode": "textsearch" | "nearbysearch" | "findplace",
    "query": "string",                // food/topic only (no locations)
    "target": {
      "kind": "me" | "city" | "place" | "coords",
      "city": "string?",
      "place": "string?",            // e.g., "Allenby Tel Aviv", "Marina Tel Aviv"
      "coords": { "lat": number, "lng": number }?
    },
    "filters": {
      "keyword": "string?",          // filled from topic when needed
      "type": "string?",
      "radius": number?,              // omit when rankby=distance
      "rankby": "prominence" | "distance"?,
      "language": "he" | "en"?,
      "region": "string?",
      "opennow": boolean?,
      "price": { "min": number, "max": number }?
    }
  },
  "output": { "fields": string[], "page_size": number }
}
```

Validation rules (enforced in code)

- Nearbysearch: coords required; require keyword or type; if rankby=distance → radius must be omitted.
- Textsearch: forbid rankby.
- Findplace: require query.

Coordination plan (LLM → rules → Google params)

- LLM‑first produces the canonical schema (mode/target/query/filters).
- Deterministic rules adjust mode safely (closest vs hard radius vs rich topic; city vs landmark).
- Geocode when needed:
  - City/street/landmark → Find Place with fields=geometry; append city to place for reliability.
- Parameter build:
  - Textsearch: set location+radius+region; topic in query; language/other filters as supported.
  - Nearby (prominence): set location+radius and keyword/type; language and other filters.
  - Nearby (distance): set location+rankby=distance and keyword/type; omit radius.
- Normalization & notes:
  - Map Google → domain DTO; include `meta.note` for mixed‑intent/low‑certainty or fallbacks.
- Errors:
  - Map Google statuses to 4xx/429/5xx; avoid generic 500; include a safe `meta.note` when falling back.

### Defaults we apply today

- Textsearch default radii: city=5000, place=500, coords=1500.
- Landmark/street upgrade: target.place = "<street/landmark> <city>" for geocoding.
- Nearby + distance only for explicit near‑me.

This document states the main goals and how we will achieve them while staying consistent with Google’s constraints.




