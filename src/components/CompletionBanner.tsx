import { GameStatus, SongData } from '../types/game';

interface CompletionBannerProps {
  gameStatus: GameStatus;
  song: SongData | null;
  playerFoundCount: number;
  totalCount: number;
  hintUsed: boolean;
  onNewSong: () => void;
}

export function CompletionBanner({
  gameStatus,
  song,
  playerFoundCount,
  totalCount,
  hintUsed,
  onNewSong,
}: CompletionBannerProps) {
  if (!song || (gameStatus !== 'won' && gameStatus !== 'gave_up')) {
    return null;
  }

  const isWon = gameStatus === 'won';

  return (
    <section
      className={`result-banner ${isWon ? 'result-won' : 'result-gave-up'}`}
      role="status"
      aria-live="polite"
    >
      <div className="result-content">
        <span className="result-tag">{isWon ? '🎉 Concluído!' : 'Fim de Jogo'}</span>
        <h2 className="result-title">
          {isWon
            ? 'Concluído! Você completou a letra toda!'
            : 'Você desistiu desta rodada'}
        </h2>
        <p className="result-song">
          <strong>{song.title}</strong> — {song.artist}
        </p>
        <p className="result-stats">
          {isWon
            ? `${totalCount} de ${totalCount} palavras descobertas • ${
                hintUsed ? 'Com dica do artista' : 'Sem usar dica'
              }`
            : `Você acertou ${playerFoundCount} de ${totalCount} palavras. As palavras destacadas em vermelho/coral abaixo eram as que faltavam.`}
        </p>
      </div>

      <button type="button" className="btn btn-primary" onClick={onNewSong}>
        Jogar Nova Música
      </button>
    </section>
  );
}
