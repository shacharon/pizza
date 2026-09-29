import { describe, it } from 'node:test';
import assert from 'node:assert';
import { capModelString } from './cap-model-string.js';

describe('capModelString', () => {
  it('leaves a short query unchanged', () => {
    assert.strictEqual(capModelString('pizza on Allenby', 80), 'pizza on Allenby');
  });

  it('cuts a long string at the last space inside 80', () => {
    const words = Array.from({ length: 20 }, (_, index) => `word${index}`);
    const value = words.join(' ');
    const result = capModelString(value, 80);
    assert.ok(result.length <= 80);
    assert.ok(value.startsWith(result));
    assert.strictEqual(result.includes(' '), true);
    assert.strictEqual(value[result.length], ' ');
  });

  it('cuts a single token longer than 80 to 80 characters', () => {
    const value = 'a'.repeat(90);
    const result = capModelString(value, 80);
    assert.strictEqual(result, 'a'.repeat(80));
    assert.strictEqual(result.length, 80);
  });

  it('leaves a short city unchanged at 40', () => {
    assert.strictEqual(capModelString('Tel Aviv', 40), 'Tel Aviv');
  });

  it('cuts a long city at the last space inside 40', () => {
    const words = Array.from({ length: 12 }, (_, index) => `city${index}`);
    const value = words.join(' ');
    const result = capModelString(value, 40);
    assert.ok(result.length <= 40);
    assert.ok(value.startsWith(result));
    assert.strictEqual(value[result.length], ' ');
  });

  it('cuts a single city token longer than 40 to 40 characters', () => {
    const value = 'b'.repeat(50);
    const result = capModelString(value, 40);
    assert.strictEqual(result, 'b'.repeat(40));
    assert.strictEqual(result.length, 40);
  });
});
