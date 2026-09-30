import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyPostFilters } from '../post-results.filter.js';
import { shapeResultList } from '../list-shape.js';

function place(name: string, address = '') {
  return { id: name, name, address, openNow: true, tags: ['restaurant'] };
}

const filters = {
  uiLanguage: 'he',
  providerLanguage: 'he',
  openState: null,
  regionCode: 'IL',
  disclaimers: { hours: true, dietary: true }
} as any;

describe('shapeResultList', () => {
  it('keeps gluten-free falafel in Maale Adumim and drops pizza, burgers, and Jerusalem', () => {
    const shaped = shapeResultList(
      [
        place('פלאפל בתחנה', 'מעלה אדומים'),
        place('שלום פלאפל קטמון', 'קטמון, ירושלים'),
        place('פיצה רומי מעלה אדומים', 'מעלה אדומים'),
        place('בורגרים מעלה אדומים', 'מעלה אדומים'),
        place('פלאפל ללא גלוטן', 'מעלה אדומים')
      ],
      'פלאפל ללא גלוטן מעלה אדומים'
    );
    assert.deepEqual(shaped.results.map((row) => row.name), ['פלאפל ללא גלוטן', 'פלאפל בתחנה']);
    assert.equal(shaped.removedDish, 2);
    assert.equal(shaped.removedCity, 1);
  });

  it('drops coffee and skewers from a fish search and keeps unnamed places', () => {
    const shaped = shapeResultList(
      [
        place('היקב', 'עמק חפר'),
        place('הרואה בקפה', 'עמק חפר'),
        place('אנאמרו', 'עמק חפר'),
        place('שיפודי אחמד סעיד', 'עמק חפר')
      ],
      'דגים באיזור עמק חפר'
    );
    assert.deepEqual(shaped.results.map((row) => row.name), ['היקב', 'אנאמרו']);
  });

  it('keeps a normal pizza search in Tel Aviv', () => {
    const shaped = shapeResultList(
      [
        place('HaPizza', 'תל אביב'),
        place('פלאפל רצון', 'תל אביב'),
        place('Pizza Roma', 'ירושלים')
      ],
      'פיצה בתל אביב'
    );
    assert.deepEqual(shaped.results.map((row) => row.name), ['HaPizza']);
  });

  it('keeps the full list when every place would be dropped', () => {
    const shaped = shapeResultList(
      [place('היקב', 'תל אביב'), place('אנאמרו', 'חיפה')],
      'דגים במעלה אדומים'
    );
    assert.equal(shaped.results.length, 2);
    assert.equal(shaped.removedDish, 0);
    assert.equal(shaped.removedCity, 0);
  });
});

describe('applyPostFilters list shape', () => {
  it('applies the dish and city rules from the query', () => {
    const result = applyPostFilters({
      results: [
        place('הרואה בקפה', 'עמק חפר'),
        place('היקב', 'עמק חפר')
      ],
      sharedFilters: filters,
      requestId: 'req-test',
      pipelineVersion: 'route2',
      query: 'דגים באיזור עמק חפר'
    });
    assert.deepEqual(result.resultsFiltered.map((row) => row.name), ['היקב']);
  });
});
