import { FormEvent, useState } from 'react';
import {
  areFilterSetsEqual,
  DEFAULT_FILTER_TAGS,
  FILTER_GROUPS,
} from '../engine/catalogFilter';
import { FilterTag, ThemeMode } from '../types/game';

interface HeaderProps {
  selectedTags: FilterTag[];
  hasPendingFilterChanges: boolean;
  matchingSongCount: number | null;
  activeArtist: string | null;
  theme: ThemeMode;
  isLoading: boolean;
  onToggleTag: (tag: FilterTag) => void;
  onSelectAll: () => void;
  onResetDefaultFilters: () => void;
  onApplyFilters: () => void;
  onDrawByArtist: (artist: string) => void;
  onClearArtistMode: () => void;
  onNewSong: () => void;
  onToggleTheme: () => void;
}

export function Header({
  selectedTags,
  hasPendingFilterChanges,
  matchingSongCount,
  activeArtist,
  theme,
  isLoading,
  onToggleTag,
  onSelectAll,
  onResetDefaultFilters,
  onApplyFilters,
  onDrawByArtist,
  onClearArtistMode,
  onNewSong,
  onToggleTheme,
}: HeaderProps) {
  const [artistInput, setArtistInput] = useState('');

  const handleSubmitArtist = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = artistInput.trim();
    if (!trimmed || isLoading) return;
    onDrawByArtist(trimmed);
  };

  const isAllSelected = selectedTags.length === 0;
  const isDefaultSelected = areFilterSetsEqual(selectedTags, DEFAULT_FILTER_TAGS);

  return (
    <header className="app-header">
      <div className="header-top">
        <div className="brand">
          <span className="brand-badge" aria-hidden="true">
            ♪
          </span>
          <div>
            <h1 className="brand-title">Complete a Música</h1>
            <p className="brand-subtitle">
              Adivinhe a letra palavra por palavra — sem saber qual é a música!
            </p>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onNewSong}
            disabled={isLoading || (!activeArtist && matchingSongCount === 0)}
            aria-label={
              activeArtist
                ? `Sortear outra música de ${activeArtist}`
                : 'Sortear nova música do catálogo'
            }
          >
            {isLoading ? 'Sorteando...' : 'Sortear Nova Música'}
          </button>

          <button
            type="button"
            className="btn btn-ghost theme-toggle"
            onClick={onToggleTheme}
            aria-label={
              theme === 'dark' ? 'Alternar para modo claro' : 'Alternar para modo escuro'
            }
          >
            {theme === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
          </button>
        </div>
      </div>

      <div className="filter-panel" aria-label="Filtros de músicas">
        <div className="filter-toolbar">
          <div className="filter-quick-actions">
            <button
              type="button"
              className={`category-pill${!activeArtist && isAllSelected ? ' active' : ''}`}
              onClick={onSelectAll}
              disabled={isLoading}
              aria-pressed={!activeArtist && isAllSelected}
            >
              Todas
            </button>

            {!isDefaultSelected && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onResetDefaultFilters}
                disabled={isLoading}
              >
                Padrão (Rock &amp; Pop · PT/EN)
              </button>
            )}

            {matchingSongCount !== null && (
              <span
                className={`filter-count-pill${
                  matchingSongCount === 0 ? ' empty' : ''
                }`}
              >
                {matchingSongCount}{' '}
                {matchingSongCount === 1 ? 'música no filtro' : 'músicas no filtro'}
              </span>
            )}

            {hasPendingFilterChanges && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onApplyFilters}
                disabled={isLoading || matchingSongCount === 0}
              >
                Aplicar e Sortear
              </button>
            )}
          </div>

          <form className="artist-form" onSubmit={handleSubmitArtist}>
            <label htmlFor="artist-draw-input" className="sr-only">
              Nome do artista ou banda para sorteio
            </label>
            <input
              id="artist-draw-input"
              type="text"
              className="artist-input"
              value={artistInput}
              onChange={(e) => setArtistInput(e.target.value)}
              placeholder="Sortear por artista/banda (ex: Djavan)..."
              disabled={isLoading}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || !artistInput.trim()}
            >
              Escolher Artista ou Banda
            </button>
          </form>
        </div>

        <div className="filter-groups">
          {FILTER_GROUPS.map((group) => (
            <div key={group.id} className="filter-group-row">
              <span className="filter-group-label">{group.label}:</span>
              <div
                className="category-bar"
                role="group"
                aria-label={group.label}
              >
                {group.options.map((opt) => {
                  const isActive = !activeArtist && selectedTags.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`category-pill${isActive ? ' active' : ''}`}
                      onClick={() => onToggleTag(opt.id)}
                      disabled={isLoading}
                      aria-pressed={isActive}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {activeArtist && (
        <div className="artist-mode-banner" role="status">
          <span>
            🎸 Modo Artista: <strong>{activeArtist}</strong> (sorteio ao vivo — não é
            adicionado ao catálogo-base)
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClearArtistMode}
            disabled={isLoading}
          >
            Voltar ao Catálogo
          </button>
        </div>
      )}
    </header>
  );
}
