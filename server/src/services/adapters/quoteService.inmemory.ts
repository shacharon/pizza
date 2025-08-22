import type { QuoteRequest, QuoteResponse, QuoteService } from "../ports/quoteService.js";

export class InMemoryQuoteService implements QuoteService {
    async createQuote(req: QuoteRequest): Promise<QuoteResponse> {
        const total = req.items.reduce((sum, it) => sum + 40 * it.qty, 0); // stub price
        return {
            quoteId: `q_${Date.now()}`,
            total,
            etaMinutes: 35,
        };
    }
}


