/**
 * Search Bar Component
 * Presentational component for search input
 */

import { Component, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
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
  readonly placeholder = input('Search for restaurants...');
  readonly disabled = input(false);
  readonly loading = input(false);

  // Outputs
  readonly search = output<string>();
  readonly clear = output<void>();

  // Local state
  readonly query = signal('');

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
}


