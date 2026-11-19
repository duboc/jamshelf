'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import type { useLiveSession } from '@/lib/stores/live-session-store';
import { Metronome } from '@/components/metronome/Metronome';
import { VisualPulse } from '@/components/metronome/VisualPulse';
import { ChordSheet } from '@/components/chord-sheet/ChordSheet';
import { SetlistDrawer } from '@/components/show-mode/SetlistDrawer';
import type { Song, Setlist } from '@/lib/types/song';

const SWIPE_MIN_DX = 60;
const SWIPE_MAX_DT = 600;
const SWIPE_DX_DY_RATIO = 1.5;
const EDGE_GUARD_PX = 24;

interface ShowModeViewProps {
  song: Song;
  activeSetlist: Setlist;
  setlistSongIdx: number;
  totalSongs: number;
  prevSongId: string | null;
  nextSongId: string | null;
  nextSongMeta?: { title: string; displayKey: string } | null;
  beatsPerBar: number;
  live: ReturnType<typeof useLiveSession>;
  onNavigate: (songId: string) => void;
  onExit: () => void;
  onChordTap: (chord: string) => void;
  onScrollStateChange: (state: { scrollTop: number; scrollRatio: number }) => void;
  handleGoLive: () => void;
  confirmGoLive: () => void;
  showNamePrompt: boolean;
  nameInput: string;
  setNameInput: (v: string) => void;
  setShowNamePrompt: (v: boolean) => void;
}

export function ShowModeView({
  song,
  activeSetlist,
  setlistSongIdx,
  totalSongs,
  prevSongId,
  nextSongId,
  nextSongMeta,
  beatsPerBar,
  live,
  onNavigate,
  onExit,
  onChordTap,
  onScrollStateChange,
  handleGoLive,
  confirmGoLive,
  showNamePrompt,
  nameInput,
  setNameInput,
  setShowNamePrompt,
}: ShowModeViewProps) {
  const store = usePlayerStore();
  const {
    displayMode,
    toggleHideChords,
    fontSize,
    setFontSize,
    visualPulseEnabled,
    setVisualPulseEnabled,
  } = useDisplayStore();

  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const [showSetlist, setShowSetlist] = useState(false);

  const canNavigate = !live.isFollowing;
  const chordsHidden = displayMode === 'lyrics-only';

  // Keyboard shortcuts for stage pedals / laptops
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === 'Escape') {
        if (showSetlist) setShowSetlist(false);
        else onExit();
      } else if (e.key === 'ArrowRight' && canNavigate && nextSongId) {
        e.preventDefault();
        onNavigate(nextSongId);
      } else if (e.key === 'ArrowLeft' && canNavigate && prevSongId) {
        e.preventDefault();
        onNavigate(prevSongId);
      } else if (e.key === ' ' && canNavigate) {
        e.preventDefault();
        store.toggleAutoScroll();
      } else if (e.key.toLowerCase() === 'l') {
        toggleHideChords();
      } else if (e.key.toLowerCase() === 's') {
        setShowSetlist((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canNavigate, nextSongId, prevSongId, onNavigate, onExit, showSetlist, store, toggleHideChords]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!canNavigate) return;
    const t = e.touches[0];
    if (t.clientX < EDGE_GUARD_PX || t.clientX > window.innerWidth - EDGE_GUARD_PX) {
      touchRef.current = null;
      return;
    }
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!canNavigate || !touchRef.current) return;
    const start = touchRef.current;
    touchRef.current = null;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    if (
      Math.abs(dx) < SWIPE_MIN_DX ||
      Math.abs(dx) < Math.abs(dy) * SWIPE_DX_DY_RATIO ||
      dt > SWIPE_MAX_DT
    ) {
      return;
    }
    if (dx < 0 && nextSongId) onNavigate(nextSongId);
    else if (dx > 0 && prevSongId) onNavigate(prevSongId);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      <VisualPulse />

      {/* Stage header */}
      <header className="flex-shrink-0 border-b border-[var(--line)] bg-[var(--surface)]/90 backdrop-blur-md px-4 sm:px-6 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-y-2 gap-x-3">
          <button
            type="button"
            onClick={() => setShowSetlist((v) => !v)}
            title="Abrir setlist (atalho: S) — toque para pular ou arraste para reordenar"
            className="min-w-0 text-left rounded-xl -mx-2 px-2.5 py-1 hover:bg-[var(--surface2)] transition-colors cursor-pointer"
          >
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-[var(--muted)]">
              <span className="mr-1.5">☰</span>
              {activeSetlist.name} · {setlistSongIdx + 1} de {totalSongs}
            </div>
            <div className="flex items-baseline gap-2 min-w-0">
              <h1 className="font-display text-xl sm:text-2xl text-[var(--ink)] truncate leading-tight">
                {song.title}
              </h1>
              {song.displayKey && !chordsHidden && (
                <span className="font-mono text-xs font-semibold text-[var(--accent-ink)] flex-shrink-0">
                  {song.displayKey}
                </span>
              )}
            </div>
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Live session controls */}
            <div className="relative flex items-center gap-1.5">
              {live.isLeading ? (
                <>
                  <span className="studio-chip text-[var(--rec)] border border-[var(--rec)]/40 bg-[var(--rec)]/10">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--rec)] animate-pulse" />
                    Liderando
                  </span>
                  <button
                    type="button"
                    onClick={live.stopLeading}
                    className="pill-btn px-2.5 py-1 text-xs"
                  >
                    Parar
                  </button>
                </>
              ) : live.isFollowing ? (
                <span className="studio-chip text-[var(--tune)] border border-[var(--tune)]/40 bg-[var(--tune-dim)]">
                  {live.isLeaderStale
                    ? `${live.session.leaderName} inativo`
                    : `Seguindo ${live.session.leaderName}`}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleGoLive}
                  className="pill-btn pill-btn-rec px-3 py-1.5 text-xs"
                >
                  <span className="w-2 h-2 rounded-full bg-current" />
                  Iniciar Ao Vivo
                </button>
              )}

              {showNamePrompt && (
                <div
                  role="dialog"
                  className="absolute right-0 top-[calc(100%+8px)] w-60 bg-[var(--surface)] border border-[var(--line)] rounded-2xl z-50 p-3.5 space-y-2.5"
                  style={{ boxShadow: 'var(--shadow-md)' }}
                >
                  <div className="text-xs text-[var(--muted)]">
                    Seu nome, para a banda saber quem está puxando o show:
                  </div>
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmGoLive();
                      if (e.key === 'Escape') setShowNamePrompt(false);
                    }}
                    placeholder="Ex.: Alex - Violão"
                    className="studio-input w-full px-2.5 py-1.5 text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNamePrompt(false)}
                      className="pill-btn px-3 py-1 text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={confirmGoLive}
                      className="pill-btn pill-btn-primary px-3 py-1 text-xs"
                    >
                      Iniciar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Per-device singer toggle (hides/shows chords without affecting anyone else) */}
            <button
              type="button"
              onClick={toggleHideChords}
              className={`pill-btn px-3 py-1.5 text-xs ${chordsHidden ? 'pill-btn-primary' : ''}`}
              title="Esconder ou mostrar acordes só neste aparelho (atalho: L)"
            >
              {chordsHidden ? 'Só letra' : 'Com acordes'}
            </button>

            {/* Font size */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFontSize(fontSize - 10)}
                className="pill-btn w-7 h-7 font-mono text-[11px]"
                aria-label="Diminuir fonte"
              >
                A-
              </button>
              <button
                type="button"
                onClick={() => setFontSize(fontSize + 10)}
                className="pill-btn w-7 h-7 font-mono text-[11px]"
                aria-label="Aumentar fonte"
              >
                A+
              </button>
            </div>

            {canNavigate && (
              <button
                type="button"
                onClick={store.toggleAutoScroll}
                className={`pill-btn px-3 py-1.5 text-xs ${
                  store.isAutoScrolling ? 'pill-btn-tune' : ''
                }`}
                title="Atalho: Espaço"
              >
                {store.isAutoScrolling ? '⏸ Pausar' : '▶ Auto-scroll'}
              </button>
            )}

            <Metronome readOnly={!canNavigate} beatsPerBar={beatsPerBar} />

            <button
              type="button"
              onClick={() => setVisualPulseEnabled(!visualPulseEnabled)}
              title="Piscar a borda da tela no tempo (só neste aparelho)"
              className={`pill-btn px-2.5 py-1.5 text-xs ${
                visualPulseEnabled ? 'border-[var(--accent)] text-[var(--accent-ink)]' : ''
              }`}
            >
              Pulso
            </button>

            <button
              type="button"
              onClick={onExit}
              className="pill-btn px-3 py-1.5 text-xs"
              title="Sair do Modo Show (Esc)"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main sheet */}
      <div
        className="flex flex-1 relative min-h-0"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <ChordSheet
          song={song}
          displayMode={displayMode}
          onChordTap={onChordTap}
          onScrollStateChange={onScrollStateChange}
          syncCorrection={live.syncCorrection}
          bottomPaddingClass="pb-20"
        />

        {showSetlist && (
          <SetlistDrawer
            setlist={activeSetlist}
            currentSongId={song.id}
            canReorder={canNavigate}
            onNavigate={onNavigate}
            onClose={() => setShowSetlist(false)}
          />
        )}
      </div>

      {/* Bottom stage bar: clean Prev / Next preview without overlapping lyrics */}
      <footer
        className="flex-shrink-0 border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-md px-4 sm:px-6 py-2"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          {canNavigate ? (
            <button
              type="button"
              onClick={() => prevSongId && onNavigate(prevSongId)}
              disabled={!prevSongId}
              className="pill-btn px-3.5 py-1.5 text-xs"
              title="Música anterior (←)"
            >
              ‹ Anterior
            </button>
          ) : (
            <span className="font-mono text-[11px] text-[var(--muted)]">
              Seguindo {live.session.leaderName}
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowSetlist(true)}
            className="font-mono text-[11px] text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer hidden sm:inline"
          >
            {setlistSongIdx + 1} / {totalSongs} · Setlist (S)
          </button>

          {canNavigate ? (
            <button
              type="button"
              onClick={() => nextSongId && onNavigate(nextSongId)}
              disabled={!nextSongId}
              className="pill-btn pill-btn-primary px-3.5 py-1.5 text-xs max-w-[60vw]"
              title="Próxima música (→)"
            >
              <span className="truncate">
                {nextSongMeta
                  ? `Próxima: ${nextSongMeta.title}${
                      nextSongMeta.displayKey && !chordsHidden ? ` (${nextSongMeta.displayKey})` : ''
                    }`
                  : 'Fim do setlist'}
              </span>
              {nextSongId && <span>›</span>}
            </button>
          ) : (
            <span className="font-mono text-[11px] text-[var(--muted)] truncate">
              {nextSongMeta ? `Próxima: ${nextSongMeta.title}` : 'Última música'}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
