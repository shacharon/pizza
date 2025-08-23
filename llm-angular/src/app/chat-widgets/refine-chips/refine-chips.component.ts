import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ChipVM { label: string; active: boolean; }

@Component({
    selector: 'app-refine-chips',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './refine-chips.component.html',
    styleUrls: ['./refine-chips.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RefineChipsComponent {
    @Input() chips: ChipVM[] = [];
    @Input() disabled = false;
    @Output() toggle = new EventEmitter<number>();
    @Output() clearAll = new EventEmitter<void>();
}


