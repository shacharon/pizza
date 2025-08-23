import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-guard-note',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './guard-note.component.html',
    styleUrls: ['./guard-note.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GuardNoteComponent {
    @Input() message: string | null = null;
}


