/**
 * Unified Search Controller
 * POST /api/search - The new BFF endpoint
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

const router = Router();

// Singleton orchestrator (instantiate services once)
const orchestrator = createSearchOrchestrator();

/**
 * POST /api/search
 * Unified search endpoint
 */
router.post('/search', async (req: Request, res: Response) => {
  try {
    // Validate request
    const validation = safeParseSearchRequest(req.body);
    
    if (!validation.success) {
      res.status(400).json(createSearchError(
        'Invalid request',
        'VALIDATION_ERROR',
        validation.error
      ));
      return;
    }

    // Execute search
    const response = await orchestrator.search(validation.data!);
    
    res.json(response);
    
  } catch (error) {
    console.error('[SearchController] Error:', error);
    
    res.status(500).json(createSearchError(
      error instanceof Error ? error.message : 'Internal server error',
      'SEARCH_ERROR'
    ));
  }
});

/**
 * GET /api/search/stats
 * Get orchestrator statistics (for monitoring)
 */
router.get('/search/stats', (req: Request, res: Response) => {
  try {
    const stats = orchestrator.getStats();
    res.json(stats);
  } catch (error) {
    console.error('[SearchController] Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * Create the SearchOrchestrator with all services
 * Singleton pattern - instantiate once and reuse
 */
function createSearchOrchestrator(): SearchOrchestrator {
  console.log('[SearchController] Initializing SearchOrchestrator...');

  // Initialize GeocodingService if API key is available
  // Provides canonicalization and verification of LLM-extracted cities
  // Falls back gracefully to LLM coordinates if API is unavailable
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  let geocodingService: GeocodingService | undefined;
  
  if (googleApiKey && googleApiKey !== 'test-key') {
    geocodingService = new GeocodingService(googleApiKey);
    console.log('[SearchController] 🌍 Geocoding validation enabled (canonical coordinates)');
    console.log('[SearchController] ℹ️  Strategy: Trust but verify - LLM intent + API canonicalization');
  } else {
    console.log('[SearchController] ⚠️  Geocoding API key not found');
    console.log('[SearchController] ℹ️  Using LLM-only mode (set GOOGLE_API_KEY to enable validation)');
    geocodingService = undefined;
  }

  // Initialize LLM provider (for assistant narration)
  const llm = createLLMProvider();
  if (llm) {
    console.log('[SearchController] 🤖 AI Assistant enabled (LLM Pass B)');
  } else {
    console.log('[SearchController] ⚠️  LLM not configured - using fallback messages');
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

  console.log('[SearchController] ✅ SearchOrchestrator ready');

  return orchestrator;
}

export default router;

