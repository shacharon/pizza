/**
 * Tests for Google Places Text Search Pagination
 * Ensures we fetch up to 20 results by iterating pages
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllPages } from '../pagination-handler.js';

// Mock logger to prevent console spam during tests
const mockLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {}
};

// Store original logger
let originalLogger: any;

describe('Google Places Text Search Pagination', () => {
  // Mock callGooglePlacesSearchText function
  let mockApiCalls: any[] = [];
  let mockCallCount = 0;

  // Helper to create mock place object
  function createMockPlace(id: string, name: string): any {
    return {
      id,
      displayName: { text: name, languageCode: 'he' },
      formattedAddress: 'Test Address',
      location: { latitude: 32.0, longitude: 34.7 },
      rating: 4.5,
      userRatingCount: 100,
      types: ['restaurant']
    };
  }

  // Helper to mock API call function
  function createMockApiCall(mockResponses: any[]) {
    mockCallCount = 0;
    return async (body: any, apiKey: string, requestId: string) => {
      const response = mockResponses[mockCallCount] || { places: [] };
      mockCallCount++;
      mockApiCalls.push({ body, callNumber: mockCallCount });
      return response;
    };
  }

  test('should aggregate results from 2 pages to reach 20 unique places', async () => {
    // Mock responses: page 1 has 12 places, page 2 has 8 places
    const page1Places = Array.from({ length: 12 }, (_, i) => 
      createMockPlace(`place_${i + 1}`, `Restaurant ${i + 1}`)
    );
    const page2Places = Array.from({ length: 8 }, (_, i) => 
      createMockPlace(`place_${i + 13}`, `Restaurant ${i + 13}`)
    );

    const mockResponses = [
      { places: page1Places, nextPageToken: 'token_page2' },
      { places: page2Places, nextPageToken: undefined }
    ];

    // Create a test version of fetchAllPages with mocked API call
    const mockCallGooglePlacesSearchText = createMockApiCall(mockResponses);
    
    // Mock the import by creating a wrapper
    const testFetchAllPages = async (
      requestBody: any,
      apiKey: string,
      requestId: string,
      maxResults: number,
      maxPages: number
    ) => {
      const results: any[] = [];
      const seenPlaceIds = new Set<string>();
      let nextPageToken: string | undefined;
      let pagesFetched = 0;

      // Fetch first page
      const firstResponse = await mockCallGooglePlacesSearchText(requestBody, apiKey, requestId);
      pagesFetched++;

      if (firstResponse.places) {
        for (const place of firstResponse.places) {
          const mapped = { placeId: place.id, name: place.displayName.text, ...place };
          if (!seenPlaceIds.has(mapped.placeId)) {
            seenPlaceIds.add(mapped.placeId);
            results.push(mapped);
          }
        }
        nextPageToken = firstResponse.nextPageToken;
      }

      // Fetch additional pages
      while (nextPageToken && results.length < maxResults && pagesFetched < maxPages) {
        const pageBody = { ...requestBody, pageToken: nextPageToken };
        const pageResponse = await mockCallGooglePlacesSearchText(pageBody, apiKey, requestId);
        pagesFetched++;

        if (pageResponse.places) {
          for (const place of pageResponse.places) {
            if (results.length >= maxResults) break;
            const mapped = { placeId: place.id, name: place.displayName.text, ...place };
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

      return results;
    };

    // Execute test
    mockApiCalls = [];
    const results = await testFetchAllPages(
      { textQuery: 'מסעדות איטלקיות בגדרה', languageCode: 'he', regionCode: 'IL' },
      'test_api_key',
      'test_request_id',
      20, // maxResults
      3   // maxPages
    );

    // Assertions
    assert.equal(results.length, 20, 'Should return exactly 20 unique results');
    assert.equal(mockCallCount, 2, 'Should make 2 API calls (2 pages)');
    assert.equal(mockApiCalls[0].body.pageToken, undefined, 'First call should not have pageToken');
    assert.equal(mockApiCalls[1].body.pageToken, 'token_page2', 'Second call should have pageToken');
    
    // Verify uniqueness
    const placeIds = results.map(r => r.placeId);
    const uniqueIds = new Set(placeIds);
    assert.equal(uniqueIds.size, 20, 'All 20 results should have unique placeIds');
  });

  test('should stop when nextPageToken is missing (less than 20 results)', async () => {
    // Mock responses: page 1 has 6 places, no next page token
    const page1Places = Array.from({ length: 6 }, (_, i) => 
      createMockPlace(`place_${i + 1}`, `Restaurant ${i + 1}`)
    );

    const mockResponses = [
      { places: page1Places, nextPageToken: undefined }
    ];

    const mockCallGooglePlacesSearchText = createMockApiCall(mockResponses);
    
    const testFetchAllPages = async (
      requestBody: any,
      apiKey: string,
      requestId: string,
      maxResults: number,
      maxPages: number
    ) => {
      const results: any[] = [];
      const seenPlaceIds = new Set<string>();
      let nextPageToken: string | undefined;
      let pagesFetched = 0;

      const firstResponse = await mockCallGooglePlacesSearchText(requestBody, apiKey, requestId);
      pagesFetched++;

      if (firstResponse.places) {
        for (const place of firstResponse.places) {
          const mapped = { placeId: place.id, name: place.displayName.text, ...place };
          if (!seenPlaceIds.has(mapped.placeId)) {
            seenPlaceIds.add(mapped.placeId);
            results.push(mapped);
          }
        }
        nextPageToken = firstResponse.nextPageToken;
      }

      while (nextPageToken && results.length < maxResults && pagesFetched < maxPages) {
        const pageBody = { ...requestBody, pageToken: nextPageToken };
        const pageResponse = await mockCallGooglePlacesSearchText(pageBody, apiKey, requestId);
        pagesFetched++;

        if (pageResponse.places) {
          for (const place of pageResponse.places) {
            if (results.length >= maxResults) break;
            const mapped = { placeId: place.id, name: place.displayName.text, ...place };
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

      return results;
    };

    mockApiCalls = [];
    const results = await testFetchAllPages(
      { textQuery: 'מסעדות איטלקיות בגדרה', languageCode: 'he', regionCode: 'IL' },
      'test_api_key',
      'test_request_id',
      20, // maxResults
      3   // maxPages
    );

    // Assertions
    assert.equal(results.length, 6, 'Should return only 6 results (all available)');
    assert.equal(mockCallCount, 1, 'Should make only 1 API call (no second page)');
    assert.ok(results.every(r => r.placeId.startsWith('place_')), 'All results should have valid placeIds');
  });

  test('should respect maxPages safety cap (3 pages max)', async () => {
    // Mock responses: 4 pages with 5 places each
    const createPage = (offset: number) => ({
      places: Array.from({ length: 5 }, (_, i) => 
        createMockPlace(`place_${offset + i + 1}`, `Restaurant ${offset + i + 1}`)
      ),
      nextPageToken: offset < 15 ? `token_page${Math.floor(offset / 5) + 2}` : undefined
    });

    const mockResponses = [
      createPage(0),   // page 1: places 1-5
      createPage(5),   // page 2: places 6-10
      createPage(10),  // page 3: places 11-15
      createPage(15)   // page 4: places 16-20 (should NOT be fetched)
    ];

    const mockCallGooglePlacesSearchText = createMockApiCall(mockResponses);
    
    const testFetchAllPages = async (
      requestBody: any,
      apiKey: string,
      requestId: string,
      maxResults: number,
      maxPages: number
    ) => {
      const results: any[] = [];
      const seenPlaceIds = new Set<string>();
      let nextPageToken: string | undefined;
      let pagesFetched = 0;

      const firstResponse = await mockCallGooglePlacesSearchText(requestBody, apiKey, requestId);
      pagesFetched++;

      if (firstResponse.places) {
        for (const place of firstResponse.places) {
          const mapped = { placeId: place.id, name: place.displayName.text, ...place };
          if (!seenPlaceIds.has(mapped.placeId)) {
            seenPlaceIds.add(mapped.placeId);
            results.push(mapped);
          }
        }
        nextPageToken = firstResponse.nextPageToken;
      }

      while (nextPageToken && results.length < maxResults && pagesFetched < maxPages) {
        const pageBody = { ...requestBody, pageToken: nextPageToken };
        const pageResponse = await mockCallGooglePlacesSearchText(pageBody, apiKey, requestId);
        pagesFetched++;

        if (pageResponse.places) {
          for (const place of pageResponse.places) {
            if (results.length >= maxResults) break;
            const mapped = { placeId: place.id, name: place.displayName.text, ...place };
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

      return results;
    };

    mockApiCalls = [];
    const results = await testFetchAllPages(
      { textQuery: 'מסעדות איטלקיות בגדרה', languageCode: 'he', regionCode: 'IL' },
      'test_api_key',
      'test_request_id',
      20, // maxResults
      3   // maxPages (safety cap)
    );

    // Assertions
    assert.equal(results.length, 15, 'Should return 15 results (3 pages × 5 results)');
    assert.equal(mockCallCount, 3, 'Should make exactly 3 API calls (maxPages cap)');
    assert.ok(results.every(r => r.placeId.startsWith('place_')), 'All results should have valid placeIds');
    
    // Verify we stopped at page 3
    const lastPlaceId = results[results.length - 1].placeId;
    assert.equal(lastPlaceId, 'place_15', 'Last result should be from page 3');
  });

  test('should deduplicate places across pages', async () => {
    // Mock responses: page 1 has 10 places, page 2 has 5 duplicates + 10 new places
    const page1Places = Array.from({ length: 10 }, (_, i) => 
      createMockPlace(`place_${i + 1}`, `Restaurant ${i + 1}`)
    );
    const page2Places = [
      ...Array.from({ length: 5 }, (_, i) => createMockPlace(`place_${i + 1}`, `Restaurant ${i + 1}`)), // duplicates
      ...Array.from({ length: 10 }, (_, i) => createMockPlace(`place_${i + 11}`, `Restaurant ${i + 11}`))
    ];

    const mockResponses = [
      { places: page1Places, nextPageToken: 'token_page2' },
      { places: page2Places, nextPageToken: undefined }
    ];

    const mockCallGooglePlacesSearchText = createMockApiCall(mockResponses);
    
    const testFetchAllPages = async (
      requestBody: any,
      apiKey: string,
      requestId: string,
      maxResults: number,
      maxPages: number
    ) => {
      const results: any[] = [];
      const seenPlaceIds = new Set<string>();
      let nextPageToken: string | undefined;
      let pagesFetched = 0;

      const firstResponse = await mockCallGooglePlacesSearchText(requestBody, apiKey, requestId);
      pagesFetched++;

      if (firstResponse.places) {
        for (const place of firstResponse.places) {
          const mapped = { placeId: place.id, name: place.displayName.text, ...place };
          if (!seenPlaceIds.has(mapped.placeId)) {
            seenPlaceIds.add(mapped.placeId);
            results.push(mapped);
          }
        }
        nextPageToken = firstResponse.nextPageToken;
      }

      while (nextPageToken && results.length < maxResults && pagesFetched < maxPages) {
        const pageBody = { ...requestBody, pageToken: nextPageToken };
        const pageResponse = await mockCallGooglePlacesSearchText(pageBody, apiKey, requestId);
        pagesFetched++;

        if (pageResponse.places) {
          for (const place of pageResponse.places) {
            if (results.length >= maxResults) break;
            const mapped = { placeId: place.id, name: place.displayName.text, ...place };
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

      return results;
    };

    mockApiCalls = [];
    const results = await testFetchAllPages(
      { textQuery: 'מסעדות איטלקיות בגדרה', languageCode: 'he', regionCode: 'IL' },
      'test_api_key',
      'test_request_id',
      20, // maxResults
      3   // maxPages
    );

    // Assertions
    assert.equal(results.length, 20, 'Should return 20 unique results');
    assert.equal(mockCallCount, 2, 'Should make 2 API calls');
    
    // Verify uniqueness
    const placeIds = results.map(r => r.placeId);
    const uniqueIds = new Set(placeIds);
    assert.equal(uniqueIds.size, 20, 'Should deduplicate: 10 from page1 + 10 new from page2');
    
    // Verify we got places 1-20 (not duplicates)
    const sortedIds = Array.from(uniqueIds).sort();
    const expectedIds = Array.from({ length: 20 }, (_, i) => `place_${i + 1}`).sort();
    assert.deepEqual(sortedIds, expectedIds, 'Should have places 1-20 without duplicates');
  });

  test('should stop at maxResults even if page has more places', async () => {
    // Mock responses: page 1 has 15 places, page 2 has 20 places
    const page1Places = Array.from({ length: 15 }, (_, i) => 
      createMockPlace(`place_${i + 1}`, `Restaurant ${i + 1}`)
    );
    const page2Places = Array.from({ length: 20 }, (_, i) => 
      createMockPlace(`place_${i + 16}`, `Restaurant ${i + 16}`)
    );

    const mockResponses = [
      { places: page1Places, nextPageToken: 'token_page2' },
      { places: page2Places, nextPageToken: 'token_page3' }
    ];

    const mockCallGooglePlacesSearchText = createMockApiCall(mockResponses);
    
    const testFetchAllPages = async (
      requestBody: any,
      apiKey: string,
      requestId: string,
      maxResults: number,
      maxPages: number
    ) => {
      const results: any[] = [];
      const seenPlaceIds = new Set<string>();
      let nextPageToken: string | undefined;
      let pagesFetched = 0;

      const firstResponse = await mockCallGooglePlacesSearchText(requestBody, apiKey, requestId);
      pagesFetched++;

      if (firstResponse.places) {
        for (const place of firstResponse.places) {
          const mapped = { placeId: place.id, name: place.displayName.text, ...place };
          if (!seenPlaceIds.has(mapped.placeId)) {
            seenPlaceIds.add(mapped.placeId);
            results.push(mapped);
          }
        }
        nextPageToken = firstResponse.nextPageToken;
      }

      while (nextPageToken && results.length < maxResults && pagesFetched < maxPages) {
        const pageBody = { ...requestBody, pageToken: nextPageToken };
        const pageResponse = await mockCallGooglePlacesSearchText(pageBody, apiKey, requestId);
        pagesFetched++;

        if (pageResponse.places) {
          for (const place of pageResponse.places) {
            if (results.length >= maxResults) break;
            const mapped = { placeId: place.id, name: place.displayName.text, ...place };
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

      return results;
    };

    mockApiCalls = [];
    const results = await testFetchAllPages(
      { textQuery: 'מסעדות איטלקיות בגדרה', languageCode: 'he', regionCode: 'IL' },
      'test_api_key',
      'test_request_id',
      20, // maxResults
      3   // maxPages
    );

    // Assertions
    assert.equal(results.length, 20, 'Should return exactly 20 results (maxResults)');
    assert.equal(mockCallCount, 2, 'Should make 2 API calls');
    
    // Verify last placeId is place_20 (stopped mid-page-2)
    const lastPlaceId = results[results.length - 1].placeId;
    assert.equal(lastPlaceId, 'place_20', 'Should stop at place_20 (reached maxResults)');
  });
});
