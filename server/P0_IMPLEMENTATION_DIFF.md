# P0 Security Implementation - Diffs

## 1. NEW: src/middleware/auth.middleware.ts

```typescript
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger/structured-logger.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || '';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  sessionId?: string;
}

export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn({
      traceId: req.traceId,
      path: req.path,
      method: req.method
    }, '[Auth] Missing or invalid Authorization header');
    
    res.status(401).json({
      error: 'Unauthorized',
      code: 'MISSING_AUTH',
      traceId: req.traceId || 'unknown'
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId?: string; sessionId?: string };
    
    if (!decoded.sessionId) {
      throw new Error('Token missing sessionId');
    }

    const authReq = req as AuthenticatedRequest;
    if (decoded.userId) {
      authReq.userId = decoded.userId;
    }
    authReq.sessionId = decoded.sessionId;
    
    if (!req.ctx) {
      (req as any).ctx = {};
    }
    req.ctx.sessionId = decoded.sessionId;
    if (decoded.userId) {
      (req as any).userId = decoded.userId;
    }

    logger.debug({
      traceId: req.traceId,
      sessionId: decoded.sessionId,
      userId: decoded.userId,
      path: req.path
    }, '[Auth] JWT verified');

    next();
  } catch (error) {
    logger.warn({
      traceId: req.traceId,
      path: req.path,
      error: error instanceof Error ? error.message : 'unknown'
    }, '[Auth] JWT verification failed');
    
    res.status(401).json({
      error: 'Unauthorized',
      code: 'INVALID_TOKEN',
      traceId: req.traceId || 'unknown'
    });
  }
}
```

---

## 2. MODIFIED: src/config/env.ts

```diff
+ function validateJwtSecret(): string {
+     const jwtSecret = process.env.JWT_SECRET;
+     const DEV_DEFAULT = 'dev-secret-change-in-production';
+     
+     if (isProd()) {
+         if (!jwtSecret || jwtSecret.trim() === '') {
+             throw new Error('[P0 Security] JWT_SECRET is required in production');
+         }
+         if (jwtSecret === DEV_DEFAULT) {
+             throw new Error('[P0 Security] JWT_SECRET cannot be dev default in production');
+         }
+         if (jwtSecret.length < 32) {
+             throw new Error('[P0 Security] JWT_SECRET must be at least 32 characters in production');
+         }
+     }
+     
+     return jwtSecret || DEV_DEFAULT;
+ }

  export function getConfig() {
      const openaiApiKey = mustString('OPENAI_API_KEY');
      const googleApiKey = mustString('GOOGLE_API_KEY');
+     const jwtSecret = validateJwtSecret();

      return {
          env: CURRENT_ENV,
          port,
          openaiApiKey,
          googleApiKey,
+         jwtSecret,
          // ...
      };
  }
```

---

## 3. MODIFIED: src/routes/v1/index.ts

```diff
  import { Router } from 'express';
  import searchRouter from '../../controllers/search/search.controller.js';
  import analyticsRouter from '../../controllers/analytics/analytics.controller.js';
  import photosRouter from '../../controllers/photos/photos.controller.js';
+ import { authenticateJWT } from '../../middleware/auth.middleware.js';
+ import { createRateLimiter } from '../../middleware/rate-limit.middleware.js';

  export function createV1Router(): Router {
    const router = Router();

+   const searchRateLimiter = createRateLimiter({
+     windowMs: 60 * 1000,
+     maxRequests: 100,
+     keyPrefix: 'search'
+   });

-   router.use('/search', searchRouter);
+   router.use('/search', authenticateJWT, searchRateLimiter, searchRouter);

-   router.use('/analytics', analyticsRouter);
+   router.use('/analytics', authenticateJWT, analyticsRouter);

    router.use('/photos', photosRouter);

    return router;
  }
```

---

## 4. MODIFIED: src/controllers/search/search.controller.ts

```diff
  router.post('/', async (req: Request, res: Response) => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const validation = safeParseSearchRequest(req.body);
      if (!validation.success || !validation.data) {
        res.status(400).json(createSearchError('Invalid request', 'VALIDATION_ERROR', validation.error));
        return;
      }

      const queryData = validation.data;
      const mode = (req.query.mode as 'sync' | 'async') || 'sync';
      const llm = createLLMProvider();

      if (!ROUTE2_ENABLED || !llm) {
        res.status(500).json(createSearchError('Config error', 'CONFIG_ERROR'));
        return;
      }

+     const authenticatedSessionId = req.ctx?.sessionId || queryData.sessionId;

      const route2Context: Route2Context = {
        requestId,
        startTime: Date.now(),
        llmProvider: llm,
        userLocation: queryData.userLocation ?? null,
        ...(req.traceId && { traceId: req.traceId }),
-       ...(queryData.sessionId && { sessionId: queryData.sessionId })
+       ...(authenticatedSessionId && { sessionId: authenticatedSessionId })
      };

      if (mode === 'async') {
-       const ownerSessionId = req.ctx?.sessionId || null;
+       const ownerSessionId = authenticatedSessionId;
        const ownerUserId = (req as any).userId || null;

        if (!ownerSessionId) {
          logger.warn({
            requestId,
            operation: 'createJob',
            decision: 'REJECTED',
            reason: 'missing_session_id'
-         }, '[P0 Security] Async job creation requires X-Session-Id header');
+         }, '[P0 Security] Async job creation requires authenticated session');
          
-         res.status(400).json(createSearchError('X-Session-Id header required for async requests', 'MISSING_SESSION_ID'));
+         res.status(401).json(createSearchError('Authentication required', 'MISSING_SESSION_ID'));
          return;
        }
      }
    }
  });
```

---

## 5. MODIFIED: src/controllers/analytics/analytics.controller.ts

```diff
+ import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
+ import { logger } from '../../lib/logger/structured-logger.js';

  const events: Array<{
    event: string;
    data: any;
    timestamp: string;
+   userId?: string;
+   sessionId: string;
  }> = [];

- router.post('/events', (req: Request, res: Response) => {
+ router.post('/events', (req: Request, res: Response) => {
+   const authReq = req as AuthenticatedRequest;
    const { event, data } = req.body;
+   const userId = authReq.userId;
+   const sessionId = authReq.sessionId || 'unknown';

    if (!event) {
-     return res.status(400).json({ error: 'Event name is required' });
+     return res.status(400).json({
+       error: 'Event name is required',
+       code: 'VALIDATION_ERROR'
+     });
    }

-   events.push({
-     event,
-     data: data || {},
-     timestamp: new Date().toISOString()
-   });
+   const eventEntry: {
+     event: string;
+     data: any;
+     timestamp: string;
+     userId?: string;
+     sessionId: string;
+   } = {
+     event,
+     data: data || {},
+     timestamp: new Date().toISOString(),
+     sessionId
+   };
+   
+   if (userId !== undefined) {
+     eventEntry.userId = userId;
+   }
+   
+   events.push(eventEntry);

-   console.log(`[Analytics] ${event}`, { ... });
+   logger.info({ event, userId, sessionId, ... }, '[Analytics] Event tracked');

    res.status(200).json({ 
      received: true,
      stored: events.length 
    });
  });

- router.get('/events', (req: Request, res: Response) => {
+ router.get('/events', (req: Request, res: Response) => {
+   const authReq = req as AuthenticatedRequest;
    const limit = parseInt(req.query.limit as string) || 100;
    const eventType = req.query.event as string | undefined;
+   const userId = authReq.userId;
+   const sessionId = authReq.sessionId || 'unknown';

-   let filtered = events;
+   let filtered = events.filter(e => 
+     e.sessionId === sessionId || 
+     (userId && e.userId === userId)
+   );

    if (eventType) {
      filtered = filtered.filter(e => e.event === eventType);
    }

+   logger.debug({ userId, sessionId, total: filtered.length }, '[Analytics] Events queried');

    res.json({
      total: filtered.length,
      limit,
      events: filtered.slice(-limit).reverse()
    });
  });

- router.get('/stats', (req: Request, res: Response) => {
+ router.get('/stats', (req: Request, res: Response) => {
+   const authReq = req as AuthenticatedRequest;
+   const userId = authReq.userId;
+   const sessionId = authReq.sessionId || 'unknown';

+   const userEvents = events.filter(e => 
+     e.sessionId === sessionId || 
+     (userId && e.userId === userId)
+   );

    const eventCounts: Record<string, number> = {};
-   events.forEach(e => {
+   userEvents.forEach(e => {
      eventCounts[e.event] = (eventCounts[e.event] || 0) + 1;
    });

    res.json({
-     totalEvents: events.length,
+     totalEvents: userEvents.length,
      maxCapacity: MAX_EVENTS,
      eventTypes: eventCounts,
-     oldestEvent: events[0]?.timestamp,
-     newestEvent: events[events.length - 1]?.timestamp
+     oldestEvent: userEvents[0]?.timestamp,
+     newestEvent: userEvents[userEvents.length - 1]?.timestamp
    });
  });

- router.delete('/events', (req: Request, res: Response) => {
+ router.delete('/events', (req: Request, res: Response) => {
+   const authReq = req as AuthenticatedRequest;
+   const userId = authReq.userId;
+   const sessionId = authReq.sessionId || 'unknown';

-   const count = events.length;
-   events.length = 0;
+   const before = events.length;
+   const remaining = events.filter(e => 
+     e.sessionId !== sessionId && 
+     (!userId || e.userId !== userId)
+   );
+   
+   const cleared = before - remaining.length;
+   events.length = 0;
+   events.push(...remaining);

-   console.log('[Analytics] Cleared all events');
+   logger.info({ userId, sessionId, cleared }, '[Analytics] Events cleared');
    
    res.json({ 
-     cleared: count,
+     cleared,
      message: 'Events cleared'
    });
  });
```

---

## 6. MODIFIED: package.json

```diff
  "dependencies": {
    // ... existing deps
+   "jsonwebtoken": "^9.0.2",
  },
  "devDependencies": {
    // ... existing deps
+   "@types/jsonwebtoken": "^9.0.7",
  }
```

---

## Summary

**Files Modified**: 6  
**Lines Added**: ~200  
**Lines Changed**: ~30  
**Build Status**: ✅ Successful

**Security Features**:
- ✅ JWT authentication on /search and /analytics
- ✅ Rate limiting on /search (100 req/min)
- ✅ JWT secret fail-fast (production)
- ✅ Analytics IDOR protection (user-scoped)
