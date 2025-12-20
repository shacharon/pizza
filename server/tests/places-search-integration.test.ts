import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Places Search Integration Tests
 * 
 * Tests ACTUAL API calls to POST /api/places/search
 * Requires server to be running on localhost:3000
 * 
 * Coverage:
 * - 6 languages (en, he, ar, ru, es, fr)
 * - 3 cities (Tel Aviv, Paris, New York)
 * - 4 cuisines (Pizza, Italian, Sushi, Burger)
 */

const API_URL = 'http://localhost:3000/api/places/search';
const TIMEOUT = 10000; // 10s timeout

interface SearchRequest {
    text: string;
    sessionId: string;
    userLocation: null;
}

interface SearchResponse {
    query: {
        mode: string;
        language: string;
    };
    restaurants: Array<{
        placeId: string;
        name: string;
        address: string;
        rating: number;
        location: { lat: number; lng: number };
    }>;
    meta: {
        tookMs: number;
        appliedFilters: string[];
    };
}

async function searchPlaces(text: string, sessionId: string): Promise<SearchResponse> {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sessionId, userLocation: null }),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return response.json();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PIZZA IN PARIS 🇫🇷🍕
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('🍕 Pizza in Paris - 6 Languages', () => {

    it('[EN] pizza in paris', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('pizza in paris', 'test-pizza-paris-en');

        assert.equal(result.query.language, 'en');
        assert.equal(result.restaurants.length, 10);
        assert.ok(result.meta.tookMs < 7000, `Too slow: ${result.meta.tookMs}ms`);

        // Verify Paris location (approx 48.8°N, 2.3°E)
        const avgLat = result.restaurants.reduce((sum, r) => sum + r.location.lat, 0) / 10;
        assert.ok(avgLat > 48 && avgLat < 49, `Not Paris: lat=${avgLat}`);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[HE] פיצה בפריז', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('פיצה בפריז', 'test-pizza-paris-he');

        assert.equal(result.query.language, 'he');
        assert.equal(result.restaurants.length, 10);
        assert.ok(result.meta.tookMs < 7000);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[AR] بيتزا في باريس', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('بيتزا في باريس', 'test-pizza-paris-ar');

        assert.equal(result.query.language, 'ar');
        assert.equal(result.restaurants.length, 10);
        assert.ok(result.meta.tookMs < 7000);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[RU] пицца в Париже', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('пицца в Париже', 'test-pizza-paris-ru');

        assert.equal(result.query.language, 'ru');
        assert.equal(result.restaurants.length, 10);
        assert.ok(result.meta.tookMs < 7000);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[ES] pizza en París', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('pizza en París', 'test-pizza-paris-es');

        assert.equal(result.query.language, 'es');
        assert.equal(result.restaurants.length, 10);
        assert.ok(result.meta.tookMs < 7000);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[FR] pizza à Paris', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('pizza à Paris', 'test-pizza-paris-fr');

        assert.equal(result.query.language, 'fr');
        assert.equal(result.restaurants.length, 10);
        assert.ok(result.meta.tookMs < 7000);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SUSHI IN NEW YORK 🇺🇸🍣
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('🍣 Sushi in New York - 6 Languages', () => {

    it('[EN] sushi in new york', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('sushi in new york', 'test-sushi-ny-en');

        assert.equal(result.query.language, 'en');
        assert.equal(result.restaurants.length, 10);
        assert.ok(result.meta.tookMs < 7000);

        // Verify NYC location (approx 40.7°N, -74°W)
        const avgLat = result.restaurants.reduce((sum, r) => sum + r.location.lat, 0) / 10;
        const avgLng = result.restaurants.reduce((sum, r) => sum + r.location.lng, 0) / 10;
        assert.ok(avgLat > 40 && avgLat < 41, `Not NYC: lat=${avgLat}`);
        assert.ok(avgLng < -73 && avgLng > -75, `Not NYC: lng=${avgLng}`);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[HE] סושי בניו יורק', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('סושי בניו יורק', 'test-sushi-ny-he');

        assert.equal(result.query.language, 'he');
        assert.equal(result.restaurants.length, 10);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[AR] سوشي في نيويورك', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('سوشي في نيويورك', 'test-sushi-ny-ar');

        assert.equal(result.query.language, 'ar');
        assert.equal(result.restaurants.length, 10);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[RU] суши в Нью-Йорке', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('суши в Нью-Йорке', 'test-sushi-ny-ru');

        assert.equal(result.query.language, 'ru');
        assert.equal(result.restaurants.length, 10);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[ES] sushi en Nueva York', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('sushi en Nueva York', 'test-sushi-ny-es');

        assert.equal(result.query.language, 'es');
        assert.equal(result.restaurants.length, 10);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[FR] sushi à New York', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('sushi à New York', 'test-sushi-ny-fr');

        assert.equal(result.query.language, 'fr');
        assert.equal(result.restaurants.length, 10);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BURGERS IN TEL AVIV 🇮🇱🍔
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('🍔 Burgers in Tel Aviv - 6 Languages', () => {

    it('[EN] burgers in tel aviv', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('burgers in tel aviv', 'test-burger-tlv-en');

        assert.equal(result.query.language, 'en');
        assert.equal(result.restaurants.length, 10);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[HE] המבורגר בתל אביב', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('המבורגר בתל אביב', 'test-burger-tlv-he');

        assert.equal(result.query.language, 'he');
        assert.equal(result.restaurants.length, 10);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[AR] برجر في تل أبيب', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('برجر في تل أبيب', 'test-burger-tlv-ar');

        assert.equal(result.query.language, 'ar');
        assert.equal(result.restaurants.length, 10);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[RU] бургеры в Тель-Авиве', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('бургеры в Тель-Авиве', 'test-burger-tlv-ru');

        assert.equal(result.query.language, 'ru');
        assert.equal(result.restaurants.length, 10);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[ES] hamburguesas en Tel Aviv', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('hamburguesas en Tel Aviv', 'test-burger-tlv-es');

        assert.equal(result.query.language, 'es');
        assert.equal(result.restaurants.length, 10);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[FR] burgers à Tel Aviv', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('burgers à Tel Aviv', 'test-burger-tlv-fr');

        assert.equal(result.query.language, 'fr');
        assert.equal(result.restaurants.length, 10);

        console.log(`  ✅ ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VARIETY SCENARIOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('🌍 Additional Variety Tests', () => {

    it('[EN] thai food in paris', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('thai food in paris', 'test-thai-paris-en');

        assert.equal(result.restaurants.length, 10);
        console.log(`  ✅ Thai in Paris: ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[ES] comida mexicana en Nueva York', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('comida mexicana en Nueva York', 'test-mexican-ny-es');

        assert.equal(result.restaurants.length, 10);
        console.log(`  ✅ Mexican in NYC: ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[FR] restaurant chinois à Paris', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('restaurant chinois à Paris', 'test-chinese-paris-fr');

        assert.equal(result.restaurants.length, 10);
        console.log(`  ✅ Chinese in Paris: ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[HE] אוכל הודי בתל אביב', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('אוכל הודי בתל אביב', 'test-indian-tlv-he');

        assert.equal(result.restaurants.length, 10);
        console.log(`  ✅ Indian in TLV: ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[RU] стейк-хаус в Нью-Йорке', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('стейк-хаус в Нью-Йорке', 'test-steakhouse-ny-ru');

        assert.equal(result.restaurants.length, 10);
        console.log(`  ✅ Steakhouse in NYC: ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });

    it('[AR] مطعم فرنسي في باريس', { timeout: TIMEOUT }, async () => {
        const result = await searchPlaces('مطعم فرنسي في باريس', 'test-french-paris-ar');

        assert.equal(result.restaurants.length, 10);
        console.log(`  ✅ French in Paris: ${result.restaurants.length} results in ${result.meta.tookMs}ms`);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PERFORMANCE & CONSISTENCY CHECKS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('⚡ Performance & Consistency', () => {

    it('All languages return same city for "pizza in paris"', { timeout: TIMEOUT * 6 }, async () => {
        const languages = [
            { text: 'pizza in paris', lang: 'en' },
            { text: 'פיצה בפריז', lang: 'he' },
            { text: 'بيتزا في باريس', lang: 'ar' },
            { text: 'пицца в Париже', lang: 'ru' },
            { text: 'pizza en París', lang: 'es' },
            { text: 'pizza à Paris', lang: 'fr' },
        ];

        const results = await Promise.all(
            languages.map(({ text, lang }) => searchPlaces(text, `consistency-paris-${lang}`))
        );

        // All should be in Paris (48.8°N, 2.3°E)
        results.forEach((result, idx) => {
            const avgLat = result.restaurants.reduce((sum, r) => sum + r.location.lat, 0) / 10;
            assert.ok(avgLat > 48 && avgLat < 49,
                `${languages[idx].lang}: Not Paris (lat=${avgLat})`);
        });

        console.log('  ✅ All 6 languages correctly geocoded to Paris');
    });

    it('Response time < 7s for all queries', { timeout: TIMEOUT * 3 }, async () => {
        const queries = [
            'pizza in paris',
            'sushi in new york',
            'burgers in tel aviv',
        ];

        const results = await Promise.all(
            queries.map((text, idx) => searchPlaces(text, `perf-test-${idx}`))
        );

        const avgTime = results.reduce((sum, r) => sum + r.meta.tookMs, 0) / results.length;

        results.forEach((result, idx) => {
            assert.ok(result.meta.tookMs < 7000,
                `Too slow: ${queries[idx]} took ${result.meta.tookMs}ms`);
        });

        console.log(`  ✅ Avg response time: ${Math.round(avgTime)}ms`);
    });
});

