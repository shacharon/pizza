/**
 * Search Bar Component
 * Presentational component for search input
 * 
 * CONTROLLED INPUT: Query value is managed by parent via `value` input.
 * The input persists exactly as the user typed until manually edited.
 */

import { Component, input, output, signal, effect, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-bar.component.html',
  styleUrl: './search-bar.component.scss'
})
export class SearchBarComponent {
  // Inputs
  readonly value = input<string>(''); // CONTROLLED: Parent provides the query value
  readonly placeholder = input('Search for restaurants...');
  readonly disabled = input(false);
  readonly loading = input(false);

  // Outputs
  readonly search = output<string>();
  readonly clear = output<void>();
  readonly inputChange = output<string>(); // NEW: Phase B

  // Local state (synced with parent via effect)
  readonly query = signal('');

  constructor() {
    // Sync local query with parent's value input
    // This ensures the input reflects the parent's state (persisted query)
    effect(() => {
      const parentValue = this.value();
      if (parentValue !== this.query()) {
        this.query.set(parentValue);
      }
    });
  }

  onSearch(): void {
    const q = this.query().trim();
    if (q) {
      this.search.emit(q);
    }
  }

  onClear(): void {
    this.query.set('');
    this.clear.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onSearch();
    }
  }

  /**
   * NEW: Phase B - Emit input changes for state machine
   */
  onInput(value: string): void {
    this.query.set(value);
    this.inputChange.emit(value);
  }
}


