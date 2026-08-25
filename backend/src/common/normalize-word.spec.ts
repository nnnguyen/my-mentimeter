import { normalizeWord, sanitizeDisplayText } from './normalize-word';

describe('normalizeWord', () => {
  it('trims leading/trailing whitespace and collapses internal whitespace', () => {
    expect(normalizeWord('   hello    world   ')).toBe('hello world');
  });

  it('lowercases the input', () => {
    expect(normalizeWord('HELLO World')).toBe('hello world');
  });

  it('strips punctuation', () => {
    expect(normalizeWord('hello!!!')).toBe('hello');
    expect(normalizeWord('chào, bạn.')).toBe('chào bạn');
    expect(normalizeWord(`it's a "test"; ok?`)).toBe('its a test ok');
  });

  it('keeps Vietnamese diacritics intact and treats them as distinct from the non-accented form', () => {
    expect(normalizeWord('Sáng Tạo')).toBe('sáng tạo');
    expect(normalizeWord('sang tao')).toBe('sang tao');
    expect(normalizeWord('Sáng Tạo')).not.toBe(normalizeWord('sang tao'));
  });

  it('produces the same result regardless of NFC vs NFD Unicode encoding', () => {
    const nfc = 'sáng tạo'.normalize('NFC');
    const nfd = 'sáng tạo'.normalize('NFD');
    expect(nfc).not.toBe(nfd); // sanity check: the two byte-encodings really differ
    expect(normalizeWord(nfd)).toBe(normalizeWord(nfc));
    expect(normalizeWord(nfd)).toBe('sáng tạo');
  });

  it('returns an empty string for empty input', () => {
    expect(normalizeWord('')).toBe('');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeWord('    ')).toBe('');
  });

  it('returns an empty string when the input is only punctuation', () => {
    expect(normalizeWord('!!! ??? ...')).toBe('');
  });

  it('truncates input longer than 40 characters', () => {
    const longWord = 'a'.repeat(50);
    const result = normalizeWord(longWord);
    expect(result.length).toBe(40);
    expect(result).toBe('a'.repeat(40));
  });

  it('neutralizes HTML/script injection attempts', () => {
    const result = normalizeWord('<script>alert(1)</script>');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).toBe('scriptalert1script');
  });

  it('keeps digits', () => {
    expect(normalizeWord('web3 5g')).toBe('web3 5g');
  });
});

describe('sanitizeDisplayText', () => {
  it('applies the same sanitization but preserves original casing', () => {
    expect(sanitizeDisplayText('Sáng Tạo!!!')).toBe('Sáng Tạo');
  });

  it('neutralizes HTML/script injection attempts', () => {
    const result = sanitizeDisplayText('<b>bold</b>');
    expect(result).not.toContain('<');
    expect(result).toBe('bboldb');
  });
});
