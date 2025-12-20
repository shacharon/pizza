import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { chatRouter } from './routes/chat.routes.js';
import { placesRouter } from './routes/places.routes.js';
import { dialogueRouter } from './routes/dialogue.routes.js';
import searchRouter from './controllers/search/search.controller.js';

export function createApp() {
    const app = express();
    app.use(helmet());
    app.use(compression());
    app.use(express.json({ limit: '1mb' }));
    app.use(cors()); // keep permissive for dev; restrict via env in server.ts if needed

    // NEW: Unified search endpoint (Phase 3)
    app.use('/api', searchRouter);

    // Legacy endpoints (will be deprecated)
    app.use('/api', chatRouter);
    app.use('/api', placesRouter);
    app.use('/api', dialogueRouter);

    app.get('/healthz', (_req, res) => res.status(200).send('ok'));

    return app;
}


