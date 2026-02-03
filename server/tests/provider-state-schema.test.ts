/**
 * Test: ProviderState and WSServerResultPatch Schema Validation
 * 
 * Verifies that the Zod schemas for provider enrichment correctly validate:
 * 1. ProviderState objects (PENDING, FOUND, NOT_FOUND with nullable URLs)
 * 2. WSServerResultPatch events (both new providers field and legacy wolt)
 * 3. Schema rejects invalid status values and malformed data
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  ProviderStateSchema,
  ProvidersSchema,
  WSServerResultPatchSchema,
  RestaurantProviderFieldsSchema
} from '../src/services/search/types/search.schemas.js';

describe('ProviderState Schema', () => {
  test('should validate PENDING state with null URL', () => {
    const data = { status: 'PENDING', url: null };
    const result = ProviderStateSchema.safeParse(data);
    
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.status, 'PENDING');
      assert.strictEqual(result.data.url, null);
    }
  });

  test('should validate FOUND state with URL', () => {
    const data = { status: 'FOUND', url: 'https://wolt.com/restaurant/123' };
    const result = ProviderStateSchema.safeParse(data);
    
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.status, 'FOUND');
      assert.strictEqual(result.data.url, 'https://wolt.com/restaurant/123');
    }
  });

  test('should validate NOT_FOUND state with null URL', () => {
    const data = { status: 'NOT_FOUND', url: null };
    const result = ProviderStateSchema.safeParse(data);
    
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.status, 'NOT_FOUND');
      assert.strictEqual(result.data.url, null);
    }
  });

  test('should reject invalid status', () => {
    const data = { status: 'INVALID', url: null };
    const result = ProviderStateSchema.safeParse(data);
    
    assert.strictEqual(result.success, false);
  });

  test('should reject missing url field', () => {
    const data = { status: 'PENDING' };
    const result = ProviderStateSchema.safeParse(data);
    
    assert.strictEqual(result.success, false);
  });
});

describe('Providers Schema', () => {
  test('should validate providers with wolt field', () => {
    const data = {
      wolt: { status: 'FOUND', url: 'https://wolt.com/restaurant/123' }
    };
    const result = ProvidersSchema.safeParse(data);
    
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.ok(result.data.wolt);
      assert.strictEqual(result.data.wolt?.status, 'FOUND');
    }
  });

  test('should validate empty providers object', () => {
    const data = {};
    const result = ProvidersSchema.safeParse(data);
    
    assert.strictEqual(result.success, true);
  });

  test('should validate providers with optional wolt', () => {
    const data = { wolt: undefined };
    const result = ProvidersSchema.safeParse(data);
    
    assert.strictEqual(result.success, true);
  });
});

describe('WSServerResultPatch Schema', () => {
  test('should validate patch with new providers.wolt field', () => {
    const data = {
      type: 'RESULT_PATCH',
      requestId: 'req_123',
      placeId: 'ChIJ123',
      patch: {
        providers: {
          wolt: { status: 'FOUND', url: 'https://wolt.com/restaurant/123' }
        }
      }
    };
    const result = WSServerResultPatchSchema.safeParse(data);
    
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.patch.providers?.wolt?.status, 'FOUND');
      assert.strictEqual(result.data.patch.providers?.wolt?.url, 'https://wolt.com/restaurant/123');
    }
  });

  test('should validate patch with legacy wolt field', () => {
    const data = {
      type: 'RESULT_PATCH',
      requestId: 'req_123',
      placeId: 'ChIJ123',
      patch: {
        wolt: { status: 'NOT_FOUND', url: null }
      }
    };
    const result = WSServerResultPatchSchema.safeParse(data);
    
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.patch.wolt?.status, 'NOT_FOUND');
      assert.strictEqual(result.data.patch.wolt?.url, null);
    }
  });

  test('should validate patch with both providers and legacy wolt fields', () => {
    const data = {
      type: 'RESULT_PATCH',
      requestId: 'req_123',
      placeId: 'ChIJ123',
      patch: {
        providers: {
          wolt: { status: 'FOUND', url: 'https://wolt.com/restaurant/123' }
        },
        wolt: { status: 'FOUND', url: 'https://wolt.com/restaurant/123' }
      }
    };
    const result = WSServerResultPatchSchema.safeParse(data);
    
    assert.strictEqual(result.success, true);
    if (result.success) {
      // Both fields should be present
      assert.ok(result.data.patch.providers?.wolt);
      assert.ok(result.data.patch.wolt);
    }
  });

  test('should reject patch with PENDING status (never allowed in patches)', () => {
    const data = {
      type: 'RESULT_PATCH',
      requestId: 'req_123',
      placeId: 'ChIJ123',
      patch: {
        wolt: { status: 'PENDING', url: null }
      }
    };
    const result = WSServerResultPatchSchema.safeParse(data);
    
    // Should fail because patch.wolt.status only allows FOUND | NOT_FOUND
    assert.strictEqual(result.success, false);
  });

  test('should reject patch with empty requestId', () => {
    const data = {
      type: 'RESULT_PATCH',
      requestId: '',
      placeId: 'ChIJ123',
      patch: {
        wolt: { status: 'FOUND', url: 'https://wolt.com/restaurant/123' }
      }
    };
    const result = WSServerResultPatchSchema.safeParse(data);
    
    assert.strictEqual(result.success, false);
  });

  test('should reject patch with wrong type', () => {
    const data = {
      type: 'WRONG_TYPE',
      requestId: 'req_123',
      placeId: 'ChIJ123',
      patch: {
        wolt: { status: 'FOUND', url: 'https://wolt.com/restaurant/123' }
      }
    };
    const result = WSServerResultPatchSchema.safeParse(data);
    
    assert.strictEqual(result.success, false);
  });
});

describe('RestaurantProviderFields Schema', () => {
  test('should validate restaurant with providers field', () => {
    const data = {
      providers: {
        wolt: { status: 'PENDING', url: null }
      }
    };
    const result = RestaurantProviderFieldsSchema.safeParse(data);
    
    assert.strictEqual(result.success, true);
  });

  test('should validate restaurant with legacy wolt field', () => {
    const data = {
      wolt: { status: 'PENDING', url: null }
    };
    const result = RestaurantProviderFieldsSchema.safeParse(data);
    
    assert.strictEqual(result.success, true);
  });

  test('should validate restaurant with both fields', () => {
    const data = {
      providers: {
        wolt: { status: 'PENDING', url: null }
      },
      wolt: { status: 'PENDING', url: null }
    };
    const result = RestaurantProviderFieldsSchema.safeParse(data);
    
    assert.strictEqual(result.success, true);
  });

  test('should validate restaurant without provider fields', () => {
    const data = {};
    const result = RestaurantProviderFieldsSchema.safeParse(data);
    
    assert.strictEqual(result.success, true);
  });
});

// Integration test: Real-world patch scenario
describe('Integration: RESULT_PATCH Flow', () => {
  test('should handle complete enrichment flow', () => {
    // Step 1: Initial restaurant state (PENDING)
    const initialRestaurant = {
      providers: {
        wolt: { status: 'PENDING', url: null }
      },
      wolt: { status: 'PENDING', url: null }
    };
    
    const validateInitial = RestaurantProviderFieldsSchema.safeParse(initialRestaurant);
    assert.strictEqual(validateInitial.success, true);
    
    // Step 2: Wolt enrichment completes - backend sends RESULT_PATCH
    const patch = {
      type: 'RESULT_PATCH',
      requestId: 'req_abc123',
      placeId: 'ChIJxxx',
      patch: {
        providers: {
          wolt: { status: 'FOUND', url: 'https://wolt.com/en/isr/tel-aviv/restaurant/pizza-place' }
        },
        wolt: { status: 'FOUND', url: 'https://wolt.com/en/isr/tel-aviv/restaurant/pizza-place' }
      }
    };
    
    const validatePatch = WSServerResultPatchSchema.safeParse(patch);
    assert.strictEqual(validatePatch.success, true);
    
    // Step 3: Frontend merges patch into restaurant
    if (validatePatch.success) {
      const updatedRestaurant = {
        ...initialRestaurant,
        providers: {
          ...initialRestaurant.providers,
          ...validatePatch.data.patch.providers
        },
        wolt: validatePatch.data.patch.wolt || initialRestaurant.wolt
      };
      
      const validateUpdated = RestaurantProviderFieldsSchema.safeParse(updatedRestaurant);
      assert.strictEqual(validateUpdated.success, true);
      
      if (validateUpdated.success) {
        assert.strictEqual(updatedRestaurant.providers.wolt?.status, 'FOUND');
        assert.strictEqual(updatedRestaurant.providers.wolt?.url, 'https://wolt.com/en/isr/tel-aviv/restaurant/pizza-place');
        console.log('✓ Complete enrichment flow validated');
      }
    }
  });
});
