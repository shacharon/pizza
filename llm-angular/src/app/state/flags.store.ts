/**
 * Flags Store
 * Reactive state management for feature flags
 */

import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FlagsStore {
  // Private state signal
  private readonly _flags = signal<Record<string, boolean>>({});

  // Public readonly flags
  readonly flags = this._flags.asReadonly();

  // Computed individual flags
  readonly unifiedSearchEnabled = computed(() => this._flags()['unifiedSearch'] || false);
  readonly actionProposalsEnabled = computed(() => this._flags()['actionProposals'] || false);

  // Mutations
  setFlags(flags: Record<string, boolean>): void {
    this._flags.set(flags);
  }

  setFlag(key: string, value: boolean): void {
    this._flags.update(current => ({
      ...current,
      [key]: value
    }));
  }

  isEnabled(flag: string): boolean {
    return this._flags()[flag] || false;
  }

  reset(): void {
    this._flags.set({});
  }
}

