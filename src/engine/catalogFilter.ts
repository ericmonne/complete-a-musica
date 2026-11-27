import {
  DecadeTag,
  FilterTag,
  SeedTrack,
  SongLanguage,
  StyleTag,
} from '../types/game';

export const LANGUAGE_TAGS: readonly SongLanguage[] = ['pt', 'en', 'es'];

export const STYLE_TAGS: readonly StyleTag[] = [
  'rock_pop',
  'rap',
  'mpb',
  'sertanejo',
  'classics',
  'soundtracks',
  'creators_pick',
];

export const DECADE_TAGS: readonly DecadeTag[] = [
  '60s_before',
  '70s',
  '80s',
  '90s',
  '2000s',
  '2010s',
  '2020s',
];

export const ALL_FILTER_TAGS: readonly FilterTag[] = [
  ...LANGUAGE_TAGS,
  ...STYLE_TAGS,
  ...DECADE_TAGS,
];

export const DEFAULT_FILTER_TAGS: FilterTag[] = ['pt', 'en', 'rock_pop'];

export const TAG_LABELS: Record<FilterTag, string> = {
  pt: 'Português',
  en: 'Inglês',
  es: 'Espanhol',
  rock_pop: 'Rock & Pop',
  rap: 'Rap',
  mpb: 'MPB',
  sertanejo: 'Sertanejo / Country',
  classics: 'Clássicos',
  soundtracks: 'Trilhas Sonoras',
  creators_pick: 'Seleção dos Criadores',
  '60s_before': 'Até anos 60',
  '70s': 'Anos 70',
  '80s': 'Anos 80',
  '90s': 'Anos 90',
  '2000s': 'Anos 2000',
  '2010s': 'Anos 2010',
  '2020s': 'Anos 2020',
};

export interface FilterGroupOption {
  id: FilterTag;
  label: string;
}

export interface FilterGroup {
  id: 'language' | 'style' | 'decade';
  label: string;
  options: FilterGroupOption[];
}

export const FILTER_GROUPS: readonly FilterGroup[] = [
  {
    id: 'language',
    label: 'Idioma',
    options: LANGUAGE_TAGS.map((id) => ({ id, label: TAG_LABELS[id] })),
  },
  {
    id: 'style',
    label: 'Estilo / Coleção',
    options: STYLE_TAGS.map((id) => ({ id, label: TAG_LABELS[id] })),
  },
  {
    id: 'decade',
    label: 'Década',
    options: DECADE_TAGS.map((id) => ({ id, label: TAG_LABELS[id] })),
  },
];

const LANGUAGE_SET = new Set<string>(LANGUAGE_TAGS);
const STYLE_SET = new Set<string>(STYLE_TAGS);
const DECADE_SET = new Set<string>(DECADE_TAGS);

/**
 * Checks whether a track matches the selected filter tags using
 * OR within each group (Language, Style, Decade) and AND across active groups.
 * An empty selection matches every track.
 */
export function matchesFilterTags(
  track: Pick<SeedTrack, 'lang' | 'tags'>,
  selectedTags: readonly FilterTag[]
): boolean {
  if (selectedTags.length === 0) {
    return true;
  }

  const trackTags = new Set<string>([track.lang, ...(track.tags ?? [])]);

  const selectedLangs = selectedTags.filter((t) => LANGUAGE_SET.has(t));
  if (selectedLangs.length > 0 && !selectedLangs.some((t) => trackTags.has(t))) {
    return false;
  }

  const selectedStyles = selectedTags.filter((t) => STYLE_SET.has(t));
  if (selectedStyles.length > 0 && !selectedStyles.some((t) => trackTags.has(t))) {
    return false;
  }

  const selectedDecades = selectedTags.filter((t) => DECADE_SET.has(t));
  if (selectedDecades.length > 0 && !selectedDecades.some((t) => trackTags.has(t))) {
    return false;
  }

  return true;
}

export function filterCatalogTracks<T extends Pick<SeedTrack, 'lang' | 'tags'>>(
  tracks: readonly T[],
  selectedTags: readonly FilterTag[]
): T[] {
  return tracks.filter((track) => matchesFilterTags(track, selectedTags));
}

export function toggleFilterTag(
  current: readonly FilterTag[],
  tag: FilterTag
): FilterTag[] {
  if (current.includes(tag)) {
    return current.filter((t) => t !== tag);
  }
  return [...current, tag];
}

export function areFilterSetsEqual(
  a: readonly FilterTag[],
  b: readonly FilterTag[]
): boolean {
  if (a.length !== b.length) {
    const setA = new Set(a);
    const setB = new Set(b);
    if (setA.size !== setB.size) return false;
    for (const item of setA) {
      if (!setB.has(item)) return false;
    }
    return true;
  }
  const setB = new Set(b);
  return a.every((item) => setB.has(item));
}

export function extractDecadeTag(tags: readonly string[]): DecadeTag | '' {
  for (const tag of tags) {
    if (DECADE_SET.has(tag)) {
      return tag as DecadeTag;
    }
  }
  return '';
}
