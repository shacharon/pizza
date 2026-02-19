/**
 * Brave Search Adapter Tests
 * 
 * Tests URL validation, especially Wolt country filtering
 */

import { BraveSearchAdapter } from '../brave-search.adapter.js';
import type { BraveSearchClient, SearchResult } from '../brave-search-client.js';
import type { ProviderSearchConfig } from '../brave-search.adapter.js';

describe('BraveSearchAdapter - Wolt Country Validation', () => {
  let adapter: BraveSearchAdapter;
  let mockClient: jest.Mocked<BraveSearchClient>;

  beforeEach(() => {
    mockClient = {
      search: jest.fn(),
    } as any;

    adapter = new BraveSearchAdapter(mockClient);
  });

  const woltConfig: ProviderSearchConfig = {
    provider: 'wolt',
    allowedHosts: ['wolt.com', '*.wolt.com'],
    requiredPathSegments: ['/restaurant/'],
  };

  describe('Valid Israeli Wolt URLs', () => {
    it('should accept /en/isr/tel-aviv/restaurant/xyz', async () => {
      const validResult: SearchResult = {
        url: 'https://wolt.com/en/isr/tel-aviv/restaurant/pizza-house',
        title: 'Pizza House',
        description: 'Best pizza in Tel Aviv',
      };

      mockClient.search.mockResolvedValue([validResult]);

      const result = await adapter.searchWithRelaxPolicy(
        'Pizza House',
        'Tel Aviv',
        woltConfig
      );

      expect(result).toBe(validResult.url);
    });

    it('should accept /he/isr/jerusalem/restaurant/xyz', async () => {
      const validResult: SearchResult = {
        url: 'https://wolt.com/he/isr/jerusalem/restaurant/falafel-king',
        title: 'Falafel King',
        description: 'Best falafel',
      };

      mockClient.search.mockResolvedValue([validResult]);

      const result = await adapter.searchWithRelaxPolicy(
        'Falafel King',
        'Jerusalem',
        woltConfig
      );

      expect(result).toBe(validResult.url);
    });

    it('should accept /isr/haifa/restaurant/xyz (no language prefix)', async () => {
      const validResult: SearchResult = {
        url: 'https://wolt.com/isr/haifa/restaurant/burger-bar',
        title: 'Burger Bar',
        description: 'Burgers',
      };

      mockClient.search.mockResolvedValue([validResult]);

      const result = await adapter.searchWithRelaxPolicy(
        'Burger Bar',
        'Haifa',
        woltConfig
      );

      expect(result).toBe(validResult.url);
    });
  });

  describe('Invalid Wolt URLs - Wrong Country', () => {
    it('should reject /en/bgr/sofia/restaurant/xyz (Bulgaria)', async () => {
      const invalidResult: SearchResult = {
        url: 'https://wolt.com/en/bgr/sofia/restaurant/pizza-house',
        title: 'Pizza House Sofia',
        description: 'Pizza in Bulgaria',
      };

      mockClient.search.mockResolvedValue([invalidResult]);

      const result = await adapter.searchWithRelaxPolicy(
        'Pizza House',
        'Sofia',
        woltConfig
      );

      expect(result).toBeNull();
    });

    it('should reject /en/fin/helsinki/restaurant/xyz (Finland)', async () => {
      const invalidResult: SearchResult = {
        url: 'https://wolt.com/en/fin/helsinki/restaurant/sushi-bar',
        title: 'Sushi Bar Helsinki',
        description: 'Sushi in Finland',
      };

      mockClient.search.mockResolvedValue([invalidResult]);

      const result = await adapter.searchWithRelaxPolicy(
        'Sushi Bar',
        'Helsinki',
        woltConfig
      );

      expect(result).toBeNull();
    });

    it('should reject /en/pol/warsaw/restaurant/xyz (Poland)', async () => {
      const invalidResult: SearchResult = {
        url: 'https://wolt.com/en/pol/warsaw/restaurant/burger-place',
        title: 'Burger Place Warsaw',
        description: 'Burgers in Poland',
      };

      mockClient.search.mockResolvedValue([invalidResult]);

      const result = await adapter.searchWithRelaxPolicy(
        'Burger Place',
        'Warsaw',
        woltConfig
      );

      expect(result).toBeNull();
    });
  });

  describe('Invalid Wolt URLs - Wrong Page Type', () => {
    it('should reject /en/isr/tel-aviv/venue/xyz (not a restaurant)', async () => {
      const invalidResult: SearchResult = {
        url: 'https://wolt.com/en/isr/tel-aviv/venue/concert-hall',
        title: 'Concert Hall',
        description: 'Event venue',
      };

      mockClient.search.mockResolvedValue([invalidResult]);

      const result = await adapter.searchWithRelaxPolicy(
        'Concert Hall',
        'Tel Aviv',
        woltConfig
      );

      expect(result).toBeNull();
    });

    it('should reject /en/isr/tel-aviv/store/xyz (retail, not restaurant)', async () => {
      const invalidResult: SearchResult = {
        url: 'https://wolt.com/en/isr/tel-aviv/store/grocery-shop',
        title: 'Grocery Shop',
        description: 'Grocery store',
      };

      mockClient.search.mockResolvedValue([invalidResult]);

      const result = await adapter.searchWithRelaxPolicy(
        'Grocery Shop',
        'Tel Aviv',
        woltConfig
      );

      expect(result).toBeNull();
    });
  });

  describe('Mixed Results - Prefer Valid Israeli URLs', () => {
    it('should skip Bulgarian result and find Israeli result', async () => {
      const bulgarianResult: SearchResult = {
        url: 'https://wolt.com/en/bgr/sofia/restaurant/pizza-house',
        title: 'Pizza House Sofia',
        description: 'Pizza in Bulgaria',
      };

      const israeliResult: SearchResult = {
        url: 'https://wolt.com/en/isr/tel-aviv/restaurant/pizza-house',
        title: 'Pizza House Tel Aviv',
        description: 'Pizza in Israel',
      };

      // Return Bulgarian first, Israeli second
      mockClient.search.mockResolvedValue([bulgarianResult, israeliResult]);

      const result = await adapter.searchWithRelaxPolicy(
        'Pizza House',
        'Tel Aviv',
        woltConfig
      );

      // Should select Israeli URL, not Bulgarian
      expect(result).toBe(israeliResult.url);
    });

    it('should skip venue and find restaurant', async () => {
      const venueResult: SearchResult = {
        url: 'https://wolt.com/en/isr/tel-aviv/venue/burger-bar',
        title: 'Burger Bar Venue',
        description: 'Event venue',
      };

      const restaurantResult: SearchResult = {
        url: 'https://wolt.com/en/isr/tel-aviv/restaurant/burger-bar',
        title: 'Burger Bar Restaurant',
        description: 'Restaurant',
      };

      mockClient.search.mockResolvedValue([venueResult, restaurantResult]);

      const result = await adapter.searchWithRelaxPolicy(
        'Burger Bar',
        'Tel Aviv',
        woltConfig
      );

      expect(result).toBe(restaurantResult.url);
    });
  });

  describe('Other Providers - No Country Validation', () => {
    it('should accept 10bis URLs without country check', async () => {
      const tenbisConfig: ProviderSearchConfig = {
        provider: 'tenbis',
        allowedHosts: ['10bis.co.il'],
      };

      const validResult: SearchResult = {
        url: 'https://www.10bis.co.il/next/restaurants/menu/pizza-house',
        title: 'Pizza House',
        description: 'Pizza',
      };

      mockClient.search.mockResolvedValue([validResult]);

      const result = await adapter.searchWithRelaxPolicy(
        'Pizza House',
        'Tel Aviv',
        tenbisConfig
      );

      expect(result).toBe(validResult.url);
    });

    it('should accept Mishloha URLs without country check', async () => {
      const mishlohaConfig: ProviderSearchConfig = {
        provider: 'mishloha',
        allowedHosts: ['mishloha.co.il'],
      };

      const validResult: SearchResult = {
        url: 'https://mishloha.co.il/restaurant/burger-bar',
        title: 'Burger Bar',
        description: 'Burgers',
      };

      mockClient.search.mockResolvedValue([validResult]);

      const result = await adapter.searchWithRelaxPolicy(
        'Burger Bar',
        'Haifa',
        mishlohaConfig
      );

      expect(result).toBe(validResult.url);
    });
  });
});
