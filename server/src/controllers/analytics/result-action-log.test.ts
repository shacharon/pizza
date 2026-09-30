import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resultActionLog } from './result-action-log.js';

describe('resultActionLog', () => {
  it('keeps the click fields and the short session code', () => {
    const row = resultActionLog(
      'result_action',
      { action: 'open', name: 'פלאפל רצון', requestId: 'req-1790709478067-4x73gn6o5' },
      'sess_d6d500c6-b21e-4abc'
    );
    assert.deepEqual(row, {
      event: 'result_action',
      action: 'open',
      name: 'פלאפל רצון',
      requestId: 'req-1790709478067-4x73gn6o5',
      sessionPrefix: 'd6d500c6'
    });
  });

  it('drops an unknown action and a missing name', () => {
    assert.equal(resultActionLog('result_action', { action: 'hack', name: 'X' }, 'sess_abc'), null);
    assert.equal(resultActionLog('result_action', { action: 'call', name: '   ' }, 'sess_abc'), null);
    assert.equal(resultActionLog('search', { action: 'open', name: 'X' }, 'sess_abc'), null);
  });
});
