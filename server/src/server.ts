import { createApp } from './app.js';
import { getConfig } from './config/env.js';
import { logger } from './lib/logger/structured-logger.js';

const { port, openaiApiKey } = getConfig();

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


