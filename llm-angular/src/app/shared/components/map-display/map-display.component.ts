import { Component, ChangeDetectionStrategy, Input, ViewChild, ElementRef, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Vendor } from '../../../shared/models/vendor';
import * as L from 'leaflet';

// Mock data with coordinates
type VendorWithCoords = Vendor & { lat: number; lon: number };

const CITY_CENTERS: Record<string, { lat: number; lon: number }> = {
    'gedera': { lat: 31.8126, lon: 34.7799 },
    'rehovot': { lat: 31.8948, lon: 34.8113 },
    'tel aviv': { lat: 32.0853, lon: 34.7818 },
    'tel-aviv': { lat: 32.0853, lon: 34.7818 },
    'jerusalem': { lat: 31.7683, lon: 35.2137 },
    'rishon lezion': { lat: 31.9730, lon: 34.7925 },
    'ashdod': { lat: 31.8014, lon: 34.6436 },
    'ashkelon': { lat: 31.6693, lon: 34.5715 },
};

@Component({
    selector: 'app-map-display',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './map-display.component.html',
    styleUrl: './map-display.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MapDisplayComponent implements AfterViewInit, OnChanges {
    @Input() vendors: Vendor[] = [];
    @ViewChild('map') mapContainer!: ElementRef;

    private map?: L.Map;
    private markers: L.Marker[] = [];

    ngAfterViewInit(): void {
        this.initMap();
        this.updateMarkers();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['vendors'] && this.map) {
            this.updateMarkers();
        }
    }

    private initMap(): void {
        const center = this.inferCenter(this.vendors) || { lat: 31.8126, lon: 34.7799 }; // default Gedera
        this.map = L.map(this.mapContainer.nativeElement).setView([center.lat, center.lon], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(this.map);
    }

    private updateMarkers(): void {
        if (!this.map) return;
        // Clear existing markers
        this.markers.forEach(marker => marker.remove());
        this.markers = [];

        const vendorsWithCoords = this.addMockCoordinates(this.vendors);

        if (vendorsWithCoords.length === 0) return;

        // Add new markers
        vendorsWithCoords.forEach((vendor, index) => {
            const marker = L.marker([vendor.lat, vendor.lon]).addTo(this.map!);
            marker.bindPopup(`<b>${String.fromCharCode(65 + index)}: ${vendor.name}</b><br>${vendor.address ?? ''}`);
            this.markers.push(marker);
        });

        // Fit map to markers
        const group = L.featureGroup(this.markers);
        this.map!.fitBounds(group.getBounds().pad(0.1));
    }

    private addMockCoordinates(vendors: Vendor[]): VendorWithCoords[] {
        const center = this.inferCenter(vendors) || { lat: 31.8126, lon: 34.7799 };
        // Simple mock: spread them around the inferred city center
        return vendors.map((v, i) => ({
            ...v,
            lat: center.lat + (Math.random() - 0.5) * 0.02 * (i + 1),
            lon: center.lon + (Math.random() - 0.5) * 0.02 * (i + 1)
        }));
    }

    private inferCenter(vendors: Vendor[]): { lat: number; lon: number } | null {
        // Try to detect a city name from vendor address or name
        for (const vendor of vendors) {
            const text = `${vendor.name ?? ''} ${vendor.address ?? ''}`.toLowerCase();
            for (const key of Object.keys(CITY_CENTERS)) {
                if (text.includes(key)) {
                    return CITY_CENTERS[key];
                }
            }
        }
        return null;
    }
}
