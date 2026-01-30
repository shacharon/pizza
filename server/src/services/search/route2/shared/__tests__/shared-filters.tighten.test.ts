/**
 * Unit tests for shared-filters.tighten.ts
 * Tests region resolution fallback chain and reverse geocoding behavior
 */

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tightenSharedFilters } from '../shared-filters.tighten.js';
import type { PreGoogleBaseFilters, IntentResult } from '../../types.js';

// Mock logger to track calls during tests
const mockLoggerCalls = {
    info: [] as any[],
    warn: [] as any[],
    debug: [] as any[],
    error: [] as any[]
};

// Note: We can't easily mock ES modules with node:test
// Instead we'll verify behavior through the function's return values
// and accept that logs will be output during tests

describe('shared-filters.tighten', () => {
    beforeEach(() => {
        // Reset mock tracking before each test
        mockLoggerCalls.info = [];
        mockLoggerCalls.warn = [];
        mockLoggerCalls.debug = [];
        mockLoggerCalls.error = [];
    });

    describe('Region Resolution - Reverse Geocoding', () => {
        const baseFilters: PreGoogleBaseFilters = {
            language: 'en',
            openState: 'any_time',
            openAt: null,
            openBetween: null,
            priceIntent: null,
            minRatingBucket: null,
            regionHint: null
        };

        const intentResult: IntentResult = {
            route: 'NEARBY',
            language: 'en',
            regionCandidate: null,
            confidence: 'high',
            messages: []
        };

        const mapping: any = {
            providerMethod: 'nearbySearch',
            query: 'pizza'
        };

        it('should warn when userLocation provided but reverse geocoding not implemented', async () => {
            const result = await tightenSharedFilters({
                base: baseFilters,
                intent: intentResult,
                mapping,
                userLocation: { lat: 32.0853, lng: 34.7818 }, // Tel Aviv
                deviceRegionCode: 'US',
                gateLanguage: 'en',
                defaultRegion: 'IL',
                requestId: 'test-reverse-geocode-warn'
            });

            // Note: Logger will output warning (can't easily mock in node:test)
            // We verify behavior through return values instead

            // Should fall back to device region when reverse geocoding returns null
            assert.strictEqual(result.filters.regionCode, 'US');
            assert.strictEqual(result.regionSource, 'device_region');
        });

        it('should fallback to device region when reverse geocoding returns null', async () => {
            const result = await tightenSharedFilters({
                base: baseFilters,
                intent: intentResult,
                mapping,
                userLocation: { lat: 40.7128, lng: -74.0060 }, // NYC
                deviceRegionCode: 'CA',
                gateLanguage: 'en',
                defaultRegion: 'IL',
                requestId: 'test-device-fallback'
            });

            assert.strictEqual(result.filters.regionCode, 'CA');
            assert.strictEqual(result.regionSource, 'device_region');
        });

        it('should fallback to base LLM hint when userLocation and device region absent', async () => {
            const result = await tightenSharedFilters({
                base: { ...baseFilters, regionHint: 'FR' },
                intent: intentResult,
                mapping,
                userLocation: null,
                deviceRegionCode: null,
                gateLanguage: 'en',
                defaultRegion: 'IL',
                requestId: 'test-base-llm-fallback'
            });

            assert.strictEqual(result.filters.regionCode, 'FR');
            assert.strictEqual(result.regionSource, 'base_llm');
        });

        it('should fallback to default region when all else fails', async () => {
            const result = await tightenSharedFilters({
                base: baseFilters,
                intent: intentResult,
                mapping,
                userLocation: null,
                deviceRegionCode: null,
                gateLanguage: 'en',
                defaultRegion: 'DE',
                requestId: 'test-default-fallback'
            });

            assert.strictEqual(result.filters.regionCode, 'DE');
            assert.strictEqual(result.regionSource, 'default');
        });

        it('should use IL as hardcoded fallback when default is invalid', async () => {
            const result = await tightenSharedFilters({
                base: baseFilters,
                intent: intentResult,
                mapping,
                userLocation: null,
                deviceRegionCode: null,
                gateLanguage: 'en',
                defaultRegion: 'invalid',
                requestId: 'test-il-hardcoded'
            });

            assert.strictEqual(result.filters.regionCode, 'IL');
            assert.strictEqual(result.regionSource, 'default');
        });
    });

    describe('Region Resolution - Intent Locking', () => {
        const baseFilters: PreGoogleBaseFilters = {
            language: 'en',
            openState: 'any_time',
            openAt: null,
            openBetween: null,
            priceIntent: null,
            minRatingBucket: null,
            regionHint: 'US'
        };

        const mapping: any = {
            providerMethod: 'landmarkPlan',
            query: 'eiffel tower'
        };

        it('should lock region when intent has confident region candidate (LANDMARK route)', async () => {
            const intentResult: IntentResult = {
                route: 'LANDMARK',
                language: 'en',
                regionCandidate: 'FR',
                confidence: 'high',
                messages: []
            };

            const result = await tightenSharedFilters({
                base: baseFilters,
                intent: intentResult,
                mapping,
                userLocation: { lat: 32.0853, lng: 34.7818 },
                deviceRegionCode: 'IL',
                gateLanguage: 'en',
                defaultRegion: 'IL',
                requestId: 'test-intent-lock'
            });

            // Should lock to intent region, ignoring everything else
            assert.strictEqual(result.filters.regionCode, 'FR');
            assert.strictEqual(result.regionSource, 'intent_locked');

            // Logger will output info about intent lock
            // Reverse geocoding should NOT be called when intent is locked
        });

        it('should lock region for TEXTSEARCH route with confident region', async () => {
            const intentResult: IntentResult = {
                route: 'TEXTSEARCH',
                language: 'en',
                regionCandidate: 'US',
                confidence: 'high',
                messages: []
            };

            const result = await tightenSharedFilters({
                base: baseFilters,
                intent: intentResult,
                mapping,
                userLocation: null,
                deviceRegionCode: 'CA',
                gateLanguage: 'en',
                defaultRegion: 'IL',
                requestId: 'test-textsearch-lock'
            });

            assert.strictEqual(result.filters.regionCode, 'US');
            assert.strictEqual(result.regionSource, 'intent_locked');
        });

        it('should NOT lock region for STOP route even with region candidate', async () => {
            const intentResult: IntentResult = {
                route: 'STOP',
                language: 'en',
                regionCandidate: 'FR',
                confidence: 'low',
                messages: []
            };

            const result = await tightenSharedFilters({
                base: baseFilters,
                intent: intentResult,
                mapping,
                userLocation: null,
                deviceRegionCode: 'CA',
                gateLanguage: 'en',
                defaultRegion: 'IL',
                requestId: 'test-stop-no-lock'
            });

            // Should NOT lock to intent region
            assert.notStrictEqual(result.filters.regionCode, 'FR');
            assert.notStrictEqual(result.regionSource, 'intent_locked');

            // Should use device region (device region has priority over base LLM hint)
            assert.strictEqual(result.filters.regionCode, 'CA');
            assert.strictEqual(result.regionSource, 'device_region');
        });
    });

    describe('Language Resolution', () => {
        const baseFilters: PreGoogleBaseFilters = {
            language: 'en',
            openState: 'any_time',
            openAt: null,
            openBetween: null,
            priceIntent: null,
            minRatingBucket: null,
            regionHint: null
        };

        const intentResult: IntentResult = {
            route: 'NEARBY',
            language: 'ar',
            regionCandidate: null,
            confidence: 'high',
            messages: []
        };

        const mapping: any = {
            providerMethod: 'nearbySearch',
            query: 'pizza'
        };

        it('should preserve Arabic for provider but map to en for UI', async () => {
            const result = await tightenSharedFilters({
                base: baseFilters,
                intent: intentResult,
                mapping,
                userLocation: null,
                deviceRegionCode: 'SA',
                gateLanguage: 'ar',
                defaultRegion: 'SA',
                requestId: 'test-arabic'
            });

            assert.strictEqual(result.filters.providerLanguage, 'ar');
            assert.strictEqual(result.filters.uiLanguage, 'en');
            assert.strictEqual(result.languageSource, 'intent_locked');
        });

        it('should handle "other" language with fallback', async () => {
            const result = await tightenSharedFilters({
                base: baseFilters,
                intent: { ...intentResult, language: 'other' },
                mapping,
                userLocation: null,
                deviceRegionCode: 'IL',
                gateLanguage: 'he',
                defaultRegion: 'IL',
                requestId: 'test-other-lang'
            });

            // Should fall back to base LLM language
            assert.strictEqual(result.filters.providerLanguage, 'en');
            assert.strictEqual(result.filters.uiLanguage, 'en');
            assert.strictEqual(result.languageSource, 'base_llm');
        });
    });

    describe('Complete Filter Resolution', () => {
        it('should resolve all filters with correct disclaimers', async () => {
            const baseFilters: PreGoogleBaseFilters = {
                language: 'he',
                openState: 'open_now',
                openAt: new Date('2024-12-25T14:00:00Z'),
                openBetween: null,
                priceIntent: 'budget',
                minRatingBucket: 4,
                regionHint: 'IL'
            };

            const intentResult: IntentResult = {
                route: 'NEARBY',
                language: 'he',
                regionCandidate: null,
                confidence: 'high',
                messages: []
            };

            const mapping: any = {
                providerMethod: 'nearbySearch',
                query: 'pizza'
            };

            const result = await tightenSharedFilters({
                base: baseFilters,
                intent: intentResult,
                mapping,
                userLocation: null,
                deviceRegionCode: 'IL',
                gateLanguage: 'he',
                defaultRegion: 'IL',
                requestId: 'test-complete'
            });

            assert.strictEqual(result.filters.uiLanguage, 'he');
            assert.strictEqual(result.filters.providerLanguage, 'he');
            assert.strictEqual(result.filters.openState, 'open_now');
            assert.ok(result.filters.openAt instanceof Date);
            assert.strictEqual(result.filters.openBetween, null);
            assert.strictEqual(result.filters.priceIntent, 'budget');
            assert.strictEqual(result.filters.minRatingBucket, 4);
            assert.strictEqual(result.filters.regionCode, 'IL');
            assert.deepStrictEqual(result.filters.disclaimers, {
                hours: true,
                dietary: true
            });

            assert.strictEqual(result.languageSource, 'intent_locked');
            // Device region takes priority over base LLM hint
            assert.strictEqual(result.regionSource, 'device_region');
        });
    });

    describe('Edge Cases', () => {
        const baseFilters: PreGoogleBaseFilters = {
            language: 'en',
            openState: 'any_time',
            openAt: null,
            openBetween: null,
            priceIntent: null,
            minRatingBucket: null,
            regionHint: null
        };

        const intentResult: IntentResult = {
            route: 'NEARBY',
            language: 'en',
            regionCandidate: null,
            confidence: 'high',
            messages: []
        };

        const mapping: any = {
            providerMethod: 'nearbySearch',
            query: 'pizza'
        };

        it('should normalize invalid device region codes', async () => {
            const result = await tightenSharedFilters({
                base: baseFilters,
                intent: intentResult,
                mapping,
                userLocation: null,
                deviceRegionCode: 'invalid123',
                gateLanguage: 'en',
                defaultRegion: 'IL',
                requestId: 'test-invalid-device'
            });

            // Should fall through to default since device code is invalid
            assert.strictEqual(result.filters.regionCode, 'IL');
            assert.strictEqual(result.regionSource, 'default');
        });

        it('should normalize lowercase region codes to uppercase', async () => {
            const result = await tightenSharedFilters({
                base: baseFilters,
                intent: { ...intentResult, route: 'LANDMARK', regionCandidate: 'us' },
                mapping,
                userLocation: null,
                deviceRegionCode: null,
                gateLanguage: 'en',
                defaultRegion: 'IL',
                requestId: 'test-lowercase-norm'
            });

            assert.strictEqual(result.filters.regionCode, 'US');
            assert.strictEqual(result.regionSource, 'intent_locked');
        });

        it('should handle missing requestId gracefully', async () => {
            const result = await tightenSharedFilters({
                base: baseFilters,
                intent: intentResult,
                mapping,
                userLocation: { lat: 32.0853, lng: 34.7818 },
                deviceRegionCode: 'IL',
                gateLanguage: 'en',
                defaultRegion: 'IL'
                // requestId intentionally omitted
            });

            assert.strictEqual(result.filters.regionCode, 'IL');
            assert.strictEqual(result.regionSource, 'device_region');
        });
    });
});
