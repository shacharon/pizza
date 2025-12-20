/**
 * Dialogue feature models
 * Types for conversational food search
 */

export type MessageRole = 'user' | 'assistant';

/**
 * Single message in conversation
 */
export interface DialogueMessage {
    role: MessageRole;
    content: string;
    timestamp: number;
    results?: PlaceItem[]; // For assistant messages with results
    suggestions?: Suggestion[]; // For assistant messages with suggestions
}

/**
 * Quick reply suggestion button
 */
export interface Suggestion {
    id: string;
    emoji: string;
    label: string;
    action: 'filter' | 'refine' | 'info' | 'map';
    value?: string;
}

/**
 * Place item from search results
 */
export interface PlaceItem {
    placeId: string;
    name: string;
    address: string;
    rating?: number;
    userRatingsTotal?: number;
    priceLevel?: number;
    photoUrl?: string;
    website?: string;
    openNow?: boolean;
    location?: { lat: number; lng: number };
}

/**
 * API request to backend
 */
export interface DialogueRequest {
    text: string;
    userLocation?: { lat: number; lng: number };
}

/**
 * API response from backend
 */
export interface DialogueResponse {
    message: string;
    suggestions: Suggestion[];
    places: PlaceItem[];
    meta?: {
        source?: string;
        mode?: string;
        tookMs?: number;
        sessionId?: string;
        note?: string;
    };
}


