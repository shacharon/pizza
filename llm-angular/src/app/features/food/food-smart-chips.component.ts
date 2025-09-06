import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { SmartChip } from './smart-chips.service';

@Component({
    selector: 'app-food-smart-chips',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './food-smart-chips.component.html',
    styleUrls: ['./food-smart-chips.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FoodSmartChipsComponent {
    @Input() chips: SmartChip[] = [];
    @Output() chipClick = new EventEmitter<SmartChip>();
    @Output() chipDismiss = new EventEmitter<string>();

    onChipClick(chip: SmartChip) {
        if (chip.state !== 'dismissed') {
            this.chipClick.emit(chip);
        }
    }

    onDismiss(event: Event, chipId: string) {
        event.stopPropagation();
        this.chipDismiss.emit(chipId);
    }
}
