/**
 * Session Store Tests
 */

import { TestBed } from '@angular/core/testing';
import { SessionStore } from './session.store';
import type { Restaurant } from '../domain/types/search.types';

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [SessionStore]
    });
    store = TestBed.inject(SessionStore);
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should be created', () => {
    expect(store).toBeTruthy();
  });

  it('should have default initial state', () => {
    expect(store.conversationId()).toBeTruthy();
    expect(store.locale()).toBe('en');
    expect(store.region()).toBe('US');
    expect(store.selectedRestaurant()).toBe(null);
    expect(store.preferences().savedFavorites).toEqual([]);
    expect(store.preferences().recentSearches).toEqual([]);
  });

  it('should persist state to sessionStorage', () => {
    const initialId = store.conversationId();
    expect(sessionStorage.getItem('search-session')).toContain(initialId);
  });

  it('should set locale', () => {
    store.setLocale('fr');
    expect(store.locale()).toBe('fr');
  });

  it('should set region', () => {
    store.setRegion('FR');
    expect(store.region()).toBe('FR');
  });

  it('should select restaurant', () => {
    const mockRestaurant: Restaurant = {
      id: '1',
      placeId: 'place-1',
      name: 'Test Restaurant',
      address: '123 Main St',
      location: { lat: 48.8566, lng: 2.3522 }
    };

    store.selectRestaurant(mockRestaurant);
    expect(store.selectedRestaurant()).toEqual(mockRestaurant);

    store.selectRestaurant(null);
    expect(store.selectedRestaurant()).toBe(null);
  });

  it('should add to favorites', () => {
    store.addToFavorites('restaurant-1');
    expect(store.preferences().savedFavorites).toContain('restaurant-1');

    // Should not add duplicates
    store.addToFavorites('restaurant-1');
    expect(store.preferences().savedFavorites.length).toBe(1);
  });

  it('should remove from favorites', () => {
    store.addToFavorites('restaurant-1');
    store.addToFavorites('restaurant-2');
    expect(store.preferences().savedFavorites.length).toBe(2);

    store.removeFromFavorites('restaurant-1');
    expect(store.preferences().savedFavorites).not.toContain('restaurant-1');
    expect(store.preferences().savedFavorites).toContain('restaurant-2');
  });

  it('should add to recent searches', () => {
    store.addToRecentSearches('pizza');
    expect(store.preferences().recentSearches).toContain('pizza');
    expect(store.preferences().recentSearches[0]).toBe('pizza'); // Most recent first
  });

  it('should move duplicate search to top', () => {
    store.addToRecentSearches('pizza');
    store.addToRecentSearches('sushi');
    store.addToRecentSearches('pizza'); // Duplicate

    const searches = store.preferences().recentSearches;
    expect(searches[0]).toBe('pizza');
    expect(searches[1]).toBe('sushi');
    expect(searches.length).toBe(2); // No duplicate
  });

  it('should keep only last 10 recent searches', () => {
    for (let i = 0; i < 15; i++) {
      store.addToRecentSearches(`search-${i}`);
    }

    expect(store.preferences().recentSearches.length).toBe(10);
    expect(store.preferences().recentSearches[0]).toBe('search-14'); // Most recent
  });

  it('should reset session', () => {
    const initialId = store.conversationId();

    store.setLocale('fr');
    store.addToFavorites('restaurant-1');
    store.addToRecentSearches('pizza');

    store.resetSession();

    expect(store.conversationId()).not.toBe(initialId); // New ID
    expect(store.locale()).toBe('en'); // Reset to default
    expect(store.preferences().savedFavorites).toEqual([]);
    expect(store.preferences().recentSearches).toEqual([]);
  });

  it('should load from sessionStorage on init', () => {
    const mockState = {
      conversationId: 'existing-session',
      locale: 'fr',
      region: 'FR',
      selectedRestaurant: null,
      preferences: {
        savedFavorites: ['restaurant-1'],
        recentSearches: ['pizza']
      }
    };

    sessionStorage.setItem('search-session', JSON.stringify(mockState));

    // Create a new store instance
    const newStore = new SessionStore();

    expect(newStore.conversationId()).toBe('existing-session');
    expect(newStore.locale()).toBe('fr');
    expect(newStore.preferences().savedFavorites).toContain('restaurant-1');
  });

  it('should handle corrupted storage gracefully', () => {
    sessionStorage.setItem('search-session', 'invalid json');

    const newStore = new SessionStore();

    expect(newStore.conversationId()).toBeTruthy();
    expect(newStore.locale()).toBe('en');
  });
});

