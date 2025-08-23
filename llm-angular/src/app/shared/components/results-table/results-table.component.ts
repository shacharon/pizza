import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CurrencyIlsPipe } from '../../pipes/currency-ils.pipe';
import type { Vendor } from '../../models/vendor';
import { trackByVendorId } from '../../ui/track-by';

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
    @Input() visible = 10;

    @Output() loadMore = new EventEmitter<void>();

    readonly trackByVendor = trackByVendorId;
}


