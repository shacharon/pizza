import { GooglePlacesClient, type FindPlaceParams, type GoogleRawResponse } from '../client/google-places.client.js';
import type { FindPlaceStrategy } from './search-strategy.js';

export class FindPlaceStrategyImpl implements FindPlaceStrategy {
    constructor(private readonly client = new GooglePlacesClient()) { }

    async execute(params: FindPlaceParams): Promise<GoogleRawResponse> {
        return this.client.findPlace(params);
    }
}


