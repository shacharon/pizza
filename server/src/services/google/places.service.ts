const BASE = "https://maps.googleapis.com/maps/api/place";

function requireKey(): string {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) throw new Error("GOOGLE_API_KEY is not set");
    return key;
}

export async function textSearch(query: string, language = "he", signal?: AbortSignal): Promise<any> {
    const key = requireKey();
    const url = new URL(`${BASE}/textsearch/json`);
    url.searchParams.set("query", query);
    url.searchParams.set("language", language);
    url.searchParams.set("key", key);
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
    url.searchParams.set("fields", "name,formatted_address,geometry/location,rating,international_phone_number,website,opening_hours,url");
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
