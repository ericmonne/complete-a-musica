const APOSTROPHE_REGEX = /[\u2018\u2019\u02BC\u0060\u00B4]/g;
const EDITION_SUFFIX_REGEX =
  /\s*(?:[-–—]\s*|\(|\[)(?:\d{4}\s+)?(?:remaster(?:ed|izado)?|radio edit|album version|single version|stereo|mono|explicit|clean version|deluxe[^)\]]*|vers[aã]o[^)\]]*)(?:\s+\d{4})?[)\]]?\s*$/i;

/**
 * Normalizes curly apostrophes and backticks into straight ASCII apostrophe (').
 */
export function normalizeApostrophes(text: string): string {
  return text.replace(APOSTROPHE_REGEX, "'");
}

/**
 * Normalizes a word for case-insensitive, accent-insensitive, and cedilla-insensitive matching.
 * Strips all diacritics (including combining cedilla \u0327) and non-alphanumeric characters.
 */
export function normalizeWord(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Strips trailing streaming edition suffixes (e.g., "- Remastered 2011", "(Deluxe Version)")
 * while preserving genuine sequel numbers like "Part 2" or "II".
 */
export function stripEditionSuffix(track: string): string {
  let current = track.trim();
  while (current.length > 0) {
    const next = current.replace(EDITION_SUFFIX_REGEX, '').trim();
    if (!next || next === current) {
      break;
    }
    current = next;
  }
  return current.length > 0 ? current : track.trim();
}

/**
 * Produces a canonical artist+track key for duplicate detection across accents,
 * capitalization, punctuation, and streaming edition suffixes.
 */
export function canonicalSongKey(artist: string, track: string): string {
  return `${normalizeWord(artist)}::${normalizeWord(stripEditionSuffix(track))}`;
}
