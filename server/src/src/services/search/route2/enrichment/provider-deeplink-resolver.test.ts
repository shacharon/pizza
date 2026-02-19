/**
 * Provider Deep Link Resolver - Unit Tests
 * 
 * Tests CSE client initialization and usage tracking:
 * - When env vars exist: resolver uses L1/L2 CSE
 * - When env vars missing: resolver uses L3 fallback
 * - Resolution behavior with different scenarios
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import {
  ProviderDeepLinkResolver,
  type ResolveInput,
} from './provider-deeplink-resolver.js';
import { GoogleCSEClient } from './google-cse-client.js';

describe('ProviderDeepLinkResolver', () => {

  describe('Resolution behavior with null CSE client', () => {
    it('should use L3 fallback when CSE client is null (simulates missing env vars)', async () => {
      // Setup: Resolver with null CSE client
      // This simulates the scenario where GOOGLE_CSE_API_KEY or GOOGLE_CSE_ENGINE_ID are missing
      const resolver = new ProviderDeepLinkResolver(null);
      const input: ResolveInput = {
        provider: 'wolt',
        name: 'Pizza House',
        cityText: 'Tel Aviv',
      };

      // Act: Resolve (logs warning with reason="no_cse_client")
      const result = await resolver.resolve(input);

      // Assert: Result uses L3 fallback (internal search URL)
      // This is the root cause of the bug: no CSE client -> no CSE calls -> cseCallsTotal stays 0
      assert.strictEqual(result.status, 'NOT_FOUND', 'Status should be NOT_FOUND for L3');
      assert.strictEqual(result.meta.layerUsed, 3, 'Should use L3');
      assert.strictEqual(result.meta.source, 'internal', 'Source should be internal');
      assert.ok(result.url, 'Should have fallback URL');
      assert.ok(
        result.url.includes('wolt.com/search'),
        'URL should be Wolt internal search'
      );
    });

    it('should use CSE (L1/L2) when CSE client is available', async () => {
      // Setup: Mock CSE client that returns results
      const mockCseClient = {
        search: mock.fn(async () => [
          {
            title: 'Pizza House - Wolt',
            url: 'https://wolt.com/en/isr/tel-aviv/restaurant/pizza-house',
            snippet: 'Order now',
          },
        ]),
        getCallCount: () => 1,
        resetCallCount: () => {},
      } as unknown as GoogleCSEClient;

      const resolver = new ProviderDeepLinkResolver(mockCseClient);
      const input: ResolveInput = {
        provider: 'wolt',
        name: 'Pizza House',
        cityText: 'Tel Aviv',
      };

      // Act: Resolve
      const result = await resolver.resolve(input);

      // Assert: Result uses CSE (L1)
      assert.strictEqual(result.status, 'FOUND', 'Status should be FOUND');
      assert.strictEqual(result.meta.layerUsed, 1, 'Should use L1 (CSE with city)');
      assert.strictEqual(result.meta.source, 'cse', 'Source should be CSE');
      assert.strictEqual(
        result.url,
        'https://wolt.com/en/isr/tel-aviv/restaurant/pizza-house',
        'Should return CSE result URL'
      );

      // Assert: CSE search was called
      assert.strictEqual(
        (mockCseClient.search as any).mock.callCount(),
        1,
        'CSE search should be called once'
      );

    });

    it('should try L1 then L2 then L3 when CSE returns no valid results', async () => {
      // Setup: Mock CSE client that returns no valid results
      const mockCseClient = {
        search: mock.fn(async () => [
          {
            title: 'Wrong site',
            url: 'https://example.com/wrong',
            snippet: 'Not wolt',
          },
        ]),
        getCallCount: () => 2,
        resetCallCount: () => {},
      } as unknown as GoogleCSEClient;

      const resolver = new ProviderDeepLinkResolver(mockCseClient);
      const input: ResolveInput = {
        provider: 'wolt',
        name: 'Pizza House',
        cityText: 'Tel Aviv',
      };

      // Act: Resolve
      const result = await resolver.resolve(input);

      // Assert: Result falls back to L3
      assert.strictEqual(result.status, 'NOT_FOUND', 'Status should be NOT_FOUND');
      assert.strictEqual(result.meta.layerUsed, 3, 'Should fall back to L3');
      assert.strictEqual(result.meta.source, 'internal', 'Source should be internal');

      // Assert: CSE was called twice (L1 + L2)
      assert.strictEqual(
        (mockCseClient.search as any).mock.callCount(),
        2,
        'CSE should be called twice (L1 + L2)'
      );
    });

    it('should skip L1 when cityText is missing and go directly to L2', async () => {
      // Setup: Mock CSE client
      const mockCseClient = {
        search: mock.fn(async () => [
          {
            title: 'Pizza House - Wolt',
            url: 'https://wolt.com/en/isr/restaurant/pizza-house',
            snippet: 'Order now',
          },
        ]),
        getCallCount: () => 1,
        resetCallCount: () => {},
      } as unknown as GoogleCSEClient;

      const resolver = new ProviderDeepLinkResolver(mockCseClient);
      const input: ResolveInput = {
        provider: 'wolt',
        name: 'Pizza House',
        cityText: null, // No city
      };

      // Act: Resolve
      const result = await resolver.resolve(input);

      // Assert: Result uses L2 (not L1)
      assert.strictEqual(result.status, 'FOUND', 'Status should be FOUND');
      assert.strictEqual(result.meta.layerUsed, 2, 'Should use L2 (no city)');
      assert.strictEqual(result.meta.source, 'cse', 'Source should be CSE');

      // Assert: CSE was called once (only L2, skipped L1)
      assert.strictEqual(
        (mockCseClient.search as any).mock.callCount(),
        1,
        'CSE should be called once (L2 only)'
      );
    });
  });

  describe('ProviderDeepLinkResolver - 10bis provider', () => {
    it('should resolve 10bis deep links using correct host', async () => {
      // Setup: Mock CSE client
      const mockCseClient = {
        search: mock.fn(async () => [
          {
            title: 'Pizza House - 10bis',
            url: 'https://www.10bis.co.il/next/restaurants/menu/delivery/19288/pizza-house',
            snippet: 'Order now',
          },
        ]),
        getCallCount: () => 1,
        resetCallCount: () => {},
      } as unknown as GoogleCSEClient;

      const resolver = new ProviderDeepLinkResolver(mockCseClient);
      const input: ResolveInput = {
        provider: 'tenbis',
        name: 'Pizza House',
        cityText: 'Tel Aviv',
      };

      // Act: Resolve
      const result = await resolver.resolve(input);

      // Assert: Result uses CSE with 10bis URL
      assert.strictEqual(result.status, 'FOUND', 'Status should be FOUND');
      assert.strictEqual(result.meta.source, 'cse', 'Source should be CSE');
      assert.ok(
        result.url?.includes('10bis.co.il'),
        'URL should be 10bis domain'
      );

      // Assert: CSE search query contains 10bis.co.il site operator
      const searchCall = (mockCseClient.search as any).mock.calls[0];
      const query = searchCall.arguments[0] as string;
      assert.ok(
        query.includes('site:10bis.co.il'),
        'Query should include 10bis.co.il site operator'
      );
    });

    it('should return 10bis internal search URL for L3 fallback', async () => {
      // Setup: Resolver with null CSE client
      const resolver = new ProviderDeepLinkResolver(null);
      const input: ResolveInput = {
        provider: 'tenbis',
        name: 'Pizza House',
        cityText: null,
      };

      // Act: Resolve
      const result = await resolver.resolve(input);

      // Assert: Result uses L3 fallback with 10bis search
      assert.strictEqual(result.status, 'NOT_FOUND', 'Status should be NOT_FOUND');
      assert.strictEqual(result.meta.layerUsed, 3, 'Should use L3');
      assert.ok(
        result.url?.includes('10bis.co.il/search'),
        'URL should be 10bis internal search'
      );
    });
  });
});
