import { CSSProperties } from 'react';
import { GameStatus, LineToken, RevealSource } from '../types/game';

interface LyricsBoardProps {
  lines: LineToken[][];
  revealState: RevealSource[];
  lastRevealedIds: Set<number>;
  gameStatus: GameStatus;
}

export function LyricsBoard({
  lines,
  revealState,
  lastRevealedIds,
  gameStatus,
}: LyricsBoardProps) {
  return (
    <section className="lyrics-board" aria-label="Letra da música">
      {gameStatus === 'gave_up' && (
        <div className="lyrics-legend">
          <span className="legend-item">
            <span className="legend-swatch swatch-player" /> Palavras acertadas
          </span>
          <span className="legend-item">
            <span className="legend-swatch swatch-missed" /> Palavras reveladas ao desistir
          </span>
        </div>
      )}

      <div className="lyrics-content">
        {lines.map((line, lineIdx) => {
          if (line.length === 0) {
            return <div key={`stanza-${lineIdx}`} className="lyrics-stanza-break" aria-hidden="true" />;
          }

          return (
            <div key={`line-${lineIdx}`} className="lyrics-line">
              {line.map((token, tokenIdx) => {
                if (token.type === 'space') {
                  return ' ';
                }

                if (token.type === 'punct') {
                  return (
                    <span key={`punct-${lineIdx}-${tokenIdx}`} className="lyrics-punct">
                      {token.text}
                    </span>
                  );
                }

                return (
                  <span key={`comp-${lineIdx}-${tokenIdx}`} className="lyrics-compound">
                    {token.items.map((item, itemIdx) => {
                      if (item.type === 'punct') {
                        return (
                          <span
                            key={`cp-${lineIdx}-${tokenIdx}-${itemIdx}`}
                            className="lyrics-punct"
                          >
                            {item.text}
                          </span>
                        );
                      }

                      const status = revealState[item.segmentId] ?? 'hidden';

                      if (status === 'hidden') {
                        return (
                          <span
                            key={`slot-${lineIdx}-${tokenIdx}-${itemIdx}`}
                            className="word-slot hidden"
                            style={{ '--chars': item.text.length } as CSSProperties}
                            aria-label={`palavra oculta de ${item.text.length} letras`}
                          />
                        );
                      }

                      if (status === 'gave_up') {
                        return (
                          <span
                            key={`slot-${lineIdx}-${tokenIdx}-${itemIdx}`}
                            className="word-slot revealed-missed"
                          >
                            {item.text}
                          </span>
                        );
                      }

                      const isJustRevealed = lastRevealedIds.has(item.segmentId);
                      return (
                        <span
                          key={`slot-${lineIdx}-${tokenIdx}-${itemIdx}`}
                          className={`word-slot revealed-player${
                            isJustRevealed ? ' just-revealed' : ''
                          }`}
                        >
                          {item.text}
                        </span>
                      );
                    })}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
