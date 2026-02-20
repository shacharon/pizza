/**
 * Minimal smoke tests for summary enrichment helper.
 * No snapshot tests. No prompt changes.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildSummaryEnrichment } from '../summary-enrichment.js';

describe('buildSummaryEnrichment', () => {
  test('when results length >= 4, top.length === 4', () => {
    const results = [
      { name: 'A' },
      { name: 'B' },
      { name: 'C' },
      { name: 'D' },
      { name: 'E' }
    ];
    const { top } = buildSummaryEnrichment(results, results.length);
    assert.equal(top.length, 4);
    assert.deepEqual(top.map((t) => t.name), ['A', 'B', 'C', 'D']);
  });

  test('skips items with missing name', () => {
    const results = [
      { name: 'A' },
      { name: '' },
      { name: 'B' },
      { name: null as unknown as string },
      { name: '   ' },
      { name: 'C' }
    ];
    const { top } = buildSummaryEnrichment(results, 6);
    assert.equal(top.length, 3);
    assert.deepEqual(top.map((t) => t.name), ['A', 'B', 'C']);
  });

  test('analysisMode: 0..4 SCARCITY, 5..14 COMPARISON, 15+ SATURATED', () => {
    const withName = { name: 'X' };
    const results = [withName];

    assert.equal(buildSummaryEnrichment([], 0).analysisMode, 'SCARCITY');
    assert.equal(buildSummaryEnrichment(results, 1).analysisMode, 'SCARCITY');
    assert.equal(buildSummaryEnrichment(results, 4).analysisMode, 'SCARCITY');

    assert.equal(buildSummaryEnrichment(results, 5).analysisMode, 'COMPARISON');
    assert.equal(buildSummaryEnrichment(results, 10).analysisMode, 'COMPARISON');
    assert.equal(buildSummaryEnrichment(results, 14).analysisMode, 'COMPARISON');

    assert.equal(buildSummaryEnrichment(results, 15).analysisMode, 'SATURATED');
    assert.equal(buildSummaryEnrichment(results, 20).analysisMode, 'SATURATED');
  });
});
