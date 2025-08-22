export interface PlaceCard {
    title: string;
    subtitle?: string; // price text (₪ symbols)
    url: string;       // restaurant website when available; else safe search URL
}

function priceToShekelSymbols(level?: number): string | undefined {
    if (level === undefined || level === null) return undefined;
    const n = Math.min(4, Math.max(1, Math.floor(level)));
    return '₪'.repeat(n);
}

export async function getPlaceCards(query: string, limit: number = 7): Promise<PlaceCard[]> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return [];
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', query);
    url.searchParams.set('key', apiKey);
    try {
        const resp = await fetch(url.toString());
        const data: any = await resp.json();
        const results: any[] = Array.isArray(data?.results) ? data.results : [];
        const top = results.slice(0, limit);
        const enriched = await Promise.all(top.map(async r => {
            let website: string | undefined;
            let priceText: string | undefined = priceToShekelSymbols(r.price_level);
            try {
                const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
                detailsUrl.searchParams.set('place_id', r.place_id);
                detailsUrl.searchParams.set('fields', 'website,price_level');
                detailsUrl.searchParams.set('key', apiKey);
                const det = await fetch(detailsUrl.toString());
                const detJson: any = await det.json();
                website = detJson?.result?.website;
                if (detJson?.result?.price_level !== undefined) {
                    priceText = priceToShekelSymbols(detJson.result.price_level) || priceText;
                }
            } catch { }
            const safeSearch = `https://www.google.com/search?q=${encodeURIComponent(r.name + ' ' + (r.formatted_address || ''))}`;
            return {
                title: r.name,
                subtitle: priceText,
                url: website || safeSearch
            } as PlaceCard;
        }));
        return enriched;
    } catch {
        return [];
    }
}


