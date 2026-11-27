import { describe, expect, it } from 'vitest';
import {
  areFilterSetsEqual,
  DEFAULT_FILTER_TAGS,
  filterCatalogTracks,
  matchesFilterTags,
  toggleFilterTag,
} from '../catalogFilter';
import { SeedTrack } from '../../types/game';

const SAMPLE: SeedTrack[] = [
  { artist: 'Legião Urbana', track: 'Tempo Perdido', lang: 'pt', tags: ['pt', 'rock_pop', '80s'] },
  { artist: 'Queen', track: "Don't Stop Me Now", lang: 'en', tags: ['en', 'rock_pop', '70s'] },
  { artist: 'Soda Stereo', track: 'De Música Ligera', lang: 'es', tags: ['es', 'rock_pop', '90s'] },
  { artist: 'Eminem', track: 'Lose Yourself', lang: 'en', tags: ['en', 'rap', '2000s'] },
  { artist: 'Racionais', track: 'Negro Drama', lang: 'pt', tags: ['pt', 'rap', '2000s'] },
  { artist: 'Caetano Veloso', track: 'Sozinho', lang: 'pt', tags: ['pt', 'mpb', '90s'] },
  { artist: 'Leandro & Leonardo', track: 'Pense em Mim', lang: 'pt', tags: ['pt', 'sertanejo', '90s'] },
  { artist: 'Idina Menzel', track: 'Let It Go', lang: 'en', tags: ['en', 'soundtracks', '2010s'] },
  { artist: 'Cult Gem', track: 'Hidden Gem', lang: 'pt', tags: ['pt', 'creators_pick', '90s'] },
];

describe('catalogFilter', () => {
  it('matches default filter (pt + en + rock_pop) and excludes es and pure rap', () => {
    const matched = filterCatalogTracks(SAMPLE, DEFAULT_FILTER_TAGS).map((t) => t.track);
    expect(matched).toEqual(['Tempo Perdido', "Don't Stop Me Now"]);
  });

  it('supports multi-select across languages and styles (OR within group, AND across groups)', () => {
    const matched = filterCatalogTracks(SAMPLE, ['rock_pop', 'es', 'pt']).map((t) => t.track);
    expect(matched).toEqual(['Tempo Perdido', 'De Música Ligera']);
  });

  it('filters by decade, rap, mpb, sertanejo, soundtracks, and creators_pick', () => {
    expect(filterCatalogTracks(SAMPLE, ['rap']).map((t) => t.track)).toEqual([
      'Lose Yourself',
      'Negro Drama',
    ]);
    expect(filterCatalogTracks(SAMPLE, ['rap', '2000s', 'pt']).map((t) => t.track)).toEqual([
      'Negro Drama',
    ]);
    expect(filterCatalogTracks(SAMPLE, ['mpb']).map((t) => t.track)).toEqual(['Sozinho']);
    expect(filterCatalogTracks(SAMPLE, ['sertanejo']).map((t) => t.track)).toEqual([
      'Pense em Mim',
    ]);
    expect(filterCatalogTracks(SAMPLE, ['mpb', 'sertanejo']).map((t) => t.track)).toEqual([
      'Sozinho',
      'Pense em Mim',
    ]);
    expect(filterCatalogTracks(SAMPLE, ['soundtracks']).map((t) => t.track)).toEqual([
      'Let It Go',
    ]);
    expect(filterCatalogTracks(SAMPLE, ['classics', 'soundtracks']).map((t) => t.track)).toEqual([
      'Let It Go',
    ]);
    expect(filterCatalogTracks(SAMPLE, ['creators_pick']).map((t) => t.track)).toEqual([
      'Hidden Gem',
    ]);
  });

  it('matches all tracks when selectedTags is empty', () => {
    expect(matchesFilterTags(SAMPLE[3], [])).toBe(true);
    expect(filterCatalogTracks(SAMPLE, [])).toHaveLength(SAMPLE.length);
  });

  it('toggles and compares filter tag sets cleanly', () => {
    const toggled = toggleFilterTag(DEFAULT_FILTER_TAGS, 'es');
    expect(toggled).toEqual(['pt', 'en', 'rock_pop', 'es']);
    expect(toggleFilterTag(toggled, 'pt')).toEqual(['en', 'rock_pop', 'es']);
    expect(areFilterSetsEqual(['pt', 'en'], ['en', 'pt'])).toBe(true);
    expect(areFilterSetsEqual(['pt'], ['pt', 'en'])).toBe(false);
  });
});
