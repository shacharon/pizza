/**
 * Location Service
 * Manages browser geolocation API and user location state
 */

import { Injectable, signal } from '@angular/core';
import type { Coordinates } from '../domain/types/search.types';

export type LocationState = 'OFF' | 'REQUESTING' | 'ON' | 'DENIED' | 'ERROR';

@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly STORAGE_KEY = 'userLocation';
  
  readonly state = signal<LocationState>('OFF');
  readonly location = signal<Coordinates | null>(null);

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Request user location via browser geolocation API
   */
  async requestLocation(): Promise<void> {
    if (!navigator.geolocation) {
      this.state.set('ERROR');
      return;
    }

    this.state.set('REQUESTING');

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        });
      });

      const coords: Coordinates = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      this.location.set(coords);
      this.state.set('ON');
      this.saveToStorage(coords);
    } catch (error: any) {
      if (error.code === 1) {
        // PERMISSION_DENIED
        this.state.set('DENIED');
      } else {
        this.state.set('ERROR');
      }
      this.location.set(null);
      this.clearStorage();
    }
  }

  /**
   * Disable location tracking
   */
  disableLocation(): void {
    this.location.set(null);
    this.state.set('OFF');
    this.clearStorage();
  }

  /**
   * Get current location (null if not enabled)
   */
  getLocation(): Coordinates | null {
    return this.location();
  }

  private loadFromStorage(): void {
    try {
      const stored = sessionStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const coords = JSON.parse(stored) as Coordinates;
        this.location.set(coords);
        this.state.set('ON');
      }
    } catch {
      // Ignore storage errors
    }
  }

  private saveToStorage(coords: Coordinates): void {
    try {
      sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(coords));
    } catch {
      // Ignore storage errors
    }
  }

  private clearStorage(): void {
    try {
      sessionStorage.removeItem(this.STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }
}
