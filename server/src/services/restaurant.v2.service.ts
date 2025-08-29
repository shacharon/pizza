import type { FoodQueryDTO } from "@api";
import type { RestaurantsResponse, Restaurant } from "@api";
import { textSearch, fetchDetails } from "./google/places.service.js";
import { InMemoryCache } from './cache.js';


const cache = new InMemoryCache();



function buildQuery(dto: FoodQueryDTO): string {
    const city = dto.city ?? "Tel Aviv";
    if (dto.type) return `${dto.type} in ${city}`;
    return `restaurants in ${city}`;
}

function cacheKey(dto: FoodQueryDTO) {
    const city = (dto.city ?? 'tel aviv').toLowerCase().trim();
    const type = dto.type ?? 'any';
    const maxPrice = dto.constraints?.maxPrice ?? 'any';
    const lang = (dto as any).language ?? 'he';
    return `restaurants:v2:${lang}:${city}:${type}:${maxPrice}`;
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
    const key = cacheKey(dto);
    const hit = await cache.get<RestaurantsResponse>(key);
    if (hit) return { ...hit, meta: { ...hit.meta, cached: true } };

    type Lang = NonNullable<RestaurantsResponse["query"]["language"]>;
    const lang: Lang = ((dto as any).language ?? "he") as Lang;

    const queryEcho: RestaurantsResponse["query"] = { city: dto.city ?? "Tel Aviv" };
    if (dto.type) queryEcho.type = dto.type;
    if (dto.constraints?.maxPrice !== undefined) queryEcho.maxPrice = dto.constraints.maxPrice;
    queryEcho.language = lang;

    const data = await textSearch(buildQuery(dto), lang);
    const list: Restaurant[] = Array.isArray(data?.results) ? data.results.slice(0, 10).map(mapBasic) : [];

    const ENRICH_TOP_N = Math.min(3, list.length);
    const top = list.slice(0, ENRICH_TOP_N);
    if (ENRICH_TOP_N > 0) {
        const settled = await Promise.allSettled(top.map(r => fetchDetails(r.placeId, lang)));
        settled.forEach((s, i) => {
            const target = top[i]; if (!target) return;
            if (s.status === "fulfilled" && s.value) {
                const d = s.value as any;
                target.phone = d?.international_phone_number ?? null;
                target.website = d?.website ?? null;
                target.openNow = d?.opening_hours?.open_now ?? null;
                target.mapsUrl = d?.url ?? null;
            }
        });
    }

    const out: RestaurantsResponse = {
        query: queryEcho,
        restaurants: [...top, ...list.slice(ENRICH_TOP_N)],
        meta: { source: "google", cached: false, nextPageToken: data?.next_page_token ?? null, enrichedTopN: ENRICH_TOP_N }
    };

    await cache.set(key, out, 15 * 60);
    return out;
}


