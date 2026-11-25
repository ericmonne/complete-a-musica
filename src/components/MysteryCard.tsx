import { GameStatus, SongData } from '../types/game';

interface MysteryCardProps {
  song: SongData | null;
  gameStatus: GameStatus;
  hintUsed: boolean;
  onRequestHint: () => void;
}

export function MysteryCard({
  song,
  gameStatus,
  hintUsed,
  onRequestHint,
}: MysteryCardProps) {
  const isFinished = gameStatus === 'won' || gameStatus === 'gave_up';
  const isArtistMode = song?.drawMode === 'artist';
  const showTitle = isFinished && song !== null;
  const showArtist = (isArtistMode || hintUsed || isFinished) && song !== null;

  return (
    <section className="mystery-card" aria-label="Informações da música">
      <div className="mystery-info">
        <div className="mystery-field">
          <span className="mystery-label">Música</span>
          <strong className={`mystery-value${showTitle ? ' revealed' : ' concealed'}`}>
            {showTitle ? song.title : '??? (Música Misteriosa)'}
          </strong>
        </div>

        <div className="mystery-field">
          <span className="mystery-label">Artista / Banda</span>
          <strong className={`mystery-value${showArtist ? ' revealed' : ' concealed'}`}>
            {showArtist ? song.artist : '???'}
          </strong>
        </div>
      </div>

      <div className="mystery-actions">
        {song?.source === 'offline' && (
          <span className="source-badge" title="Sem resposta da API, usando catálogo local">
            Catálogo local
          </span>
        )}

        {isArtistMode && (
          <span className="artist-mode-badge">Sorteio por artista (fora do catálogo)</span>
        )}

        {!isArtistMode && gameStatus === 'playing' && !hintUsed && (
          <button
            type="button"
            className="btn btn-hint"
            onClick={onRequestHint}
          >
            Pedir Dica (Revelar Artista)
          </button>
        )}

        {!isArtistMode && gameStatus === 'playing' && hintUsed && (
          <span className="hint-used-badge">Dica usada: Artista revelado</span>
        )}
      </div>
    </section>
  );
}
