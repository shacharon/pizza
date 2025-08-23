import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Vendor } from '../../shared/models/vendor';

@Component({
    selector: 'app-summary-card',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './summary-card.component.html',
    styleUrls: ['./summary-card.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SummaryCardComponent {
    @Input() top: Vendor[] = [];
    @Input() pending = false;
    @Output() cta = new EventEmitter<{ vendor: Vendor; action: 'call' | 'web' | 'maps' }>();
}


