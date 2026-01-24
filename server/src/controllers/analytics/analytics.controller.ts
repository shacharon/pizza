/**
 * Analytics Controller
 * P0 Security: User-scoped analytics with IDOR protection
 */

import { Router, Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { logger } from '../../lib/logger/structured-logger.js';

const router = Router();

// In-memory storage (reset on server restart)
// P0: Events bound to userId/sessionId
const events: Array<{
  event: string;
  data: any;
  timestamp: string;
  userId?: string;
  sessionId: string;
}> = [];

const MAX_EVENTS = 1000;

/**
 * POST /api/analytics/events
 * P0 Security: Track event bound to authenticated user/session
 */
router.post('/events', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { event, data } = req.body;
  const userId = authReq.userId;
  const sessionId = authReq.sessionId || 'unknown';

  if (!event) {
    return res.status(400).json({
      error: 'Event name is required',
      code: 'VALIDATION_ERROR'
    });
  }

  // P0: Bind event to authenticated user/session
  const eventEntry: {
    event: string;
    data: any;
    timestamp: string;
    userId?: string;
    sessionId: string;
  } = {
    event,
    data: data || {},
    timestamp: new Date().toISOString(),
    sessionId
  };
  
  if (userId !== undefined) {
    eventEntry.userId = userId;
  }
  
  events.push(eventEntry);

  if (events.length > MAX_EVENTS) {
    events.shift();
  }

  logger.info({
    event,
    userId,
    sessionId,
    query: data?.query,
    count: data?.count
  }, '[Analytics] Event tracked');

  res.status(200).json({ 
    received: true,
    stored: events.length 
  });
});

/**
 * GET /api/analytics/events
 * P0 Security: Query only own events (IDOR protection)
 */
router.get('/events', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const limit = parseInt(req.query.limit as string) || 100;
  const eventType = req.query.event as string | undefined;
  const userId = authReq.userId;
  const sessionId = authReq.sessionId || 'unknown';

  // P0: Filter by authenticated user/session
  let filtered = events.filter(e => 
    e.sessionId === sessionId || 
    (userId && e.userId === userId)
  );

  if (eventType) {
    filtered = filtered.filter(e => e.event === eventType);
  }

  logger.debug({
    userId,
    sessionId,
    total: filtered.length
  }, '[Analytics] Events queried');

  res.json({
    total: filtered.length,
    limit,
    events: filtered.slice(-limit).reverse()
  });
});

/**
 * GET /api/analytics/stats
 * P0 Security: Stats for own events only (IDOR protection)
 */
router.get('/stats', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.userId;
  const sessionId = authReq.sessionId || 'unknown';

  // P0: Filter by authenticated user/session
  const userEvents = events.filter(e => 
    e.sessionId === sessionId || 
    (userId && e.userId === userId)
  );

  const eventCounts: Record<string, number> = {};
  userEvents.forEach(e => {
    eventCounts[e.event] = (eventCounts[e.event] || 0) + 1;
  });

  res.json({
    totalEvents: userEvents.length,
    maxCapacity: MAX_EVENTS,
    eventTypes: eventCounts,
    oldestEvent: userEvents[0]?.timestamp,
    newestEvent: userEvents[userEvents.length - 1]?.timestamp
  });
});

/**
 * DELETE /api/analytics/events
 * P0 Security: Clear only own events (IDOR protection)
 */
router.delete('/events', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.userId;
  const sessionId = authReq.sessionId || 'unknown';

  // P0: Remove only own events
  const before = events.length;
  const remaining = events.filter(e => 
    e.sessionId !== sessionId && 
    (!userId || e.userId !== userId)
  );
  
  const cleared = before - remaining.length;
  events.length = 0;
  events.push(...remaining);

  logger.info({
    userId,
    sessionId,
    cleared
  }, '[Analytics] Events cleared');
  
  res.json({ 
    cleared,
    message: 'Events cleared'
  });
});

export default router;












