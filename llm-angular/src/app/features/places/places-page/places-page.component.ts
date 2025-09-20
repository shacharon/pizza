import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { PlacesApiService, type PlacesResponseDto } from '../../../shared/services/places-api.service';
import { NgIf, NgFor, JsonPipe, DecimalPipe } from '@angular/common';

@Component({
    selector: 'app-places-page',
    standalone: true,
    templateUrl: './places-page.component.html',
    styleUrls: ['./places-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgIf, NgFor, JsonPipe, DecimalPipe]
})
export class PlacesPageComponent {
    readonly title = signal('Places');
    readonly query = signal('vegan pizza near me');
    readonly language = signal<'he' | 'en'>('he');
    readonly mode = signal<'textsearch' | 'nearbysearch' | 'findplace'>('textsearch');

    readonly loading = signal(false);
    readonly error = signal<string | null>(null);
    readonly results = signal<PlacesResponseDto | null>(null);
    readonly userLocation = signal<{ lat: number; lng: number } | null>(null);

    constructor(private readonly api: PlacesApiService) { }

    get canSearch(): boolean {
        return this.query().trim().length > 0 && !this.loading();
    }

    onSubmit(): void {
        if (!this.canSearch) return;
        this.loading.set(true);
        this.error.set(null);
        const selected = this.mode();
        const request$ = selected === 'textsearch'
            ? this.api.searchWithText({ text: this.query(), language: this.language(), userLocation: this.userLocation() ?? undefined })
            : this.api.searchWithSchema({
                intent: 'find_food',
                provider: 'google_places',
                search: selected === 'findplace'
                    ? { mode: 'findplace', query: this.query(), target: { kind: 'place', place: this.query() }, filters: { language: this.language() } }
                    : { mode: 'nearbysearch', target: this.userLocation() ? { kind: 'coords', coords: this.userLocation() } : { kind: 'me' }, filters: { keyword: this.query(), language: this.language(), radius: 1500 } },
                output: { fields: ['place_id', 'name', 'formatted_address', 'geometry'], page_size: 20 }
            });

        request$.subscribe({
            next: (res) => {
                this.results.set(res);
                this.loading.set(false);
            },
            error: (err) => {
                this.error.set(err?.message || 'Request failed');
                this.loading.set(false);
            }
        });
    }

    trackByNameOrIndex(index: number, item: any): any {
        return item?.placeId ?? item?.name ?? index;
    }

    onQueryInput(event: Event): void {
        const value = (event.target as HTMLInputElement).value;
        this.query.set(value);
    }

    onLanguageChange(event: Event): void {
        const value = (event.target as HTMLSelectElement).value as 'he' | 'en';
        this.language.set(value);
    }

    onModeChange(event: Event): void {
        const value = (event.target as HTMLSelectElement).value as 'textsearch' | 'nearbysearch' | 'findplace';
        this.mode.set(value);
    }

    useMyLocation(): void {
        if (!navigator.geolocation) {
            this.error.set('Geolocation not supported');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                this.userLocation.set({ lat: latitude, lng: longitude });
            },
            (err) => {
                this.error.set(err.message || 'Failed to get location');
            },
            { enableHighAccuracy: true, timeout: 7000 }
        );
    }
}
