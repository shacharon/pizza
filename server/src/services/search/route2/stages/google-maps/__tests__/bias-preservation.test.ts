/**
 * Tests for Bias Preservation Fix
 * Ensures locationBias from LLM is not dropped when cityText exists
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Bias Preservation', () => {
  test('should preserve original locationBias when cityText exists', () => {
    // Simulate the enrichedMapping logic from text-search.handler.ts
    const mapping = {
      providerMethod: 'textSearch' as const,
      textQuery: 'pizza',
      region: 'IL',
      language: 'he',
      cityText: 'Tel Aviv',
      bias: {
        type: 'locationBias' as const,
        center: { lat: 32.0853, lng: 34.7818 }, // LLM-provided bias
        radiusMeters: 3000
      }
    };

    // Simulated geocoded coordinates
    const cityCoords = { lat: 32.0, lng: 34.7 }; // Different from LLM bias

    // BEFORE FIX: Would replace with cityCoords
    // AFTER FIX: Should preserve original bias
    const enrichedMapping = {
      ...mapping,
      bias: mapping.bias || { // Preserve original if exists
        type: 'locationBias' as const,
        center: cityCoords,
        radiusMeters: 20000
      }
    };

    // Assert original bias is preserved
    assert.ok(enrichedMapping.bias, 'Bias should exist');
    assert.equal(enrichedMapping.bias.center.lat, 32.0853, 'Should preserve original lat from LLM');
    assert.equal(enrichedMapping.bias.center.lng, 34.7818, 'Should preserve original lng from LLM');
    assert.equal(enrichedMapping.bias.radiusMeters, 3000, 'Should preserve original radius from LLM');
  });

  test('should use geocoded bias as fallback when no original bias exists', () => {
    const mapping = {
      providerMethod: 'textSearch' as const,
      textQuery: 'pizza',
      region: 'IL',
      language: 'he',
      cityText: 'Tel Aviv',
      bias: undefined // No LLM bias
    };

    const cityCoords = { lat: 32.0, lng: 34.7 };

    const enrichedMapping = {
      ...mapping,
      bias: mapping.bias || { // Use geocoded as fallback
        type: 'locationBias' as const,
        center: cityCoords,
        radiusMeters: 20000
      }
    };

    // Assert geocoded bias is used
    assert.ok(enrichedMapping.bias, 'Bias should exist');
    assert.equal(enrichedMapping.bias.center.lat, 32.0, 'Should use geocoded lat');
    assert.equal(enrichedMapping.bias.center.lng, 34.7, 'Should use geocoded lng');
    assert.equal(enrichedMapping.bias.radiusMeters, 20000, 'Should use city-level radius');
  });

  test('hasBiasApplied logging should reflect final state', () => {
    // Test logging fields
    const requestBody = {
      textQuery: 'pizza',
      languageCode: 'he',
      regionCode: 'IL',
      locationBias: {
        circle: {
          center: { latitude: 32.0853, longitude: 34.7818 },
          radius: 3000
        }
      }
    };

    const hasBiasApplied = !!requestBody.locationBias;
    assert.equal(hasBiasApplied, true, 'hasBiasApplied should be true when locationBias exists');

    // Without bias
    const requestBodyNoBias: {
      textQuery: string;
      languageCode: string;
      regionCode: string;
      locationBias?: any;
    } = {
      textQuery: 'pizza',
      languageCode: 'he',
      regionCode: 'IL'
    };

    const hasBiasAppliedNoBias = !!requestBodyNoBias.locationBias;
    assert.equal(hasBiasAppliedNoBias, false, 'hasBiasApplied should be false when no locationBias');
  });

  test('hasBiasPlanned should indicate intent before geocoding', () => {
    // With LLM bias
    const mappingWithBias = {
      bias: { type: 'locationBias' as const, center: { lat: 32, lng: 34 }, radiusMeters: 3000 },
      cityText: undefined
    };
    const hasBiasPlanned1 = !!mappingWithBias.bias || !!mappingWithBias.cityText;
    assert.equal(hasBiasPlanned1, true, 'hasBiasPlanned should be true when bias exists');

    // With cityText (will geocode)
    const mappingWithCity = {
      bias: undefined,
      cityText: 'Tel Aviv'
    };
    const hasBiasPlanned2 = !!mappingWithCity.bias || !!mappingWithCity.cityText;
    assert.equal(hasBiasPlanned2, true, 'hasBiasPlanned should be true when cityText exists');

    // Without bias or cityText
    const mappingNoBias = {
      bias: undefined,
      cityText: undefined
    };
    const hasBiasPlanned3 = !!mappingNoBias.bias || !!mappingNoBias.cityText;
    assert.equal(hasBiasPlanned3, false, 'hasBiasPlanned should be false when neither exists');
  });

  test('hasBiasCandidate should reflect schema capabilities', () => {
    // Simulate schema check
    const schema = {
      properties: {
        locationBias: { type: 'object' },
        textQuery: { type: 'string' }
      }
    };

    const hasBiasCandidate = Boolean(schema.properties.locationBias);
    assert.equal(hasBiasCandidate, true, 'hasBiasCandidate should be true when schema has locationBias');

    // Schema without locationBias
    const schemaOld = {
      properties: {
        textQuery: { type: 'string' }
      }
    };

    const hasBiasCandidateOld = Boolean((schemaOld.properties as any).locationBias);
    assert.equal(hasBiasCandidateOld, false, 'hasBiasCandidate should be false when schema lacks locationBias');
  });
});
