import { ChangeDetectionStrategy, Component, signal, computed } from '@angular/core';
import { NgIf, NgFor, DecimalPipe } from '@angular/common';
import { PlacesFacade } from '../places.facade';
import type { SearchMode } from '../places.models';

/**
 * Places page component
 * Presentational component that delegates business logic to PlacesFacade
 * Following Angular best practices: OnPush change detection, signals, facade pattern
 */
@Component({
    selector: 'app-places-page',
    standalone: true,
    templateUrl: './places-page.component.html',
    styleUrls: ['./places-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgIf, NgFor, DecimalPipe]
})
export class PlacesPageComponent {
    readonly title = signal('Places');
    readonly query = signal('vegan pizza near me');
    readonly mode = signal<SearchMode>('textsearch');
    readonly nearMe = signal(false);
    readonly userLocation = signal<{ lat: number; lng: number } | null>(null);

    // Computed from facade
    readonly detectedLanguage = computed(() => this.facade.detectedContext().language);
    readonly detectedRegion = computed(() => this.facade.detectedContext().region);
    readonly loading = computed(() => this.facade.loading());
    readonly error = computed(() => this.facade.error());
    readonly results = computed(() => this.facade.results());

    readonly canSearch = computed(() => this.query().trim().length > 0 && !this.loading());

    constructor(readonly facade: PlacesFacade) { }

    onSubmit(): void {
        if (!this.canSearch()) return;

        this.facade.search({
            query: this.query(),
            nearMe: this.nearMe(),
            mode: this.mode(), // For troubleshooting, will be removed in Phase 2
            userLocation: this.userLocation() ?? undefined
        });
    }

    trackByPlaceId(index: number, item: any): any {
        return item?.placeId ?? item?.name ?? index;
    }

    onQueryInput(event: Event): void {
        const value = (event.target as HTMLInputElement).value;
        this.query.set(value);
        // Update detected language in facade
        this.facade.updateDetectedLanguage(value);
    }

    onModeChange(event: Event): void {
        const value = (event.target as HTMLSelectElement).value as SearchMode;
        this.mode.set(value);
    }

    onNearMeChange(event: Event): void {
        const checked = (event.target as HTMLInputElement).checked;
        this.nearMe.set(checked);
    }

    useMyLocation(): void {
        if (!navigator.geolocation) {
            this.facade.error.set('Geolocation not supported');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                this.userLocation.set({ lat: latitude, lng: longitude });
            },
            (err) => {
                this.facade.error.set(err.message || 'Failed to get location');
            },
            { enableHighAccuracy: true, timeout: 7000 }
        );
    }
}
