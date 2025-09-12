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

    // Map backend data to frontend format with fallback images
    displayRestaurants = computed(() => {
        return this.restaurants().map((restaurant, index) => ({
            id: restaurant.id || `restaurant-${index}`,
            name: restaurant.name,
            cuisine: restaurant.cuisine || this.guessCuisineFromName(restaurant.name),
            rating: restaurant.rating || this.generateFallbackRating(),
            priceRange: restaurant.priceRange || this.convertPriceLevel(restaurant.priceLevel) || this.generatePriceRange(restaurant.items),
            imageUrl: restaurant.photoUrl || restaurant.imageUrl || this.getFallbackImage(restaurant.name),
            deliveryTime: restaurant.deliveryTime || '20-30 min',
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

}

