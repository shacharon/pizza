/**
 * Unit tests: business_status filtering (CLOSED_PERMANENTLY removed, TEMP kept and flagged, missing kept)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isOperational,
  isPermanentlyClosed,
  isTemporarilyClosed,
  filterPlacesByBusinessStatus,
  filterResultsByBusinessStatus
} from '../business-status.js';

describe('business-status', () => {
  describe('isOperational', () => {
    it('returns true for OPERATIONAL', () => {
      assert.strictEqual(isOperational({ businessStatus: 'OPERATIONAL' }), true);
    });
    it('returns true for missing businessStatus', () => {
      assert.strictEqual(isOperational({}), true);
      assert.strictEqual(isOperational({ businessStatus: undefined }), true);
    });
    it('returns true for empty string', () => {
      assert.strictEqual(isOperational({ businessStatus: '' }), true);
    });
    it('returns false for CLOSED_PERMANENTLY', () => {
      assert.strictEqual(isOperational({ businessStatus: 'CLOSED_PERMANENTLY' }), false);
    });
    it('returns false for CLOSED_TEMPORARILY', () => {
      assert.strictEqual(isOperational({ businessStatus: 'CLOSED_TEMPORARILY' }), false);
    });
  });

  describe('isPermanentlyClosed', () => {
    it('returns true only for CLOSED_PERMANENTLY', () => {
      assert.strictEqual(isPermanentlyClosed({ businessStatus: 'CLOSED_PERMANENTLY' }), true);
      assert.strictEqual(isPermanentlyClosed({ businessStatus: 'OPERATIONAL' }), false);
      assert.strictEqual(isPermanentlyClosed({ businessStatus: 'CLOSED_TEMPORARILY' }), false);
      assert.strictEqual(isPermanentlyClosed({}), false);
    });
  });

  describe('isTemporarilyClosed', () => {
    it('returns true only for CLOSED_TEMPORARILY', () => {
      assert.strictEqual(isTemporarilyClosed({ businessStatus: 'CLOSED_TEMPORARILY' }), true);
      assert.strictEqual(isTemporarilyClosed({ businessStatus: 'OPERATIONAL' }), false);
      assert.strictEqual(isTemporarilyClosed({ businessStatus: 'CLOSED_PERMANENTLY' }), false);
      assert.strictEqual(isTemporarilyClosed({}), false);
    });
  });

  describe('filterPlacesByBusinessStatus', () => {
    it('removes CLOSED_PERMANENTLY only', () => {
      const places = [
        { id: 'places/ChIJ1', businessStatus: 'OPERATIONAL' },
        { id: 'places/ChIJ2', businessStatus: 'CLOSED_PERMANENTLY' },
        { id: 'ChIJ3', businessStatus: 'CLOSED_TEMPORARILY' },
        { id: 'places/ChIJ4' }
      ];
      const out = filterPlacesByBusinessStatus(places);
      assert.strictEqual(out.filtered.length, 3);
      assert.strictEqual(out.permanentlyClosedCount, 1);
      assert.deepStrictEqual(out.permanentlyClosedPlaceIds, ['ChIJ2']);
      assert.strictEqual(out.tempClosedCount, 1);
      assert.strictEqual(out.missingStatusCount, 1);
      assert.strictEqual(out.filtered[0].businessStatus, 'OPERATIONAL');
      assert.strictEqual(out.filtered[1].businessStatus, 'CLOSED_TEMPORARILY');
      assert.strictEqual(out.filtered[2].id, 'places/ChIJ4');
    });

    it('mixed results: CLOSED_PERMANENTLY removed, TEMP and missing kept', () => {
      const places = [
        { id: 'p1', businessStatus: 'CLOSED_PERMANENTLY' },
        { id: 'p2', businessStatus: 'CLOSED_TEMPORARILY' },
        { id: 'p3' },
        { id: 'p4', businessStatus: 'OPERATIONAL' }
      ];
      const out = filterPlacesByBusinessStatus(places);
      assert.strictEqual(out.filtered.length, 3);
      assert.strictEqual(out.permanentlyClosedCount, 1);
      assert.strictEqual(out.permanentlyClosedPlaceIds[0], 'p1');
      assert.strictEqual(out.tempClosedCount, 1);
      assert.strictEqual(out.missingStatusCount, 1);
      assert.ok(out.filtered.every((p) => p.businessStatus !== 'CLOSED_PERMANENTLY'));
    });

    it('all OPERATIONAL or missing returns same length', () => {
      const places = [
        { id: 'a', businessStatus: 'OPERATIONAL' },
        { id: 'b' }
      ];
      const out = filterPlacesByBusinessStatus(places);
      assert.strictEqual(out.filtered.length, 2);
      assert.strictEqual(out.permanentlyClosedCount, 0);
      assert.strictEqual(out.permanentlyClosedPlaceIds.length, 0);
    });
  });

  describe('filterResultsByBusinessStatus', () => {
    it('removes DTOs with businessStatus CLOSED_PERMANENTLY', () => {
      const results = [
        { placeId: 'x', businessStatus: 'OPERATIONAL' },
        { placeId: 'y', businessStatus: 'CLOSED_PERMANENTLY' },
        { placeId: 'z', businessStatus: 'CLOSED_TEMPORARILY' }
      ];
      const filtered = filterResultsByBusinessStatus(results);
      assert.strictEqual(filtered.length, 2);
      assert.strictEqual(filtered[0].placeId, 'x');
      assert.strictEqual(filtered[1].placeId, 'z');
    });

    it('keeps results with no businessStatus (cache legacy)', () => {
      const results = [{ placeId: 'a' }, { placeId: 'b', businessStatus: 'OPERATIONAL' }];
      const filtered = filterResultsByBusinessStatus(results);
      assert.strictEqual(filtered.length, 2);
    });
  });
});
