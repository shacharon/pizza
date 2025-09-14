import type { GoogleRawResponse, TextSearchParams, NearbySearchParams, FindPlaceParams } from '../client/google-places.client.js';

export type StrategyKind = 'textsearch' | 'nearbysearch' | 'findplace';

export interface SearchStrategy<Params> {
    execute(params: Params): Promise<GoogleRawResponse>;
}

export type TextSearchStrategy = SearchStrategy<TextSearchParams>;
export type NearbySearchStrategy = SearchStrategy<NearbySearchParams>;
export type FindPlaceStrategy = SearchStrategy<FindPlaceParams>;


