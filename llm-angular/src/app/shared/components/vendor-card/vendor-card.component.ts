import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Vendor } from '../../../shared/models/vendor';

@Component({
    selector: 'app-vendor-card',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './vendor-card.component.html',
    styleUrl: './vendor-card.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class VendorCardComponent {
    @Input({ required: true }) vendor!: Vendor;
    @Input() marker?: string;
}
