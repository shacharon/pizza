import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-chat-composer',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './chat-composer.component.html',
    styleUrls: ['./chat-composer.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComposerComponent {
    @Input() pending = false;
    @Input() language: 'mirror' | 'he' | 'en' = 'mirror';
    @Input() placeholder = 'שאל משהו…';
    @Output() send = new EventEmitter<string>();
    @Output() languageChange = new EventEmitter<'mirror' | 'he' | 'en'>();

    text = '';

    onSend() {
        const msg = (this.text || '').trim();
        if (!msg || this.pending) return;
        this.send.emit(msg);
        this.text = '';
    }
}


