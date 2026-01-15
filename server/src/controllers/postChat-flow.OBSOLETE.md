## Chat entry point: controller + service flow

### What this covers

- Where a chat request enters the backend
- Business steps taken to produce a reply
- Technical responsibilities split between controller and service

### High-level

- Controller (`chat.controller.ts` → `postChat`) is now thin.
- Business logic lives in `ChatService.handleMessage(...)` (Facade) in `services/chat/chat.service.ts`.
- Responses conform to `ChatReply` and are validated with `ResSchema` before sending.

## Request lifecycle

1. Validate request body

   - Schema: `ReqSchema` (fields: `message?`, `patch?`, `language?`, `page?`, `limit?`).
   - On failure → 400 `{ error: MESSAGES.missingMessage }`.

2. Identify request and session

   - `sessionId` from `x-session-id` request header, else generated.
   - `requestId` is generated for logs.

3. Delegate to service

   - Controller calls: `chatService.handleMessage(sessionId, requestId, parsedBody)`.
   - Service returns `{ payload: ChatReply, headers?: Record<string,string> }`.
   - Controller sets returned headers (e.g., `x-guard`, `x-session-id`) and sends JSON.

4. Error handling
   - Controller catches errors, logs with `requestId`, responds `500` with a sanitized message.

## Business flow inside ChatService

The service orchestrates guard checks, intent/pipeline, restaurant fetch, state reduction, and session persistence.

1. Prompt Guard (pre-filter)

- `promptGuardPreFilter(message, language || 'mirror')`.
- If not allowed:
  - Tracks off-domain streak in session (`guard` counters, within 5 minutes).
  - Soft nudge first; firm refusal on next off-domain.
  - Returns reply immediately with `x-guard` header.

2. Patch flow (refine existing DTO)

- If `patch` is provided:
  - Initialize agent node (`createInitialNode` → `reduce(USER_MESSAGE)` → `reduce(INTENT_OK)` → `reduce(CLARIFIED)`).
  - Load stored session DTO, merge with patch.
  - Build args for restaurant search: `{ type, city, maxPrice, language, userText, page?, limit? }`.
  - Call LLM-backed search: `getRestaurants(args)`.
  - Validate LLM output with `isValidRestaurantsOutput`.
  - Map restaurants → vendors (dedup/expand by items where needed).
  - Reduce `SEARCH_START`/`SEARCH_OK` when city exists.
  - Persist merged DTO to session; return `ChatReply` with `action: 'results'` and set `x-session-id`.

3. Natural message flow (no patch)

- Run intent pipeline: `runChatPipeline(message)`.
- Initialize agent node and `reduce(USER_MESSAGE)`.
- Branch by result:
  - `refuse` → reduce `INTENT_OTHER`, return refusal reply.
  - `greeting` → static greeting reply.
  - `clarify` → generic clarify reply.
  - Else → `reduce(INTENT_OK)` and `reduce(CLARIFIED, dto)`.

4. Find Food intent

- If intent is `find_food`:
  - Optionally `reduce(SEARCH_START)` if city is present.
  - Call `getRestaurants` with derived args.
  - Validate, map to vendors, `reduce(SEARCH_OK)` if city.
  - Persist DTO, set `x-session-id`, return `ChatReply` with results.

5. Order flow (strategy)

- Select handler via `pickHandler` (e.g., `OrderFoodHandler(new InMemoryQuoteService())`).
- For action kinds:
  - `results` → reduce `SEARCH_OK` (when applicable), return results.
  - `refuse`/`clarify`/`confirm` → format reply; persist DTO; set `x-session-id`.

## Technical details

- Controller is responsible only for:
  - Input validation, `sessionId` extraction, header setting, HTTP status.
- Service is responsible for:
  - Guard checks, pipeline, state machine (`createInitialNode`/`reduce`), calling search services, mapping to UI models, persisting session, and building the reply.
- Interfaces / DI:
  - `SessionAgent` interface (`store/types.ts`), injected into `ChatService`.
  - Restaurant search dependency is injected as `getRestaurants` (can be abstracted behind a port later).
- Mapping helper:
  - `mapRestaurantsToVendors(restaurants)` centralizes adaptation to UI rows, including expanding itemized menus.
- Headers:
  - `x-guard` indicates guard action.
  - `x-session-id` is returned when session is persisted/updated.
- Validation:
  - Outgoing payloads validated with `ResSchema` to enforce contract.

## Future improvements

- Extract small private methods in service: `handleGuard`, `handlePatch`, `handleFindFood`, `handleOrder` for clearer structure.
- Introduce `RestaurantSearchPort` to type the restaurant dependency formally.
- Replace in-memory session with Redis-backed `SessionAgent`.
- Add a `Logger` interface for structured logs with `requestId`.
