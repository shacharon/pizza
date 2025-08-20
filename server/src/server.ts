import { createApp } from './app.js';
import { getConfig } from './config/env.js';

const { port, openaiApiKey } = getConfig();

if (!openaiApiKey) {
    console.warn('Warning: OPENAI_API_KEY is not set. /api/chat will fail until it is provided.');
}

const app = createApp();
const server = app.listen(port, () => {
    console.log(`API on http://localhost:${port}`);
});

function shutdown(signal: NodeJS.Signals) {
    console.log(`Received ${signal}. Shutting down...`);
    server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);


