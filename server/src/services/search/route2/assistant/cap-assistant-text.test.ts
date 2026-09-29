import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ASSISTANT_REPLY_MAX_CHARS, capAssistantText } from './cap-assistant-text.js';

describe('capAssistantText', () => {
  it('keeps a short reply', () => {
    assert.equal(capAssistantText('pizza on Allenby'), 'pizza on Allenby');
    assert.equal(capAssistantText('pizza on Allenby').length, 16);
  });

  it('keeps a reply of exactly 600 characters', () => {
    const text = 'a'.repeat(ASSISTANT_REPLY_MAX_CHARS);
    assert.equal(capAssistantText(text).length, 600);
    assert.equal(capAssistantText(text), text);
  });

  it('cuts a reply of 601 characters to the first 600', () => {
    const text = 'b'.repeat(600) + 'Z';
    const capped = capAssistantText(text);
    assert.equal(capped.length, 600);
    assert.equal(capped, text.slice(0, 600));
    assert.equal(capped.includes('Z'), false);
  });

  it('leaves a script tag as characters', () => {
    const script = '<script>alert(1)</script>';
    assert.equal(capAssistantText(script), script);
  });
});
