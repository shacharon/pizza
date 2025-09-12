import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FoodGridResultsComponent } from '../food-grid-results/food-grid-results.component';
import { FoodService, type NLUResponse } from '../food.service';

@Component({
    selector: 'app-food-grid-page',
    standalone: true,
    imports: [CommonModule, FormsModule, FoodGridResultsComponent],
    templateUrl: './food-grid-page.component.html',
    styleUrls: ['./food-grid-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoodGridPageComponent {

    private foodService = inject(FoodService);

    searchQuery = signal<string>('');
    isLoading = signal<boolean>(false);
    restaurants = signal<any[]>([]);
    errorMessage = signal<string>('');
    clarificationMessage = signal<string>('');

    private searchTimeout: any;

    async onSearch(event: Event) {
        const input = event.target as HTMLInputElement;
        const query = input.value.trim();

        // Clear previous timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        // Clear previous results
        this.errorMessage.set('');
        this.clarificationMessage.set('');

        if (!query) {
            this.restaurants.set([]);
            this.searchQuery.set('');
            return;
        }

        // Show loading and debounce
        this.isLoading.set(true);
        this.searchTimeout = setTimeout(async () => {
            await this.performLLMSearch(query);
        }, 800);
    }

    async onSearchClick() {
        // Trigger immediate search on button click
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        const query = this.searchQuery().trim();
        if (query) {
            this.isLoading.set(true);
            await this.performLLMSearch(query);
        }
    }

    private async performLLMSearch(query: string) {
        try {
            this.searchQuery.set(query);

            const response = await this.foodService.parseAndSearch({
                text: query,
                language: 'en' // TODO: detect language or make configurable
            }).toPromise();

            this.isLoading.set(false);

            if (!response) {
                this.errorMessage.set('No response from server');
                return;
            }

            if (response.type === 'results') {
                this.restaurants.set(response.restaurants || []);
                this.clarificationMessage.set('');
            } else if (response.type === 'clarify') {
                this.clarificationMessage.set(response.message);
                this.restaurants.set([]);
            }

        } catch (error) {
            this.isLoading.set(false);
            this.errorMessage.set('Search failed. Please try again.');
            console.error('LLM search error:', error);
        }
    }
}
