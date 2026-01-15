/**
 * Tests for IntentFullService - Multi-language food type detection
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { IntentFullService } from './intent-full.service.js';
import type { LLMProvider } from '../../llm/types.js';

describe('IntentFullService - Multi-language food types', () => {
  let service: IntentFullService;
  let mockLLM: jest.Mocked<LLMProvider>;

  beforeEach(() => {
    // Create mock LLM provider
    mockLLM = {
      completeJSON: jest.fn(),
      complete: jest.fn()
    } as any;

    service = new IntentFullService(mockLLM);
  });

  it('should detect Hebrew meat restaurant without location', async () => {
    mockLLM.completeJSON.mockResolvedValue({
      language: 'he',
      canonicalCategory: 'meat restaurant',
      locationText: null,
      isRelativeLocation: false,
      requiresUserLocation: true,
      modifiers: {
        openNow: false,
        cheap: false,
        glutenFree: false,
        vegetarian: false,
        vegan: false,
        kosher: false,
        delivery: false,
        takeaway: false,
        exclude: []
      },
      confidence: 0.9,
      explanation: 'User is looking for a meat restaurant, no specific location mentioned'
    });

    const result = await service.extract('מסעדת בשרים');

    expect(result.canonicalCategory).toBe('meat restaurant');
    expect(result.requiresUserLocation).toBe(true);
  });

  it('should detect Hebrew hummus slang', async () => {
    mockLLM.completeJSON.mockResolvedValue({
      language: 'he',
      canonicalCategory: 'hummus restaurant',
      locationText: null,
      isRelativeLocation: false,
      requiresUserLocation: true,
      modifiers: {
        openNow: false,
        cheap: false,
        glutenFree: false,
        vegetarian: false,
        vegan: false,
        kosher: false,
        delivery: false,
        takeaway: false,
        exclude: []
      },
      confidence: 0.85,
      explanation: 'User is looking for a hummus place (חומוסיה)'
    });

    const result = await service.extract('חומוסיה');

    expect(result.canonicalCategory).toBe('hummus restaurant');
  });

  it('should detect Russian meat restaurant', async () => {
    mockLLM.completeJSON.mockResolvedValue({
      language: 'ru',
      canonicalCategory: 'meat restaurant',
      locationText: null,
      isRelativeLocation: false,
      requiresUserLocation: true,
      modifiers: {
        openNow: false,
        cheap: false,
        glutenFree: false,
        vegetarian: false,
        vegan: false,
        kosher: false,
        delivery: false,
        takeaway: false,
        exclude: []
      },
      confidence: 0.9,
      explanation: 'User is looking for a meat restaurant in Russian'
    });

    const result = await service.extract('мясной ресторан');

    expect(result.canonicalCategory).toBe('meat restaurant');
  });

  it('should treat luxury as modifier, not category', async () => {
    mockLLM.completeJSON.mockResolvedValue({
      language: 'he',
      canonicalCategory: 'restaurant',
      locationText: 'גדרה',
      isRelativeLocation: false,
      requiresUserLocation: false,
      modifiers: {
        openNow: false,
        cheap: false, // Luxury is opposite of cheap
        glutenFree: false,
        vegetarian: false,
        vegan: false,
        kosher: false,
        delivery: false,
        takeaway: false,
        exclude: []
      },
      confidence: 0.85,
      explanation: 'User is looking for an upscale restaurant in Gedera, luxury is a modifier not a category'
    });

    const result = await service.extract('מסעדה יוקרתית בגדרה');

    expect(result.canonicalCategory).not.toBe('luxury restaurant');
    expect(result.canonicalCategory).toBe('restaurant');
    expect(result.locationText).toBe('גדרה');
  });

  it('should apply fallback for low confidence dairy query', async () => {
    mockLLM.completeJSON.mockResolvedValue({
      language: 'he',
      canonicalCategory: null, // LLM failed to extract category
      locationText: null,
      isRelativeLocation: false,
      requiresUserLocation: true,
      modifiers: {
        openNow: false,
        cheap: false,
        glutenFree: false,
        vegetarian: false,
        vegan: false,
        kosher: false,
        delivery: false,
        takeaway: false,
        exclude: []
      },
      confidence: 0.5, // Low confidence
      explanation: 'Unclear query'
    });

    const result = await service.extract('חלבי');

    // Fallback should apply and set canonical to "dairy restaurant"
    expect(result.canonicalCategory).toBe('dairy restaurant');
  });
});
