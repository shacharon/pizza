import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyPostFilters } from '../post-results.filter.js';
import { placeNameIsClearlyKosher, queryAsksNotKosher } from '../not-kosher-name.js';

function place(name: string) {
  return { id: name, name, openNow: true, tags: ['restaurant'] };
}

function filters(isKosher: boolean | null) {
  return {
    uiLanguage: 'he',
    providerLanguage: 'he',
    openState: null,
    regionCode: 'IL',
    disclaimers: { hours: true, dietary: true },
    isKosher
  } as any;
}

describe('not kosher name filter', () => {
  it('treats לא כשר as a not-kosher query', () => {
    assert.equal(queryAsksNotKosher('בשר לא כשר באיזור ירושלים'), true);
    assert.equal(queryAsksNotKosher('kosher meat'), false);
    assert.equal(queryAsksNotKosher('non-kosher burger'), true);
  });

  it('marks a name that says kosher, and keeps a name that says לא כשר', () => {
    assert.equal(placeNameIsClearlyKosher('דולפין ים הכשרה - Sea dolphin kosher'), true);
    assert.equal(placeNameIsClearlyKosher('החברים ירושלים מהדרין'), true);
    assert.equal(placeNameIsClearlyKosher('מסעדת אנטריקוט'), false);
    assert.equal(placeNameIsClearlyKosher('בשר לא כשר'), false);
  });

  it('drops clearly kosher names and keeps the rest', () => {
    const result = applyPostFilters({
      results: [
        place('דולפין ים הכשרה - Sea dolphin kosher'),
        place('החברים ירושלים מהדרין'),
        place('מסעדת אנטריקוט'),
        place('בשר לא כשר')
      ],
      sharedFilters: filters(false),
      requestId: 'req-test',
      pipelineVersion: 'route2'
    });
    assert.deepEqual(result.resultsFiltered.map((r) => r.name), ['מסעדת אנטריקוט', 'בשר לא כשר']);
  });

  it('does not drop kosher names when kosher was not refused', () => {
    const result = applyPostFilters({
      results: [place('דולפין ים הכשרה - Sea dolphin kosher'), place('מסעדת אנטריקוט')],
      sharedFilters: filters(null),
      requestId: 'req-test',
      pipelineVersion: 'route2'
    });
    assert.equal(result.resultsFiltered.length, 2);
  });
});
