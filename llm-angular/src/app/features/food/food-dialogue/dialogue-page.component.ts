import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogueFacade } from '../../dialogue/dialogue.facade';

@Component({
    selector: 'app-dialogue-page',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './dialogue-page.component.html',
    styleUrls: ['./dialogue-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialoguePageComponent {
    readonly inputText = signal('');

    constructor(readonly facade: DialogueFacade) {}

    onSubmit(): void {
        const text = this.inputText().trim();
        if (!text) return;

        this.facade.sendMessage(text);
        this.inputText.set('');
    }

    onSuggestionClick(suggestion: any): void {
        this.facade.handleSuggestion(suggestion);
    }

    onClearClick(): void {
        this.facade.clearConversation();
    }

    trackByTimestamp(index: number, message: any): number {
        return message.timestamp;
    }

    trackBySuggestionId(index: number, suggestion: any): string {
        return suggestion.id;
    }

    trackByPlaceId(index: number, place: any): string {
        return place.placeId;
    }

    useMyLocation(): void {
        if (!navigator.geolocation) {
            this.facade.setError('Geolocation not supported');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                this.facade.setUserLocation({ lat: latitude, lng: longitude });
                this.facade.setError(null);
            },
            (err) => {
                this.facade.setError(err.message || 'Failed to get location');
                this.facade.setUserLocation(null);
            },
            { enableHighAccuracy: true, timeout: 7000 }
        );
    }
}


