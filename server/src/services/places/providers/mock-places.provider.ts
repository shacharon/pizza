/**
 * Mock Places Provider
 * Phase 7: Deterministic provider for CI testing
 * 
 * Returns fixture data instead of calling real Google Places API
 * Enables stable, repeatable tests without external dependencies
 */

import type { IPlacesProviderService, TextSearchParams, PlaceDetailsParams } from './places-provider.interface.js';
import type { PlaceItem } from '../places.types.js';
import { loadFixtures, getFixtureKey } from './places-fixtures.js';
import { logger } from '../../../lib/logger/structured-logger.js';

export class MockPlacesProvider implements IPlacesProviderService {
  private fixtures: Map<string, PlaceItem[]>;
  
  constructor() {
    this.fixtures = loadFixtures();
    logger.info('MockPlacesProvider initialized', {
      fixtureCount: this.fixtures.size
    });
  }
  
  /**
   * Mock text search - returns fixtures based on query
   */
  async textSearch(params: TextSearchParams): Promise<PlaceItem[]> {
    const key = this.buildKey(params);
    
    logger.debug('Mock text search', {
      key,
      query: params.query,
      category: params.category,
      city: params.location?.city
    });
    
    // Return fixture if exists
    if (this.fixtures.has(key)) {
      const results = this.fixtures.get(key)!;
      logger.debug('Mock text search - fixture found', {
        key,
        resultCount: results.length
      });
      return [...results]; // Return copy
    }
    
    // Try category-only match
    const categoryKey = params.category?.toLowerCase() || 'default';
    if (this.fixtures.has(categoryKey)) {
      const results = this.fixtures.get(categoryKey)!;
      logger.debug('Mock text search - category match', {
        categoryKey,
        resultCount: results.length
      });
      return [...results];
    }
    
    // Return default fixture
    const defaultResults = this.getDefaultFixture(params.category);
    logger.debug('Mock text search - using default', {
      resultCount: defaultResults.length
    });
    return defaultResults;
  }
  
  /**
   * Mock place details - returns enriched fixture data
   */
  async getPlaceDetails(params: PlaceDetailsParams): Promise<PlaceItem | null> {
    logger.debug('Mock place details', {
      placeId: params.placeId
    });
    
    // Search for place in fixtures by ID
    for (const places of this.fixtures.values()) {
      const place = places.find(p => p.id === params.placeId);
      if (place) {
        logger.debug('Mock place details - found', {
          placeId: params.placeId,
          name: place.name
        });
        return { ...place }; // Return copy
      }
    }
    
    logger.warn('Mock place details - not found', {
      placeId: params.placeId
    });
    
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





