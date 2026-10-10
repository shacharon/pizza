# Going2Eat Route3 — Product Contract

**Story:** R3-001 (Sprint 0)
**Status:** Draft for approval
**Scope of this file:** what Route3 must do for the user. It is not a design or an implementation plan.

This document has three parts. Keep them apart:

1. **Verified existing behavior.** What Route2 and the current UI do today, read from the code. Paths are under `server/src/` or `llm-angular/src/app/`.
2. **Approved requirements.** What Route3 must deliver.
3. **Unresolved questions.** Decisions not yet made. Nothing in part 3 is approved.

---

## 1. Verified existing behavior (Route2 + current UI)

Facts were found by reading the code at `origin/main` (`3dcb218`). Nothing was run.

### 1.1 Search pipeline

- Entry: `POST /api/v1/search` (sync, or async with `?mode=async`), served by `controllers/search/search.controller.ts`. Results come from `GET /api/v1/search/:requestId/result`, plus WS `/ws` and SSE `GET /api/v1/stream/assistant/:requestId`.
- The orchestrator is `services/search/route2/route2.orchestrator.ts`. Stage order:
  1. language detection
  2. region
  3. Gate2
  4. intent
  5. location guards
  6. route-LLM
  7. `base_filters` and `post_constraints`, run in parallel
  8. Google Maps
  9. post-filters
  10. ranking
  11. order-provider enrichment (Wolt / 10bis / Mishloha)
  12. final response
- The response DTO is `SearchResponse` (`services/search/types/search-response.dto.ts`). Each result is a `RestaurantResult` (`services/search/types/restaurant.types.ts`).
- The code has no `route3` flag or folder. A search of `server/src` finds no match.

### 1.2 Clarification

- Gate2 returns `CONTINUE`, `ASK_CLARIFY` or `STOP` (`route2/stages/gate2.stage.ts`).
- Location guards can also ask for clarification. Examples: "near me" without GPS, or a text search with no anchor.
- A clarify reaches the client as `assist.type='clarify'` in HTTP, a WS `CLARIFY` terminal and an assistant message.
- The UI shows clarification as **choice buttons only** (`features/.../clarification-block.component.html`). Choosing one re-runs the **same query** with the choice's `constraintPatch` (`facades/search.facade.ts`). A free-text answer is just a new, unrelated search.

### 1.3 Conversation and context

- **Each search is stateless.** `Route2Context` (`route2/types.ts`) holds no prior query, constraints or results.
- `sessionId` is used only for auth, ownership and WS routing.
- `clearContext` is accepted by the request DTO (`services/search/types/search-request.dto.ts`) but no server code reads it.
- On the client, `clearContext` appears to be always `false`. `submit()` clears `intentReset` before the value is read (`search.facade.ts`, `input-state-machine.service.ts`).
- There is no conversation store. Redis holds only jobs. `SessionContext.conversationHistory` and `CONVERSATION_ENGINE` are unused leftovers.
- The UI has no "new search" control. The clear (X) button resets the store. Each submit clears the previous results and assistant messages.

### 1.4 Assistant

- The assistant is **one-way narration**, not a chat. Message types: `GATE_FAIL`, `CLARIFY`, `SUMMARY`, `SEARCH_FAILED`, `GENERIC_QUERY_NARRATION` (`route2/assistant/assistant.types.ts`).
- There is no reply endpoint. The client WS messages `action_clicked` and `ui_state_changed` are only logged.
- The UI has one composer, the search bar, and shows the assistant as a one-line message plus a "Show why" summary. Assistant panel components exist, but the live page does not use them.

### 1.5 Languages

- **Server, query language detection:** a script-based detector returns he / en / ru / ar.
- **Server, intent LLM language:** he / en / ru / ar / fr / es / other.
- **Server, assistant language:** taken from the intent, then the query, then the UI, then `en` (`route2/orchestrator.helpers.ts`).
- **Server, Google language:** he / en / ar / ru / fr / es, with `he` as fallback.
- **UI:** supports he, en, ar, ru, fr, es, de, it, am, with RTL for he and ar (`i18n.service.ts`, `language.service.ts`). Language comes from the browser and the keyboard layout, then syncs from the response's `uiLanguage`.
- Parts of the UI are still hardcoded English.

### 1.6 Country / region

- **Device region** comes from the GPS point: inside the Israel bounding box gives `IL`, otherwise `OTHER`. Without GPS it is `DEFAULT_REGION_CODE`, default `IL` (`route2/utils/region-resolver.ts`).
- **Final region** is `intent.regionCandidate || device region || 'IL'` (`route2/orchestrator.early-context.ts`).
- **Region today is NOT independent of request language.** The intent prompt says "If Hebrew query → likely IL … If unsure → IL" (`route2/stages/intent/intent.prompt.ts`), and the LLM's guess overrides the device region.
- The client does not send `region`. A session default of `'US'` exists but is unused.
- A city named in the text is extracted (`cityText`), and results are limited to a radius around it.

### 1.7 Filtering and ranking

- **Constraint extraction by LLM:** open state and times, price, kosher, gluten-free, accessible, parking.
- **Deterministic post-filters** (`route2/post-filters/post-results.filter.ts`):
  - **Open-now / at-time:** places with unknown hours are kept. This conflicts with `unknownPolicy:'exclude'` in `constraints-registry.ts`.
  - **Price range:** places with no price data are kept.
  - **Not kosher:** places whose name is clearly kosher are dropped.
  - **Wrong dish / wrong city:** dropped by name and address match, unless that would empty the list.
  - **Gluten-free:** a soft hint only.
  - **Permanently closed:** removed.
- **Ranking:** fixed baseline weights: rating 0.45, review count 0.25, distance 0.15, open now 0.10, price fit 0.05 (`route2/ranking/ranking-apply.ts`). Intent can boost some weights.
- There is no minimum-rating threshold and no LLM verification or rerank of results.

### 1.8 Result actions, parking, booking

- **Card actions** (`restaurant-card.component.*`):
  - open the website
  - Navigate (Google place link)
  - Call (`tel:`)
  - order on Wolt / 10bis / Mishloha
- **Parking:** extracted but `enforcement:'not_applied'`. There is no parking UI.
- **Booking / reservation:** none. The assistant treats it as an "unsupported need".

### 1.9 Environments

- Angular has `environment.ts` (local), `environment.development.ts` and `environment.production.ts`, swapped through `angular.json`. Only `production` gates dev-only behavior.
- Server feature flags come from `GET /flags`, with localStorage `ff_*` overrides.
- There is no Route2 / Route3 selector in the client.
- `window.assistantDevTools` is also loaded in production builds.

---

## 2. Approved requirements (Route3)

IDs are stable. Later stories cite them (e.g. "implements PR-03").

### PR-01 — Full conversational restaurant assistant

Route3 is a conversational assistant for finding restaurants, not a one-shot search box.

- **PR-01.1** The user can reply to the assistant in free text. The reply is treated as part of the current conversation.
- **PR-01.2** The assistant can answer, ask, explain results and suggest next steps in natural language.

### PR-02 — Discovery, clarification, follow-ups and updated results

- **PR-02.1 Discovery:** find restaurants from a natural-language request: dish or cuisine, place, time, price and dietary needs.
- **PR-02.2 Clarification:** when the request cannot be served well, ask a focused question. The user may answer by choice **or** in free text, and the answer is merged into the current request. It does not replace the request.
- **PR-02.3 Follow-ups:** support refinements such as "cheaper", "open now", "closer to the beach", "only kosher" or "what about sushi instead". Each one modifies the current context.
- **PR-02.4 Updated results:** a follow-up that changes the constraints produces an updated recommendation list. A follow-up that is only a question (e.g. "is the first one open late?") is answered without needlessly re-running the search.

### PR-03 — Preserve search context until a new search

- **PR-03.1** The context carries across turns: query intent, location / city, constraints and the current results.
- **PR-03.2** The context ends only when the user **starts a new search**. Clearing or reloading must not silently keep stale context.
- **PR-03.3** The user can always tell whether they are refining the current search or starting a new one.

### PR-04 — Multilingual, with country-aware search independent of language

- **PR-04.1** Keep existing multilingual support. Every language that Route2 serves today must still work in Route3 (see §1.5).
- **PR-04.2** The assistant replies in the user's language.
- **PR-04.3** The search country or region is derived from **where** the user wants to eat: an explicit place in the text, device location or the session. It must **not** be inferred from the language of the request. Examples: a Hebrew query about Paris searches France; an English query in Tel Aviv searches Israel.

### PR-05 — Trustworthy recommendations

- **PR-05.1** Every new recommendation list is **filtered and ranked before it is published** to the user. No unfiltered or unranked list may be shown, including partial or streamed lists.
- **PR-05.2** Results must honor the user's explicit constraints (open state, price, dietary, location). The handling of results whose data is unknown must be defined and consistent.
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

## 3. Unresolved questions

These need an owner decision. None is approved by this document.

| # | Question | Why it matters |
|---|----------|----------------|
| Q1 | **Conflict with the existing epic.** `docs/route3/EPIC_ROUTE3.md` defines Route3 as "LangGraph on top of Route2". It says: same prompts, no new NLU, response DTO unchanged, Angular UI changes out of scope. PR-01–PR-03 and PR-06 need new conversation behavior, contract changes and UI changes. Which document wins, and should the epic and sprints 01–06 be rewritten? | Every later story depends on it. |
| Q2 | Where is conversation context stored (server-side keyed by session, client-sent, or both), what is its TTL, and does it survive a page reload? | PR-03, privacy, cost |
| Q3 | What counts as "starts a new search"? Options: an explicit button, clearing the box, a topic-change detection, or a mix. Who decides when it is ambiguous: the user or the model? | PR-03.2 / PR-03.3 |
| Q4 | Does Route3 keep the `SearchResponse` DTO and WS / SSE protocol, extend them, or add a new conversation endpoint? | PR-06.1 single UI, Route2 compatibility |
| Q5 | Exact language set for MVP. Server-side detection covers he / en / ru / ar, intent covers fr / es, and the UI has 9 locales. Is "existing support" the server set or the UI set? | PR-04.1 acceptance criteria |
| Q6 | Region source priority when they disagree (explicit place vs GPS vs session), and the fallback when none is known. Today the fallback is `IL`. | PR-04.3 |
| Q7 | Unknown-data policy per constraint, e.g. unknown hours under "open now" or unknown price. Today the code keeps such places, but the registry says exclude. | PR-05.2 |
| Q8 | Is a minimum quality bar required (rating or review threshold)? Is an LLM verification or rerank step allowed, given cost and latency? | PR-05 |
| Q9 | How is the dev-only selector gated: Angular build environment, server flag, `ff_*` override, or all of them? Must the server also refuse Route3 in production? | PR-06.2 |
| Q10 | Should follow-up turns that only ask a question about the current results keep the current results visible unchanged? | PR-02.4 |
| Q11 | Latency and cost budget per turn for Route3 compared with Route2. | Feasibility |
| Q12 | Do existing order buttons (Wolt / 10bis / Mishloha) and card actions stay unchanged in Route3? | Scope |

### Existing issues found while reading (not requirements)

Recorded for triage. This story does not fix them:

- **Client `clearContext` is always false.** `intentReset` is cleared before it is read.
- **Gate clarify may be classed as `DONE_STOPPED` in async mode.** It uses `failureReason: 'LOW_CONFIDENCE'`.
- **Open-state unknown policy is inconsistent.** The filter keeps unknowns; the registry says exclude.
- **Client `region` is never sent.** The session default `'US'` is unused.
- **`window.assistantDevTools` ships in production builds.**
