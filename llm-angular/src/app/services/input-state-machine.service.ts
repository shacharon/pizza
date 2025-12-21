/**
 * InputStateMachine
 * Manages search bar state transitions and behavior
 * 
 * States:
 * - EMPTY: No input, show recent searches
 * - TYPING: User typing, show suggestions
 * - SEARCHING: API call in progress
 * - RESULTS: Results displayed
 * - EDITING: User editing existing query
 */

import { Injectable, signal, computed } from '@angular/core';

export type InputState = 'EMPTY' | 'TYPING' | 'SEARCHING' | 'RESULTS' | 'EDITING';

@Injectable({
  providedIn: 'root'
})
export class InputStateMachine {
  // State signals
  private stateSignal = signal<InputState>('EMPTY');
  private querySignal = signal<string>('');
  private previousQuerySignal = signal<string>('');

  // Public readonly signals
  readonly state = this.stateSignal.asReadonly();
  readonly query = this.querySignal.asReadonly();
  readonly previousQuery = this.previousQuerySignal.asReadonly();

  // Computed signals
  readonly showRecentSearches = computed(() => {
    const state = this.stateSignal();
    const query = this.querySignal();
    return state === 'EMPTY' && query.length === 0;
  });

  readonly showClearButton = computed(() => {
    const query = this.querySignal();
    return query.length > 0;
  });

  readonly isSearching = computed(() => this.stateSignal() === 'SEARCHING');

  readonly hasResults = computed(() => this.stateSignal() === 'RESULTS');

  readonly canSubmit = computed(() => {
    const query = this.querySignal();
    const state = this.stateSignal();
    return query.trim().length > 0 && state !== 'SEARCHING';
  });

  /**
   * Handle input change
   * Transitions: EMPTY → TYPING, RESULTS → EDITING
   */
  input(text: string): void {
    const trimmedText = text.trim();
    const currentState = this.stateSignal();

    this.querySignal.set(text);

    if (trimmedText.length === 0) {
      this.stateSignal.set('EMPTY');
    } else if (currentState === 'EMPTY' || currentState === 'TYPING') {
      this.stateSignal.set('TYPING');
    } else if (currentState === 'RESULTS') {
      this.stateSignal.set('EDITING');
    }
  }

  /**
   * Clear input and reset to EMPTY
   * Transitions: * → EMPTY
   */
  clear(): void {
    this.querySignal.set('');
    this.stateSignal.set('EMPTY');
  }

  /**
   * Submit search
   * Transitions: TYPING|EDITING → SEARCHING
   */
  submit(): void {
    const query = this.querySignal();
    const currentState = this.stateSignal();

    if (query.trim().length > 0 && currentState !== 'SEARCHING') {
      this.previousQuerySignal.set(query);
      this.stateSignal.set('SEARCHING');
    }
  }

  /**
   * Search completed successfully
   * Transitions: SEARCHING → RESULTS
   */
  searchComplete(): void {
    if (this.stateSignal() === 'SEARCHING') {
      this.stateSignal.set('RESULTS');
    }
  }

  /**
   * Search failed
   * Transitions: SEARCHING → TYPING (allows retry)
   */
  searchFailed(): void {
    if (this.stateSignal() === 'SEARCHING') {
      this.stateSignal.set('TYPING');
    }
  }

  /**
   * Select recent search
   * Transitions: EMPTY → SEARCHING
   */
  selectRecent(query: string): void {
    this.querySignal.set(query);
    this.previousQuerySignal.set(query);
    this.stateSignal.set('SEARCHING');
  }

  /**
   * Select refinement chip
   * Transitions: RESULTS → SEARCHING
   */
  selectChip(newQuery: string): void {
    this.querySignal.set(newQuery);
    this.previousQuerySignal.set(newQuery);
    this.stateSignal.set('SEARCHING');
  }

  /**
   * Reset to initial state (for testing or cleanup)
   */
  reset(): void {
    this.querySignal.set('');
    this.previousQuerySignal.set('');
    this.stateSignal.set('EMPTY');
  }

  /**
   * Get current state snapshot (for debugging)
   */
  getSnapshot(): { state: InputState; query: string; previousQuery: string } {
    return {
      state: this.stateSignal(),
      query: this.querySignal(),
      previousQuery: this.previousQuerySignal(),
    };
  }
}

