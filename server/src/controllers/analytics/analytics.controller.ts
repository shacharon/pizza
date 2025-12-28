/**
 * Analytics Controller
 * Handles event tracking with in-memory storage
 */

import { Router, Request, Response } from 'express';

const router = Router();

// In-memory storage (reset on server restart)
const events: Array<{
  event: string;
  data: any;
  timestamp: string;
}> = [];

const MAX_EVENTS = 1000;

/**
 * POST /api/analytics/events
 * Track an analytics event
 */
router.post('/events', (req: Request, res: Response) => {
  const { event, data } = req.body;

  // Validate request
  if (!event) {
    return res.status(400).json({ error: 'Event name is required' });
  }

  // Store in memory
  events.push({
    event,
    data: data || {},
    timestamp: new Date().toISOString()
  });

  // Keep only last MAX_EVENTS events (FIFO)
  if (events.length > MAX_EVENTS) {
    events.shift();
  }

  // Log to console for visibility
  console.log(`[Analytics] ${event}`, {
    query: data?.query,
    count: data?.count,
    durationMs: data?.durationMs,
    sessionId: data?.sessionId
  });

  res.status(200).json({ 
    received: true,
    stored: events.length 
  });
});

/**
 * GET /api/analytics/events
 * Query recent events (for debugging)
 */
router.get('/events', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const eventType = req.query.event as string | undefined;

  let filtered = events;

  // Filter by event type if specified
  if (eventType) {
    filtered = events.filter(e => e.event === eventType);
  }

  res.json({
    total: filtered.length,
    limit,
    events: filtered.slice(-limit).reverse() // Most recent first
  });
});

/**
 * GET /api/analytics/stats
 * Get analytics statistics
 */
router.get('/stats', (req: Request, res: Response) => {
  const eventCounts: Record<string, number> = {};
  
  events.forEach(e => {
    eventCounts[e.event] = (eventCounts[e.event] || 0) + 1;
  });

  res.json({
    totalEvents: events.length,
    maxCapacity: MAX_EVENTS,
    eventTypes: eventCounts,
    oldestEvent: events[0]?.timestamp,
    newestEvent: events[events.length - 1]?.timestamp
  });
});

/**
 * DELETE /api/analytics/events
 * Clear all stored events (for testing)
 */
router.delete('/events', (req: Request, res: Response) => {
  const count = events.length;
  events.length = 0; // Clear array
  
  console.log('[Analytics] Cleared all events');
  
  res.json({ 
    cleared: count,
    message: 'All events cleared'
  });
});

export default router;












