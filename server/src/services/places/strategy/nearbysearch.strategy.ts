import { GooglePlacesClient, type NearbySearchParams, type GoogleRawResponse } from '../client/google-places.client.js';
import type { NearbySearchStrategy } from './search-strategy.js';

export class NearbySearchStrategyImpl implements NearbySearchStrategy {
    constructor(private readonly client = new GooglePlacesClient()) { }

    async execute(params: NearbySearchParams): Promise<GoogleRawResponse> {
        return this.client.nearbySearch(params);
    }
}


