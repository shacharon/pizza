import { ASSISTANT_REPLY_MAX_CHARS, capAssistantText } from './cap-assistant-text';

describe('capAssistantText', () => {
  it('keeps a short reply', () => {
    expect(capAssistantText('pizza on Allenby')).toBe('pizza on Allenby');
    expect(capAssistantText('pizza on Allenby').length).toBe(16);
  });

  it('keeps a reply of exactly 600 characters', () => {
    const text = 'a'.repeat(ASSISTANT_REPLY_MAX_CHARS);
    expect(capAssistantText(text).length).toBe(600);
    expect(capAssistantText(text)).toBe(text);
  });

  it('cuts a reply of 601 characters to the first 600', () => {
    const text = 'b'.repeat(600) + 'Z';
    const capped = capAssistantText(text);
    expect(capped.length).toBe(600);
    expect(capped).toBe(text.slice(0, 600));
    expect(capped.includes('Z')).toBe(false);
  });

  it('leaves a script tag as characters', () => {
    const script = '<script>alert(1)</script>';
    expect(capAssistantText(script)).toBe(script);
  });
});