import { describe, expect, it } from 'vitest';
import { cleanLyrics } from '../lyricsCleaner';

describe('cleanLyrics', () => {
  it('strips LRC timestamps and bracketed section headers', () => {
    const synced = `
[00:12.34] [Verse 1]
[00:15.00] Hello world
[00:18.50] [Chorus: Singer]
[00:20.00] You're shining bright
    `;
    expect(cleanLyrics(null, synced)).toBe("Hello world\n\nYou're shining bright");
  });

  it('prefers plainLyrics when non-empty and removes repeat/section parenthetical markers', () => {
    const plain = `
[Intro]
(Chorus)
Coração partido (x2)
(Repeat 3x)

Você é luz (bis)
    `;
    expect(cleanLyrics(plain, '[00:01.00] ignored')).toBe(
      'Coração partido\n\nVocê é luz'
    );
  });

  it('normalizes curly apostrophes and excessive blank lines', () => {
    const plain = 'Don’t stop\n\n\n\nIt’s alright';
    expect(cleanLyrics(plain)).toBe("Don't stop\n\nIt's alright");
  });
});
