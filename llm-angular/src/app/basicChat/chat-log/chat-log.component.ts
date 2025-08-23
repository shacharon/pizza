import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-chat-log',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './chat-log.component.html',
    styleUrls: ['./chat-log.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatLogComponent {
    @Input() log: { role: 'user' | 'assistant'; text: string }[] = [];
}


