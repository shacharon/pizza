import { Component, ChangeDetectionStrategy, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

@Component({
    selector: 'app-filter-panel',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './filter-panel.component.html',
    styleUrl: './filter-panel.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilterPanelComponent {
    @Output() filtersChange = new EventEmitter<any>();

    form = new FormGroup({
        query: new FormControl(''),
        // More controls will be added here
    });

    search() {
        this.filtersChange.emit(this.form.value);
    }
}
