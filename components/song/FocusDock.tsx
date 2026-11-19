'use client';

import { useState } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import { playReferencePitch } from '@/lib/utils/pitch-audio';

interface FocusDockProps {
  songTitle: string;
  displayedKey: string;
  pitchTarget: string;
  stageNotes: string;
  wakeLockActive: boolean;
  isFollowing: boolean;
  hasSetlist: boolean;
  prevSongId: string | null;
  nextSongId: string | null;
  onNavigateSong: (songId: string) => void;
  onOpenSetlistDrawer: () => void;
  onTriggerCountIn: () => void;
  onExit: () => void;
}

export function FocusDock({
  songTitle,
  displayedKey,
  pitchTarget,
  stageNotes,
  wakeLockActive,
  isFollowing,
  hasSetlist,
  prevSongId,
  nextSongId,
  onNavigateSong,
  onOpenSetlistDrawer,
  onTriggerCountIn,
  onExit,
}: FocusDockProps) {
  const store = usePlayerStore();
  const { displayMode, toggleHideChords, fontSize, setFontSize } = useDisplayStore();
  const [pitchRinging, setPitchRinging] = useState(false);
  const chordsHidden = displayMode === 'lyrics-only';

  const handlePlayPitch = () => {
    if (!pitchTarget) return;
    if (playReferencePitch(pitchTarget, { mode: 'chord' })) {
      setPitchRinging(true);
      setTimeout(() => setPitchRinging(false), 1600);
    }
  };

  return (
    <>
      {/* Minimal top bar so singer/musician always knows song title & can exit in one tap */}
      <div className="flex-shrink-0 bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pt-2.5 pb-1.5">
        <div className="w-full rounded-[20px] bg-[var(--surface)] px-4 py-2 space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {hasSetlist && (
                <button
                  type="button"
                  onClick={onOpenSetlistDrawer}
                  className="pill-btn bg-[var(--bg)] px-2.5 h-8 text-xs flex-shrink-0"
                  title="Abrir setlist"
                >
                  ☰
                </button>
              )}
              <span className="font-display font-bold text-lg text-[var(--ink)] truncate">{songTitle}</span>
              {displayedKey && !chordsHidden && (
                <span className="studio-chip bg-[var(--primary-container)] text-[var(--on-primary-container)] flex-shrink-0">
                  {displayedKey}
                </span>
              )}
              {wakeLockActive && (
                <span
                  className="studio-chip bg-[var(--tune-dim)] text-[var(--tune)] hidden sm:inline-flex flex-shrink-0"
                  title="Bloqueio automático de tela desativado enquanto você lê"
                >
                  Tela ativa
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onExit}
              className="pill-btn bg-[var(--bg)] px-3.5 h-8 text-xs flex-shrink-0"
              title="Voltar para a tela completa (Esc)"
            >
              Sair da tela limpa
            </button>
          </div>
          {stageNotes && (
            <div className="flex items-center gap-2 text-xs text-[var(--ink)]">
              <span className="studio-chip bg-[var(--warn-dim)] text-[var(--warn-ink)] flex-shrink-0">
                Deixa
              </span>
              <span className="truncate">{stageNotes}</span>
            </div>
          )}
        </div>
      </div>

      {/* Floating bottom dock */}
      <div
        className="fixed bottom-4 inset-x-0 z-30 flex justify-center px-3 pointer-events-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div
          className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 flex-wrap justify-center rounded-[24px] sm:rounded-full bg-[var(--surface)] px-3 py-2"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          {hasSetlist && !isFollowing && (
            <>
              <button
                type="button"
                disabled={!prevSongId}
                onClick={() => prevSongId && onNavigateSong(prevSongId)}
                className="pill-btn bg-[var(--bg)] w-9 h-9 text-base"
                title="Música anterior"
                aria-label="Música anterior"
              >
                ‹
              </button>
              <button
                type="button"
                disabled={!nextSongId}
                onClick={() => nextSongId && onNavigateSong(nextSongId)}
                className="pill-btn bg-[var(--bg)] w-9 h-9 text-base"
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
              className={`pill-btn px-3.5 h-9 text-xs ${
                store.isAutoScrolling ? 'pill-btn-tune' : 'bg-[var(--bg)]'
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
                className="pill-btn bg-[var(--bg)] w-9 h-9 font-mono text-xs"
                aria-label="Diminuir velocidade"
              >
                -
              </button>
              <span className="font-mono text-xs text-[var(--muted)] tabular-nums px-0.5">
                {store.autoScrollSpeed.toFixed(1)}×
              </span>
              <button
                type="button"
                onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed + 0.1)}
                className="pill-btn bg-[var(--bg)] w-9 h-9 font-mono text-xs"
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
              className="pill-btn bg-[var(--bg)] w-9 h-9 font-mono text-xs"
              aria-label="Diminuir letra"
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => setFontSize(fontSize + 10)}
              className="pill-btn bg-[var(--bg)] w-9 h-9 font-mono text-xs"
              aria-label="Aumentar letra"
            >
              A+
            </button>
          </div>

          {pitchTarget && (
            <button
              type="button"
              onClick={handlePlayPitch}
              className={`pill-btn px-3 h-9 text-xs ${
                pitchRinging ? 'pill-btn-primary' : 'bg-[var(--bg)] text-[var(--accent-ink)]'
              }`}
              title={`Tocar acorde-guia (${pitchTarget})`}
            >
              ♪ {pitchTarget}
            </button>
          )}

          {!isFollowing && (
            <button
              type="button"
              onClick={onTriggerCountIn}
              className="pill-btn bg-[var(--bg)] px-3 h-9 font-mono text-xs"
              title="Contagem visual 1-2-3-4 (atalho: C)"
            >
              1·2·3·4
            </button>
          )}

          <button
            type="button"
            onClick={toggleHideChords}
            className={`pill-btn px-3.5 h-9 text-xs ${
              chordsHidden ? 'pill-btn-primary' : 'bg-[var(--bg)]'
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
