/**
 * Search Bar Component
 * Presentational component for search input
 * 
 * CONTROLLED INPUT: Query value is managed by parent via `value` input.
 * The input reflects parent state but allows local editing until submission.
 */

import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
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

  onSearch(): void {
    const q = this.value().trim();
    if (q) {
      this.search.emit(q);
    }
  }

  onClear(): void {
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
    this.inputChange.emit(value);
  }
}


