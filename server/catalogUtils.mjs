const EDITION_SUFFIX_REGEX =
  /\s*(?:[-–—]\s*|\(|\[)(?:\d{4}\s+)?(?:remaster(?:ed|izado)?|radio edit|album version|single version|stereo|mono|explicit|clean version|deluxe[^)\]]*|vers[aã]o[^)\]]*)(?:\s+\d{4})?[)\]]?\s*$/i;

export function normalizeWord(input) {
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

export function stripEditionSuffix(track) {
  let current = String(track ?? '').trim();
  while (current.length > 0) {
    const next = current.replace(EDITION_SUFFIX_REGEX, '').trim();
    if (!next || next === current) {
      break;
    }
    current = next;
  }
  return current.length > 0 ? current : String(track ?? '').trim();
}

export function canonicalSongKey(artist, track) {
  return `${normalizeWord(artist)}::${normalizeWord(stripEditionSuffix(track))}`;
}
