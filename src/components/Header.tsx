import { FormEvent, useState } from 'react';
import { CATEGORIES } from '../services/seedCatalog';
import { CategoryId, ThemeMode } from '../types/game';

interface HeaderProps {
  category: CategoryId;
  activeArtist: string | null;
  theme: ThemeMode;
  isLoading: boolean;
  onSelectCategory: (category: CategoryId) => void;
  onDrawByArtist: (artist: string) => void;
  onClearArtistMode: () => void;
  onNewSong: () => void;
  onToggleTheme: () => void;
}

export function Header({
  category,
  activeArtist,
  theme,
  isLoading,
  onSelectCategory,
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
            disabled={isLoading}
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

      <div className="header-filters">
        <nav className="category-bar" aria-label="Categorias de músicas">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`category-pill${
                !activeArtist && category === cat.id ? ' active' : ''
              }`}
              onClick={() => onSelectCategory(cat.id)}
              disabled={isLoading}
              aria-pressed={!activeArtist && category === cat.id}
            >
              {cat.label}
            </button>
          ))}
        </nav>

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
            Sortear Artista
          </button>
        </form>
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
