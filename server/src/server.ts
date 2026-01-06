import { createApp } from './app.js';
import { getConfig } from './config/env.js';
import { logger } from './lib/logger/structured-logger.js';
import 'dotenv/config';


function maskKey(k?: string) {
    if (!k) return { exists: false, len: 0, last4: '----' };
    return { exists: true, len: k.length, last4: k.slice(-4) };
}

console.log('[BOOT] process.env.GOOGLE_API_KEY:', maskKey(process.env.GOOGLE_API_KEY));
console.log('[BOOT] process.env.GOOGLE_MAPS_API_KEY:', maskKey(process.env.GOOGLE_MAPS_API_KEY));

const { port, openaiApiKey, googleApiKey } = getConfig();

if (!openaiApiKey) {
    logger.warn('OPENAI_API_KEY is not set. /api/chat will fail until it is provided.');
}
if (!googleApiKey) {
    logger.warn('GOOGLE_API_KEY is not set. Google search will fail until it is provided.');
}


if (!openaiApiKey) {
    logger.warn('OPENAI_API_KEY is not set. /api/chat will fail until it is provided.');
}

const app = createApp();
const server = app.listen(port, () => {
    logger.info(`Server listening on http://localhost:${port}`);
});

function shutdown(signal: NodeJS.Signals) {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);


