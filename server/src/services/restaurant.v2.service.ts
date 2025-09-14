import type { FoodQueryDTO } from "@api";
import type { RestaurantsResponse, Restaurant } from "@api";
import { textSearch, fetchDetails } from "./google/places.service.js";
import { findCity } from './google/places.service.js';
import { InMemoryCache } from './cache.js';
import config from '../config/index.js';


const cache = new InMemoryCache();
const CACHE_VERSION = 'dietary-v1';



function buildQuery(dto: FoodQueryDTO): string {
    const hasGeo = !!((dto as any)?.constraints?.location && (dto as any)?.constraints?.radiusMeters);

    // Build query parts from type and dietary keywords
    const dietary = (dto.constraints as any)?.dietary as string[] | undefined;
    let dietPhrase: string | null = null;
    if (dietary && dietary.length > 0) {
        if (dietary.includes('vegan')) dietPhrase = 'vegan';
        else if (dietary.includes('vegetarian')) dietPhrase = 'vegetarian';
        else if (dietary.includes('gluten_free')) dietPhrase = 'gluten free';
        else if (dietary.includes('kosher')) dietPhrase = 'kosher';
    }

    // When geo-anchored, keep query minimal but embed dietary/type so Google can match
    if (hasGeo) {
        if (dto.type && dietPhrase) return `${dietPhrase} ${dto.type} restaurant`;
        if (dto.type) return `${dto.type} restaurant`;
        if (dietPhrase) return `${dietPhrase} restaurants`;
        return `restaurants`;
    }

    // City-anchored
    const city = dto.city ?? "Tel Aviv";
    if (dto.type && dietPhrase) return `${dietPhrase} ${dto.type} in ${city}`;
    if (dto.type) return `${dto.type} in ${city}`;
    if (dietPhrase) return `${dietPhrase} restaurants in ${city}`;
    // Support token-only queries like "vegan" or "restaurants"
    return `${dietPhrase ? dietPhrase + ' ' : ''}restaurants in ${city}`;
}

function cacheKey(dto: FoodQueryDTO) {
    const hasGeo = !!((dto as any)?.constraints?.location && (dto as any)?.constraints?.radiusMeters);
    const type = dto.type ?? 'any';
    const maxPrice = dto.constraints?.maxPrice ?? 'any';
    const dietary = dto.constraints?.dietary?.sort().join(',') ?? 'any';
    const lang = (dto as any).language ?? 'he';
    const cityOrGeo = hasGeo
        ? (() => {
            const { location, radiusMeters } = (dto as any).constraints;
            const lat = Number(location.lat).toFixed(3);
            const lng = Number(location.lng).toFixed(3);
            return `geo:${lat},${lng}:${radiusMeters}`;
        })()
        : (dto.city ?? 'tel aviv').toLowerCase().trim();
    return `restaurants:v2:${CACHE_VERSION}:${lang}:${cityOrGeo}:${type}:${maxPrice}:${dietary}`;
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

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371e3;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
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

    // Prefer location+radius when provided (near me or address geocoded upstream)
    let data: any = null;
    let list: Restaurant[] = [];
    const hasGeo = (dto as any)?.constraints?.location && (dto as any)?.constraints?.radiusMeters;
    try {
        if (hasGeo) {
            const { location, radiusMeters } = (dto as any).constraints;
            // Attempt 1: requested radius (e.g., 2km)
            data = await textSearch(buildQuery(dto), lang, undefined, { location, radiusMeters });
            list = Array.isArray(data?.results) ? data.results.slice(0, config.PROVIDER_RESULT_LIMIT).map(mapBasic) : [];
            // Defensive filter: ensure results are within radius
            list = list.filter(r => {
                const loc = (r as any).location;
                if (!loc) return true;
                return distanceMeters({ lat: location.lat, lng: location.lng }, { lat: loc.lat, lng: loc.lng }) <= (radiusMeters + 1500);
            });
            // If none, progressively widen near-me radius (stay geo-anchored)
            if (list.length === 0) {
                const widen1 = Math.min(6_000, Math.max(radiusMeters * 3, 3_000));
                const d1 = await textSearch(buildQuery(dto), lang, undefined, { location, radiusMeters: widen1 });
                let l1: Restaurant[] = Array.isArray(d1?.results) ? d1.results.slice(0, config.PROVIDER_RESULT_LIMIT).map(mapBasic) : [];
                l1 = l1.filter(r => {
                    const loc = (r as any).location;
                    if (!loc) return true;
                    return distanceMeters({ lat: location.lat, lng: location.lng }, { lat: loc.lat, lng: loc.lng }) <= (widen1 + 2000);
                });
                if (l1.length > 0) { data = d1; list = l1; }
            }
            if (list.length === 0) {
                const widen2 = 10_000;
                const d2 = await textSearch(buildQuery(dto), lang, undefined, { location, radiusMeters: widen2 });
                let l2: Restaurant[] = Array.isArray(d2?.results) ? d2.results.slice(0, config.PROVIDER_RESULT_LIMIT).map(mapBasic) : [];
                l2 = l2.filter(r => {
                    const loc = (r as any).location;
                    if (!loc) return true;
                    return distanceMeters({ lat: location.lat, lng: location.lng }, { lat: loc.lat, lng: loc.lng }) <= (widen2 + 3000);
                });
                if (l2.length > 0) { data = d2; list = l2; }
            }
            // Variant queries for type-only: try "{type} restaurant(s)" and common synonyms (e.g., pizzeria)
            if (list.length === 0 && dto.type) {
                const variants = [
                    `${dto.type} restaurant`,
                    `${dto.type} restaurants`,
                    dto.type.toLowerCase() === 'pizza' ? 'pizzeria' : ''
                ].filter(Boolean) as string[];
                for (const v of variants) {
                    const dv = await textSearch(v, lang, undefined, { location, radiusMeters: (dto as any).constraints.radiusMeters || 2_000 });
                    const lv: Restaurant[] = Array.isArray(dv?.results) ? dv.results.slice(0, config.PROVIDER_RESULT_LIMIT).map(mapBasic) : [];
                    if (lv.length > 0) { data = dv; list = lv; break; }
                }
            }
        }
    } catch { }
    // Fallback for type-only near-me queries: if no results, search generic restaurants then filter by type keyword
    if (list.length === 0 && hasGeo && dto.type) {
        try {
            const { location } = (dto as any).constraints;
            const generic = await textSearch('restaurants', lang, undefined, { location, radiusMeters: (dto as any).constraints.radiusMeters || 2_000 });
            const genericList: Restaurant[] = Array.isArray(generic?.results) ? generic.results.slice(0, config.PROVIDER_RESULT_LIMIT * 2).map(mapBasic) : [];
            const typeLower = String(dto.type).toLowerCase();
            const filtered = genericList.filter(r => {
                const name = (r.name || '').toLowerCase();
                const types = Array.isArray((r as any).types) ? ((r as any).types as string[]).join(' ').toLowerCase() : '';
                return name.includes(typeLower) || types.includes(typeLower);
            });
            if (filtered.length > 0) {
                list = filtered;
                data = generic;
            } else if (genericList.length > 0) {
                // Final safety: return generic restaurants so the UI is never empty for token-only queries
                list = genericList;
                data = generic;
            }
        } catch { }
    }
    // If geo + dietary query yielded nothing, broaden the textual query and rely on enrichment filtering
    const dietaryList: string[] | undefined = (dto as any)?.constraints?.dietary;
    if (list.length === 0 && hasGeo && dietaryList && dietaryList.length > 0) {
        try {
            const { location } = (dto as any).constraints;
            const broadDto: FoodQueryDTO = { ...dto } as any;
            // Temporarily drop diet phrase from query builder by cloning with no dietary
            (broadDto as any).constraints = { ...(dto as any).constraints };
            (broadDto as any).constraints.dietary = dietaryList; // keep for filtering later
            const q = dto.type ? `${dto.type}` : `restaurants`;
            // Use builder path with geo but without diet phrase: call textSearch directly
            const d = await textSearch(q, lang, undefined, { location, radiusMeters: (dto as any).constraints.radiusMeters || 2_000 });
            let l: Restaurant[] = Array.isArray(d?.results) ? d.results.slice(0, config.PROVIDER_RESULT_LIMIT).map(mapBasic) : [];
            l = l.filter(r => {
                const loc = (r as any).location;
                if (!loc) return true;
                return distanceMeters({ lat: location.lat, lng: location.lng }, { lat: loc.lat, lng: loc.lng }) <= (((dto as any).constraints.radiusMeters || 2_000) + 2000);
            });
            if (l.length > 0) { data = d; list = l; }
        } catch { }
    }

    if (list.length === 0) {
        // Final fallback: plain text search (only if we didn't have geo or widening failed)
        data = await textSearch(buildQuery(dto), lang);
        list = Array.isArray(data?.results) ? data.results.slice(0, config.PROVIDER_RESULT_LIMIT).map(mapBasic) : [];
    }

    // If no results, expand search by 10km around resolved city center (IL-first geocode)
    let expanded = false;
    if (list.length === 0 && dto.city) {
        try {
            const geo = await findCity(dto.city, lang);
            if (geo) {
                const expandedData = await textSearch(buildQuery(dto), lang, undefined, { location: { lat: geo.lat, lng: geo.lng }, radiusMeters: 10_000 });
                const expandedList: Restaurant[] = Array.isArray(expandedData?.results) ? expandedData.results.slice(0, config.PROVIDER_RESULT_LIMIT).map(mapBasic) : [];
                if (expandedList.length > 0) {
                    list = expandedList;
                    expanded = true;
                }
            }
        } catch { }
    }

    const wantDietary = !!((dto as any)?.constraints?.dietary && (dto as any).constraints.dietary.length > 0);
    const ENRICH_TOP_N = Math.min(wantDietary ? 40 : 12, list.length);
    const top = list.slice(0, ENRICH_TOP_N);
    if (ENRICH_TOP_N > 0) {
        console.log(`🔍 ENRICHING ${ENRICH_TOP_N} restaurants with dietary info...`);
        // Fetch details with a per-request timeout guard
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


