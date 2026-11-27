import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CompletionBanner } from './components/CompletionBanner';
import { GameControls } from './components/GameControls';
import { Header } from './components/Header';
import { LyricsBoard } from './components/LyricsBoard';
import { MysteryCard } from './components/MysteryCard';
import {
  areFilterSetsEqual,
  DEFAULT_FILTER_TAGS,
  filterCatalogTracks,
  toggleFilterTag,
} from './engine/catalogFilter';
import { normalizeWord } from './engine/normalize';
import { parseLyrics } from './engine/tokenizer';
import {
  ArtistNotFoundError,
  EmptyFilterPoolError,
  fetchCatalogTracks,
  fetchRandomMysterySong,
  fetchRandomSongByArtist,
} from './services/lrclib';
import {
  FilterTag,
  GameStatus,
  ParsedLyrics,
  RevealSource,
  SeedTrack,
  SongData,
  ThemeMode,
} from './types/game';

const THEME_STORAGE_KEY = 'complete-musica-theme';

function getInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }

  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

export function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [selectedTags, setSelectedTags] = useState<FilterTag[]>(() => [
    ...DEFAULT_FILTER_TAGS,
  ]);
  const [appliedTags, setAppliedTags] = useState<FilterTag[]>(() => [
    ...DEFAULT_FILTER_TAGS,
  ]);
  const [catalogMeta, setCatalogMeta] = useState<
    Array<Pick<SeedTrack, 'lang' | 'tags'>> | null
  >(null);
  const [activeArtist, setActiveArtist] = useState<string | null>(null);
  const [song, setSong] = useState<SongData | null>(null);
  const [parsedLyrics, setParsedLyrics] = useState<ParsedLyrics | null>(null);
  const [revealState, setRevealState] = useState<RevealSource[]>([]);
  const [gameStatus, setGameStatus] = useState<GameStatus>('loading');
  const [isSearchingArtist, setIsSearchingArtist] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [lastRevealedIds, setLastRevealedIds] = useState<Set<number>>(new Set());
  const [lastMatchCount, setLastMatchCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [artistNotice, setArtistNotice] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const requestCounterRef = useRef(0);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentSongIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    if ((gameStatus === 'won' || gameStatus === 'gave_up') && song) {
      document.title = `${song.title} — ${song.artist} | Complete a Música`;
    } else {
      document.title = 'Complete a Música';
    }
  }, [gameStatus, song]);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) {
        clearTimeout(pulseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    void fetchCatalogTracks().then((tracks) => {
      if (!active) return;
      // Store only non-spoiler language/tag metadata for instant filter counting
      setCatalogMeta(tracks.map((t) => ({ lang: t.lang, tags: t.tags })));
    });
    return () => {
      active = false;
    };
  }, []);

  const applyLoadedSong = useCallback((nextSong: SongData) => {
    const parsed = parseLyrics(nextSong.lyrics);
    if (parsed.segments.length === 0) {
      throw new Error('A letra retornada não possui palavras jogáveis.');
    }

    currentSongIdRef.current = nextSong.id;
    setSong(nextSong);
    setParsedLyrics(parsed);
    setRevealState(new Array<RevealSource>(parsed.segments.length).fill('hidden'));
    setHintUsed(false);
    setInputValue('');
    setLastRevealedIds(new Set());
    setLastMatchCount(0);
    setGameStatus('playing');
  }, []);

  const loadSong = useCallback(
    async (targetTags: readonly FilterTag[]) => {
      const requestId = ++requestCounterRef.current;
      const hadActiveSong = Boolean(parsedLyrics && song);
      setArtistNotice(null);
      setErrorMsg(null);
      setIsSearchingArtist(false);

      if (!hadActiveSong) {
        setGameStatus('loading');
      } else {
        setGameStatus('loading');
      }

      try {
        const nextSong = await fetchRandomMysterySong(
          targetTags,
          currentSongIdRef.current
        );
        if (requestId !== requestCounterRef.current) {
          return;
        }
        setActiveArtist(null);
        setAppliedTags([...targetTags]);
        applyLoadedSong(nextSong);
      } catch (err) {
        if (requestId !== requestCounterRef.current) {
          return;
        }
        if (err instanceof EmptyFilterPoolError) {
          if (hadActiveSong) {
            setArtistNotice(err.message);
            setGameStatus('playing');
            return;
          }
          setErrorMsg(err.message);
          setGameStatus('error');
          return;
        }
        setErrorMsg('Não foi possível carregar uma música no momento. Tente novamente.');
        setGameStatus('error');
      }
    },
    [applyLoadedSong, parsedLyrics, song]
  );

  const handleDrawByArtist = useCallback(
    async (artistName: string) => {
      const requestId = ++requestCounterRef.current;
      const hadActiveSong = Boolean(parsedLyrics && song);
      setArtistNotice(null);
      setErrorMsg(null);

      if (hadActiveSong) {
        setIsSearchingArtist(true);
      } else {
        setGameStatus('loading');
      }

      try {
        const nextSong = await fetchRandomSongByArtist(
          artistName,
          currentSongIdRef.current
        );
        if (requestId !== requestCounterRef.current) {
          return;
        }
        setActiveArtist(nextSong.artist);
        applyLoadedSong(nextSong);
      } catch (err) {
        if (requestId !== requestCounterRef.current) {
          return;
        }
        const message =
          err instanceof ArtistNotFoundError
            ? err.message
            : `Erro ao buscar músicas de "${artistName}" no LRCLIB. Tente novamente.`;

        if (hadActiveSong) {
          setArtistNotice(message);
        } else {
          setErrorMsg(message);
          setGameStatus('error');
        }
      } finally {
        if (requestId === requestCounterRef.current) {
          setIsSearchingArtist(false);
        }
      }
    },
    [applyLoadedSong, parsedLyrics, song]
  );

  useEffect(() => {
    void loadSong(DEFAULT_FILTER_TAGS);
    // Initial draw runs once on mount with default filters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (gameStatus === 'playing' && !isSearchingArtist) {
      inputRef.current?.focus();
    }
  }, [gameStatus, isSearchingArtist, song?.id]);

  const playerFoundCount = useMemo(
    () => revealState.filter((status) => status === 'player').length,
    [revealState]
  );

  const totalCount = parsedLyrics?.segments.length ?? 0;

  const matchingSongCount = useMemo(() => {
    if (!catalogMeta) return null;
    return filterCatalogTracks(catalogMeta, selectedTags).length;
  }, [catalogMeta, selectedTags]);

  const hasPendingFilterChanges = useMemo(
    () => !areFilterSetsEqual(selectedTags, appliedTags),
    [selectedTags, appliedTags]
  );

  const handleToggleTag = (tag: FilterTag) => {
    setArtistNotice(null);
    if (activeArtist) {
      setActiveArtist(null);
    }
    setSelectedTags((prev) => toggleFilterTag(prev, tag));
  };

  const handleSelectAll = () => {
    setArtistNotice(null);
    setActiveArtist(null);
    setSelectedTags([]);
  };

  const handleResetDefaultFilters = () => {
    setArtistNotice(null);
    setActiveArtist(null);
    setSelectedTags([...DEFAULT_FILTER_TAGS]);
  };

  const handleApplyFilters = () => {
    void loadSong(selectedTags);
  };

  const handleNewSong = () => {
    if (activeArtist && !hasPendingFilterChanges) {
      void handleDrawByArtist(activeArtist);
    } else {
      void loadSong(selectedTags);
    }
  };

  const handleClearArtistMode = () => {
    void loadSong(selectedTags);
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleRequestHint = () => {
    if (gameStatus !== 'playing') return;
    setHintUsed(true);
    inputRef.current?.focus();
  };

  const handleGiveUp = () => {
    if (gameStatus !== 'playing') return;
    setRevealState((prev) =>
      prev.map((status) => (status === 'hidden' ? 'gave_up' : status))
    );
    setGameStatus('gave_up');
    setInputValue('');
  };

  const handleInputChange = (rawValue: string) => {
    if (gameStatus !== 'playing' || !parsedLyrics) {
      return;
    }

    const norm = normalizeWord(rawValue);
    if (norm.length > 0) {
      const candidateIds = parsedLyrics.keyToSegmentIds[norm] ?? [];
      const newlyRevealedIds = candidateIds.filter(
        (id) => revealState[id] === 'hidden'
      );

      if (newlyRevealedIds.length > 0) {
        const nextRevealState = [...revealState];
        for (const id of newlyRevealedIds) {
          nextRevealState[id] = 'player';
        }

        setRevealState(nextRevealState);
        setLastRevealedIds(new Set(newlyRevealedIds));
        setLastMatchCount(newlyRevealedIds.length);
        setInputValue('');

        if (pulseTimerRef.current) {
          clearTimeout(pulseTimerRef.current);
        }
        pulseTimerRef.current = setTimeout(() => {
          setLastRevealedIds(new Set());
        }, 800);

        if (nextRevealState.every((status) => status !== 'hidden')) {
          setGameStatus('won');
        }
        return;
      }
    }

    setInputValue(rawValue);
  };

  return (
    <div className="app-shell">
      <div className="app-container">
        <Header
          selectedTags={selectedTags}
          hasPendingFilterChanges={hasPendingFilterChanges}
          matchingSongCount={matchingSongCount}
          activeArtist={activeArtist}
          theme={theme}
          isLoading={gameStatus === 'loading' || isSearchingArtist}
          onToggleTag={handleToggleTag}
          onSelectAll={handleSelectAll}
          onResetDefaultFilters={handleResetDefaultFilters}
          onApplyFilters={handleApplyFilters}
          onDrawByArtist={(artist) => void handleDrawByArtist(artist)}
          onClearArtistMode={handleClearArtistMode}
          onNewSong={handleNewSong}
          onToggleTheme={handleToggleTheme}
        />

        {artistNotice && (
          <div className="artist-alert" role="alert">
            <span>{artistNotice}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setArtistNotice(null)}
              aria-label="Fechar aviso"
            >
              Fechar
            </button>
          </div>
        )}

        <main className="main-content">
          {gameStatus === 'loading' && (
            <div className="status-card" role="status" aria-live="polite">
              <div className="spinner" aria-hidden="true" />
              <p>Sorteando uma música misteriosa...</p>
            </div>
          )}

          {gameStatus === 'error' && (
            <div className="status-card error-card" role="alert">
              <p>{errorMsg}</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void loadSong(selectedTags)}
              >
                Tentar Novamente
              </button>
            </div>
          )}

          {gameStatus !== 'loading' && gameStatus !== 'error' && parsedLyrics && (
            <>
              <MysteryCard
                song={song}
                gameStatus={gameStatus}
                hintUsed={hintUsed}
                onRequestHint={handleRequestHint}
              />

              <CompletionBanner
                gameStatus={gameStatus}
                song={song}
                playerFoundCount={playerFoundCount}
                totalCount={totalCount}
                hintUsed={hintUsed}
                onNewSong={handleNewSong}
              />

              <GameControls
                inputValue={inputValue}
                inputRef={inputRef}
                gameStatus={gameStatus}
                revealedCount={playerFoundCount}
                totalCount={totalCount}
                lastMatchCount={lastMatchCount}
                onInputChange={handleInputChange}
                onGiveUp={handleGiveUp}
              />

              <LyricsBoard
                lines={parsedLyrics.lines}
                revealState={revealState}
                lastRevealedIds={lastRevealedIds}
                gameStatus={gameStatus}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
