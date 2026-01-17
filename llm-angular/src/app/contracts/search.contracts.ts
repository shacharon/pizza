// llm-angular/src/app/contracts/search.contracts.ts

export const CONTRACTS_VERSION = "search_contracts_v1" as const;

export type ContractsVersion = typeof CONTRACTS_VERSION;

export type SearchDecision = "CONTINUE" | "ASK_CLARIFY" | "STOP";
export type SearchEventType = "progress" | "ready" | "error";

export type SearchStage =
    | "accepted"
    | "gate2"
    | "intent"
    | "route_llm"
    | "google"
    | "done";

export type ReadyKind = "results" | "ask" | "stop";

export type ReasonCode = "INTERNAL_ERROR" | "PROVIDER_UNAVAILABLE";

export type WsSubscribeMsg = {
    action: "subscribe";
    channel: "search";
    requestId: string;
    contractsVersion: ContractsVersion;
};

export type WsSearchEvent =
    | {
        channel: "search";
        contractsVersion: ContractsVersion;
        type: "progress";
        requestId: string;
        ts: string;
        stage: SearchStage;
        decision?: SearchDecision;
        message?: string;
    }
    | {
        channel: "search";
        contractsVersion: ContractsVersion;
        type: "ready";
        requestId: string;
        ts: string;
        stage: "done";
        ready: ReadyKind;
        decision: SearchDecision;
        message?: string;
        resultUrl?: string;
    }
    | {
        channel: "search";
        contractsVersion: ContractsVersion;
        type: "error";
        requestId: string;
        ts: string;
        stage: SearchStage;
        code: ReasonCode;
        message: string;
    };

// ---- HTTP (Iteration 1)

export type SearchStartResponse202 = {
    requestId: string;
    resultUrl: string;
    contractsVersion: ContractsVersion;
};

export type SearchResultRunning202 = {
    requestId: string;
    status: "running";
    contractsVersion: ContractsVersion;
};

export type SearchResultDone200<T = unknown> = {
    requestId: string;
    status: "done";
    resultCount: number;
    results: T[];
    contractsVersion: ContractsVersion;
};

export type SearchResultResponse<T = unknown> =
    | SearchResultRunning202
    | SearchResultDone200<T>;
