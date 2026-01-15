/**
 * Tests for IntentGateService - Multi-language food type detection
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { IntentGateService } from './intent-gate.service.js';
import type { LLMProvider } from '../../llm/types.js';
import type { IntentGateResult } from './intent-gate.types.js';

describe('IntentGateService - Multi-language food types', () => {
  let service: IntentGateService;
  let mockLLM: jest.Mocked<LLMProvider>;

  beforeEach(() => {
    // Create mock LLM provider
    mockLLM = {
      completeJSON: jest.fn(),
      complete: jest.fn()
    } as any;

    service = new IntentGateService(mockLLM);
  });

  it('should detect Hebrew meat restaurant', async () => {
    mockLLM.completeJSON.mockResolvedValue({
      language: 'he',
      hasFood: true,
      food: {
        raw: 'מסעדת בשרים',
        canonical: 'meat restaurant'
      },
      hasLocation: false,
      location: {
        raw: null,
        canonical: null,
        isRelative: false,
        requiresUserLocation: true
      },
      hasModifiers: false,
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
      route: 'CORE',
      routeReason: 'clear_food_location'
    });

    const result = await service.analyze('מסעדת בשרים');

    expect(result.hasFood).toBe(true);
    expect(result.food.canonical).toBe('meat restaurant');
  });

  it('should detect Hebrew dairy restaurant with location', async () => {
    mockLLM.completeJSON.mockResolvedValue({
      language: 'he',
      hasFood: true,
      food: {
        raw: 'מסעדה חלבית',
        canonical: 'dairy restaurant'
      },
      hasLocation: true,
      location: {
        raw: 'בגדרה',
        canonical: 'גדרה',
        isRelative: false,
        requiresUserLocation: false
      },
      hasModifiers: false,
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
      route: 'CORE',
      routeReason: 'clear_food_location'
    });

    const result = await service.analyze('מסעדה חלבית בגדרה');

    expect(result.food.canonical).toBe('dairy restaurant');
    expect(result.location.canonical).toBe('גדרה');
  });

  it('should detect Hebrew hummus slang', async () => {
    mockLLM.completeJSON.mockResolvedValue({
      language: 'he',
      hasFood: true,
      food: {
        raw: 'חומוסיה',
        canonical: 'hummus restaurant'
      },
      hasLocation: false,
      location: {
        raw: null,
        canonical: null,
        isRelative: false,
        requiresUserLocation: true
      },
      hasModifiers: false,
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
      route: 'CORE',
      routeReason: 'clear_food'
    });

    const result = await service.analyze('חומוסיה');

    expect(result.food.canonical).toBe('hummus restaurant');
    expect(result.location.requiresUserLocation).toBe(true);
  });

  it('should detect Russian meat restaurant with location', async () => {
    mockLLM.completeJSON.mockResolvedValue({
      language: 'ru',
      hasFood: true,
      food: {
        raw: 'мясной ресторан',
        canonical: 'meat restaurant'
      },
      hasLocation: true,
      location: {
        raw: 'в Гедере',
        canonical: 'Гедере',
        isRelative: false,
        requiresUserLocation: false
      },
      hasModifiers: false,
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
      route: 'CORE',
      routeReason: 'clear_food_location'
    });

    const result = await service.analyze('мясной ресторан в Гедере');

    expect(result.food.canonical).toBe('meat restaurant');
    expect(result.location.canonical).toBe('Гедере');
  });

  it('should detect gluten free as modifier, not category', async () => {
    mockLLM.completeJSON.mockResolvedValue({
      language: 'he',
      hasFood: true,
      food: {
        raw: 'מסעדה',
        canonical: 'restaurant'
      },
      hasLocation: true,
      location: {
        raw: 'בגדרה',
        canonical: 'גדרה',
        isRelative: false,
        requiresUserLocation: false
      },
      hasModifiers: true,
      modifiers: {
        openNow: false,
        cheap: false,
        glutenFree: true,
        vegetarian: false,
        vegan: false,
        kosher: false,
        delivery: false,
        takeaway: false,
        exclude: []
      },
      confidence: 0.8,
      route: 'FULL_LLM',
      routeReason: 'has_modifiers'
    });

    const result = await service.analyze('מסעדה ללא גלוטן בגדרה');

    expect(result.modifiers.glutenFree).toBe(true);
    expect(result.food.canonical).toBe('restaurant');
    expect(result.food.canonical).not.toBe('gluten free restaurant');
  });

  it('should detect English meat restaurant with relative location', async () => {
    mockLLM.completeJSON.mockResolvedValue({
      language: 'en',
      hasFood: true,
      food: {
        raw: 'meat restaurant',
        canonical: 'meat restaurant'
      },
      hasLocation: true,
      location: {
        raw: 'near me',
        canonical: null,
        isRelative: true,
        requiresUserLocation: true
      },
      hasModifiers: false,
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
      route: 'CORE',
      routeReason: 'clear_food_location'
    });

    const result = await service.analyze('meat restaurant near me');

    expect(result.food.canonical).toBe('meat restaurant');
    expect(result.location.isRelative).toBe(true);
  });

  it('should apply fallback for low confidence meat query', async () => {
    mockLLM.completeJSON.mockResolvedValue({
      language: 'he',
      hasFood: true,
      food: {
        raw: 'בשרים',
        canonical: null // LLM failed to extract canonical
      },
      hasLocation: false,
      location: {
        raw: null,
        canonical: null,
        isRelative: false,
        requiresUserLocation: true
      },
      hasModifiers: false,
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
      confidence: 0.6, // Low confidence
      route: 'FULL_LLM',
      routeReason: 'low_confidence'
    });

    const result = await service.analyze('בשרים');

    // Fallback should apply and set canonical to "meat restaurant"
    expect(result.food.canonical).toBe('meat restaurant');
  });
});
