import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { chatRouter } from './routes/chat.routes.js';

export function createApp() {
    const app = express();
    app.use(helmet());
    app.use(compression());
    app.use(express.json({ limit: '1mb' }));
    app.use(cors()); // keep permissive for dev; restrict via env in server.ts if needed

    app.use('/api', chatRouter);

    app.get('/healthz', (_req, res) => res.status(200).send('ok'));

    return app;
}


