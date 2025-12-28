/**
 * Session Store
 * Reactive state management for session with persistence
 */

import { Injectable, signal, computed } from '@angular/core';
import type { SessionState } from '../domain/types/session.types';
import type { Restaurant } from '../domain/types/search.types';

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly storageKey = 'search-session';

  // Private state signal
  private readonly _state = signal<SessionState>(this.loadFromStorage());

  // Computed public signals
  readonly conversationId = computed(() => this._state().conversationId);
  readonly locale = computed(() => this._state().locale);
  readonly region = computed(() => this._state().region);
  readonly selectedRestaurant = computed(() => this._state().selectedRestaurant);
  readonly preferences = computed(() => this._state().preferences);

  // Full state access
  readonly state = this._state.asReadonly();

  // Mutations
  setState(state: Partial<SessionState>): void {
    this._state.update(current => {
      const updated = { ...current, ...state };
      this.saveToStorage(updated);
      return updated;
    });
  }

  selectRestaurant(restaurant: Restaurant | null): void {
    this.setState({ selectedRestaurant: restaurant });
  }

  setLocale(locale: string): void {
    this.setState({ locale });
  }

  setRegion(region: string): void {
    this.setState({ region });
  }

  addToFavorites(restaurantId: string): void {
    this._state.update(current => {
      const favorites = current.preferences.savedFavorites;
      if (!favorites.includes(restaurantId)) {
        const updated = {
          ...current,
          preferences: {
            ...current.preferences,
            savedFavorites: [...favorites, restaurantId]
          }
        };
        this.saveToStorage(updated);
        return updated;
      }
      return current;
    });
  }

  removeFromFavorites(restaurantId: string): void {
    this._state.update(current => {
      const updated = {
        ...current,
        preferences: {
          ...current.preferences,
          savedFavorites: current.preferences.savedFavorites.filter(id => id !== restaurantId)
        }
      };
      this.saveToStorage(updated);
      return updated;
    });
  }

  addToRecentSearches(query: string): void {
    this._state.update(current => {
      const searches = current.preferences.recentSearches;
      const updated = {
        ...current,
        preferences: {
          ...current.preferences,
          recentSearches: [query, ...searches.filter(s => s !== query)].slice(0, 10) // Keep last 10
        }
      };
      this.saveToStorage(updated);
      return updated;
    });
  }

  resetSession(): void {
    const newState = this.createDefault();
    this._state.set(newState);
    this.saveToStorage(newState);
  }

  // Private helpers
  private loadFromStorage(): SessionState {
    try {
      const stored = sessionStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Ensure all required fields exist
        return {
          conversationId: parsed.conversationId || this.generateId(),
          locale: parsed.locale || 'en',
          region: parsed.region || 'US',
          selectedRestaurant: parsed.selectedRestaurant || null,
          preferences: {
            savedFavorites: parsed.preferences?.savedFavorites || [],
            recentSearches: parsed.preferences?.recentSearches || []
          }
        };
      }
    } catch (error) {
      console.warn('[SessionStore] Failed to load from storage:', error);
    }
    return this.createDefault();
  }

  private saveToStorage(state: SessionState): void {
    try {
      sessionStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch (error) {
      console.warn('[SessionStore] Failed to save to storage:', error);
    }
  }

  private createDefault(): SessionState {
    return {
      conversationId: this.generateId(),
      locale: 'en',
      region: 'US',
      selectedRestaurant: null,
      preferences: {
        savedFavorites: [],
        recentSearches: []
      }
    };
  }

  private generateId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}











