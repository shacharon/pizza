import type { RestaurantsResponse, Restaurant } from "@api";

// Simple stub to unblock UI wiring. Replace with Google Places implementation later.

function stubRestaurants(city: string): Restaurant[] {
    const base: Restaurant[] = [
        { name: "Domino's Pizza", address: `Main St, ${city}`, placeId: "stub_1", rating: 4.1, location: { lat: 0, lng: 0 } },
        { name: "Pizza Hut", address: `Center Ave, ${city}`, placeId: "stub_2", rating: 3.9, location: { lat: 0, lng: 0 } },
        { name: "Japanika", address: `Downtown Rd, ${city}`, placeId: "stub_3", rating: 4.2, location: { lat: 0, lng: 0 } },
        { name: "Moses Burger", address: `Liberty Blvd, ${city}`, placeId: "stub_4", rating: 4.0, location: { lat: 0, lng: 0 } },
        { name: "Aroma Cafe", address: `Park Lane, ${city}`, placeId: "stub_5", rating: 4.0, location: { lat: 0, lng: 0 } },
    ];
    return base;
}

export async function getRestaurantsStub(params: { city: string; language?: string; page?: number }): Promise<RestaurantsResponse> {
    const city = params.city || "Tel Aviv";
    const language = params.language || "he";
    const page = params.page ?? 1;
    const restaurants = stubRestaurants(city);
    return {
        query: { city, language: language as any, page },
        restaurants,
        meta: { source: "google", cached: false, nextPageToken: null, enrichedTopN: 0 }
    };
}


