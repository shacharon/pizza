import { setTimeout as delay } from 'node:timers/promises';

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'Mozilla/5.0 link-preview' } });
    } finally {
        clearTimeout(id);
    }
}

export async function fetchOpenGraph(url: string, timeoutMs: number = 2500): Promise<{ imageUrl?: string; title?: string; description?: string }> {
    try {
        const res = await fetchWithTimeout(url, timeoutMs);
        const html = await res.text();
        const pick = (prop: string) => {
            const re = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
            const m = html.match(re);
            return m?.[1];
        };
        const image = pick('og:image') || pick('twitter:image');
        const title = pick('og:title');
        const description = pick('og:description');
        return { imageUrl: image, title, description };
    } catch {
        return {};
    }
}

export async function enrichCards(cards: { title: string; url: string; subtitle?: string }[], timeoutMs?: number) {
    const enriched = await Promise.all(cards.map(async c => {
        const og = await fetchOpenGraph(c.url, timeoutMs);
        return { ...c, imageUrl: og.imageUrl };
    }));
    return enriched;
}


