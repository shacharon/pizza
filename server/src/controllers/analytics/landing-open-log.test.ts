import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { landingOpenLog } from './landing-open-log.js';

describe('landingOpenLog', () => {
  it('keeps the entry and the short session code', () => {
    assert.deepEqual(
      landingOpenLog('landing_open', { entry: 'p:cv' }, 'sess_d6d500c6-b21e-4abc'),
      { event: 'landing_open', entry: 'p:cv', sessionPrefix: 'd6d500c6' }
    );
    assert.equal(landingOpenLog('landing_open', { entry: 'qr' }, 'sess_abc')?.entry, 'qr');
  });

  it('drops a bad entry, a wrong event, or missing data', () => {
    assert.equal(landingOpenLog('landing_open', { entry: 'p:Bad Name!' }, 'sess_abc'), null);
    assert.equal(landingOpenLog('landing_open', { entry: '' }, 'sess_abc'), null);
    assert.equal(landingOpenLog('landing_open', null, 'sess_abc'), null);
    assert.equal(landingOpenLog('search', { entry: 'qr' }, 'sess_abc'), null);
  });
});
