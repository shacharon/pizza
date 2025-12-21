/**
 * RecentSearchesService
 * Manages recent search queries with sessionStorage persistence
 * 
 * Features:
 * - Stores last 5 searches
 * - Deduplicates (same query moves to top)
 * - sessionStorage for session persistence
 * - Clear all functionality
 */

import { Injectable, signal, computed } from '@angular/core';

const STORAGE_KEY = 'recent_searches';
const MAX_SEARCHES = 5;

@Injectable({
  providedIn: 'root'
})
export class RecentSearchesService {
  // Internal signal
  private searchesSignal = signal<string[]>(this.loadFromStorage());

  // Public readonly signal
  readonly searches = this.searchesSignal.asReadonly();

  // Computed signals
  readonly hasSearches = computed(() => this.searchesSignal().length > 0);
  readonly count = computed(() => this.searchesSignal().length);

  constructor() {
    // Load from sessionStorage on initialization
    console.log('[RecentSearches] Loaded', this.searchesSignal().length, 'searches from storage');
  }

  /**
   * Add a search query to recent searches
   * - Deduplicates (moves existing to top)
   * - Limits to MAX_SEARCHES
   * - Persists to sessionStorage
   */
  add(query: string): void {
    const trimmedQuery = query.trim();
    
    // Ignore empty queries
    if (!trimmedQuery) {
      return;
    }

    const currentSearches = [...this.searchesSignal()];

    // Remove if already exists (we'll add it to the front)
    const existingIndex = currentSearches.indexOf(trimmedQuery);
    if (existingIndex !== -1) {
      currentSearches.splice(existingIndex, 1);
    }

    // Add to front
    currentSearches.unshift(trimmedQuery);

    // Limit to MAX_SEARCHES
    const limitedSearches = currentSearches.slice(0, MAX_SEARCHES);

    // Update signal and storage
    this.searchesSignal.set(limitedSearches);
    this.saveToStorage(limitedSearches);

    console.log('[RecentSearches] Added:', trimmedQuery, '(total:', limitedSearches.length, ')');
  }

  /**
   * Remove a specific search query
   */
  remove(query: string): void {
    const currentSearches = this.searchesSignal();
    const filtered = currentSearches.filter(q => q !== query);
    
    if (filtered.length !== currentSearches.length) {
      this.searchesSignal.set(filtered);
      this.saveToStorage(filtered);
      console.log('[RecentSearches] Removed:', query);
    }
  }

  /**
   * Clear all recent searches
   */
  clear(): void {
    this.searchesSignal.set([]);
    this.clearStorage();
    console.log('[RecentSearches] Cleared all');
  }

  /**
   * Get all searches as array (for backward compatibility)
   */
  getAll(): string[] {
    return this.searchesSignal();
  }

  /**
   * Check if a query is in recent searches
   */
  has(query: string): boolean {
    return this.searchesSignal().includes(query.trim());
  }

  /**
   * Load recent searches from sessionStorage
   */
  private loadFromStorage(): string[] {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, MAX_SEARCHES); // Ensure limit
        }
      }
    } catch (error) {
      console.warn('[RecentSearches] Failed to load from storage:', error);
    }
    return [];
  }

  /**
   * Save recent searches to sessionStorage
   */
  private saveToStorage(searches: string[]): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
    } catch (error) {
      console.warn('[RecentSearches] Failed to save to storage:', error);
    }
  }

  /**
   * Clear sessionStorage
   */
  private clearStorage(): void {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('[RecentSearches] Failed to clear storage:', error);
    }
  }

  /**
   * Reset service (for testing)
   */
  reset(): void {
    this.clear();
  }
}

