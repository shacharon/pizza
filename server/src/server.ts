import { createApp } from './app.js';
import { getConfig } from './config/env.js';
import { logger } from './lib/logger/structured-logger.js';
import { InMemoryRequestStore } from './infra/state/in-memory-request-store.js';
import { WebSocketManager } from './infra/websocket/websocket-manager.js';
import { logAssistantMode } from './config/assistant.flags.js';
import 'dotenv/config';

// Phase 2: Initialize state store singleton
export const requestStateStore = new InMemoryRequestStore(300, 60_000);

function maskKey(k?: string) {
    if (!k) return { exists: false, len: 0, last4: '----' };
    return { exists: true, len: k.length, last4: k.slice(-4) };
}

// Log API key status at boot
logger.info({
    googleApiKey: maskKey(process.env.GOOGLE_API_KEY),
    googleMapsApiKey: maskKey(process.env.GOOGLE_MAPS_API_KEY),
}, '[BOOT] API key status');

const { port, openaiApiKey, googleApiKey } = getConfig();

if (!openaiApiKey) {
    logger.warn('OPENAI_API_KEY is not set. /api/chat will fail until it is provided.');
}
if (!googleApiKey) {
    logger.warn('GOOGLE_API_KEY is not set. Google search will fail until it is provided.');
}

const app = createApp();
const server = app.listen(port, () => {
    logger.info(`Server listening on http://localhost:${port}`);

    // Log assistant mode at startup (TO_MAYBE: disabled for MVP)
    logAssistantMode();
});

// Phase 3: Initialize WebSocket manager
export const wsManager = new WebSocketManager(server, {
    path: '/ws',
    heartbeatIntervalMs: 30_000,
    allowedOrigins: process.env.WS_ALLOWED_ORIGINS?.split(',') || ['*'],
    requestStateStore // Phase 3: Enable late-subscriber replay
});

function shutdown(signal: NodeJS.Signals) {
    logger.info(`Received ${signal}. Shutting down gracefully...`);

    // Phase 2: Shutdown state store (clear intervals)
    requestStateStore.shutdown();

    // Phase 3: Shutdown WebSocket manager
    wsManager.shutdown();

    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown hangs
    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10_000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);



