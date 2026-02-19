import type { WsSearchEvent } from '../../contracts/search.contracts.js';
import { wsManager } from '../../server.js';

export function publishSearchEvent(requestId: string, event: WsSearchEvent) {
    // Publish to search channel using the existing publishToChannel method
    wsManager.publishToChannel('search', requestId, undefined, event as any);
}
