import { languageFromKeyboardSample } from './keyboard-language';

describe('languageFromKeyboardSample', () => {
  it('reads a Hebrew keyboard', () => {
    expect(languageFromKeyboardSample('קראטוןםפ')).toBe('he');
  });

  it('reads an Arabic keyboard', () => {
    expect(languageFromKeyboardSample('ضصثقفغعهخح')).toBe('ar');
  });

  it('reads a Russian keyboard', () => {
    expect(languageFromKeyboardSample('йцукенгшщз')).toBe('ru');
  });

  it('leaves a Latin keyboard to the browser language', () => {
    expect(languageFromKeyboardSample('qwerty')).toBeNull();
  });
});
