const BASE = "https://maps.googleapis.com/maps/api/place";

function requireKey(): string {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) throw new Error("GOOGLE_API_KEY is not set");
    return key;
}

export async function textSearch(query: string, language = "he", signal?: AbortSignal, opts?: { location?: { lat: number; lng: number }; radiusMeters?: number }): Promise<any> {
    const key = requireKey();
    const url = new URL(`${BASE}/textsearch/json`);
    url.searchParams.set("query", query);
    url.searchParams.set("language", language);
    url.searchParams.set("key", key);
    if (opts?.location) {
        url.searchParams.set("location", `${opts.location.lat},${opts.location.lng}`);
    }
    if (opts?.radiusMeters) {
        url.searchParams.set("radius", String(opts.radiusMeters));
    }
    const res = await fetch(url, { signal: signal ?? null });
    if (!res.ok) throw new Error(`Places TextSearch failed: ${res.status}`);
    const json = await res.json();
    const status = json?.status as string | undefined;
    if (status && status !== "OK" && status !== "ZERO_RESULTS") {
        const em = json?.error_message ? `: ${json.error_message}` : "";
        throw new Error(`Places TextSearch error ${status}${em}`);
    }
    return json;
}

export async function fetchDetails(placeId: string, language = "he", signal?: AbortSignal): Promise<any> {
    const key = requireKey();
    const url = new URL(`${BASE}/details/json`);
    url.searchParams.set("place_id", placeId);
    url.searchParams.set("language", language);
    url.searchParams.set("key", key);
    url.searchParams.set("fields", "name,formatted_address,geometry/location,rating,international_phone_number,website,opening_hours,url,editorial_summary,reviews,types");
    const res = await fetch(url, { signal: signal ?? null });
    if (!res.ok) throw new Error(`Places Details failed: ${res.status}`);
    const json = await res.json();
    const status = json?.status as string | undefined;
    if (status && status !== "OK" && status !== "ZERO_RESULTS") {
        const em = json?.error_message ? `: ${json.error_message}` : "";
        throw new Error(`Places Details error ${status}${em}`);
    }
    return json?.result;
}

export async function findCity(input: string, language = "he", signal?: AbortSignal): Promise<{ city: string; lat: number; lng: number } | null> {
    const key = requireKey();
    // IL-first strategy to favor Hebrew cities like "ראשון לציון"
    async function geocodeIL(addr: string) {
        const url = new URL(`https://maps.googleapis.com/maps/api/geocode/json`);
        url.searchParams.set("address", addr);
        url.searchParams.set("language", language);
        url.searchParams.set("key", key);
        url.searchParams.set("components", "country:IL");
        url.searchParams.set("region", "il");
        const res = await fetch(url, { signal: signal ?? null });
        if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
        const json = await res.json();
        if (json?.status && json.status !== "OK" && json.status !== "ZERO_RESULTS") {
            const em = json?.error_message ? `: ${json.error_message}` : "";
            throw new Error(`Geocode error ${json.status}${em}`);
        }
        return (json?.results || []) as any[];
    }

    const preferredTypes = new Set(['locality', 'sublocality', 'postal_town', 'administrative_area_level_3', 'administrative_area_level_2', 'administrative_area_level_1', 'political']);
    const pick = (arr: any[]) => arr.find(r => Array.isArray(r.types) && r.types.some((t: string) => preferredTypes.has(t))) || arr[0] || null;

    // 1) Geocode IL
    let results = await geocodeIL(input);
    let chosen = pick(results);
    // 2) If still nothing, try with explicit HE context suffix
    if (!chosen) {
        results = await geocodeIL(`${input} ישראל`);
        chosen = pick(results);
    }
    // 3) If still nothing, try Places Text Search in IL
    if (!chosen) {
        try {
            const ts = new URL(`${BASE}/textsearch/json`);
            ts.searchParams.set("query", `${input} ישראל`);
            ts.searchParams.set("language", language);
            ts.searchParams.set("key", key);
            const tsRes = await fetch(ts, { signal: signal ?? null });
            if (tsRes.ok) {
                const tsJson = await tsRes.json();
                const arr: any[] = tsJson?.results || [];
                chosen = pick(arr);
            }
        } catch { }
    }
    if (!chosen) return null;
    const cityComp = (chosen.address_components || []).find((c: any) => Array.isArray(c.types) && (c.types.includes('locality') || c.types.includes('postal_town') || c.types.includes('administrative_area_level_2') || c.types.includes('administrative_area_level_1')));
    const city = cityComp?.long_name || chosen.name || chosen.formatted_address || input;
    const lat = chosen.geometry?.location?.lat;
    const lng = chosen.geometry?.location?.lng;
    if (typeof lat === 'number' && typeof lng === 'number') return { city, lat, lng };
    return null;
}
