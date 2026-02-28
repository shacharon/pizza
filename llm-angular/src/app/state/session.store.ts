/**
 * Session Store
 * Reactive state management for session with persistence
 */

import { Injectable, signal, computed } from '@angular/core';
import type { SessionState } from '../domain/types/session.types';
import type { Restaurant } from '../domain/types/search.types';
import type { SupportedLang } from '../core/services/language.service';

const SUPPORTED_LOCALES: readonly SupportedLang[] = ['he', 'en', 'ar', 'ru', 'fr', 'es', 'de', 'it', 'am'];

function isSupportedLocale(x: unknown): x is SupportedLang {
  return typeof x === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(x);
}

/** Result of initial load: state and whether it came from storage (vs default). */
interface SessionLoadResult {
  state: SessionState;
  loadedFromStorage: boolean;
}

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly storageKey = 'search-session';

  private readonly _initial = this.loadFromStorage();
  private readonly _state = signal<SessionState>(this._initial.state);

  /** True if session was restored from sessionStorage; false if created as default. Do not override locale when true. */
  readonly loadedFromStorage = this._initial.loadedFromStorage;

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
  private loadFromStorage(): SessionLoadResult {
    try {
      if (typeof sessionStorage === 'undefined') {
        return { state: this.createDefault(), loadedFromStorage: false };
      }
      const stored = sessionStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        const state: SessionState = {
          conversationId: parsed.conversationId || this.generateId(),
          locale: isSupportedLocale(parsed.locale) ? parsed.locale : 'en',
          region: parsed.region || 'US',
          selectedRestaurant: parsed.selectedRestaurant || null,
          preferences: {
            savedFavorites: parsed.preferences?.savedFavorites || [],
            recentSearches: parsed.preferences?.recentSearches || []
          }
        };
        return { state, loadedFromStorage: true };
      }
    } catch (error) {
      console.warn('[SessionStore] Failed to load from storage:', error);
    }
    return { state: this.createDefault(), loadedFromStorage: false };
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













