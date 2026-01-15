## ChatService.handleMessage

### Purpose (business)

- Central orchestration for the chat flow.
- Turns a user request (text or patch) into a validated `ChatReply` that the UI can render immediately.
- Preserves conversation state (DTO + guard counters) via `SessionAgent` so subsequent requests are contextual.

### Inputs

- `sessionId`: caller session key (header). If absent, controller generates one.
- `requestId`: correlation id for logs.
- `body`:
  - `message?`: free-form user text.
  - `patch?`: partial DTO refinement (e.g., `{ maxPrice: 60 }`).
  - `language?`: `'mirror' | 'he' | 'en'` (mirror echoes user language by default).
  - `page?`, `limit?`: optional pagination.

### Outputs

- `{ payload: ChatReply, headers?: Record<string,string> }`
  - `payload` is validated with `ResSchema` before returning.
  - `headers` may include `x-guard` (policy signal) and `x-session-id` (session continuity).

### Technical responsibilities

1. Guard pre-filter

- `promptGuardPreFilter(message, language)` decides if content is allowed.
- On block: increments session guard counters, returns a soft/firm reply.

2. Patch flow (refine existing DTO)

- Loads prior DTO from `SessionAgent`, merges with `patch`.
- Initializes the state machine node, feeds `USER_MESSAGE`, `INTENT_OK`, `CLARIFIED`.
- Builds normalized args and calls the restaurant search (`getRestaurants`).
- Validates LLM output (`isValidRestaurantsOutput`).
- Maps LLM restaurants → UI vendors (`mapRestaurantsToVendors`).
- Updates node with `SEARCH_START`/`SEARCH_OK` when city exists, persists merged DTO, returns results.

3. Natural message flow

- Runs `runChatPipeline` to derive intent + DTO.
- Updates state machine with `USER_MESSAGE`, handles branches:
  - `refuse` → refusal reply; `greeting` → greeting; `clarify` → ask-for-more.
  - Otherwise accepts DTO with `INTENT_OK` + `CLARIFIED` and continues.

4. Find Food intent

- Optionally `SEARCH_START` when city present.
- Calls `getRestaurants`, validates, maps to vendors, `SEARCH_OK` when city.
- Persists DTO and returns results.

5. Order flow (strategy)

- Delegates to an intent handler via `pickHandler` (currently `OrderFoodHandler`).
- Returns the appropriate `ChatReply` (results/clarify/refuse/confirm) and persists DTO.

### Design choices

- Facade pattern: isolates web concerns in the controller; concentrates business rules here.
- Dependency injection:
  - `SessionAgent` interface for persistence (in-memory now, Redis later).
  - Restaurant search function is injected for testability; can evolve to a `RestaurantSearchPort`.
- Strict validation: outgoing replies are schema-checked (`ResSchema`).
- Deterministic LLM calls (temperature 0) elsewhere enable effective caching.

### Extension points

- Split into private helpers: `handleGuard`, `handlePatch`, `handleFindFood`, `handleOrder` for readability.
- Add `RestaurantSearchPort` and a `Logger` interface.
- Swap `SessionAgent` to Redis without touching controller/service call sites.
