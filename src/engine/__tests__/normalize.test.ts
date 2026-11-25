import { describe, expect, it } from 'vitest';
import { normalizeApostrophes, normalizeWord } from '../normalize';

describe('normalizeWord', () => {
  it('is case-insensitive and strips accents and cedillas', () => {
    expect(normalizeWord('Coração')).toBe('coracao');
    expect(normalizeWord('CORAÇÃO')).toBe('coracao');
    expect(normalizeWord('Você')).toBe('voce');
    expect(normalizeWord('É')).toBe('e');
    expect(normalizeWord('não')).toBe('nao');
    expect(normalizeWord('Águas')).toBe('aguas');
    expect(normalizeWord('Açaí')).toBe('acai');
    expect(normalizeWord('garçon')).toBe('garcon');
    expect(normalizeWord('niño')).toBe('nino');
    expect(normalizeWord('pingüino')).toBe('pinguino');
    expect(normalizeWord('¿Corazón?')).toBe('corazon');
  });

  it('strips punctuation while keeping letters and digits', () => {
    expect(normalizeWord('hello!')).toBe('hello');
    expect(normalizeWord('"amor?"')).toBe('amor');
    expect(normalizeWord('...baby')).toBe('baby');
    expect(normalizeWord('24/7')).toBe('247');
    expect(normalizeWord('—')).toBe('');
  });

  it('handles 1-letter and 2-letter words', () => {
    expect(normalizeWord('a')).toBe('a');
    expect(normalizeWord('I')).toBe('i');
    expect(normalizeWord('é')).toBe('e');
    expect(normalizeWord('in')).toBe('in');
    expect(normalizeWord('to')).toBe('to');
  });
});

describe('normalizeApostrophes', () => {
  it('converts curly apostrophes and backticks to straight apostrophes', () => {
    expect(normalizeApostrophes('You’re my ‘heart’')).toBe("You're my 'heart'");
  });
});
