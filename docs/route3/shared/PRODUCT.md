# Going2Eat Route3 — Product Contract

**Story:** R3-001 (Sprint 0)
**Status:** Draft for approval (revision 2, after independent review of `aea00b6`)
**Scope of this file:** what Route3 must do for the user. It is not a design or an implementation plan.

This document has four parts. Keep them apart:

1. **Verified existing behavior.** What Route2 and the current UI do today, read from the code. Paths are under `server/src/` or `llm-angular/src/app/`. `R2/` means `server/src/services/search/route2/`.
2. **Decisions.** Product decisions already made, with their effect on older documents.
3. **Approved requirements.** What Route3 must deliver.
4. **Open questions.** Every item marked **OPEN** is undecided. Nothing in part 4 is approved.

---

## 1. Verified existing behavior (Route2 + current UI)

Facts were found by reading the code at `origin/main` (`3dcb218`). Nothing was run.

### 1.1 Search pipeline

- **Entry:** `POST /api/v1/search` (sync, or async with `?mode=async`) in `controllers/search/search.controller.ts`.
  - Results: `GET /api/v1/search/:requestId/result`.
  - WebSocket: `/ws`.
  - Assistant SSE: `GET /api/v1/stream/assistant/:requestId`.
- **Order of execution** in `R2/route2.orchestrator.ts`:
  1. Deterministic language detection, then device-region resolution.
  2. Gate2, followed by its STOP and ASK_CLARIFY guards.
  3. Intent LLM.
  4. Early location guards (lines 261–272): the text-search location guard and the "near me" without-location check. Also the generic-food check and the "near me" route override.
  5. Early routing context (region + language), then the route-LLM.
  6. Later location guards (lines 307–371): the NEARBY-needs-location guard and the text-search anchor check.
  7. After all guards pass, these start **in parallel** (lines 376–416):
     - `base_filters` LLM
     - `post_constraints` LLM
     - an early SUMMARY assistant LLM, which does not block results
     - Google Maps
  8. Barrier: await `base_filters`, resolve filters, await Google, then await `post_constraints`.
  9. Deterministic post-filters.
  10. Ranking. It reorders and scores; it removes nothing.
  11. Wolt / 10bis / Mishloha link enrichment.
  12. A Place Details decision (a decision only, with no API call).
  13. `buildFinalResponse`.
- **DTOs:** the response is `SearchResponse` (`services/search/types/search-response.dto.ts`). Each result is a `RestaurantResult` (`services/search/types/restaurant.types.ts`).
- The code has no `route3` flag or folder.

### 1.2 Clarification

- Gate2 returns `CONTINUE`, `ASK_CLARIFY` or `STOP` (`R2/stages/gate2.stage.ts`).
- Location guards can also return a clarify. Examples: "near me" without GPS, or NEARBY without a location.
  - A text search with no anchor and no "near me" does **not** stop. It continues and attaches a location question.
- A clarify reaches the client as `assist.type='clarify'` in HTTP, a WS `CLARIFY` terminal and an assistant message.
- The UI shows clarification as **choice buttons only** (`clarification-block.component.html`).
  - Choosing a button re-runs the **same query** with the choice's `constraintPatch` (`facades/search.facade.ts`).
  - A free-text answer is just a new, unrelated search.

### 1.3 Session, context and storage

- **Each search is stateless.** `Route2Context` (`R2/types.ts`) holds no prior query, constraints or results.
- **`sessionId`:**
  - It is used for auth, ownership and WS routing.
  - `resolveSessionId` prefers the JWT session, then `request.sessionId`, then the literal `'route2-session'` (`R2/orchestrator.helpers.ts:150-155`).
  - It is also the key for the region session cache (see §1.6). That cache is never active.
- **`clearContext`:**
  - The request DTO accepts it (`services/search/types/search-request.dto.ts`). No server code reads it.
  - On the client it is always `false`. `inputStateMachine.submit()` clears `intentReset` before `search()` reads it (`services/input-state-machine.service.ts`, `facades/search.facade.ts:213-228`).
- **No conversation store.** `SessionContext.conversationHistory` and `CONVERSATION_ENGINE` are unused leftovers.
- **Redis** holds: async jobs and request state, auth sessions, WS tickets, Google caches, rate limits and LLM budget counters. It holds no conversation data.
- **Client:**
  - `conversationId`, locale, region and recent searches are kept in `sessionStorage` (`state/session.store.ts`).
  - The UI has no "New Search" control. The clear (X) button resets the store.
  - Each submit clears the previous results and assistant messages.

### 1.4 Assistant

- The assistant is **one-way narration**, not a chat.
  - Message types: `GATE_FAIL`, `CLARIFY`, `SUMMARY`, `SEARCH_FAILED`, `GENERIC_QUERY_NARRATION` (`R2/assistant/assistant.types.ts`).
  - SSE sends a fixed "searching" template, then the SUMMARY.
- **No reply path:**
  - There is no reply endpoint.
  - The WS protocol defines client messages `action_clicked` and `ui_state_changed`. The server only logs them (`infra/websocket/websocket-manager.ts:294-313`).
  - The live page does not send them (`search-page.component.ts:630`, "Future: Send action_clicked").
- **UI:**
  - The page has one composer, the search bar.
  - The assistant appears as a one-line message plus a "Show why" summary.
  - Assistant panel components exist but are not used by the live page.

### 1.5 Languages

There are several different language sets:

| Layer | Values | Source |
|-------|--------|--------|
| Query detector (deterministic) | he, en, ru, ar, unknown. **Any Latin-script majority returns `en`**, so French, Spanish, German and Italian queries are detected as English. | `R2/utils/query-language-detector.ts` |
| Intent LLM | he, en, ru, ar, fr, es, other | `R2/stages/intent/intent.types.ts:17` |
| Google Places request language | he, en, ar, ru, fr, es; fallback `he` | `R2/orchestrator.early-context.ts` |
| Published `languageContext.googleLanguage` | he \| en only | `R2/orchestrator.response.ts:54` |
| Response `uiLanguage` | intent language passed through `toRequestLanguage`: he, en, ar, ru, fr, es, de, it. `other` / unknown become `en`. No `am`. | `R2/orchestrator.early-context.ts:24-44` |
| Assistant language | intent, then detected query, then UI, then `en` | `R2/orchestrator.helpers.ts` |
| Angular UI locales | he, en, ar, ru, fr, es, de, it, am; RTL for he and ar | `core/services/language.service.ts`, `i18n.service.ts` |

- **Client language selection:**
  - The client starts from the browser language.
  - A Hebrew, Arabic or Russian keyboard layout replaces it. A Latin layout does not.
  - The client then **overwrites** the UI language with the response's `uiLanguage` (`search.facade.ts:316-322`).
- Amharic exists only in the UI. The server never returns it.
- Parts of the UI are still hardcoded English.

### 1.6 Country / region

- **Device region** (`R2/utils/region-resolver.ts`) is only `IL` or `OTHER`:
  1. GPS inside the Israel bounding box gives `IL`. Any other GPS point gives `OTHER`. It does not name a country.
  2. Without GPS, the code reads a session cache (`session.context.regionCode`), which is also only `IL` | `OTHER`.
     - That step needs `sessionService`, and no caller provides one. It is declared only in `R2/types.ts:31`.
     - In practice the cache never runs.
  3. Otherwise `DEFAULT_REGION_CODE` (default `IL`).
- **Final region** is `intent.regionCandidate || device region || 'IL'`, then sanitized (`R2/orchestrator.early-context.ts:61-63`).
- **Region today is NOT independent of request language.**
  - The intent prompt says "If Hebrew query → likely IL … If unsure → IL" (`R2/stages/intent/intent.prompt.ts:60-62`).
  - The LLM candidate overrides the device region.
- The client does not send `region`. The session default `'US'` (`state/session.store.ts:156`) is used only for analytics.
- **A city named in the text** (`cityText` from intent):
  1. The city is appended to the Google text query (`R2/stages/route-llm/textsearch.mapper.ts`).
  2. If the LLM gave no bias and geocoding succeeds, a 20 km `locationBias` is applied (`text-search.handler.ts:288-318`). The mapper itself sets no automatic bias.
  3. When a bias centre exists, a distance filter runs on the results (`text-search.handler.ts:392-441`):
     - It starts at 12 km and widens to 20 km, then 30 km, while fewer than 5 results remain.
     - Places without a location are kept.
     - If geocoding fails, there is no bias and no distance filter.
  4. A post-filter later removes results whose address names a different known place. It never empties the list (`R2/post-filters/list-shape.ts:85-99`).

### 1.7 Filtering and ranking

- **LLM constraint extraction (no filtering):**
  - `base_filters` extracts open state and price.
  - `post_constraints` extracts open state and times, price level, `isKosher`, `isGlutenFree`, accessible and parking.
- **Removed in the Google stage:** `CLOSED_PERMANENTLY` places, before mapping and caching (`R2/stages/google-maps/business-status.ts`). Temporarily closed places are kept and flagged.
- **Deterministic post-filters** (`R2/post-filters/post-results.filter.ts`):
  - **Open now / at a time / between times:** places with unknown hours are **kept** (lines 228–236). The registry says `openState.unknownPolicy: 'exclude'` (`R2/constraints/constraints-registry.ts`), and that registry is metadata only.
  - **Price range:** places with unknown price are kept. The registry agrees: `priceRange.unknownPolicy: 'include'`.
  - **Price intent:** sorts the list.
  - **"Not kosher"** (`isKosher === false`): drops places whose **name** is clearly kosher. Other places stay.
  - **Wrong dish / wrong city:** dropped by name and address match, only when that does not empty the list.
- **Extracted but not applied:**
  - **Kosher (`isKosher === true`):** extracted and reported as an applied filter (`R2/orchestrator.filters.ts:131`). It feeds the Place Details decision. No result is removed for it. The registry lists kosher as `hard` / `exclude`, but no filter enforces that.
  - **Gluten-free:** a soft hint plus a sort. Places whose name says gluten-free move to the front; nothing is removed (`list-shape.ts:101-105`).
  - **Accessible and parking:** `enforcement: 'not_applied'`.
- **Ranking:** fixed baseline weights: rating 0.45, review count 0.25, distance 0.15, open now 0.10, price fit 0.05 (`R2/ranking/ranking-apply.ts:26-31`). Intent, filter and constraint signals can adjust the weights.
- There is no minimum-rating threshold and no LLM verification or rerank of results.

### 1.8 Result actions, parking, booking

- **Card actions** (`restaurant-card.component.*`):
  - open the website
  - Navigate (Google place link)
  - Call (`tel:`)
  - order on Wolt / 10bis / Mishloha
- **Parking:** extracted but not applied. There is no parking UI.
- **Booking / reservation:** none. The assistant prompt treats it as an "unsupported need".

### 1.9 Environments and flags

- **Angular environments:** `environment.ts` (local), `environment.development.ts` and `environment.production.ts`, swapped through `angular.json`. Only `production` gates dev-only behavior.
- **Feature flags:**
  - The client calls `GET /api/v1/flags` (`api/flags.api.ts`, `shared/api/api.config.ts`). It is served by `routes/v1/index.ts`.
  - localStorage `ff_*` keys override them.
- There is no Route2 / Route3 selector in the client.
- `window.assistantDevTools` is imported by the live search page with no production guard (`search-page.component.ts:45`).

---

## 2. Decisions

### D-01 — Conversational Route3 supersedes the legacy epic (decided)

- **What changes:** the approved conversational, **LLM-first** Route3 direction in this document **supersedes** the earlier "copy of Route2" design in `docs/route3/EPIC_ROUTE3.md`.
  - That epic set these constraints: a LangGraph wrapper over the same Route2 stages, the same prompts, no new language understanding, an unchanged response DTO, and Angular out of scope.
  - Where it conflicts with this document, this document wins.
- **Legacy files stay as they are:**
  - `EPIC_ROUTE3.md` and sprints 01–06 remain unchanged, as historical documents. They are not rewritten.
  - Sprints 07–10 are shipped Route2 work and are not part of the superseded plan.

### D-02 — Search context lifetime (decided)

- An explicit **New Search** action resets the current search context.
- Follow-up messages preserve the current context.
- **Topic changes:** the **orchestrator LLM** decides whether a message changes topic.
  - There is no deterministic topic-change routing (no keyword or rule-based switch).
  - When the LLM is uncertain, it asks the user to clarify.
- A browser refresh does **not** start a new search. When a valid session exists, the context is restored.

---

## 3. Approved requirements (Route3)

IDs are stable. Later stories cite them (e.g. "implements PR-03").

### PR-01 — Full conversational restaurant assistant

Route3 is a conversational assistant for finding restaurants, not a one-shot search box.

- **PR-01.1** The user can reply to the assistant in free text. The reply is treated as part of the current conversation.
- **PR-01.2** The assistant can answer, ask, explain results and suggest next steps in natural language.

### PR-02 — Discovery, clarification, follow-ups and updated results

- **PR-02.1 Discovery:** find restaurants from a natural-language request: dish or cuisine, place, time, price and dietary needs.
- **PR-02.2 Clarification:** when the request cannot be served well, ask a focused question.
  - The user may answer by choice **or** in free text.
  - The answer is merged into the current request. It does not replace it.
- **PR-02.3 Follow-ups:** support refinements such as "cheaper", "open now", "closer to the beach", "only kosher" or "what about sushi instead". Each one modifies the current context.
- **PR-02.4 Updated results:**
  - A follow-up that changes the constraints produces an updated recommendation list.
  - A follow-up that is only a question (e.g. "is the first one open late?") is answered without needlessly re-running the search.

### PR-03 — Preserve search context until a new search

- **PR-03.1** The context carries across turns: query intent, location / city, constraints and the current results.
- **PR-03.2** The context is reset by an explicit **New Search** action (D-02). Follow-up messages keep it.
- **PR-03.3** Whether a message changes topic is decided by the orchestrator LLM, not by deterministic rules. When uncertain, the assistant asks the user whether to refine the current search or start a new one.
- **PR-03.4** A browser refresh does not start a new search. When a valid session exists, the context is restored.
- **PR-03.5** The user can always tell whether they are refining the current search or starting a new one.

### PR-04 — Multilingual, with country-aware search independent of language

- **PR-04.1** Keep existing multilingual support. Every language that Route2 serves today must still work in Route3 (see §1.5). Which set is meant is **OPEN** (Q5).
- **PR-04.2** The assistant replies in the user's language.
- **PR-04.3** The search country or region is derived from **where** the user wants to eat: an explicit place in the text, device location or the session. It must **not** be inferred from the language of the request.
  - Examples: a Hebrew query about Paris searches France; an English query in Tel Aviv searches Israel.
  - This is a change from Route2 (§1.6). Today, device and session region can only express `IL` / `OTHER`.

### PR-05 — Trustworthy recommendations

- **PR-05.1** Every new recommendation list is **filtered and ranked before it is published** to the user. No unfiltered or unranked list may be shown, including partial or streamed lists.
- **PR-05.2** Results must honor the user's explicit constraints: open state, price, dietary and location. The handling of results whose data is unknown must be defined and consistent.
  - This goes beyond Route2. Positive kosher, gluten-free and accessible are not enforced today (§1.7).
  - The exact bar is **OPEN** (Q13, Q7).
- **PR-05.3** Clearly wrong results are removed: the wrong dish, the wrong city or a permanently closed place.
- **PR-05.4** The assistant does not state facts about a restaurant that the data does not support.

### PR-06 — One UI, with a development-only Route2 / Route3 selector

- **PR-06.1** There is a single user interface. Route3 does not get a separate app or page.
- **PR-06.2** A Route2 / Route3 selector is available **only in development** builds and environments. Production users cannot see it or reach it.
- **PR-06.3** Route2 stays the production default and keeps working unchanged while Route3 is developed.

### PR-07 — Parking and booking are future capabilities

- **PR-07.1** Parking information and filters, and table booking / reservation, are **not in MVP scope**.
- **PR-07.2** The design must not block adding them later.
- **PR-07.3** In MVP, if a user asks for parking or booking, the assistant says plainly that it is not supported yet and continues with the search.

---

## 4. Open questions

All items below are **OPEN** unless marked closed. Question IDs are stable.

| # | Status | Question | Affects |
|---|--------|----------|---------|
| Q1 | **Closed** by D-01 | Conflict with the legacy epic. | — |
| Q2 | **OPEN** (in part) | Refresh restores context (D-02). Still open: where context is stored (server, client or both), its TTL or expiry, and what makes a session "valid" for restoring it. | PR-03.4, privacy, cost |
| Q3 | **Closed** by D-02 | What ends the context. Explicit New Search resets it; the orchestrator LLM judges topic changes and asks when uncertain. | — |
| Q3a | **OPEN** | How New Search is exposed in the UI, and whether the existing clear (X) button counts as New Search, is a separate action, or is removed. | PR-03.2, PR-06.1 |
| Q3b | **OPEN** | When the LLM is confident a message is a new topic, does Route3 start a new search on its own, or always confirm with the user first? D-02 only covers the uncertain case. | PR-03.3 |
| Q4 | **OPEN** | Does Route3 keep `SearchResponse` plus WS/SSE, extend them, or add a conversation endpoint? | PR-06.1, Route2 compatibility |
| Q5 | **OPEN** | Which language set PR-04.1 freezes: the detector (he/en/ru/ar, Latin becomes en), intent (adds fr/es), Google Places (6), response `uiLanguage` (8), or the 9 UI locales. The server never returns Amharic. | PR-04.1 acceptance |
| Q6 | **OPEN** | Priority when an explicit place, GPS and session disagree, and the fallback when none is known. Device region is only `IL` / `OTHER`, and a GPS point outside Israel does not name a country. Today the fallback is `IL`. | PR-04.3 |
| Q7 | **OPEN** | Unknown-data policy, decided **separately** for each of: unknown hours under an open-state filter, unknown price under a price filter, and unknown kosher status under a kosher request. | PR-05.2 |
| Q8 | **OPEN** | Is a minimum quality bar required (rating or review count)? Is an LLM verification or rerank of results allowed, given cost and latency? | PR-05 |
| Q9 | **OPEN** | How the dev-only Route2 / Route3 selector is gated (Angular build environment, server flag, `ff_*` override, or a combination), and whether the server must refuse Route3 in production. | PR-06.2 |
| Q10 | **OPEN** | When the user asks a question about the current list, does that list stay on screen unchanged? | PR-02.4 |
| Q11 | **OPEN** | Latency and cost budget per Route3 turn compared with Route2. | Feasibility |
| Q12 | **OPEN** | Do Wolt, 10bis, Mishloha and the other card actions stay as they are in Route3? | Scope |
| Q13 | **OPEN** | Dietary bar for PR-05.2. Choose between hard-dropping places that do not match kosher / gluten-free / accessible, or keeping Route2 behavior: positive kosher not applied, gluten-free a hint, "not kosher" a name drop. | PR-05.2 |

### Existing issues found while reading (not requirements)

Recorded for triage. This story does not fix them:

- **Client `clearContext` is always false.** `intentReset` is cleared before it is read.
- **Gate clarify may be classed as `DONE_STOPPED` in async mode.** It uses `failureReason: 'LOW_CONFIDENCE'`.
- **Open-state unknown policy is inconsistent.** The filter keeps unknowns; the registry says exclude.
- **Kosher is listed as `hard` / `exclude` in the registry and reported as applied, but no filter enforces it.**
- **The region session cache can never run.** No caller provides `sessionService`.
- **Client `region` is never sent.** The session default `'US'` is used only for analytics.
- **`window.assistantDevTools` ships in production builds.**
