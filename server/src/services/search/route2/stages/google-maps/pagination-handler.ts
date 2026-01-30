/**
 * Pagination Handler
 * Manages nextPageToken loop and multi-page result fetching for Google Places API
 * 
 * Responsibility:
 * - Handle pagination token flow
 * - Aggregate results across pages
 * - Enforce maxResults limit
 * - Deduplicate results by placeId
 */

import type { RouteLLMMapping } from '../../types.js';
import { mapGooglePlaceToResult } from './result-mapper.js';
import { callGooglePlacesSearchText } from './text-search.handler.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';

/**
 * Fetch all pages of results up to maxResults limit
 * Returns aggregated results from all pages with deduplication
 */
export async function fetchAllPages(
  requestBody: any,
  apiKey: string,
  requestId: string,
  maxResults: number = 40
): Promise<any[]> {
  const results: any[] = [];
  const seenPlaceIds = new Set<string>();
  let nextPageToken: string | undefined;
  let pagesFetched = 0;
  let totalFetched = 0;

  // Fetch first page
  const firstResponse = await callGooglePlacesSearchText(requestBody, apiKey, requestId);
  pagesFetched++;

  if (firstResponse.places) {
    totalFetched += firstResponse.places.length;
    for (const place of firstResponse.places) {
      const mapped = mapGooglePlaceToResult(place);
      if (!seenPlaceIds.has(mapped.placeId)) {
        seenPlaceIds.add(mapped.placeId);
        results.push(mapped);
      }
    }
    nextPageToken = firstResponse.nextPageToken;
  }

  // Fetch additional pages if needed (up to maxResults)
  while (nextPageToken && results.length < maxResults) {
    // New API: no delay needed for pagination
    const pageBody = { ...requestBody, pageToken: nextPageToken };
    const pageResponse = await callGooglePlacesSearchText(pageBody, apiKey, requestId);
    pagesFetched++;

    if (pageResponse.places) {
      totalFetched += pageResponse.places.length;
      const remaining = maxResults - results.length;

      for (const place of pageResponse.places) {
        if (results.length >= maxResults) break;

        const mapped = mapGooglePlaceToResult(place);
        if (!seenPlaceIds.has(mapped.placeId)) {
          seenPlaceIds.add(mapped.placeId);
          results.push(mapped);
        }
      }

      nextPageToken = pageResponse.nextPageToken;
    } else {
      break;
    }
  }

  // Log pagination summary
  logger.info({
    requestId,
    event: 'google_pages_fetched',
    pages: pagesFetched,
    totalFetched,
    totalUnique: results.length,
    nextPageTokenUsed: pagesFetched > 1,
    hadMorePages: !!nextPageToken
  }, '[GOOGLE] Pagination summary');

  // DEBUG: Log when Google returns exactly 20 results with no second page
  // This helps identify cases where Google may have more results but doesn't provide nextPageToken
  if (!nextPageToken && totalFetched === 20) {
    logger.debug({
      event: 'google_no_second_page',
      requestId,
      textQuery: requestBody.textQuery,
      hasBias: !!requestBody.locationBias,
      biasRadiusMeters: requestBody.locationBias?.circle?.radius || null,
      region: requestBody.regionCode || null,
      language: requestBody.languageCode || null
    }, '[GOOGLE] No second page despite fetching exactly 20 results');
  }

  return results;
}
