import type { FoodQueryDTO } from "@api";
import type { RestaurantsResponse, Restaurant } from "@api";
import { textSearch } from "./google/places.service.js";

function buildQuery(dto: FoodQueryDTO): string {
    const city = dto.city ?? "Tel Aviv";
    if (dto.type) return `${dto.type} in ${city}`;
    return `restaurants in ${city}`;
}

function mapBasic(r: any): Restaurant {
    return {
        name: r.name,
        address: r.formatted_address,
        rating: r.rating ?? null,
        placeId: r.place_id,
        location: r.geometry?.location ?? null,
    };
}

export async function getRestaurantsV2(dto: FoodQueryDTO): Promise<RestaurantsResponse> {
    const language = (dto as any).language ?? "he";
    const data = await textSearch(buildQuery(dto), language);
    const list: Restaurant[] = Array.isArray(data?.results) ? data.results.slice(0, 10).map(mapBasic) : [];
    const queryEcho = {
        city: dto.city ?? "Tel Aviv",
        type: dto.type,
        maxPrice: dto.constraints?.maxPrice,
        language,
    } as RestaurantsResponse["query"];
    return {
        query: queryEcho,
        restaurants: list,
        meta: { source: "google", cached: false, nextPageToken: data?.next_page_token ?? null, enrichedTopN: 0 }
    };
}


