'use client';

import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';

interface FocusDockProps {
  songTitle: string;
  displayedKey: string;
  isFollowing: boolean;
  hasSetlist: boolean;
  prevSongId: string | null;
  nextSongId: string | null;
  onNavigateSong: (songId: string) => void;
  onOpenSetlistDrawer: () => void;
  onExit: () => void;
}

export function FocusDock({
  songTitle,
  displayedKey,
  isFollowing,
  hasSetlist,
  prevSongId,
  nextSongId,
  onNavigateSong,
  onOpenSetlistDrawer,
  onExit,
}: FocusDockProps) {
  const store = usePlayerStore();
  const { displayMode, toggleHideChords, fontSize, setFontSize } = useDisplayStore();
  const chordsHidden = displayMode === 'lyrics-only';

  return (
    <>
      {/* Minimal top bar so singer/musician always knows song title & can exit in one tap */}
      <div className="flex-shrink-0 border-b border-[var(--line)]/70 bg-[var(--bg)]/90 backdrop-blur-md px-4 sm:px-6 py-2">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {hasSetlist && (
              <button
                type="button"
                onClick={onOpenSetlistDrawer}
                className="pill-btn px-2.5 py-1 text-xs flex-shrink-0"
                title="Abrir setlist"
              >
                ☰
              </button>
            )}
            <span className="font-display text-lg text-[var(--ink)] truncate">{songTitle}</span>
            {displayedKey && !chordsHidden && (
              <span className="studio-chip text-[var(--accent-ink)] flex-shrink-0">
                {displayedKey}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onExit}
            className="pill-btn px-3 py-1 text-xs flex-shrink-0"
            title="Voltar para a tela completa (Esc)"
          >
            Sair da tela limpa
          </button>
        </div>
      </div>

      {/* Floating bottom dock */}
      <div
        className="fixed bottom-4 inset-x-0 z-30 flex justify-center px-3 pointer-events-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div
          className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 flex-wrap justify-center rounded-full border border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-md px-2.5 py-1.5"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          {hasSetlist && !isFollowing && (
            <>
              <button
                type="button"
                disabled={!prevSongId}
                onClick={() => prevSongId && onNavigateSong(prevSongId)}
                className="pill-btn w-8 h-8 text-base"
                title="Música anterior"
                aria-label="Música anterior"
              >
                ‹
              </button>
              <button
                type="button"
                disabled={!nextSongId}
                onClick={() => nextSongId && onNavigateSong(nextSongId)}
                className="pill-btn w-8 h-8 text-base"
                title="Próxima música"
                aria-label="Próxima música"
              >
                ›
              </button>
            </>
          )}

          {!isFollowing && (
            <button
              type="button"
              onClick={store.toggleAutoScroll}
              className={`pill-btn px-3 h-8 text-xs ${
                store.isAutoScrolling ? 'pill-btn-tune' : ''
              }`}
            >
              {store.isAutoScrolling ? '⏸ Pausar' : '▶ Rolar'}
            </button>
          )}

          {!isFollowing && store.isAutoScrolling && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed - 0.1)}
                className="pill-btn w-7 h-7 font-mono text-xs"
                aria-label="Diminuir velocidade"
              >
                -
              </button>
              <span className="font-mono text-[10.5px] text-[var(--muted)] tabular-nums px-0.5">
                {store.autoScrollSpeed.toFixed(1)}×
              </span>
              <button
                type="button"
                onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed + 0.1)}
                className="pill-btn w-7 h-7 font-mono text-xs"
                aria-label="Aumentar velocidade"
              >
                +
              </button>
            </div>
          )}

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFontSize(fontSize - 10)}
              className="pill-btn w-8 h-8 font-mono text-[11px]"
              aria-label="Diminuir letra"
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => setFontSize(fontSize + 10)}
              className="pill-btn w-8 h-8 font-mono text-[11px]"
              aria-label="Aumentar letra"
            >
              A+
            </button>
          </div>

          <button
            type="button"
            onClick={toggleHideChords}
            className={`pill-btn px-3 h-8 text-xs ${
              chordsHidden ? 'pill-btn-primary' : ''
            }`}
            title="Alternar entre só letra (para cantar) e cifra completa"
          >
            {chordsHidden ? 'Mostrar acordes' : 'Esconder acordes'}
          </button>
        </div>
      </div>
    </>
  );
}
