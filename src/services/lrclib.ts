import { filterCatalogTracks } from '../engine/catalogFilter';
import { cleanLyrics } from '../engine/lyricsCleaner';
import { canonicalSongKey, normalizeWord } from '../engine/normalize';
import {
  FilterTag,
  SeedTrack,
  SongData,
  SongLanguage,
} from '../types/game';
import { EMERGENCY_OFFLINE_SONGS, SEED_TRACKS } from './seedCatalog';

export const LRCLIB_SEARCH_URL = 'https://lrclib.net/api/search';
const CLIENT_HEADER = 'CompleteAMusica v1.0 (https://github.com/complete-a-musica)';
const REQUEST_TIMEOUT_MS = 8000;
const CATALOG_TIMEOUT_MS = 3000;
const PLAYED_STORAGE_KEY = 'complete-musica-played';
const ARTIST_PLAYED_STORAGE_KEY = 'complete-musica-artist-played';
export const MIN_LYRICS_WORDS = 25;
export const MAX_LYRICS_WORDS = 1000;
const MAX_SEED_ATTEMPTS = 4;

const NON_STUDIO_REGEX =
  /\b(live|remix|karaoke|instrumental|ao vivo|ac[úu]stic[oa]|acoustic|cover)\b/i;
const TRIBUTE_ARTIST_REGEX = /\b(tribute|karaoke|cover|8-bit|lullaby)\b/i;

export interface LrclibTrackRecord {
  id: number | string;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

export class ArtistNotFoundError extends Error {
  constructor(artistName: string) {
    super(
      `Nenhuma música com letra jogável foi encontrada no LRCLIB para "${artistName}".`
    );
    this.name = 'ArtistNotFoundError';
  }
}

export class EmptyFilterPoolError extends Error {
  constructor() {
    super(
      'Nenhuma música encontrada para essa combinação de filtros. Ajuste as categorias ou clique em "Todas".'
    );
    this.name = 'EmptyFilterPoolError';
  }
}

function seedKey(seed: SeedTrack): string {
  return `${normalizeWord(seed.artist)}::${normalizeWord(seed.track)}`;
}

function loadPlayedKeys(storageKey: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function savePlayedKeys(storageKey: string, keys: Set<string>): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(Array.from(keys)));
  } catch {
    // Ignore storage errors in restricted environments
  }
}

function markKeyPlayed(storageKey: string, key: string): void {
  const keys = loadPlayedKeys(storageKey);
  keys.add(key);
  savePlayedKeys(storageKey, keys);
}

export function countLyricsWords(cleaned: string): number {
  const words = cleaned.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function pickRandomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function inferSongLanguage(cleanedLyrics: string): SongLanguage {
  if (
    /[ãõçêôà]/i.test(cleanedLyrics) ||
    /\b(você|não|coração|então|também|ninguém|alguém|minha)\b/i.test(cleanedLyrics)
  ) {
    return 'pt';
  }
  if (
    /[ñ¿¡]/i.test(cleanedLyrics) ||
    /\b(corazón|también|siempre|quiero|puedo|tengo|estoy|eres|porque|cuando|dónde|qué|cómo|más|aquí|así|sueño|mañana|contigo|conmigo)\b/i.test(
      cleanedLyrics
    ) ||
    (/[áéíóú]/i.test(cleanedLyrics) &&
      /\b(el|los|las|una|del|pero|yo|tú|sin|con)\b/i.test(cleanedLyrics))
  ) {
    return 'es';
  }
  return 'en';
}

function scoreBaseRecord(
  record: LrclibTrackRecord,
  cleanedLyrics: string
): number {
  let score = 0;
  const trackName = (record.trackName ?? '').toLowerCase();

  if (record.plainLyrics && record.plainLyrics.trim().length > 0) {
    score += 20;
  }

  if (NON_STUDIO_REGEX.test(trackName)) {
    score -= 30;
  }

  const wordCount = countLyricsWords(cleanedLyrics);
  if (wordCount >= 40 && wordCount <= 450) {
    score += 5;
  }

  return score;
}

function scoreSeedCandidate(
  record: LrclibTrackRecord,
  seed: SeedTrack
): number {
  if (record.instrumental) return -1;

  const cleaned = cleanLyrics(record.plainLyrics, record.syncedLyrics);
  const wordCount = countLyricsWords(cleaned);
  if (wordCount < MIN_LYRICS_WORDS || wordCount > MAX_LYRICS_WORDS) {
    return -1;
  }

  let score = scoreBaseRecord(record, cleaned);
  const trackName = (record.trackName ?? '').toLowerCase();
  const artistName = (record.artistName ?? '').toLowerCase();

  if (normalizeWord(trackName) === normalizeWord(seed.track)) {
    score += 25;
  } else if (normalizeWord(trackName).includes(normalizeWord(seed.track))) {
    score += 10;
  }

  if (normalizeWord(artistName) === normalizeWord(seed.artist)) {
    score += 25;
  } else if (normalizeWord(artistName).includes(normalizeWord(seed.artist))) {
    score += 10;
  }

  return score;
}

async function fetchWithTimeout(
  url: string,
  withClientHeader: boolean,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const init: RequestInit = {
      method: 'GET',
      signal: controller.signal,
    };
    if (withClientHeader) {
      init.headers = { 'Lrclib-Client': CLIENT_HEADER };
    }
    return await fetch(url, init);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function queryLrclibRecords(url: string): Promise<LrclibTrackRecord[]> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url, true);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    response = await fetchWithTimeout(url, false);
  }

  if (!response.ok) {
    return [];
  }

  const records: unknown = await response.json();
  if (!Array.isArray(records)) {
    return [];
  }

  return records.filter(
    (item): item is LrclibTrackRecord => Boolean(item && typeof item === 'object')
  );
}

function extractValidCatalogTracks(data: unknown): SeedTrack[] | null {
  let list: unknown[] | null = null;
  if (Array.isArray(data)) {
    list = data;
  } else if (
    data &&
    typeof data === 'object' &&
    'tracks' in data &&
    Array.isArray((data as { tracks: unknown }).tracks)
  ) {
    list = (data as { tracks: unknown[] }).tracks;
  }

  if (!list || list.length === 0) {
    return null;
  }

  const first = list[0] as Partial<SeedTrack> | undefined;
  if (
    typeof first?.artist === 'string' &&
    typeof first?.track === 'string' &&
    Array.isArray(first?.tags)
  ) {
    return list as SeedTrack[];
  }

  return null;
}

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number
): Promise<unknown | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches the base catalog from `./catalog.json` (served by GitHub Pages and Vite public/)
 * or falls back to `/api/catalog` and finally the bundled SEED_TRACKS.
 */
export async function fetchCatalogTracks(): Promise<SeedTrack[]> {
  const staticData = await fetchJsonWithTimeout('./catalog.json', CATALOG_TIMEOUT_MS);
  const staticTracks = extractValidCatalogTracks(staticData);
  if (staticTracks) {
    return staticTracks;
  }

  const apiData = await fetchJsonWithTimeout('/api/catalog', CATALOG_TIMEOUT_MS);
  const apiTracks = extractValidCatalogTracks(apiData);
  if (apiTracks) {
    return apiTracks;
  }

  return SEED_TRACKS;
}

async function queryLrclibSeed(seed: SeedTrack): Promise<SongData | null> {
  const url = `${LRCLIB_SEARCH_URL}?track_name=${encodeURIComponent(
    seed.track
  )}&artist_name=${encodeURIComponent(seed.artist)}`;

  const records = await queryLrclibRecords(url);
  if (records.length === 0) {
    return null;
  }

  let bestRecord: LrclibTrackRecord | null = null;
  let bestScore = -1;

  for (const candidate of records) {
    const score = scoreSeedCandidate(candidate, seed);
    if (score > bestScore) {
      bestScore = score;
      bestRecord = candidate;
    }
  }

  if (!bestRecord) {
    return null;
  }

  const cleanedLyrics = cleanLyrics(bestRecord.plainLyrics, bestRecord.syncedLyrics);
  if (!cleanedLyrics) {
    return null;
  }

  return {
    id: `lrclib-${bestRecord.id ?? seedKey(seed)}`,
    title: bestRecord.trackName?.trim() || seed.track,
    artist: bestRecord.artistName?.trim() || seed.artist,
    album: bestRecord.albumName?.trim() || undefined,
    lang: seed.lang,
    lyrics: cleanedLyrics,
    source: 'lrclib',
    drawMode: 'catalog',
  };
}

function pickOfflineFallback(
  selectedTags: readonly FilterTag[],
  excludeSongId?: string
): SongData {
  const playedKeys = loadPlayedKeys(PLAYED_STORAGE_KEY);
  const filteredPool = filterCatalogTracks(EMERGENCY_OFFLINE_SONGS, selectedTags);

  const pool = filteredPool.length > 0 ? filteredPool : EMERGENCY_OFFLINE_SONGS;
  const unplayed = pool.filter(
    (song) => song.id !== excludeSongId && !playedKeys.has(song.id)
  );
  const candidates =
    unplayed.length > 0
      ? unplayed
      : pool.filter((song) => song.id !== excludeSongId);

  const chosen = pickRandomItem(candidates.length > 0 ? candidates : pool);
  markKeyPlayed(PLAYED_STORAGE_KEY, chosen.id);

  return {
    id: chosen.id,
    title: chosen.title,
    artist: chosen.artist,
    lang: chosen.lang,
    lyrics: chosen.lyrics,
    source: 'offline',
    drawMode: 'catalog',
  };
}

/**
 * Draws a random mystery song matching the selected filter tags from LRCLIB,
 * avoiding repeats within the current browser session and falling back
 * to the offline emergency catalog only if LRCLIB queries fail.
 */
export async function fetchRandomMysterySong(
  selectedTags: readonly FilterTag[],
  excludeSongId?: string
): Promise<SongData> {
  const catalogTracks = await fetchCatalogTracks();
  const playedKeys = loadPlayedKeys(PLAYED_STORAGE_KEY);
  const pool = filterCatalogTracks(catalogTracks, selectedTags);

  if (selectedTags.length > 0 && pool.length === 0) {
    throw new EmptyFilterPoolError();
  }

  const effectivePool = pool.length > 0 ? pool : catalogTracks;

  let unplayed = effectivePool.filter((seed) => !playedKeys.has(seedKey(seed)));
  if (unplayed.length === 0) {
    const poolKeys = new Set(effectivePool.map(seedKey));
    const updatedKeys = new Set(
      Array.from(playedKeys).filter((k) => !poolKeys.has(k))
    );
    savePlayedKeys(PLAYED_STORAGE_KEY, updatedKeys);
    unplayed = effectivePool;
  }

  const candidates = shuffle(unplayed).slice(0, MAX_SEED_ATTEMPTS);
  let duplicateFallback: SongData | null = null;

  for (const seed of candidates) {
    const key = seedKey(seed);
    try {
      const song = await queryLrclibSeed(seed);
      if (song) {
        if (song.id !== excludeSongId) {
          markKeyPlayed(PLAYED_STORAGE_KEY, key);
          return song;
        }
        duplicateFallback = song;
      }
    } catch {
      // Try next candidate seed
    }
  }

  if (duplicateFallback) {
    return duplicateFallback;
  }

  return pickOfflineFallback(selectedTags, excludeSongId);
}

/**
 * Searches LRCLIB in real time for songs by the given artist/band name and
 * draws a random playable song WITHOUT adding the artist or songs to the base catalog.
 */
export async function fetchRandomSongByArtist(
  artistQuery: string,
  excludeSongId?: string
): Promise<SongData> {
  const trimmedQuery = artistQuery.trim();
  const queryNorm = normalizeWord(trimmedQuery);
  if (!queryNorm) {
    throw new ArtistNotFoundError(trimmedQuery);
  }

  const primaryUrl = `${LRCLIB_SEARCH_URL}?artist_name=${encodeURIComponent(
    trimmedQuery
  )}`;
  let records = await queryLrclibRecords(primaryUrl);

  if (records.length === 0) {
    const fallbackUrl = `${LRCLIB_SEARCH_URL}?q=${encodeURIComponent(trimmedQuery)}`;
    records = await queryLrclibRecords(fallbackUrl);
  }

  const matchingRecords = records.filter((record) => {
    if (record.instrumental) return false;
    const artistName = record.artistName?.trim() ?? '';
    if (!artistName || TRIBUTE_ARTIST_REGEX.test(artistName)) return false;
    const recArtistNorm = normalizeWord(artistName);
    if (!recArtistNorm) return false;
    return (
      recArtistNorm === queryNorm ||
      recArtistNorm.includes(queryNorm) ||
      queryNorm.includes(recArtistNorm)
    );
  });

  const hasExactArtistMatch = matchingRecords.some(
    (record) => normalizeWord(record.artistName ?? '') === queryNorm
  );
  const refinedRecords = hasExactArtistMatch
    ? matchingRecords.filter((record) => {
        const recArtistNorm = normalizeWord(record.artistName ?? '');
        return recArtistNorm === queryNorm || recArtistNorm.startsWith(queryNorm);
      })
    : matchingRecords;

  const deduped = new Map<
    string,
    { song: SongData; score: number; canonicalKey: string }
  >();

  for (const record of refinedRecords) {
    const title = record.trackName?.trim() ?? '';
    const artist = record.artistName?.trim() ?? trimmedQuery;
    if (!title) continue;

    const cleanedLyrics = cleanLyrics(record.plainLyrics, record.syncedLyrics);
    const wordCount = countLyricsWords(cleanedLyrics);
    if (wordCount < MIN_LYRICS_WORDS || wordCount > MAX_LYRICS_WORDS) {
      continue;
    }

    const canonicalKey = canonicalSongKey(artist, title);
    const score = scoreBaseRecord(record, cleanedLyrics);
    const song: SongData = {
      id: `lrclib-${record.id ?? canonicalKey}`,
      title,
      artist,
      album: record.albumName?.trim() || undefined,
      lang: inferSongLanguage(cleanedLyrics),
      lyrics: cleanedLyrics,
      source: 'lrclib',
      drawMode: 'artist',
    };

    const existing = deduped.get(canonicalKey);
    if (!existing || score > existing.score) {
      deduped.set(canonicalKey, { song, score, canonicalKey });
    }
  }

  const uniqueEntries = Array.from(deduped.values());
  if (uniqueEntries.length === 0) {
    throw new ArtistNotFoundError(trimmedQuery);
  }

  const playedKeys = loadPlayedKeys(ARTIST_PLAYED_STORAGE_KEY);
  let unplayed = uniqueEntries.filter(
    (entry) =>
      !playedKeys.has(entry.canonicalKey) && entry.song.id !== excludeSongId
  );

  if (unplayed.length === 0) {
    const currentArtistKeys = new Set(uniqueEntries.map((e) => e.canonicalKey));
    const cleared = new Set(
      Array.from(playedKeys).filter((key) => !currentArtistKeys.has(key))
    );
    savePlayedKeys(ARTIST_PLAYED_STORAGE_KEY, cleared);

    const nonSame = uniqueEntries.filter(
      (entry) => entry.song.id !== excludeSongId
    );
    unplayed = nonSame.length > 0 ? nonSame : uniqueEntries;
  }

  const chosen = pickRandomItem(unplayed);
  markKeyPlayed(ARTIST_PLAYED_STORAGE_KEY, chosen.canonicalKey);
  return chosen.song;
}
