/**
 * Pagination Handler
 * Manages nextPageToken loop and multi-page result fetching for Google Places API
 * 
 * Responsibility:
 * - Handle pagination token flow
 * - Aggregate results across pages
 * - Enforce maxResults limit
 */

import type { RouteLLMMapping } from '../../types.js';
import { mapGooglePlaceToResult } from './result-mapper.js';
import { callGooglePlacesSearchText } from './text-search.handler.js';

/**
 * Fetch all pages of results up to maxResults limit
 * Returns aggregated results from all pages
 */
export async function fetchAllPages(
  requestBody: any,
  apiKey: string,
  requestId: string,
  maxResults: number = 20
): Promise<any[]> {
  const results: any[] = [];
  let nextPageToken: string | undefined;

  // Fetch first page
  const firstResponse = await callGooglePlacesSearchText(requestBody, apiKey, requestId);
  if (firstResponse.places) {
    results.push(...firstResponse.places.map((r: any) => mapGooglePlaceToResult(r)));
    nextPageToken = firstResponse.nextPageToken;
  }

  // Fetch additional pages if needed (up to maxResults)
  while (nextPageToken && results.length < maxResults) {
    // New API: no delay needed for pagination
    const pageBody = { ...requestBody, pageToken: nextPageToken };
    const pageResponse = await callGooglePlacesSearchText(pageBody, apiKey, requestId);

    if (pageResponse.places) {
      const remaining = maxResults - results.length;
      const newResults = pageResponse.places.slice(0, remaining);
      results.push(...newResults.map((r: any) => mapGooglePlaceToResult(r)));
      nextPageToken = pageResponse.nextPageToken;
    } else {
      break;
    }
  }

  return results;
}
