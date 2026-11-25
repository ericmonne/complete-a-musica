export type SongLanguage = 'pt' | 'en' | 'es';

export type CategoryId = 'all' | 'pt' | 'en' | 'es' | 'rock_pop' | 'classics';

export type ThemeMode = 'light' | 'dark';

export type RevealSource = 'hidden' | 'player' | 'gave_up';

export type GameStatus = 'loading' | 'playing' | 'won' | 'gave_up' | 'error';

export interface WordSegment {
  id: number;
  acceptedKeys: string[];
}

export type CompoundSubItem =
  | { type: 'part'; segmentId: number; text: string }
  | { type: 'punct'; text: string };

export type LineToken =
  | { type: 'space'; text: string }
  | { type: 'punct'; text: string }
  | { type: 'compound'; items: CompoundSubItem[] };

export interface ParsedLyrics {
  lines: LineToken[][];
  segments: WordSegment[];
  keyToSegmentIds: Record<string, number[]>;
}

export interface SongData {
  id: string;
  title: string;
  artist: string;
  album?: string;
  lang: SongLanguage;
  lyrics: string;
  source: 'lrclib' | 'offline';
  drawMode?: 'catalog' | 'artist';
}

export interface SeedTrack {
  artist: string;
  track: string;
  lang: SongLanguage;
  tags: Exclude<CategoryId, 'all'>[];
}

export interface CatalogTrack extends SeedTrack {
  id: string;
  addedAt: string;
}
