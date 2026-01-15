import type { FoodQueryDTO, ChatAction } from "@api";
import type { Intent } from "../intent.js";
import type { VendorSearch } from "../ports/vendorSearch.js";
import type { QuoteService } from "../ports/quoteService.js";

// ChatAction moved to shared contract

export interface IntentHandler {
    canHandle(intent: Intent): boolean;
    handle(dto: FoodQueryDTO): Promise<ChatAction>;
}

export class FindFoodHandler implements IntentHandler {
    constructor(private readonly search: VendorSearch) { }
    canHandle(intent: Intent): boolean { return intent === "find_food"; }
    async handle(dto: FoodQueryDTO): Promise<ChatAction> {
        const res = await this.search.search(dto);
        const cards = (dto as any).cards;
        return { action: "results", data: { ...res, query: dto, ...(Array.isArray(cards) && cards.length ? { cards } : {}) } };
    }
}

export class OrderFoodHandler implements IntentHandler {
    constructor(private readonly quotes: QuoteService) { }
    canHandle(intent: Intent): boolean { return intent === "order_food"; }
    async handle(_dto: FoodQueryDTO): Promise<ChatAction> {
        // Still clarifying until client supplies items; QuoteService used in next step
        return { action: "clarify", data: { question: "Which items would you like to order?", missing: ["items"] } };
    }
}

export function pickHandler(intent: Intent, handlers: IntentHandler[]): IntentHandler | null {
    return handlers.find(h => h.canHandle(intent)) ?? null;
}


