import { Injectable, signal, computed } from '@angular/core';
import { DialogueApiService } from '../../shared/services/dialogue-api.service';
import { DialogueMessage, Suggestion, PlaceItem } from './dialogue.models';

/**
 * DialogueFacade
 * Manages state and business logic for dialogue feature
 * Follows Facade pattern to keep component simple
 */
@Injectable({ providedIn: 'root' })
export class DialogueFacade {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // State Signals
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    readonly messages = signal<DialogueMessage[]>([]);
    readonly loading = signal(false);
    readonly error = signal<string | null>(null);
    readonly sessionId = signal(this.generateSessionId());
    readonly userLocation = signal<{ lat: number; lng: number } | null>(null);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Computed Signals
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    /**
     * Get suggestions from last assistant message
     */
    readonly currentSuggestions = computed(() => {
        const msgs = this.messages();
        const lastAssistant = msgs.filter(m => m.role === 'assistant').pop();
        return lastAssistant?.suggestions || [];
    });

    /**
     * Get results from last assistant message
     */
    readonly currentResults = computed(() => {
        const msgs = this.messages();
        const lastAssistant = msgs.filter(m => m.role === 'assistant').pop();
        return lastAssistant?.results || [];
    });

    /**
     * Check if conversation has started
     */
    readonly hasMessages = computed(() => this.messages().length > 0);

    constructor(private readonly api: DialogueApiService) {}

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Public Methods
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Send user message
     */
    sendMessage(text: string): void {
        if (!text.trim() || this.loading()) return;

        // Add user message to conversation
        this.messages.update(msgs => [
            ...msgs,
            {
                role: 'user',
                content: text,
                timestamp: Date.now()
            }
        ]);

        this.loading.set(true);
        this.error.set(null);

        // Call API
        this.api.sendMessage(
            {
                text,
                userLocation: this.userLocation() ?? undefined
            },
            this.sessionId()
        ).subscribe({
            next: (response) => {
                // Add assistant message to conversation
                this.messages.update(msgs => [
                    ...msgs,
                    {
                        role: 'assistant',
                        content: response.message,
                        timestamp: Date.now(),
                        results: response.places,
                        suggestions: response.suggestions
                    }
                ]);
                this.loading.set(false);
            },
            error: (err) => {
                this.error.set(err?.message || 'Request failed');
                this.loading.set(false);
            }
        });
    }

    /**
     * Handle suggestion button click
     * Treats it as a user message
     */
    handleSuggestion(suggestion: Suggestion): void {
        this.sendMessage(suggestion.label);
    }

    /**
     * Set user location (from geolocation API)
     */
    setUserLocation(location: { lat: number; lng: number } | null): void {
        this.userLocation.set(location);
    }

    /**
     * Clear conversation and start fresh
     */
    clearConversation(): void {
        this.messages.set([]);
        this.sessionId.set(this.generateSessionId());
        this.error.set(null);
    }

    /**
     * Set error message
     */
    setError(message: string | null): void {
        this.error.set(message);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Private Methods
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    private generateSessionId(): string {
        return `dialogue-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
}


