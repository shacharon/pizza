export interface QuoteRequestItem { itemId: string; qty: number }

export interface QuoteRequest {
    vendorId: string;
    items: QuoteRequestItem[];
    address?: string;
}

export interface QuoteResponse {
    quoteId: string;
    total: number;
    etaMinutes: number;
}

export interface QuoteService {
    createQuote(req: QuoteRequest): Promise<QuoteResponse>;
}


