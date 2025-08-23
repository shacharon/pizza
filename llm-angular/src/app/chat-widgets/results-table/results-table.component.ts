import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CurrencyIlsPipe } from '../../shared/pipes/currency-ils.pipe';
import type { Vendor } from '../../shared/models/vendor';
import { trackByVendorId } from '../../shared/ui/track-by';

@Component({
    selector: 'app-results-table',
    standalone: true,
    imports: [CommonModule, CurrencyIlsPipe],
    templateUrl: './results-table.component.html',
    styleUrls: ['./results-table.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResultsTableComponent {
    @Input() vendors: Vendor[] = [];
    @Input() pending = false;
    @Input() canLoadMore = true;
    @Input() visible = 10; // show first N rows for Phase 1

    @Output() loadMore = new EventEmitter<void>();

    readonly trackByVendor = trackByVendorId;
}


