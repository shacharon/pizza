import type { FoodQueryDTO, RestaurantsResponse } from '@api';
import { getRestaurantsV2 } from './restaurant.v2.service.js';

export interface RestaurantsProvider {
    search(dto: FoodQueryDTO): Promise<RestaurantsResponse>;
}


let current: RestaurantsProvider = { search: getRestaurantsV2 };


export function setRestaurantsProvider(p: RestaurantsProvider) { current = p; }
export function getRestaurantsProvider(): RestaurantsProvider { return current; }

class StubRestaurantsProvider implements RestaurantsProvider {
    async search(dto: FoodQueryDTO): Promise<RestaurantsResponse> {
        const city = dto.city ?? 'Tel Aviv';
        return {
            query: { city },
            restaurants: [
                { name: "Stub Pizza", address: `Main, ${city}`, placeId: "stub_1" },
                { name: "Stub Hut", address: `Center, ${city}`, placeId: "stub_2" }
            ],
            meta: { source: "google", cached: false, nextPageToken: null, enrichedTopN: 0 }
        };
    }
}

// wire env flag
if ((process.env.SEARCH_PROVIDER || '').toLowerCase() === 'stub') {
    setRestaurantsProvider(new StubRestaurantsProvider());
}