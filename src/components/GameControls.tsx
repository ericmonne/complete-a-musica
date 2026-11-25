import { RefObject, useEffect, useState } from 'react';
import { GameStatus } from '../types/game';

interface GameControlsProps {
  inputValue: string;
  inputRef: RefObject<HTMLInputElement>;
  gameStatus: GameStatus;
  revealedCount: number;
  totalCount: number;
  lastMatchCount: number;
  onInputChange: (value: string) => void;
  onGiveUp: () => void;
}

export function GameControls({
  inputValue,
  inputRef,
  gameStatus,
  revealedCount,
  totalCount,
  lastMatchCount,
  onInputChange,
  onGiveUp,
}: GameControlsProps) {
  const [confirmingGiveUp, setConfirmingGiveUp] = useState(false);

  useEffect(() => {
    setConfirmingGiveUp(false);
  }, [gameStatus]);

  useEffect(() => {
    if (!confirmingGiveUp) return;
    const timer = setTimeout(() => {
      setConfirmingGiveUp(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, [confirmingGiveUp]);

  const progressPct = totalCount > 0 ? Math.round((revealedCount / totalCount) * 100) : 0;
  const isPlaying = gameStatus === 'playing';

  return (
    <section className="controls-sticky" aria-label="Controles do jogo">
      <div className="controls-row">
        <div className="input-wrapper">
          <label htmlFor="word-guess-input" className="sr-only">
            Digite uma palavra da música
          </label>
          <input
            id="word-guess-input"
            ref={inputRef}
            type="text"
            className="word-input"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={
              isPlaying
                ? 'Digite uma palavra da música...'
                : 'Aguarde ou sorteie uma nova música'
            }
            disabled={!isPlaying}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {lastMatchCount > 0 && isPlaying && (
            <span key={`${revealedCount}-${lastMatchCount}`} className="match-badge" aria-live="polite">
              +{lastMatchCount}
            </span>
          )}
        </div>

        <div className="progress-box">
          <div className="progress-text">
            <span>
              <strong>{revealedCount}</strong> / {totalCount} palavras
            </span>
            <span className="progress-pct">{progressPct}%</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {isPlaying && (
          <div className="give-up-box">
            {!confirmingGiveUp ? (
              <button
                type="button"
                className="btn btn-danger-outline"
                onClick={() => setConfirmingGiveUp(true)}
              >
                Desistir
              </button>
            ) : (
              <div className="give-up-confirm">
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    setConfirmingGiveUp(false);
                    onGiveUp();
                  }}
                >
                  Confirmar desistência?
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setConfirmingGiveUp(false)}
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
