import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Restaurant {
    id: string;
    name: string;
    cuisine: string;
    rating: number;
    priceRange: string;
    imageUrl: string;
    deliveryTime: string;
    description: string;
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

    // Mock data - will be replaced with real data later
    restaurants = signal<Restaurant[]>([
        {
            id: '1',
            name: 'Mario\'s Authentic Pizza',
            cuisine: 'Italian',
            rating: 4.8,
            priceRange: '$$',
            imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=300&fit=crop',
            deliveryTime: '25-35 min',
            description: 'Wood-fired pizzas with fresh ingredients'
        },
        {
            id: '2',
            name: 'Sakura Sushi Bar',
            cuisine: 'Japanese',
            rating: 4.9,
            priceRange: '$$$',
            imageUrl: 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400&h=300&fit=crop',
            deliveryTime: '20-30 min',
            description: 'Fresh sashimi and traditional rolls'
        },
        {
            id: '3',
            name: 'Burger Junction',
            cuisine: 'American',
            rating: 4.5,
            priceRange: '$',
            imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop',
            deliveryTime: '15-25 min',
            description: 'Juicy burgers and crispy fries'
        },
        {
            id: '4',
            name: 'Spice Garden',
            cuisine: 'Indian',
            rating: 4.7,
            priceRange: '$$',
            imageUrl: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=300&fit=crop',
            deliveryTime: '30-40 min',
            description: 'Authentic curries and tandoor specialties'
        },
        {
            id: '5',
            name: 'Taco Libre',
            cuisine: 'Mexican',
            rating: 4.6,
            priceRange: '$',
            imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400&h=300&fit=crop',
            deliveryTime: '20-30 min',
            description: 'Street-style tacos and fresh guacamole'
        },
        {
            id: '6',
            name: 'Le Petit Bistro',
            cuisine: 'French',
            rating: 4.9,
            priceRange: '$$$$',
            imageUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop',
            deliveryTime: '45-55 min',
            description: 'Classic French cuisine with modern flair'
        }
    ]);

}

