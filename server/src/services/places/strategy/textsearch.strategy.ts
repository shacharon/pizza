import { GooglePlacesClient, type TextSearchParams, type GoogleRawResponse } from '../client/google-places.client.js';
import type { TextSearchStrategy } from './search-strategy.js';

export class TextSearchStrategyImpl implements TextSearchStrategy {
    constructor(private readonly client = new GooglePlacesClient()) { }

    async execute(params: TextSearchParams): Promise<GoogleRawResponse> {
        return this.client.textSearch(params);
    }
}


