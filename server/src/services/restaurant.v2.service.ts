import type { FoodQueryDTO } from "@api";
import type { RestaurantsResponse, Restaurant } from "@api";
import { textSearch, fetchDetails } from "./google/places.service.js";
import { findCity } from './google/places.service.js';
import { InMemoryCache } from './cache.js';


const cache = new InMemoryCache();
const CACHE_VERSION = 'dietary-v1';



function buildQuery(dto: FoodQueryDTO): string {
    const city = dto.city ?? "Tel Aviv";
    if (dto.type) return `${dto.type} in ${city}`;
    return `restaurants in ${city}`;
}

function cacheKey(dto: FoodQueryDTO) {
    const city = (dto.city ?? 'tel aviv').toLowerCase().trim();
    const type = dto.type ?? 'any';
    const maxPrice = dto.constraints?.maxPrice ?? 'any';
    const dietary = dto.constraints?.dietary?.sort().join(',') ?? 'any';
    const lang = (dto as any).language ?? 'he';
    return `restaurants:v2:${CACHE_VERSION}:${lang}:${city}:${type}:${maxPrice}:${dietary}`;
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
        types: r.types ?? null,
        website: r.website ?? null,
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
    let list: Restaurant[] = Array.isArray(data?.results) ? data.results.slice(0, 20).map(mapBasic) : [];

    // If no results, expand search by 10km around resolved city center (IL-first geocode)
    let expanded = false;
    if (list.length === 0 && dto.city) {
        try {
            const geo = await findCity(dto.city, lang);
            if (geo) {
                const expandedData = await textSearch(buildQuery(dto), lang, undefined, { location: { lat: geo.lat, lng: geo.lng }, radiusMeters: 10_000 });
                const expandedList: Restaurant[] = Array.isArray(expandedData?.results) ? expandedData.results.slice(0, 20).map(mapBasic) : [];
                if (expandedList.length > 0) {
                    list = expandedList;
                    expanded = true;
                }
            }
        } catch { }
    }

    const ENRICH_TOP_N = Math.min(20, list.length);
    const top = list.slice(0, ENRICH_TOP_N);
    if (ENRICH_TOP_N > 0) {
        console.log(`🔍 ENRICHING ${ENRICH_TOP_N} restaurants with dietary info...`);
        const settled = await Promise.allSettled(top.map(r => fetchDetails(r.placeId, lang)));
        settled.forEach((s, i) => {
            const target = top[i]; if (!target) return;
            console.log(`📋 Processing ${target.name}:`, s.status);

            if (s.status === "fulfilled" && s.value) {
                const d = s.value as any;
                console.log(`✅ Details for ${target.name}:`, {
                    hasEditorialSummary: !!d?.editorial_summary?.overview,
                    reviewsCount: Array.isArray(d?.reviews) ? d.reviews.length : 0,
                    website: !!d?.website,
                    types: d?.types?.slice(0, 3) || []
                });

                // enrich core fields if missing
                if ((target as any).priceLevel == null && d?.price_level != null) (target as any).priceLevel = d.price_level;
                const photoRef: string | null = d?.photos?.[0]?.photo_reference ?? null;
                if (!(target as any).photoUrl && photoRef) (target as any).photoUrl = photoUrlFromReference(photoRef);

                target.phone = d?.international_phone_number ?? null;
                target.website = d?.website ?? null;
                target.openNow = d?.opening_hours?.open_now ?? null;
                target.mapsUrl = d?.url ?? null;

                // dietary enrichment
                const dietary: any = {};
                // Note: servesVegetarianFood is not available in Google Places API

                const texts: string[] = [];
                // Include restaurant name in analysis
                texts.push(target.name.toLowerCase());
                if (d?.editorial_summary?.overview) texts.push(String(d.editorial_summary.overview));
                if (Array.isArray(d?.reviews)) {
                    for (const rv of (d.reviews as any[]).slice(0, 3)) if (rv?.text) texts.push(String(rv.text));
                }
                const blob = texts.join(' ').toLowerCase();
                console.log(`📝 Text analysis for ${target.name}:`, {
                    textLength: blob.length,
                    hasVeganKeyword: /\bvegan\b|טבעוני/.test(blob),
                    hasGlutenFreeKeyword: /gluten[- ]?free|ללא גלוטן/.test(blob),
                    hasKosherKeyword: /\bkosher\b|כשר|מהדרין/.test(blob),
                    sampleText: blob.substring(0, 100) + '...'
                });

                // Detect dietary preferences from text
                if (/\bvegan\b|טבעוני/.test(blob)) dietary.vegan = true;
                if (/\bvegetarian\b|צמחוני/.test(blob)) dietary.vegetarian = true;
                if (/gluten[- ]?free|ללא גלוטן/.test(blob)) dietary.glutenFree = true;
                if (/\bkosher\b|כשר|מהדרין/.test(blob)) dietary.kosher = true;

                // If vegan, also mark as vegetarian
                if (dietary.vegan) dietary.vegetarian = true;

                // Ensure we always have boolean values
                dietary.vegetarian = dietary.vegetarian || false;
                dietary.vegan = dietary.vegan || false;
                dietary.glutenFree = dietary.glutenFree || false;
                dietary.kosher = dietary.kosher || false;

                (target as any).dietary = dietary;

                console.log(`🥗 Final dietary for ${target.name}:`, dietary);
            } else {
                console.log(`❌ Failed to get details for ${target.name}:`, s.status === "rejected" ? s.reason : "No value");
            }
        });
    }

    const out: RestaurantsResponse = {
        query: queryEcho,
        restaurants: [...top, ...list.slice(ENRICH_TOP_N)],
        meta: { source: "google", cached: false, nextPageToken: data?.next_page_token ?? null, enrichedTopN: ENRICH_TOP_N }
    };

    // Apply dietary filtering if requested
    if (dto.constraints?.dietary && dto.constraints.dietary.length > 0) {
        const requiredDietary = dto.constraints.dietary;
        console.log(`🥗 FILTERING for dietary requirements:`, requiredDietary);

        const filteredRestaurants = out.restaurants.filter((restaurant: any) => {
            const dietary = restaurant.dietary;
            console.log(`🔍 Checking ${restaurant.name}: dietary =`, dietary);

            if (!dietary) {
                console.log(`❌ ${restaurant.name} has no dietary info`);
                return false;
            }

            // Check if restaurant meets ALL dietary requirements
            const meetsRequirements = requiredDietary.every(requirement => {
                let meets = false;
                switch (requirement) {
                    case 'kosher': meets = dietary.kosher === true; break;
                    case 'vegan': meets = dietary.vegan === true; break;
                    case 'vegetarian': meets = dietary.vegetarian === true; break;
                    case 'gluten_free': meets = dietary.glutenFree === true; break;
                    case 'halal': meets = dietary.halal === true; break;
                    default: meets = false;
                }
                console.log(`  ${requirement}: ${meets ? '✅' : '❌'} (${dietary[requirement === 'gluten_free' ? 'glutenFree' : requirement]})`);
                return meets;
            });

            if (meetsRequirements) {
                console.log(`✅ ${restaurant.name} PASSES all requirements`);
            } else {
                console.log(`❌ ${restaurant.name} FAILS requirements`);
            }

            return meetsRequirements;
        });

        console.log(`🔍 Filtered from ${out.restaurants.length} to ${filteredRestaurants.length} restaurants`);
        out.restaurants = filteredRestaurants;
    } else {
        console.log(`🔍 No dietary filtering requested`);
    }

    // Log final dietary info for debugging
    console.log(`🍽️ FINAL RESPONSE - Dietary info summary:`);
    out.restaurants.forEach((r, i) => {
        if (i < ENRICH_TOP_N) {
            console.log(`  ${r.name}: dietary =`, (r as any).dietary);
        }
    });

    await cache.set(key, out, 15 * 60);
    return out;
}


