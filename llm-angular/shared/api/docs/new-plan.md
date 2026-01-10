# Restaurant Finder Documentation Package

This file includes three main sections:

1. Architecture Overview
2. Technical Implementation Guide
3. Product Requirements

---

## 1. Architecture Overview

# Restaurant Finder — High-Level Architecture

## Purpose

Deliver accurate, real-time restaurant search results (names, addresses, price levels, ratings, optional contact info) without maintaining a persistent DB, leveraging LLM for intent parsing and Google Places/OSM for ground-truth data.

---

## Core Pipeline (Steps 1–5)

### 1. **Extract DTO (Intent → Structured Query)**

- Input: free-text user request (e.g., _“Pizza in Ashkelon under 60 ILS”_).
- LLM role: **slot filling only**, not data generation.
- Output: strict DTO:
  ```json
  {
    "city": "Ashkelon",
    "type": "pizza",
    "maxPrice": 60,
    "language": "he"
  }
  ```

### 2. **Build Query**

- From DTO → query string for external data source.
- Example: `pizza in Ashkelon`.
- Language and filters applied (e.g., kosher, openNow).
- **Primary Source:** Google Places Text Search.
- **Fallback:** OSM/Overpass if quota exhausted or API unavailable.

### 3. **Cache Layer**

- Purpose: reduce latency and costs, prevent API quota exhaustion.
- Key composed from normalized DTO (city, type, maxPrice, language, filters).
- TTL: 10–30 minutes for lists; 1–3 hours for place details.
- Optional: stale-while-revalidate pattern.

### 4. **External Data Fetch (Text Search)**

- Call Google Places Text Search API with query.
- Returns up to ~20 results per page:
  - `name`
  - `formatted_address`
  - `geometry.location`
  - `rating`
  - `price_level` (when available)
  - `place_id` (for details)

### 5. **Basic Mapping**

- Transform Google’s verbose schema → clean JSON for UI.
- Fields included:
  - `name`
  - `address`
  - `rating`
  - `placeId`
  - `location`
- Place Details (phone, website, hours) fetched either:
  - **On-demand** (user clicks → details).
  - Or **batch top N** (3–10) in parallel if richer UX required.

---

## Flow Diagram (Simplified)

```
User → LLM (DTO) → Cache? → Google Places Text Search
                    ↓            ↓
                 (hit)        Results (20)
                    ↓            ↓
                  Return    Basic Mapping (10)
                               ↓
                       Optional Details (N)
                               ↓
                            JSON → UI
```

---

## Notes

- OSM (OpenStreetMap) may serve as fallback, but lacks rich metadata (phone/hours).
- Performance budget:
  - LLM: 500–2000ms (only if free-text).
  - Places Text Search: 150–600ms.
  - Place Details (topN parallel): 200–700ms.
- Always attribute Google data per licensing requirements.

---

## 2. Technical Implementation Guide

# Restaurant Finder — Technical Implementation Guide

## Stack

- **Backend**: Node.js/TypeScript, Express/Fastify
- **Cache**: Redis (preferred), in-memory fallback for dev
- **External APIs**:
  - Google Places API (Text Search + Place Details)
  - OSM/Overpass (fallback)

---

## Step-by-Step Implementation

### Step 1: DTO Extraction

- **LLM Prompt** (system):
  ```
  You must return ONLY valid JSON matching:
  { "city": string, "type": "pizza|sushi|burger|other", "maxPrice"?: number, "language"?: string }
  Do not invent restaurant data.
  ```
- Output validated with Zod schema.

### Step 2: Build Query

```ts
function buildQuery(dto: DTO): string {
  if (dto.type) return `${dto.type} in ${dto.city}`;
  return `restaurants in ${dto.city}`;
}
```

### Step 3: Cache

```ts
function cacheKey(dto: DTO, page = 1) {
  return `restaurants:v2:${dto.language ?? "he"}:${normalize(dto.city)}:${
    dto.type ?? "any"
  }:${dto.maxPrice ?? "any"}:page=${page}`;
}
```

- **TTL**: 15 minutes (lists), 3 hours (details).
- Use `Promise.allSettled` for parallel writes.

### Step 4: Text Search

```ts
async function textSearch(query: string, language = "he") {
  const { data } = await axios.get(
    "https://maps.googleapis.com/maps/api/place/textsearch/json",
    { params: { query, language, key: GOOGLE_KEY } }
  );
  return data;
}
```

### Step 5: Mapping

```ts
function mapBasic(r: any) {
  return {
    name: r.name,
    address: r.formatted_address,
    rating: r.rating ?? null,
    placeId: r.place_id,
    location: r.geometry?.location ?? null,
  };
}
```

### Place Details (Optional)

```ts
async function fetchDetails(placeId: string, language = "he") {
  const { data } = await axios.get(
    "https://maps.googleapis.com/maps/api/place/details/json",
    {
      params: {
        place_id: placeId,
        key: GOOGLE_KEY,
        language,
        fields:
          "name,formatted_address,geometry/location,rating,international_phone_number,website,opening_hours,url",
      },
    }
  );
  return data.result;
}
```

### Pagination

- Google Places returns `next_page_token`.
- Constraint: must wait ~2s before using token.
- Max 3 pages (~60 results).
- Cache each page separately.

---

## Data Shapes

### Request DTO

```ts
type FoodQueryDTO = {
  city: string;
  type?: "pizza" | "sushi" | "burger" | "other";
  maxPrice?: number;
  language?: string;
};
```

### Restaurant

```ts
type Restaurant = {
  name: string;
  address: string;
  rating?: number | null;
  phone?: string | null;
  website?: string | null;
  openNow?: boolean | null;
  mapsUrl?: string | null;
  placeId: string;
  location?: { lat: number; lng: number } | null;
};
```

### Response

```ts
type RestaurantsResponse = {
  query: FoodQueryDTO;
  restaurants: Restaurant[];
  meta: {
    source: "google" | "osm";
    cached: boolean;
    nextPageToken?: string | null;
    enrichedTopN: number;
  };
};
```

---

## Performance Considerations

- Use parallel calls (`Promise.allSettled`) for Place Details.
- Apply timeout (e.g., 1200ms) for external calls.
- Consider `stale-while-revalidate` pattern.

---

## OSM Integration

- **Nominatim** for search:
  ```
  https://nominatim.openstreetmap.org/search.php?q=pizza+ashkelon&format=json
  ```
- **Overpass** for structured queries:
  ```
  [out:json];
  area[name="Ashkelon"]->.a;
  node["amenity"="restaurant"]["cuisine"="pizza"](area.a);
  out;
  ```
- Less metadata than Google, but free.

---

## 3. Product Requirements

# Restaurant Finder — Product Requirements (Dialogue-Derived)

## Goal

Enable a conversational flow where users can naturally request food, and the system seamlessly translates their intent into actionable results.

---

## Conversational Principles

### Anchors

- **Minimum for fetching results:**
  - Must have `city` (location anchor).
  - Plus at least one of: `type` (pizza, sushi, burger, …) or `maxPrice`.
- Once anchors exist → **fetch immediately** (do not ask further clarifications).

### Clarifications

- If `city` is missing → ask once: _“Which city are you in?”_
- If type and price are both missing → ask preference: _“Do you want pizza, sushi, or burgers?”_

---

## Dialogue Examples

### Example 1 — Minimal Anchor

- User: _“I want a pizza in Ashkelon under 60 ILS”_
- System: Immediately fetch 10 results and display.

### Example 2 — Missing City

- User: _“I want Italian food”_
- System: _“Which city should I search in?”_

### Example 3 — Vague Intent

- User: _“I want to eat something tasty”_
- System: _“What do you feel like — pizza, sushi, or burgers?”_

---

## UX Principles

1. **First Response = Results**
   - Once anchors are satisfied, system shows up to 10 restaurants immediately.
2. **Progressive Disclosure**
   - Show `name + address + rating` initially.
   - On user click → reveal phone, website, hours (via Place Details).
3. **Pagination**
   - “Show more” loads next 10 (page 2, then page 3).
4. **Cache Awareness**
   - Repeat queries within 10–30 min should return instantly.

---

## Non-Functional Requirements

- Latency target:
  - Anchor fulfilled → ≤ 1.5s for first 10 results.
- Accuracy:
  - No hallucinations; only Google/OSM sources.
- Scalability:
  - Support 100s of concurrent queries with caching.
- Transparency:
  - Display “Powered by Google” attribution when Google data is shown.

---

## Product MVP Definition

- Conversational interface for food search.
- LLM used **only** for intent normalization.
- Google Places for addresses, with caching.
- Minimal UI: list of 10 restaurants + “show more” + “details”.
