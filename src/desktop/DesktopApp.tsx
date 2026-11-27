import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  DECADE_TAGS,
  extractDecadeTag,
  STYLE_TAGS,
  TAG_LABELS,
} from '../engine/catalogFilter';
import { cleanLyrics } from '../engine/lyricsCleaner';
import { canonicalSongKey, normalizeWord } from '../engine/normalize';
import {
  countLyricsWords,
  inferSongLanguage,
  LRCLIB_SEARCH_URL,
  LrclibTrackRecord,
  MAX_LYRICS_WORDS,
  MIN_LYRICS_WORDS,
  queryLrclibRecords,
} from '../services/lrclib';
import {
  CatalogTrack,
  DecadeTag,
  FilterTag,
  SongLanguage,
  StyleTag,
  ThemeMode,
} from '../types/game';
import {
  addTrackToGitHubCatalog,
  DuplicateCatalogError,
  findDuplicateTrack,
  GitHubAuthError,
  GitHubNotFoundError,
  removeTrackFromGitHubCatalog,
  updateTrackInGitHubCatalog,
  verifyAndFetchGitHubCatalog,
} from './githubCatalogClient';

declare global {
  interface Window {
    desktopEnv?: {
      defaultApiUrl?: string;
      preconfiguredKey?: string;
      defaultGitHubRepo?: string;
      defaultGitHubBranch?: string;
      preconfiguredGitHubToken?: string;
    };
  }
}

const MODE_STORAGE_KEY = 'cam-desktop-mode';
const API_URL_STORAGE_KEY = 'cam-desktop-api-url';
const ADMIN_KEY_STORAGE_KEY = 'cam-desktop-admin-key';
const GH_REPO_STORAGE_KEY = 'cam-desktop-gh-repo';
const GH_BRANCH_STORAGE_KEY = 'cam-desktop-gh-branch';
const GH_TOKEN_STORAGE_KEY = 'cam-desktop-gh-token';
const DESKTOP_THEME_KEY = 'cam-desktop-theme';

type ConnectionMode = 'github' | 'local';

type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'invalid_key'
  | 'unreachable';

type CatalogFilterValue = 'all' | 'no_decade' | FilterTag;

interface LrclibSearchCandidate {
  key: string;
  artist: string;
  track: string;
  album?: string;
  wordCount: number;
  playable: boolean;
  instrumental: boolean;
  cleanedLyrics: string;
  lang: SongLanguage;
  styleTags: StyleTag[];
  decade: DecadeTag | '';
}

function readStorage(key: string, fallback = ''): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors
  }
}

function getInitialMode(): ConnectionMode {
  const saved = readStorage(MODE_STORAGE_KEY);
  return saved === 'local' ? 'local' : 'github';
}

function getInitialTheme(): ThemeMode {
  const saved = readStorage(DESKTOP_THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

function composeTrackTags(
  lang: SongLanguage,
  styleTags: readonly StyleTag[],
  decade: DecadeTag | ''
): FilterTag[] {
  const tags: FilterTag[] = [lang, ...styleTags];
  if (decade) {
    tags.push(decade);
  }
  return Array.from(new Set(tags));
}

function toggleStyleInList(list: readonly StyleTag[], tag: StyleTag): StyleTag[] {
  return list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag];
}

export function DesktopApp() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [mode, setMode] = useState<ConnectionMode>(getInitialMode);

  // Local server mode credentials
  const [apiUrl, setApiUrl] = useState<string>(
    () =>
      readStorage(API_URL_STORAGE_KEY) ||
      window.desktopEnv?.defaultApiUrl ||
      'http://127.0.0.1:3001'
  );
  const [adminKey, setAdminKey] = useState<string>(
    () =>
      readStorage(ADMIN_KEY_STORAGE_KEY) ||
      window.desktopEnv?.preconfiguredKey ||
      ''
  );
  const [showLocalKey, setShowLocalKey] = useState(false);

  // GitHub Pages mode credentials
  const [ghRepo, setGhRepo] = useState<string>(
    () =>
      readStorage(GH_REPO_STORAGE_KEY) ||
      window.desktopEnv?.defaultGitHubRepo ||
      ''
  );
  const [ghBranch, setGhBranch] = useState<string>(
    () =>
      readStorage(GH_BRANCH_STORAGE_KEY) ||
      window.desktopEnv?.defaultGitHubBranch ||
      ''
  );
  const [ghToken, setGhToken] = useState<string>(
    () =>
      readStorage(GH_TOKEN_STORAGE_KEY) ||
      window.desktopEnv?.preconfiguredGitHubToken ||
      ''
  );
  const [showGhToken, setShowGhToken] = useState(false);
  const [connectedGitHubInfo, setConnectedGitHubInfo] = useState<string>('');

  const [connState, setConnState] = useState<ConnectionState>('disconnected');
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [catalogTracks, setCatalogTracks] = useState<CatalogTrack[]>([]);

  // LRCLIB search state
  const [lrclibQuery, setLrclibQuery] = useState('');
  const [isSearchingLrclib, setIsSearchingLrclib] = useState(false);
  const [lrclibResults, setLrclibResults] = useState<LrclibSearchCandidate[]>([]);
  const [lrclibSearched, setLrclibSearched] = useState(false);
  const [expandedPreviewKey, setExpandedPreviewKey] = useState<string | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  // Manual form state
  const [manualArtist, setManualArtist] = useState('');
  const [manualTrack, setManualTrack] = useState('');
  const [manualLang, setManualLang] = useState<SongLanguage>('pt');
  const [manualStyleTags, setManualStyleTags] = useState<StyleTag[]>(['rock_pop']);
  const [manualDecade, setManualDecade] = useState<DecadeTag | ''>('');
  const [isAddingManual, setIsAddingManual] = useState(false);

  // Catalog filter, inline editing & removal state
  const [catalogFilter, setCatalogFilter] = useState('');
  const [catalogCategory, setCatalogCategory] =
    useState<CatalogFilterValue>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editLang, setEditLang] = useState<SongLanguage>('pt');
  const [editStyleTags, setEditStyleTags] = useState<StyleTag[]>([]);
  const [editDecade, setEditDecade] = useState<DecadeTag | ''>('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeStorage(DESKTOP_THEME_KEY, theme);
  }, [theme]);

  const normalizedBaseUrl = useMemo(() => apiUrl.trim().replace(/\/+$/, ''), [apiUrl]);

  const connectLocalServer = useCallback(
    async (targetUrl: string, targetKey: string) => {
      const cleanUrl = targetUrl.trim().replace(/\/+$/, '');
      const cleanKey = targetKey.trim();
      if (!cleanUrl) {
        setConnState('unreachable');
        return;
      }

      writeStorage(API_URL_STORAGE_KEY, cleanUrl);
      writeStorage(ADMIN_KEY_STORAGE_KEY, cleanKey);

      setConnState('connecting');
      setStatusFeedback(null);

      try {
        const authRes = await fetch(`${cleanUrl}/api/auth/verify`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cleanKey}`,
          },
        });

        if (authRes.status === 401) {
          setConnState('invalid_key');
          return;
        }
        if (!authRes.ok) {
          setConnState('unreachable');
          return;
        }

        const catRes = await fetch(`${cleanUrl}/api/catalog`, {
          cache: 'no-store',
        });
        if (!catRes.ok) {
          setConnState('unreachable');
          return;
        }
        const catData = (await catRes.json()) as { tracks?: CatalogTrack[] };
        setCatalogTracks(Array.isArray(catData.tracks) ? catData.tracks : []);
        setConnState('connected');
      } catch {
        setConnState('unreachable');
      }
    },
    []
  );

  const connectGitHub = useCallback(
    async (targetRepo: string, targetBranch: string, targetToken: string) => {
      const cleanRepo = targetRepo.trim();
      const cleanBranch = targetBranch.trim();
      const cleanToken = targetToken.trim();

      writeStorage(GH_REPO_STORAGE_KEY, cleanRepo);
      writeStorage(GH_BRANCH_STORAGE_KEY, cleanBranch);
      writeStorage(GH_TOKEN_STORAGE_KEY, cleanToken);

      setConnState('connecting');
      setStatusFeedback(null);

      try {
        const snapshot = await verifyAndFetchGitHubCatalog({
          repoInput: cleanRepo,
          branch: cleanBranch,
          token: cleanToken,
        });
        setCatalogTracks(snapshot.tracks);
        setConnectedGitHubInfo(`${snapshot.repoSlug}@${snapshot.branch}`);
        if (!cleanBranch && snapshot.branch) {
          setGhBranch(snapshot.branch);
          writeStorage(GH_BRANCH_STORAGE_KEY, snapshot.branch);
        }
        setConnState('connected');
      } catch (err) {
        if (err instanceof GitHubAuthError) {
          setConnState('invalid_key');
          setStatusFeedback({ type: 'error', text: err.message });
        } else if (err instanceof GitHubNotFoundError) {
          setConnState('unreachable');
          setStatusFeedback({ type: 'error', text: err.message });
        } else {
          setConnState('unreachable');
          setStatusFeedback({
            type: 'error',
            text:
              err instanceof Error
                ? err.message
                : 'Erro ao conectar ao GitHub.',
          });
        }
      }
    },
    []
  );

  useEffect(() => {
    if (mode === 'github') {
      if (ghRepo.trim() && ghToken.trim()) {
        void connectGitHub(ghRepo, ghBranch, ghToken);
      }
    } else if (apiUrl.trim() && adminKey.trim()) {
      void connectLocalServer(apiUrl, adminKey);
    }
    // Auto-connect only on initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleModeSwitch = (nextMode: ConnectionMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    writeStorage(MODE_STORAGE_KEY, nextMode);
    setConnState('disconnected');
    setCatalogTracks([]);
    setStatusFeedback(null);
    setConfirmDeleteId(null);
    setEditingTrackId(null);
  };

  const postTrackToCatalog = async (payload: {
    artist: string;
    track: string;
    lang: SongLanguage;
    tags: FilterTag[];
  }): Promise<boolean> => {
    setStatusFeedback(null);

    if (mode === 'github') {
      try {
        const result = await addTrackToGitHubCatalog({
          repoInput: ghRepo,
          branch: ghBranch,
          token: ghToken,
          payload,
        });
        setCatalogTracks(result.tracks);
        setStatusFeedback({
          type: 'success',
          text: `Salvo no GitHub: ${result.track.artist} — ${result.track.track}. O GitHub Pages atualizará o site em cerca de 30–45 segundos.`,
        });
        return true;
      } catch (err) {
        if (err instanceof GitHubAuthError) {
          setConnState('invalid_key');
        }
        if (err instanceof DuplicateCatalogError) {
          setStatusFeedback({ type: 'error', text: err.message });
          return false;
        }
        setStatusFeedback({
          type: 'error',
          text:
            err instanceof Error
              ? err.message
              : 'Falha ao salvar música no GitHub.',
        });
        return false;
      }
    }

    try {
      const res = await fetch(`${normalizedBaseUrl}/api/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminKey.trim()}`,
        },
        body: JSON.stringify({
          artist: payload.artist,
          track: payload.track,
          lang: payload.lang,
          tags: payload.tags,
        }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        track?: CatalogTrack;
        error?: string;
      };

      if (res.status === 401) {
        setConnState('invalid_key');
        setStatusFeedback({
          type: 'error',
          text: body.error || 'Chave de acesso inválida.',
        });
        return false;
      }

      if (res.status === 409) {
        setStatusFeedback({
          type: 'error',
          text: body.error || 'Esta música já está cadastrada no catálogo.',
        });
        return false;
      }

      if (!res.ok || !body.track) {
        setStatusFeedback({
          type: 'error',
          text: body.error || 'Falha ao adicionar música.',
        });
        return false;
      }

      const addedTrack = body.track;
      setCatalogTracks((prev) =>
        prev.some((t) => t.id === addedTrack.id) ? prev : [...prev, addedTrack]
      );
      setStatusFeedback({
        type: 'success',
        text: `Adicionada ao catálogo: ${addedTrack.artist} — ${addedTrack.track}`,
      });
      return true;
    } catch {
      setStatusFeedback({
        type: 'error',
        text: 'Erro de conexão ao salvar no servidor de catálogo.',
      });
      return false;
    }
  };

  const handleSearchLrclib = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = lrclibQuery.trim();
    if (!trimmed) return;

    setIsSearchingLrclib(true);
    setLrclibSearched(false);
    setExpandedPreviewKey(null);
    setStatusFeedback(null);

    try {
      const url = `${LRCLIB_SEARCH_URL}?q=${encodeURIComponent(trimmed)}`;
      const records: LrclibTrackRecord[] = await queryLrclibRecords(url);

      const mapped: LrclibSearchCandidate[] = records.slice(0, 20).map((rec, index) => {
        const artist = rec.artistName?.trim() || 'Desconhecido';
        const track = rec.trackName?.trim() || 'Sem título';
        const cleanedLyrics = cleanLyrics(rec.plainLyrics, rec.syncedLyrics);
        const wordCount = countLyricsWords(cleanedLyrics);
        const instrumental = Boolean(rec.instrumental);
        const playable =
          !instrumental &&
          wordCount >= MIN_LYRICS_WORDS &&
          wordCount <= MAX_LYRICS_WORDS;
        const lang: SongLanguage = inferSongLanguage(cleanedLyrics);

        return {
          key: `${rec.id ?? index}-${canonicalSongKey(artist, track)}`,
          artist,
          track,
          album: rec.albumName?.trim() || undefined,
          wordCount,
          playable,
          instrumental,
          cleanedLyrics,
          lang,
          styleTags: ['rock_pop'],
          decade: '',
        };
      });

      setLrclibResults(mapped);
    } catch {
      setLrclibResults([]);
      setStatusFeedback({
        type: 'error',
        text: 'Não foi possível consultar o LRCLIB agora.',
      });
    } finally {
      setIsSearchingLrclib(false);
      setLrclibSearched(true);
    }
  };

  const handleUpdateLrclibCandidate = (
    key: string,
    updater: (prev: LrclibSearchCandidate) => LrclibSearchCandidate
  ) => {
    setLrclibResults((prev) =>
      prev.map((item) => (item.key === key ? updater(item) : item))
    );
  };

  const handleAddFromLrclib = async (candidate: LrclibSearchCandidate) => {
    setAddingKey(candidate.key);
    try {
      await postTrackToCatalog({
        artist: candidate.artist,
        track: candidate.track,
        lang: candidate.lang,
        tags: composeTrackTags(candidate.lang, candidate.styleTags, candidate.decade),
      });
    } finally {
      setAddingKey(null);
    }
  };

  const manualDuplicate = useMemo(
    () => findDuplicateTrack(catalogTracks, manualArtist, manualTrack),
    [catalogTracks, manualArtist, manualTrack]
  );

  const handleManualSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (
      !manualArtist.trim() ||
      !manualTrack.trim() ||
      manualDuplicate ||
      connState !== 'connected'
    ) {
      return;
    }

    setIsAddingManual(true);
    try {
      const ok = await postTrackToCatalog({
        artist: manualArtist.trim(),
        track: manualTrack.trim(),
        lang: manualLang,
        tags: composeTrackTags(manualLang, manualStyleTags, manualDecade),
      });
      if (ok) {
        setManualArtist('');
        setManualTrack('');
      }
    } finally {
      setIsAddingManual(false);
    }
  };

  const handleStartEdit = (item: CatalogTrack) => {
    setConfirmDeleteId(null);
    setEditingTrackId(item.id);
    setEditLang(item.lang);
    setEditStyleTags(
      STYLE_TAGS.filter((styleTag) => item.tags.includes(styleTag))
    );
    setEditDecade(extractDecadeTag(item.tags));
  };

  const handleSaveEdit = async (id: string) => {
    setStatusFeedback(null);
    setIsSavingEdit(true);
    const nextTags = composeTrackTags(editLang, editStyleTags, editDecade);

    try {
      if (mode === 'github') {
        const result = await updateTrackInGitHubCatalog({
          repoInput: ghRepo,
          branch: ghBranch,
          token: ghToken,
          id,
          updates: { lang: editLang, tags: nextTags },
        });
        setCatalogTracks(result.tracks);
        setEditingTrackId(null);
        setStatusFeedback({
          type: 'success',
          text: `Tags atualizadas no GitHub: ${result.track.artist} — ${result.track.track}.`,
        });
        return;
      }

      const res = await fetch(
        `${normalizedBaseUrl}/api/catalog/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminKey.trim()}`,
          },
          body: JSON.stringify({ lang: editLang, tags: nextTags }),
        }
      );

      if (res.status === 401) {
        setConnState('invalid_key');
        return;
      }

      const body = (await res.json().catch(() => ({}))) as {
        track?: CatalogTrack;
        error?: string;
      };

      if (!res.ok || !body.track) {
        setStatusFeedback({
          type: 'error',
          text: body.error || 'Falha ao atualizar tags da música.',
        });
        return;
      }

      const updatedTrack = body.track;
      setCatalogTracks((prev) =>
        prev.map((item) => (item.id === id ? updatedTrack : item))
      );
      setEditingTrackId(null);
      setStatusFeedback({
        type: 'success',
        text: `Tags atualizadas: ${updatedTrack.artist} — ${updatedTrack.track}`,
      });
    } catch (err) {
      if (err instanceof GitHubAuthError) {
        setConnState('invalid_key');
      }
      setStatusFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Erro ao atualizar tags da música.',
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteTrack = async (id: string) => {
    setStatusFeedback(null);

    if (mode === 'github') {
      try {
        const result = await removeTrackFromGitHubCatalog({
          repoInput: ghRepo,
          branch: ghBranch,
          token: ghToken,
          id,
        });
        setCatalogTracks(result.tracks);
        setConfirmDeleteId(null);
        setStatusFeedback({
          type: 'success',
          text: 'Música removida no GitHub. O GitHub Pages atualizará o site em cerca de 30–45 segundos.',
        });
      } catch (err) {
        if (err instanceof GitHubAuthError) {
          setConnState('invalid_key');
        }
        setStatusFeedback({
          type: 'error',
          text:
            err instanceof Error
              ? err.message
              : 'Erro ao remover música no GitHub.',
        });
      }
      return;
    }

    try {
      const res = await fetch(
        `${normalizedBaseUrl}/api/catalog/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${adminKey.trim()}`,
          },
        }
      );

      if (res.status === 401) {
        setConnState('invalid_key');
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStatusFeedback({
          type: 'error',
          text: body.error || 'Falha ao remover música.',
        });
        return;
      }

      setCatalogTracks((prev) => prev.filter((t) => t.id !== id));
      setConfirmDeleteId(null);
      setStatusFeedback({
        type: 'success',
        text: 'Música removida do catálogo.',
      });
    } catch {
      setStatusFeedback({
        type: 'error',
        text: 'Erro de conexão ao remover música.',
      });
    }
  };

  const filteredCatalog = useMemo(() => {
    const q = normalizeWord(catalogFilter);
    return [...catalogTracks]
      .reverse()
      .filter((item) => {
        if (catalogCategory === 'no_decade') {
          if (extractDecadeTag(item.tags) !== '') return false;
        } else if (
          catalogCategory !== 'all' &&
          item.lang !== catalogCategory &&
          !item.tags.includes(catalogCategory)
        ) {
          return false;
        }
        if (!q) return true;
        return (
          normalizeWord(item.artist).includes(q) ||
          normalizeWord(item.track).includes(q)
        );
      });
  }, [catalogTracks, catalogCategory, catalogFilter]);

  const isAuthenticated = connState === 'connected';

  return (
    <div className="desktop-shell">
      <div className="desktop-container">
        <header className="desk-card desk-header">
          <div className="desk-header-top">
            <div>
              <h1 className="desk-title">Gerenciador de Catálogo — Complete a Música</h1>
              <p className="desk-subtitle">
                Adicione músicas, defina décadas, estilos (Rock &amp; Pop, Rap &amp;
                Reggaeton, MPB, Sertanejo / Country, Clássicos, Trilhas Sonoras) e marque a
                Seleção dos Criadores.
              </p>
            </div>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
            </button>
          </div>

          <div className="mode-tabs" role="tablist" aria-label="Destino do catálogo">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'github'}
              className={`mode-tab${mode === 'github' ? ' active' : ''}`}
              onClick={() => handleModeSwitch('github')}
            >
              GitHub (GitHub Pages)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'local'}
              className={`mode-tab${mode === 'local' ? ' active' : ''}`}
              onClick={() => handleModeSwitch('local')}
            >
              Servidor Local
            </button>
          </div>

          {mode === 'github' ? (
            <>
              <form
                className="conn-bar conn-bar-gh"
                onSubmit={(e) => {
                  e.preventDefault();
                  void connectGitHub(ghRepo, ghBranch, ghToken);
                }}
              >
                <div className="field-group">
                  <label htmlFor="gh-repo-input">Repositório GitHub</label>
                  <input
                    id="gh-repo-input"
                    type="text"
                    className="desk-input"
                    value={ghRepo}
                    onChange={(e) => setGhRepo(e.target.value)}
                    placeholder="Ex: seu-usuario/complete-a-musica ou URL do repositório"
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="gh-branch-input">Branch</label>
                  <input
                    id="gh-branch-input"
                    type="text"
                    className="desk-input"
                    value={ghBranch}
                    onChange={(e) => setGhBranch(e.target.value)}
                    placeholder="Automático (main/master)"
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="gh-token-input">Token do GitHub (PAT)</label>
                  <div className="key-input-row">
                    <input
                      id="gh-token-input"
                      type={showGhToken ? 'text' : 'password'}
                      className="desk-input"
                      value={ghToken}
                      onChange={(e) => setGhToken(e.target.value)}
                      placeholder="Cole o token github_pat_..."
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowGhToken((prev) => !prev)}
                    >
                      {showGhToken ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>

                <div className="conn-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={connState === 'connecting'}
                  >
                    {connState === 'connecting'
                      ? 'Conectando...'
                      : 'Conectar / Atualizar'}
                  </button>

                  <span className={`status-pill status-${connState}`}>
                    {connState === 'connected' &&
                      `Conectado ao GitHub (${connectedGitHubInfo}) • ${catalogTracks.length} músicas`}
                    {connState === 'connecting' && 'Verificando conexão...'}
                    {connState === 'invalid_key' && 'Token inválido ou sem permissão'}
                    {connState === 'unreachable' &&
                      'Repositório ou GitHub inacessível'}
                    {connState === 'disconnected' && 'Desconectado'}
                  </span>
                </div>
              </form>

              <details className="token-help">
                <summary>
                  Como gerar o Token do GitHub para mim ou outra pessoa?
                </summary>
                <ol>
                  <li>
                    No GitHub, acesse{' '}
                    <strong>
                      Settings → Developer settings → Personal access tokens →
                      Fine-grained tokens → Generate new token
                    </strong>
                    .
                  </li>
                  <li>
                    Em <strong>Repository access</strong>, selecione{' '}
                    <em>Only select repositories</em> e marque apenas o repositório
                    deste jogo.
                  </li>
                  <li>
                    Em <strong>Repository permissions → Contents</strong>, marque{' '}
                    <strong>Read and write</strong>, gere o token e cole acima.
                    Somente quem tiver esse token conseguirá alterar{' '}
                    <code>public/catalog.json</code>.
                  </li>
                </ol>
              </details>
            </>
          ) : (
            <form
              className="conn-bar"
              onSubmit={(e) => {
                e.preventDefault();
                void connectLocalServer(apiUrl, adminKey);
              }}
            >
              <div className="field-group">
                <label htmlFor="api-url-input">URL do Servidor</label>
                <input
                  id="api-url-input"
                  type="text"
                  className="desk-input"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="http://127.0.0.1:3001"
                />
              </div>

              <div className="field-group">
                <label htmlFor="admin-key-input">Chave de Acesso (Admin Key)</label>
                <div className="key-input-row">
                  <input
                    id="admin-key-input"
                    type={showLocalKey ? 'text' : 'password'}
                    className="desk-input"
                    value={adminKey}
                    onChange={(e) => setAdminKey(e.target.value)}
                    placeholder="Cole a CATALOG_ADMIN_KEY..."
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowLocalKey((prev) => !prev)}
                  >
                    {showLocalKey ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>

              <div className="conn-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={connState === 'connecting'}
                >
                  {connState === 'connecting'
                    ? 'Conectando...'
                    : 'Conectar / Atualizar'}
                </button>

                <span className={`status-pill status-${connState}`}>
                  {connState === 'connected' &&
                    `Conectado e autenticado • ${catalogTracks.length} músicas`}
                  {connState === 'connecting' && 'Verificando conexão...'}
                  {connState === 'invalid_key' && 'Chave inválida'}
                  {connState === 'unreachable' && 'Servidor inacessível'}
                  {connState === 'disconnected' && 'Desconectado'}
                </span>
              </div>
            </form>
          )}
        </header>

        {statusFeedback && (
          <div
            className={`feedback-banner feedback-${statusFeedback.type}`}
            role={statusFeedback.type === 'error' ? 'alert' : 'status'}
          >
            <span>{statusFeedback.text}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setStatusFeedback(null)}
            >
              Fechar
            </button>
          </div>
        )}

        <div className="desk-grid">
          <section className="desk-card" aria-label="Buscar no LRCLIB">
            <h2 className="section-title">1. Buscar no LRCLIB e Adicionar</h2>
            <p className="section-hint">
              Pesquise uma música no LRCLIB para conferir a letra e definir idioma, estilo e
              década antes de incluir no catálogo.
            </p>

            <form className="search-row" onSubmit={(e) => void handleSearchLrclib(e)}>
              <input
                type="text"
                className="desk-input"
                value={lrclibQuery}
                onChange={(e) => setLrclibQuery(e.target.value)}
                placeholder="Pesquisar música ou artista no LRCLIB..."
                aria-label="Pesquisar música ou artista no LRCLIB"
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSearchingLrclib || !lrclibQuery.trim()}
              >
                {isSearchingLrclib ? 'Buscando...' : 'Buscar'}
              </button>
            </form>

            {lrclibSearched && lrclibResults.length === 0 && (
              <p className="empty-msg">Nenhum resultado encontrado no LRCLIB.</p>
            )}

            <div className="lrclib-results">
              {lrclibResults.map((item) => {
                const duplicate = findDuplicateTrack(
                  catalogTracks,
                  item.artist,
                  item.track
                );
                const isExpanded = expandedPreviewKey === item.key;

                return (
                  <div key={item.key} className="result-item">
                    <div className="result-main">
                      <div>
                        <strong>{item.track}</strong> — <span>{item.artist}</span>
                        {item.album && <span className="album-name"> ({item.album})</span>}
                      </div>
                      <div className="result-badges">
                        <span
                          className={`mini-badge ${
                            item.playable ? 'badge-ok' : 'badge-warn'
                          }`}
                        >
                          {item.instrumental
                            ? 'Instrumental'
                            : `${item.wordCount} palavras`}
                        </span>
                        {duplicate && (
                          <span className="mini-badge badge-dup">Já no catálogo</span>
                        )}
                      </div>
                    </div>

                    <div className="result-controls">
                      <select
                        aria-label={`Idioma de ${item.track}`}
                        className="desk-select"
                        value={item.lang}
                        onChange={(e) =>
                          handleUpdateLrclibCandidate(item.key, (prev) => ({
                            ...prev,
                            lang: e.target.value as SongLanguage,
                          }))
                        }
                      >
                        <option value="pt">Português</option>
                        <option value="en">Inglês</option>
                        <option value="es">Espanhol</option>
                        <option value="it">Italiano</option>
                      </select>

                      <select
                        aria-label={`Década de ${item.track}`}
                        className="desk-select"
                        value={item.decade}
                        onChange={(e) =>
                          handleUpdateLrclibCandidate(item.key, (prev) => ({
                            ...prev,
                            decade: e.target.value as DecadeTag | '',
                          }))
                        }
                      >
                        <option value="">Sem década</option>
                        {DECADE_TAGS.map((dec) => (
                          <option key={dec} value={dec}>
                            {TAG_LABELS[dec]}
                          </option>
                        ))}
                      </select>

                      {STYLE_TAGS.map((styleTag) => (
                        <label key={styleTag} className="tag-check">
                          <input
                            type="checkbox"
                            checked={item.styleTags.includes(styleTag)}
                            onChange={() =>
                              handleUpdateLrclibCandidate(item.key, (prev) => ({
                                ...prev,
                                styleTags: toggleStyleInList(prev.styleTags, styleTag),
                              }))
                            }
                          />
                          {TAG_LABELS[styleTag]}
                        </label>
                      ))}

                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          setExpandedPreviewKey(isExpanded ? null : item.key)
                        }
                        disabled={!item.cleanedLyrics}
                      >
                        {isExpanded ? 'Ocultar letra' : 'Ver letra'}
                      </button>

                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={
                          !isAuthenticated ||
                          !item.playable ||
                          Boolean(duplicate) ||
                          addingKey === item.key
                        }
                        onClick={() => void handleAddFromLrclib(item)}
                      >
                        {addingKey === item.key
                          ? 'Adicionando...'
                          : duplicate
                          ? 'Já cadastrada'
                          : 'Adicionar ao Catálogo'}
                      </button>
                    </div>

                    {isExpanded && (
                      <pre className="lyrics-preview">{item.cleanedLyrics}</pre>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="desk-card" aria-label="Cadastro manual">
            <h2 className="section-title">2. Cadastro Manual</h2>
            <p className="section-hint">
              Adicione diretamente informando artista e nome exato da música (a letra será
              buscada pelo jogo no LRCLIB).
            </p>

            <form
              className="manual-form"
              onSubmit={(e) => void handleManualSubmit(e)}
            >
              <div className="field-group">
                <label htmlFor="manual-artist-input">Artista / Banda</label>
                <input
                  id="manual-artist-input"
                  type="text"
                  className="desk-input"
                  value={manualArtist}
                  onChange={(e) => setManualArtist(e.target.value)}
                  placeholder="Ex: Gilberto Gil"
                />
              </div>

              <div className="field-group">
                <label htmlFor="manual-track-input">Nome da Música</label>
                <input
                  id="manual-track-input"
                  type="text"
                  className="desk-input"
                  value={manualTrack}
                  onChange={(e) => setManualTrack(e.target.value)}
                  placeholder="Ex: Aquele Abraço"
                />
              </div>

              <div className="manual-meta-row">
                <div className="field-group">
                  <label htmlFor="manual-lang-select">Idioma</label>
                  <select
                    id="manual-lang-select"
                    className="desk-select"
                    value={manualLang}
                    onChange={(e) => setManualLang(e.target.value as SongLanguage)}
                  >
                    <option value="pt">Português</option>
                    <option value="en">Inglês</option>
                    <option value="es">Espanhol</option>
                    <option value="it">Italiano</option>
                  </select>
                </div>

                <div className="field-group">
                  <label htmlFor="manual-decade-select">Década</label>
                  <select
                    id="manual-decade-select"
                    className="desk-select"
                    value={manualDecade}
                    onChange={(e) => setManualDecade(e.target.value as DecadeTag | '')}
                  >
                    <option value="">Sem década</option>
                    {DECADE_TAGS.map((dec) => (
                      <option key={dec} value={dec}>
                        {TAG_LABELS[dec]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field-group">
                <span>Estilos e coleções</span>
                <div className="tags-inline">
                  {STYLE_TAGS.map((styleTag) => (
                    <label key={styleTag} className="tag-check">
                      <input
                        type="checkbox"
                        checked={manualStyleTags.includes(styleTag)}
                        onChange={() =>
                          setManualStyleTags((prev) => toggleStyleInList(prev, styleTag))
                        }
                      />
                      {TAG_LABELS[styleTag]}
                    </label>
                  ))}
                </div>
              </div>

              {manualDuplicate && (
                <div className="duplicate-warning" role="alert">
                  ⚠️ Duplicada! Já existe no catálogo como:{' '}
                  <strong>
                    {manualDuplicate.artist} — {manualDuplicate.track}
                  </strong>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  !isAuthenticated ||
                  !manualArtist.trim() ||
                  !manualTrack.trim() ||
                  Boolean(manualDuplicate) ||
                  isAddingManual
                }
              >
                {isAddingManual ? 'Salvando...' : 'Adicionar Música'}
              </button>
            </form>
          </section>
        </div>

        <section className="desk-card" aria-label="Catálogo Atual">
          <div className="catalog-header">
            <h2 className="section-title">
              3. Catálogo Atual ({catalogTracks.length} músicas)
            </h2>

            <div className="catalog-filters">
              <input
                type="text"
                className="desk-input"
                value={catalogFilter}
                onChange={(e) => setCatalogFilter(e.target.value)}
                placeholder="Filtrar por artista ou música..."
                aria-label="Filtrar catálogo"
              />
              <select
                aria-label="Filtrar por categoria"
                className="desk-select"
                value={catalogCategory}
                onChange={(e) =>
                  setCatalogCategory(e.target.value as CatalogFilterValue)
                }
              >
                <option value="all">Todas</option>
                <optgroup label="Idioma">
                  <option value="pt">Português</option>
                  <option value="en">Inglês</option>
                  <option value="es">Espanhol</option>
                  <option value="it">Italiano</option>
                </optgroup>
                <optgroup label="Estilo / Coleção">
                  {STYLE_TAGS.map((styleTag) => (
                    <option key={styleTag} value={styleTag}>
                      {TAG_LABELS[styleTag]}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Década">
                  {DECADE_TAGS.map((dec) => (
                    <option key={dec} value={dec}>
                      {TAG_LABELS[dec]}
                    </option>
                  ))}
                  <option value="no_decade">Sem década</option>
                </optgroup>
              </select>
            </div>
          </div>

          <div className="catalog-list">
            {filteredCatalog.length === 0 ? (
              <p className="empty-msg">
                {isAuthenticated
                  ? 'Nenhuma música encontrada para esse filtro.'
                  : 'Conecte-se acima para visualizar o catálogo.'}
              </p>
            ) : (
              filteredCatalog.map((item) => {
                const isEditing = editingTrackId === item.id;

                return (
                  <div key={item.id} className="catalog-row-wrapper">
                    <div className="catalog-row">
                      <div className="catalog-row-info">
                        <strong>{item.track}</strong>
                        <span className="catalog-artist"> — {item.artist}</span>
                        <div className="catalog-tags">
                          {item.tags.map((tag) => (
                            <span key={tag} className="tag-pill">
                              {TAG_LABELS[tag] ?? tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="catalog-row-actions">
                        {confirmDeleteId === item.id ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => void handleDeleteTrack(item.id)}
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={!isAuthenticated || isSavingEdit}
                              onClick={() =>
                                isEditing
                                  ? setEditingTrackId(null)
                                  : handleStartEdit(item)
                              }
                            >
                              {isEditing ? 'Fechar edição' : 'Editar'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger-outline btn-sm"
                              disabled={!isAuthenticated || isSavingEdit}
                              onClick={() => setConfirmDeleteId(item.id)}
                            >
                              Remover
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isEditing && (
                      <div className="catalog-edit-panel">
                        <div className="catalog-edit-controls">
                          <label className="edit-inline-field">
                            <span>Idioma</span>
                            <select
                              aria-label={`Editar idioma de ${item.track}`}
                              className="desk-select"
                              value={editLang}
                              onChange={(e) =>
                                setEditLang(e.target.value as SongLanguage)
                              }
                            >
                              <option value="pt">Português</option>
                              <option value="en">Inglês</option>
                              <option value="es">Espanhol</option>
                              <option value="it">Italiano</option>
                            </select>
                          </label>

                          <label className="edit-inline-field">
                            <span>Década</span>
                            <select
                              aria-label={`Editar década de ${item.track}`}
                              className="desk-select"
                              value={editDecade}
                              onChange={(e) =>
                                setEditDecade(e.target.value as DecadeTag | '')
                              }
                            >
                              <option value="">Sem década</option>
                              {DECADE_TAGS.map((dec) => (
                                <option key={dec} value={dec}>
                                  {TAG_LABELS[dec]}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="tags-inline">
                            {STYLE_TAGS.map((styleTag) => (
                              <label key={styleTag} className="tag-check">
                                <input
                                  type="checkbox"
                                  checked={editStyleTags.includes(styleTag)}
                                  onChange={() =>
                                    setEditStyleTags((prev) =>
                                      toggleStyleInList(prev, styleTag)
                                    )
                                  }
                                />
                                {TAG_LABELS[styleTag]}
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="catalog-edit-actions">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={isSavingEdit}
                            onClick={() => void handleSaveEdit(item.id)}
                          >
                            {isSavingEdit ? 'Salvando...' : 'Salvar alterações'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={isSavingEdit}
                            onClick={() => setEditingTrackId(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default DesktopApp;
