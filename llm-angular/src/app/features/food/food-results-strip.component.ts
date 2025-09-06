import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-food-results-strip',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './food-results-strip.component.html',
    styleUrls: ['./food-results-strip.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FoodResultsStripComponent {
    @Input() items: { name: string; address?: string | null; rating?: number | null }[] = [];
    @Input() summary: string | null = null;
}


