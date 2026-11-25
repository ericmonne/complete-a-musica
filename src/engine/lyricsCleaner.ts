import { normalizeApostrophes } from './normalize';

const LRC_TIMESTAMP_REGEX = /\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g;
const BRACKET_ANNOTATION_REGEX = /\[[^\]]*\]/g;
const REPEAT_MARKER_REGEX = /\((?:x\s*\d+|\d+\s*x|bis|repeat[^)]*)\)/gi;
const PAREN_SECTION_LINE_REGEX =
  /^\s*\((?:chorus|refr[aã]o|verse[^)]*|verso[^)]*|pre-chorus[^)]*|pr[eé]-refr[aã]o[^)]*|intro|outro|bridge|ponte|instrumental|solo|interlude|hook|coda)\)\s*:?\s*$/gim;

/**
 * Cleans raw plain or LRC-synced lyrics returned from LRCLIB by removing timestamps,
 * bracketed section labels, and repeat markers while preserving line breaks and punctuation.
 */
export function cleanLyrics(
  rawPlain: string | null | undefined,
  rawSynced?: string | null
): string {
  const source = rawPlain && rawPlain.trim().length > 0 ? rawPlain : rawSynced ?? '';
  if (!source.trim()) {
    return '';
  }

  let cleaned = normalizeApostrophes(source.replace(/\r\n?/g, '\n'));
  cleaned = cleaned.replace(LRC_TIMESTAMP_REGEX, '');
  cleaned = cleaned.replace(BRACKET_ANNOTATION_REGEX, '');
  cleaned = cleaned.replace(REPEAT_MARKER_REGEX, '');
  cleaned = cleaned.replace(PAREN_SECTION_LINE_REGEX, '');

  const lines = cleaned.split('\n').map((line) => line.trim().replace(/\s{2,}/g, ' '));
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
