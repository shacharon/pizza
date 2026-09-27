import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GATE2_PROMPT_VERSION, GATE2_SYSTEM_PROMPT } from './gate2.stage.js';

const NEW_EXAMPLES = [
  '"itlain next to me" -> {"foodSignal":"YES","confidence":0.92}',
  '"piza" -> {"foodSignal":"YES","confidence":0.95}',
  '"restarents" -> {"foodSignal":"YES","confidence":0.92}',
  '"Italian next to me" -> {"foodSignal":"YES","confidence":0.95}',
  '"what\'s open near me" -> {"foodSignal":"UNCERTAIN","confidence":0.55}',
  '"sex near me" -> {"foodSignal":"NO","confidence":1.0}'
];

describe('Gate2 prompt typo examples', () => {
  it('is version gate2_v9 and includes the typo and stop examples', () => {
    assert.equal(GATE2_PROMPT_VERSION, 'gate2_v9');
    for (const line of NEW_EXAMPLES) {
      assert.equal(GATE2_SYSTEM_PROMPT.includes(line), true, line);
    }
  });

  it('keeps the pizza YES example, the Hebrew uncertain example, and the confidence bands', () => {
    assert.equal(
      GATE2_SYSTEM_PROMPT.includes('"pizza" -> {"foodSignal":"YES","confidence":0.95}'),
      true
    );
    assert.equal(
      GATE2_SYSTEM_PROMPT.includes('"מה פתוח עכשיו" -> {"foodSignal":"UNCERTAIN","confidence":0.55}'),
      true
    );
    assert.equal(GATE2_SYSTEM_PROMPT.includes('0.90-1.0'), true);
    assert.equal(GATE2_SYSTEM_PROMPT.includes('0.45-0.65'), true);
    assert.equal(GATE2_SYSTEM_PROMPT.includes('0.95-1.0'), true);
    assert.equal(GATE2_SYSTEM_PROMPT.includes('Profanity-only: NO 1.0'), true);
  });
});
