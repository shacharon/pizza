/**
 * Assistant Context Builder
 * Reconstructs AssistantContext from job/result data
 * Single responsibility: Context reconstruction and mapping
 */

import type { Logger } from 'pino';
import type { AssistantContext, AssistantLanguage } from '../../../services/search/route2/assistant/assistant-llm.service.js';

export class AssistantContextBuilder {
  constructor(private readonly logger: Logger) { }

  /**
   * Reconstruct AssistantContext from job/result
   * Best effort: Falls back to GENERIC_QUERY_NARRATION if cannot reconstruct SUMMARY
   */
  async buildContext(
    requestId: string,
    job: any,
    result: any
  ): Promise<AssistantContext> {
    const query = job?.query || 'unknown query';
    const language = result?.query?.language || 'en';

    // If result has results array, try to build SUMMARY context
    if (result && result.results && Array.isArray(result.results)) {
      const resultCount = result.results.length;

      // Extract top 3 restaurant names
      const top3Names = result.results
        .slice(0, 3)
        .map((r: any) => r.name || 'Unknown')
        .filter(Boolean);

      // Build SUMMARY context
      const summaryContext: AssistantContext = {
        type: 'SUMMARY',
        query,
        language: language as AssistantLanguage,
        resultCount,
        top3Names,
        metadata: {
          filtersApplied: result.meta?.appliedFilters || []
        }
      };

      return summaryContext;
    }

    // Fallback: GENERIC_QUERY_NARRATION (safe default)
    this.logger.info(
      { requestId, reason: 'no_results_for_summary' },
      '[AssistantSSE] Cannot reconstruct SUMMARY, using GENERIC_QUERY_NARRATION fallback'
    );

    const fallbackContext: AssistantContext = {
      type: 'GENERIC_QUERY_NARRATION',
      query,
      language: language as AssistantLanguage,
      resultCount: 0,
      usedCurrentLocation: false
    };

    return fallbackContext;
  }
}
