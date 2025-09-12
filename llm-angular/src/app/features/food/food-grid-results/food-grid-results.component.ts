import { Component, ChangeDetectionStrategy, signal, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Restaurant {
    id?: string;
    name: string;
    cuisine?: string;
    rating?: number;
    priceRange?: string;
    imageUrl?: string;
    photoUrl?: string; // Google Places photo URL
    deliveryTime?: string;
    description?: string;
    address?: string;
    items?: { name: string; price: number }[];
    placeId?: string;
    priceLevel?: number;
    location?: { lat: number; lng: number }; // Google Places coordinates
    types?: string[]; // Google Places types array
    website?: string; // Restaurant website URL
}

@Component({
    selector: 'app-food-grid-results',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './food-grid-results.component.html',
    styleUrls: ['./food-grid-results.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoodGridResultsComponent {

    // Input from parent component
    searchQuery = input<string>('');
    isLoading = input<boolean>(false);
    restaurants = input<Restaurant[]>([]);
    userLocation = input<{ lat: number; lng: number } | null>(null);
    showDistances = input<boolean>(false);

    // Map backend data to frontend format with fallback images
    displayRestaurants = computed(() => {
        const restaurants = this.restaurants();

        // Debug: Log what we receive in the component
        console.log('=== FRONTEND COMPONENT DATA ===');
        console.log('Restaurants received:', restaurants);
        console.log('User location:', this.userLocation());
        console.log('Show distances:', this.showDistances());
        if (restaurants.length > 0) {
            console.log('First restaurant structure:', restaurants[0]);
            console.log('Available keys:', Object.keys(restaurants[0]));
        }
        console.log('===============================');

        return restaurants.map((restaurant, index) => ({
            id: restaurant.id || `restaurant-${index}`,
            name: restaurant.name,
            cuisine: restaurant.cuisine || this.getCuisineFromTypes(restaurant.types) || this.guessCuisineFromName(restaurant.name),
            rating: restaurant.rating || this.generateFallbackRating(),
            priceRange: restaurant.priceRange || this.convertPriceLevel(restaurant.priceLevel) || this.generatePriceRange(restaurant.items),
            imageUrl: (() => {
                const photoUrl = restaurant.photoUrl;
                const imageUrl = restaurant.imageUrl;
                const fallback = this.getFallbackImage(restaurant.name);

                console.log(`🖼️ Image mapping for "${restaurant.name}":`, {
                    photoUrl: photoUrl ? '✅ HAS GOOGLE PHOTO' : '❌ NO GOOGLE PHOTO',
                    photoUrlValue: photoUrl,
                    imageUrl: imageUrl ? '✅ HAS IMAGE URL' : '❌ NO IMAGE URL',
                    imageUrlValue: imageUrl,
                    fallback: '🎨 FALLBACK',
                    fallbackValue: fallback,
                    final: photoUrl || imageUrl || fallback
                });

                return photoUrl || imageUrl || fallback;
            })(),
            deliveryTime: this.getLocationInfo(restaurant),
            description: restaurant.description || restaurant.address || 'Great food at this location',
            address: restaurant.address,
            items: restaurant.items
        }));
    });

    private getFallbackImage(restaurantName: string): string {
        // Generate food images based on restaurant name/type
        const name = restaurantName.toLowerCase();

        // Pizza images
        if (name.includes('pizza') || name.includes('papi')) {
            const pizzaImages = [
                'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=300&fit=crop',
                'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400&h=300&fit=crop',
                'https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=400&h=300&fit=crop'
            ];
            return this.getRandomImage(pizzaImages, restaurantName);
        }

        // Sushi images
        if (name.includes('sushi') || name.includes('japan')) {
            const sushiImages = [
                'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400&h=300&fit=crop',
                'https://images.unsplash.com/photo-1553621042-f6e147245754?w=400&h=300&fit=crop',
                'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=400&h=300&fit=crop'
            ];
            return this.getRandomImage(sushiImages, restaurantName);
        }

        // Burger images
        if (name.includes('burger') || name.includes('mcdonald')) {
            const burgerImages = [
                'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop',
                'https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&h=300&fit=crop',
                'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=400&h=300&fit=crop'
            ];
            return this.getRandomImage(burgerImages, restaurantName);
        }

        // Cafe/Coffee images
        if (name.includes('aroma') || name.includes('coffee') || name.includes('cafe')) {
            const cafeImages = [
                'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&h=300&fit=crop',
                'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400&h=300&fit=crop',
                'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=400&h=300&fit=crop'
            ];
            return this.getRandomImage(cafeImages, restaurantName);
        }

        // Bakery images
        if (name.includes('greg') || name.includes('bakery')) {
            const bakeryImages = [
                'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=300&fit=crop',
                'https://images.unsplash.com/photo-1555507036-ab794f4ade6a?w=400&h=300&fit=crop',
                'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&h=300&fit=crop'
            ];
            return this.getRandomImage(bakeryImages, restaurantName);
        }

        // General restaurant images
        const generalImages = [
            'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop',
            'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400&h=300&fit=crop',
            'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=300&fit=crop',
            'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=300&fit=crop',
            'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop'
        ];
        return this.getRandomImage(generalImages, restaurantName);
    }

    private getRandomImage(images: string[], seed: string): string {
        // Use restaurant name as seed for consistent randomization
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            const char = seed.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        const index = Math.abs(hash) % images.length;
        return images[index];
    }

    private getCuisineFromTypes(types?: string[]): string | null {
        if (!types || !Array.isArray(types)) return null;

        // Debug: log the types we receive
        console.log('Google Places types:', types);

        // Map Google Places types to cuisine categories
        // Reference: https://developers.google.com/maps/documentation/places/web-service/supported_types

        for (const type of types) {
            switch (type) {
                // Specific cuisine types
                case 'italian_restaurant':
                case 'pizza_restaurant':
                    return 'Italian';

                case 'japanese_restaurant':
                case 'sushi_restaurant':
                    return 'Japanese';

                case 'chinese_restaurant':
                    return 'Chinese';

                case 'mexican_restaurant':
                    return 'Mexican';

                case 'indian_restaurant':
                    return 'Indian';

                case 'french_restaurant':
                    return 'French';

                case 'american_restaurant':
                case 'hamburger_restaurant':
                    return 'American';

                case 'thai_restaurant':
                    return 'Thai';

                case 'greek_restaurant':
                    return 'Greek';

                case 'korean_restaurant':
                    return 'Korean';

                case 'mediterranean_restaurant':
                    return 'Mediterranean';

                case 'seafood_restaurant':
                    return 'Seafood';

                case 'steakhouse':
                    return 'Steakhouse';

                case 'vegetarian_restaurant':
                    return 'Vegetarian';

                case 'bakery':
                    return 'Bakery';

                case 'cafe':
                case 'coffee_shop':
                    return 'Cafe';

                case 'fast_food_restaurant':
                    return 'Fast Food';

                case 'bar':
                case 'night_club':
                    return 'Bar';
            }
        }

        // If we have restaurant-related types but no specific cuisine, return generic
        if (types.some(type =>
            type.includes('restaurant') ||
            type.includes('food') ||
            type.includes('meal')
        )) {
            return 'Restaurant';
        }

        return null;
    }

    private guessCuisineFromName(name: string): string {
        const lowerName = name.toLowerCase();
        if (lowerName.includes('pizza') || lowerName.includes('papi')) return 'Italian';
        if (lowerName.includes('sushi') || lowerName.includes('japan')) return 'Japanese';
        if (lowerName.includes('burger') || lowerName.includes('mcdonald')) return 'American';
        if (lowerName.includes('aroma') || lowerName.includes('greg')) return 'Cafe';
        if (lowerName.includes('moses')) return 'Israeli';
        return 'Restaurant';
    }

    private generateFallbackRating(): number {
        return Math.round((Math.random() * 1.5 + 3.5) * 10) / 10; // 3.5-5.0 range
    }

    private convertPriceLevel(priceLevel?: number): string | null {
        if (priceLevel === undefined || priceLevel === null) return null;

        // Google Places price levels: 0 = Free, 1 = Inexpensive, 2 = Moderate, 3 = Expensive, 4 = Very Expensive
        switch (priceLevel) {
            case 0: return '$';
            case 1: return '$';
            case 2: return '$$';
            case 3: return '$$$';
            case 4: return '$$$$';
            default: return null;
        }
    }

    private generatePriceRange(items?: { name: string; price: number }[]): string {
        if (!items || items.length === 0) return '$$';

        const avgPrice = items.reduce((sum, item) => sum + item.price, 0) / items.length;
        if (avgPrice < 30) return '$';
        if (avgPrice < 60) return '$$';
        if (avgPrice < 100) return '$$$';
        return '$$$$';
    }

    private getLocationInfo(restaurant: Restaurant): string {
        if (!this.showDistances()) {
            // Show neighborhood when distances are disabled
            return this.extractNeighborhood(restaurant.address) || 'Restaurant location';
        }

        // Try to show distance when enabled
        const distance = this.calculateDistance(restaurant);
        if (distance) {
            return distance;
        }

        // Fallback to neighborhood if no coordinates
        return this.extractNeighborhood(restaurant.address) || 'Distance unavailable';
    }

    private calculateDistance(restaurant: Restaurant): string | null {
        const userLoc = this.userLocation();
        if (!userLoc) return null;

        // Debug: log what data we have
        console.log('Restaurant data for distance calc:', {
            name: restaurant.name,
            location: restaurant.location,
            address: restaurant.address,
            photoUrl: restaurant.photoUrl,
            imageUrl: restaurant.imageUrl,
            types: restaurant.types,
            allData: restaurant
        });

        // Check for restaurant coordinates
        const restaurantLoc = restaurant.location;
        if (!restaurantLoc || !restaurantLoc.lat || !restaurantLoc.lng) {
            console.log('No coordinates found for:', restaurant.name);
            return null;
        }

        const distance = this.haversineDistance(
            userLoc.lat,
            userLoc.lng,
            restaurantLoc.lat,
            restaurantLoc.lng
        );

        if (distance < 1) {
            return `${Math.round(distance * 1000)} m away`;
        } else {
            return `${distance.toFixed(1)} km away`;
        }
    }

    private haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.toRadians(lat2 - lat1);
        const dLng = this.toRadians(lng2 - lng1);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private toRadians(degrees: number): number {
        return degrees * (Math.PI / 180);
    }

    private extractNeighborhood(address?: string): string | null {
        if (!address) return null;

        // Extract meaningful part from address
        // "123 Dizengoff St, Tel Aviv" → "Dizengoff St"
        const parts = address.split(',');
        if (parts.length > 1) {
            const streetPart = parts[0].trim();
            // Remove house numbers: "123 Dizengoff St" → "Dizengoff St"
            const withoutNumber = streetPart.replace(/^\d+\s*/, '');
            return withoutNumber || streetPart;
        }

        return address.length > 30 ? address.substring(0, 30) + '...' : address;
    }

    onImageError(event: Event, restaurantName: string) {
        const img = event.target as HTMLImageElement;
        console.error(`❌ Image failed to load for "${restaurantName}":`, {
            src: img.src,
            error: event
        });

        // Fallback to our curated image when Google Photo fails
        const fallbackUrl = this.getFallbackImage(restaurantName);
        if (img.src !== fallbackUrl) {
            console.log(`🔄 Switching to fallback image for "${restaurantName}":`, fallbackUrl);
            img.src = fallbackUrl;
        }
    }

    onImageLoad(event: Event, restaurantName: string) {
        const img = event.target as HTMLImageElement;
        console.log(`✅ Image loaded successfully for "${restaurantName}":`, {
            src: img.src,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight
        });
    }

    onRestaurantClick(restaurant: any) {
        const website = restaurant.website;

        if (website) {
            // Open restaurant website in new tab
            console.log(`🔗 Opening website for "${restaurant.name}":`, website);
            window.open(website, '_blank', 'noopener,noreferrer');
        } else {
            // Fallback: search for restaurant on Google
            const searchQuery = encodeURIComponent(`${restaurant.name} ${restaurant.address || ''}`);
            const googleSearchUrl = `https://www.google.com/search?q=${searchQuery}`;
            console.log(`🔍 No website found for "${restaurant.name}", opening Google search:`, googleSearchUrl);
            window.open(googleSearchUrl, '_blank', 'noopener,noreferrer');
        }
    }

}

