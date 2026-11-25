import { describe, expect, it } from 'vitest';
import { parseLyrics } from '../tokenizer';
import { CompoundSubItem } from '../../types/game';

function getCompounds(text: string): CompoundSubItem[][] {
  const parsed = parseLyrics(text);
  const result: CompoundSubItem[][] = [];
  for (const line of parsed.lines) {
    for (const token of line) {
      if (token.type === 'compound') {
        result.push(token.items);
      }
    }
  }
  return result;
}

describe('parseLyrics', () => {
  it('handles 1-letter and 2-letter words and ignores accents/cedillas', () => {
    const parsed = parseLyrics('É o coração em paz, a fé no ar.');
    expect(parsed.keyToSegmentIds['e']).toHaveLength(1);
    expect(parsed.keyToSegmentIds['o']).toHaveLength(1);
    expect(parsed.keyToSegmentIds['coracao']).toHaveLength(1);
    expect(parsed.keyToSegmentIds['em']).toHaveLength(1);
    expect(parsed.keyToSegmentIds['paz']).toHaveLength(1);
    expect(parsed.keyToSegmentIds['a']).toHaveLength(1);
    expect(parsed.keyToSegmentIds['fe']).toHaveLength(1);
    expect(parsed.keyToSegmentIds['no']).toHaveLength(1);
    expect(parsed.keyToSegmentIds['ar']).toHaveLength(1);
  });

  it('keeps punctuation visible without requiring punctuation in input', () => {
    const parsed = parseLyrics('(Olá!), — mundo?');
    const tokens = parsed.lines[0];
    expect(tokens[0]).toEqual({
      type: 'compound',
      items: [
        { type: 'punct', text: '(' },
        { type: 'part', segmentId: 0, text: 'Olá' },
        { type: 'punct', text: '!),' },
      ],
    });
    expect(tokens[2]).toEqual({ type: 'punct', text: '—' });
    expect(tokens[4]).toEqual({
      type: 'compound',
      items: [
        { type: 'part', segmentId: 1, text: 'mundo' },
        { type: 'punct', text: '?' },
      ],
    });
  });

  it('splits "You\'re" into "You" and "re" separately and rejects "your"', () => {
    const parsed = parseLyrics("You're here");
    expect(parsed.segments).toHaveLength(3);
    expect(parsed.keyToSegmentIds['you']).toEqual([0]);
    expect(parsed.keyToSegmentIds['are']).toEqual([1]);
    expect(parsed.keyToSegmentIds['your']).toBeUndefined();
    expect(parsed.keyToSegmentIds['youre']).toBeUndefined();

    const compounds = getCompounds("You're");
    expect(compounds[0]).toEqual([
      { type: 'part', segmentId: 0, text: 'You' },
      { type: 'punct', text: "'" },
      { type: 'part', segmentId: 1, text: 're' },
    ]);
  });

  it('splits "He\'s" and "It\'s" separately and rejects "its"', () => {
    const parsed = parseLyrics("He's fine, it's true");
    expect(parsed.keyToSegmentIds['he']).toEqual([0]);
    expect(parsed.keyToSegmentIds['is']).toEqual([1, 4]);
    expect(parsed.keyToSegmentIds['has']).toEqual([1, 4]);
    expect(parsed.keyToSegmentIds['it']).toEqual([3]);
    expect(parsed.keyToSegmentIds['its']).toBeUndefined();
  });

  it('handles "Don\'t", "Won\'t", "Can\'t", "Let\'s", "I\'m", "We\'ll", "We\'re" without false homographs', () => {
    const parsed = parseLyrics("Don't stop, won't go, can't fail, let's run, I'm free, we'll see, we're fine");
    expect(parsed.keyToSegmentIds['do']).toBeDefined();
    expect(parsed.keyToSegmentIds['not']).toHaveLength(3); // don't, won't, can't
    expect(parsed.keyToSegmentIds['will']).toHaveLength(2); // won't, we'll
    expect(parsed.keyToSegmentIds['can']).toHaveLength(1);
    expect(parsed.keyToSegmentIds['let']).toHaveLength(1);
    expect(parsed.keyToSegmentIds['us']).toHaveLength(1);
    expect(parsed.keyToSegmentIds['i']).toHaveLength(1);
    expect(parsed.keyToSegmentIds['am']).toHaveLength(1);
    expect(parsed.keyToSegmentIds['we']).toHaveLength(2);
    expect(parsed.keyToSegmentIds['are']).toHaveLength(1);

    // Crucial false-homograph checks
    expect(parsed.keyToSegmentIds['well']).toBeUndefined();
    expect(parsed.keyToSegmentIds['were']).toBeUndefined();

    // Verify Don't keeps apostrophe between n and t
    const compounds = getCompounds("Don't");
    expect(compounds[0]).toEqual([
      { type: 'part', segmentId: 0, text: 'Do' },
      { type: 'part', segmentId: 1, text: 'n' },
      { type: 'punct', text: "'" },
      { type: 'part', segmentId: 1, text: 't' },
    ]);
  });

  it("handles slang walkin', Portuguese d'água, hyphenated bem-vindo, and possessive heaven's door", () => {
    const parsed = parseLyrics("walkin' on d'água, bem-vindo at heaven's door");
    expect(parsed.keyToSegmentIds['walking']).toEqual([0]);
    expect(parsed.keyToSegmentIds['walkin']).toEqual([0]);
    expect(parsed.keyToSegmentIds['de']).toEqual([2]);
    expect(parsed.keyToSegmentIds['agua']).toEqual([3]);
    expect(parsed.keyToSegmentIds['bem']).toEqual([4]);
    expect(parsed.keyToSegmentIds['vindo']).toEqual([5]);
    expect(parsed.keyToSegmentIds['heavens']).toEqual([7]);
    expect(parsed.keyToSegmentIds['is']).toBeUndefined();
  });
});
