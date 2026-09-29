import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  truncateWordsForLlm,
  LLM_USER_TEXT_MAX_WORDS,
  frameSearchAsData,
  SEARCH_TEXT_IS_DATA_LINE
} from './truncate-llm-words.js';

describe('truncateWordsForLlm', () => {
  it('keeps a short query', () => {
    assert.equal(truncateWordsForLlm('pizza on Allenby'), 'pizza on Allenby');
  });

  it('drops words after 25', () => {
    const words = Array.from({ length: 40 }, (_, i) => `w${i + 1}`);
    const truncated = truncateWordsForLlm(words.join(' '));
    assert.equal(truncated.split(' ').length, LLM_USER_TEXT_MAX_WORDS);
    assert.equal(truncated.endsWith('w25'), true);
    assert.equal(truncated.includes('w26'), false);
  });

  it('collapses extra spaces before counting', () => {
    assert.equal(truncateWordsForLlm('  pizza   near   me  '), 'pizza near me');
  });
});

describe('frameSearchAsData', () => {
  it('puts the fixed line in front of a short search', () => {
    assert.equal(
      frameSearchAsData('pizza on Allenby'),
      `${SEARCH_TEXT_IS_DATA_LINE}\npizza on Allenby`
    );
  });

  it('does not change a 25-word cut', () => {
    const words = Array.from({ length: 40 }, (_, i) => `w${i + 1}`);
    const truncated = truncateWordsForLlm(words.join(' '));
    const framed = frameSearchAsData(truncated);
    const searchLine = framed.split('\n')[1];
    assert.equal(framed.startsWith(`${SEARCH_TEXT_IS_DATA_LINE}\n`), true);
    assert.equal(searchLine, truncated);
    assert.equal(searchLine.split(' ').length, LLM_USER_TEXT_MAX_WORDS);
    assert.equal(searchLine.endsWith('w25'), true);
    assert.equal(searchLine.includes('w26'), false);
  });
});
