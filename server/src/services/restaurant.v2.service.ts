import type { FoodQueryDTO } from "@api";
import type { RestaurantsResponse, Restaurant } from "@api";
import { textSearch, fetchDetails } from "./google/places.service.js";
import { findCity } from './google/places.service.js';
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

function photoUrlFromReference(ref?: string | null, maxwidth: number = 640): string | null {
    if (!ref) return null;
    const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) return null;
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxwidth}&photo_reference=${encodeURIComponent(ref)}&key=${key}`;
}

function mapBasic(r: any): Restaurant {
    const firstPhotoRef: string | null = r.photos?.[0]?.photo_reference ?? null;
    return {
        name: r.name,
        address: r.formatted_address,
        rating: r.rating ?? null,
        priceLevel: r.price_level ?? null,
        placeId: r.place_id,
        photoUrl: photoUrlFromReference(firstPhotoRef),
        location: r.geometry?.location ?? null,
    } as any;
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
    let list: Restaurant[] = Array.isArray(data?.results) ? data.results.slice(0, 10).map(mapBasic) : [];

    // If no results, expand search by 10km around resolved city center (IL-first geocode)
    let expanded = false;
    if (list.length === 0 && dto.city) {
        try {
            const geo = await findCity(dto.city, lang);
            if (geo) {
                const expandedData = await textSearch(buildQuery(dto), lang, { location: { lat: geo.lat, lng: geo.lng }, radiusMeters: 10_000 });
                const expandedList: Restaurant[] = Array.isArray(expandedData?.results) ? expandedData.results.slice(0, 10).map(mapBasic) : [];
                if (expandedList.length > 0) {
                    list = expandedList;
                    expanded = true;
                }
            }
        } catch { }
    }

    const ENRICH_TOP_N = Math.min(10, list.length);
    const top = list.slice(0, ENRICH_TOP_N);
    if (ENRICH_TOP_N > 0) {
        const settled = await Promise.allSettled(top.map(r => fetchDetails(r.placeId, lang)));
        settled.forEach((s, i) => {
            const target = top[i]; if (!target) return;
            if (s.status === "fulfilled" && s.value) {
                const d = s.value as any;
                // enrich core fields if missing
                if ((target as any).priceLevel == null && d?.price_level != null) (target as any).priceLevel = d.price_level;
                const photoRef: string | null = d?.photos?.[0]?.photo_reference ?? null;
                if (!(target as any).photoUrl && photoRef) (target as any).photoUrl = photoUrlFromReference(photoRef);

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
        meta: { source: "google", cached: false, nextPageToken: data?.next_page_token ?? null, enrichedTopN: ENRICH_TOP_N, expandedRadiusMeters: expanded ? 10_000 : 0 }
    };

    await cache.set(key, out, 15 * 60);
    return out;
}


