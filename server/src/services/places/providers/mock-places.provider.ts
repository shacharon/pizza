/**
 * Mock Places Provider
 * Phase 7: Deterministic provider for CI testing
 * 
 * Returns fixture data instead of calling real Google Places API
 * Enables stable, repeatable tests without external dependencies
 */

import { loadFixtures, getFixtureKey } from './places-fixtures.js';
import { logger } from '../../../lib/logger/structured-logger.js';

// Local types for mock provider
export interface PlaceItem {
  id: string;
  name: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  location?: { lat: number; lng: number; city?: string };
  categories?: string[];
  cuisine?: string;
  openNow?: string;
  types?: string[];
  photoUrl?: string;
  dietaryOptions?: string[];
}

export interface TextSearchParams {
  query: string;
  category?: string;
  location?: { city?: string; lat?: number; lng?: number };
}

export interface PlaceDetailsParams {
  placeId: string;
}

export class MockPlacesProvider {
  private fixtures: Map<string, PlaceItem[]>;

  constructor() {
    this.fixtures = loadFixtures();
    logger.info({
      fixtureCount: this.fixtures.size
    }, 'MockPlacesProvider initialized');
  }

  /**
   * Mock text search - returns fixtures based on query
   */
  async textSearch(params: TextSearchParams): Promise<PlaceItem[]> {
    const key = this.buildKey(params);

    logger.debug({
      key,
      query: params.query,
      category: params.category,
      city: params.location?.city
    }, 'Mock text search');

    // Return fixture if exists
    if (this.fixtures.has(key)) {
      const results = this.fixtures.get(key)!;
      logger.debug({
        key,
        resultCount: results.length
      }, 'Mock text search - fixture found');
      return [...results]; // Return copy
    }

    // Try category-only match
    const categoryKey = params.category?.toLowerCase() || 'default';
    if (this.fixtures.has(categoryKey)) {
      const results = this.fixtures.get(categoryKey)!;
      logger.debug({
        categoryKey,
        resultCount: results.length
      }, 'Mock text search - category match');
      return [...results];
    }

    // Return default fixture
    const defaultResults = this.getDefaultFixture(params.category);
    logger.debug({
      resultCount: defaultResults.length
    }, 'Mock text search - using default');
    return defaultResults;
  }

  /**
   * Mock place details - returns enriched fixture data
   */
  async getPlaceDetails(params: PlaceDetailsParams): Promise<PlaceItem | null> {
    logger.debug({
      placeId: params.placeId
    }, 'Mock place details');

    // Search for place in fixtures by ID
    for (const places of this.fixtures.values()) {
      const place = places.find(p => p.id === params.placeId);
      if (place) {
        logger.debug({
          placeId: params.placeId,
          name: place.name
        }, 'Mock place details - found');
        return { ...place }; // Return copy
      }
    }

    logger.warn({
      placeId: params.placeId
    }, 'Mock place details - not found');

    return null;
  }

  /**
   * Mock nearby search - returns fixtures for location
   */
  async nearbySearch(params: any): Promise<PlaceItem[]> {
    // For mock, treat as text search
    return this.textSearch({
      query: params.keyword || '',
      category: params.type,
      location: params.location
    });
  }

  /**
   * Build lookup key from search parameters
   */
  private buildKey(params: TextSearchParams): string {
    const category = params.category?.toLowerCase().trim() || 'default';
    const city = params.location?.city?.toLowerCase().trim() || 'default';

    // Normalize common variations
    const normalizedCategory = this.normalizeCategory(category);
    const normalizedCity = this.normalizeCity(city);

    return `${normalizedCategory}_${normalizedCity}`;
  }

  /**
   * Normalize category names
   */
  private normalizeCategory(category: string): string {
    // Map common variations to canonical names
    const mappings: Record<string, string> = {
      'pizza': 'pizza',
      'pizzeria': 'pizza',
      'italian': 'italian',
      'sushi': 'sushi',
      'japanese': 'sushi',
      'burger': 'burger',
      'hamburger': 'burger',
      'vegan': 'vegan',
      'kosher': 'kosher',
      'cafe': 'cafe',
      'coffee': 'cafe'
    };

    return mappings[category] || category;
  }

  /**
   * Normalize city names
   */
  private normalizeCity(city: string): string {
    // Map common variations to canonical names
    const mappings: Record<string, string> = {
      'tel aviv': 'tel_aviv',
      'tel-aviv': 'tel_aviv',
      'telaviv': 'tel_aviv',
      'jerusalem': 'jerusalem',
      'haifa': 'haifa'
    };

    return mappings[city] || city.replace(/\s+/g, '_');
  }

  /**
   * Get default fixture for category
   */
  private getDefaultFixture(category?: string): PlaceItem[] {
    // Return empty for "no results" scenarios
    if (category && category.includes('remote') || category?.includes('antarctica')) {
      return [];
    }

    // Return default fixture
    return this.fixtures.get('default') || [];
  }
}





