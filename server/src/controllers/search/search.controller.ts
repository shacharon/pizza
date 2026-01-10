/**
 * Unified Search Controller
 * Routes are mounted at /search by the v1 aggregator
 * 
 * Internal routes:
 * - POST /       → /search
 * - GET /stats   → /search/stats
 */

import { Router, type Request, type Response } from 'express';
import { SearchOrchestrator } from '../../services/search/orchestrator/search.orchestrator.js';
import { IntentService } from '../../services/search/capabilities/intent.service.js';
import { GeoResolverService } from '../../services/search/capabilities/geo-resolver.service.js';
import { PlacesProviderService } from '../../services/search/capabilities/places-provider.service.js';
import { RankingService } from '../../services/search/capabilities/ranking.service.js';
import { SuggestionService } from '../../services/search/capabilities/suggestion.service.js';
import { SessionService } from '../../services/search/capabilities/session.service.js';
import { GeocodingService } from '../../services/search/geocoding/geocoding.service.js';
import { safeParseSearchRequest } from '../../services/search/types/search-request.dto.js';
import { createSearchError } from '../../services/search/types/search-response.dto.js';
import { createLLMProvider } from '../../llm/factory.js';
import { logger } from '../../lib/logger/structured-logger.js';
import { AssistantJobService } from '../../services/search/assistant/assistant-job.service.js';
import type { SearchContext } from '../../services/search/types/search.types.js';
import type { RequestState } from '../../infra/state/request-state.store.js';

const router = Router();

// Singleton orchestrator (instantiate services once)
const orchestrator = createSearchOrchestrator();

// Phase 4: Assistant job service (lazy loaded when needed)
let assistantJobService: AssistantJobService | null = null;

/**
 * POST /search
 * Unified search endpoint
 * 
 * Phase 5: Supports both sync (default) and async modes
 * - ?mode=sync (default): Returns full response with assistant (4-6s)
 * - ?mode=async: Returns fast core result, assistant via WebSocket
 */
router.post('/', async (req: Request, res: Response) => {
  // Phase 1: Generate requestId once (source of truth)
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Validate request
    const validation = safeParseSearchRequest(req.body);

    if (!validation.success) {
      req.log.warn({ requestId, error: validation.error }, 'Invalid search request');
      res.status(400).json(createSearchError(
        'Invalid request',
        'VALIDATION_ERROR',
        validation.error
      ));
      return;
    }

    // Phase 5: Parse mode (sync or async)
    const mode = (req.query.mode as 'sync' | 'async') || 'sync';

    req.log.info({ 
      requestId, 
      query: validation.data!.query, 
      mode 
    }, 'Search request validated');

    // Phase 5: Async mode - fast core + fire-and-forget assistant
    if (mode === 'async') {
      // Import singletons dynamically to avoid circular dependency
      const serverModule = await import('../../server.js');
      const requestStateStore = (serverModule as any).requestStateStore;
      const wsManager = (serverModule as any).wsManager;
      
      // Lazy init assistant job service
      if (!assistantJobService) {
        const llm = createLLMProvider();
        assistantJobService = new AssistantJobService(llm, requestStateStore, wsManager);
        logger.info('✅ AssistantJobService initialized (async mode)');
      }

      // Build search context
      const ctx: SearchContext = {
        requestId,
        ...(validation.data!.sessionId !== undefined && { sessionId: validation.data!.sessionId }),
        ...(req.traceId !== undefined && { traceId: req.traceId }),
        startTime: Date.now(),
        timings: {
          intentMs: 0,
          geocodeMs: 0,
          providerMs: 0,
          rankingMs: 0,
          assistantMs: 0,
          totalMs: 0
        }
      };

      // Call searchCore (fast path, no LLM)
      const coreResult = await orchestrator.searchCore(validation.data!, ctx);

      // Create initial request state
      const seed = Date.now() % 1000000; // Deterministic seed from timestamp
      const now = Date.now();
      const state: RequestState = {
        requestId,
        ...(validation.data!.sessionId !== undefined && { sessionId: validation.data!.sessionId }),
        ...(req.traceId !== undefined && { traceId: req.traceId }),
        coreResult,
        assistantStatus: 'pending' as const,
        seed,
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 300_000 // 5 minutes TTL
      };

      // Persist state
      await requestStateStore.set(requestId, state, 300);

      // Fire-and-forget assistant job
      assistantJobService.startJob(requestId).catch(err => {
        logger.error({ requestId, err }, 'assistant_job_failed');
      });

      logger.info({ requestId }, 'assistant_job_queued');

      // Return fast core result (NO assist/proposedActions)
      req.log.info({
        requestId,
        resultCount: coreResult.results.length,
        mode: 'async'
      }, 'Search core completed (async)');

      res.json(coreResult);
      return;
    }

    // Sync mode (default) - backward compatible
    const response = await orchestrator.search(validation.data!, req.traceId, requestId);

    req.log.info({
      requestId,
      resultCount: response.results.length,
      mode: 'sync'
    }, 'Search completed (sync)');

    res.json(response);

  } catch (error) {
    req.log.error({ requestId, error }, 'Search error');

    res.status(500).json(createSearchError(
      error instanceof Error ? error.message : 'Internal server error',
      'SEARCH_ERROR'
    ));
  }
});

/**
 * GET /search/stats
 * Get orchestrator statistics (for monitoring)
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = orchestrator.getStats();
    res.json(stats);
  } catch (error) {
    req.log.error({ error }, 'Stats error');
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * Create the SearchOrchestrator with all services
 * Singleton pattern - instantiate once and reuse
 */
function createSearchOrchestrator(): SearchOrchestrator {
  logger.info('Initializing SearchOrchestrator...');

  // Initialize GeocodingService if API key is available
  // Provides canonicalization and verification of LLM-extracted cities
  // Falls back gracefully to LLM coordinates if API is unavailable
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  let geocodingService: GeocodingService | undefined;

  if (googleApiKey && googleApiKey !== 'test-key') {
    geocodingService = new GeocodingService(googleApiKey);
    logger.info('🌍 Geocoding validation enabled (canonical coordinates)');
    logger.info('ℹ️  Strategy: Trust but verify - LLM intent + API canonicalization');
  } else {
    logger.warn('⚠️  Geocoding API key not found');
    logger.info('ℹ️  Using LLM-only mode (set GOOGLE_API_KEY to enable validation)');
    geocodingService = undefined;
  }

  // Initialize LLM provider (for assistant narration)
  const llm = createLLMProvider();
  if (llm) {
    logger.info('🤖 AI Assistant enabled (LLM Pass B)');
  } else {
    logger.warn('⚠️  LLM not configured - using fallback messages');
  }

  // Instantiate all capability services
  const intentService = new IntentService(undefined, geocodingService);
  const geoResolver = new GeoResolverService();
  const placesProvider = new PlacesProviderService();
  const rankingService = new RankingService();
  const suggestionService = new SuggestionService();
  const sessionService = new SessionService();

  // Start session cleanup
  sessionService.startCleanup();

  // Create orchestrator
  const orchestrator = new SearchOrchestrator(
    intentService,
    geoResolver,
    placesProvider,
    rankingService,
    suggestionService,
    sessionService,
    llm
  );

  logger.info('✅ SearchOrchestrator ready');

  return orchestrator;
}

export default router;

