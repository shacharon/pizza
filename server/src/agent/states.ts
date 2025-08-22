import type { SearchResultDTO } from "@api";

export enum AgentState {
    COLLECTING = "COLLECTING",
    PARTIAL_RESULTS = "PARTIAL_RESULTS",
    SEARCHING = "SEARCHING",
    RESULTS = "RESULTS",
    NO_RESULTS = "NO_RESULTS",
    QUOTING = "QUOTING",
    CONFIRM = "CONFIRM",
    ORDERING = "ORDERING",
    DONE = "DONE",
    REFUSAL = "REFUSAL",
    ERROR = "ERROR",
}

export type AgentEvent =
    | { type: "USER_MESSAGE"; text: string }
    | { type: "INTENT_OK" }
    | { type: "INTENT_OTHER" }
    | { type: "CLARIFIED"; patch: Partial<Context["query"]> }
    | { type: "SEARCH_START" }
    | { type: "SEARCH_OK"; results: SearchResultDTO }
    | { type: "SEARCH_EMPTY" }
    | { type: "SELECT_VENDOR"; vendorId: string }
    | { type: "QUOTE_READY" }
    | { type: "CONFIRM" }
    | { type: "ORDER_OK" }
    | { type: "ORDER_FAIL"; reason?: string };

// Deferred import to avoid circular: Context is defined in context.ts
// Using a type-only import via import type above for SearchResultDTO.
// The reducer will import Context from "./context.js".


