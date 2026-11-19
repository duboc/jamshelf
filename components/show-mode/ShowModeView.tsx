'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import type { useLiveSession } from '@/lib/stores/live-session-store';
import { Metronome } from '@/components/metronome/Metronome';
import { VisualPulse } from '@/components/metronome/VisualPulse';
import { ChordSheet } from '@/components/chord-sheet/ChordSheet';
import { SetlistDrawer } from '@/components/show-mode/SetlistDrawer';
import { StageNotesBar } from '@/components/song/StageNotesBar';
import { playReferencePitch } from '@/lib/utils/pitch-audio';
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
  pitchTarget: string;
  wakeLockActive: boolean;
  live: ReturnType<typeof useLiveSession>;
  onNavigate: (songId: string) => void;
  onExit: () => void;
  onChordTap: (chord: string) => void;
  onScrollStateChange: (state: { scrollTop: number; scrollRatio: number }) => void;
  onTriggerCountIn: () => void;
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
  pitchTarget,
  wakeLockActive,
  live,
  onNavigate,
  onExit,
  onChordTap,
  onScrollStateChange,
  onTriggerCountIn,
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
  const [pitchRinging, setPitchRinging] = useState(false);

  const canNavigate = !live.isFollowing;
  const chordsHidden = displayMode === 'lyrics-only';

  const handlePlayPitch = () => {
    if (!pitchTarget) return;
    if (playReferencePitch(pitchTarget, { mode: 'chord' })) {
      setPitchRinging(true);
      setTimeout(() => setPitchRinging(false), 1600);
    }
  };

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
      } else if (e.key.toLowerCase() === 'c' && canNavigate) {
        e.preventDefault();
        onTriggerCountIn();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canNavigate, nextSongId, prevSongId, onNavigate, onExit, showSetlist, store, toggleHideChords, onTriggerCountIn]);

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
      <header className="flex-shrink-0 bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pt-3 pb-2.5">
        <div className="w-full rounded-[20px] bg-[var(--surface)] px-4 sm:px-5 py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2 min-w-0 lg:contents">
            <button
              type="button"
              onClick={() => setShowSetlist((v) => !v)}
              title="Abrir setlist (atalho: S) - toque para pular ou arraste para reordenar"
              className="min-w-0 text-left rounded-2xl -mx-2 px-3 py-1 hover:bg-[var(--surface-high)] transition-colors cursor-pointer lg:order-1 lg:mr-auto"
            >
              <div className="text-xs font-medium text-[var(--muted)] truncate">
                <span className="mr-1.5">☰</span>
                {activeSetlist.name} · {setlistSongIdx + 1} de {totalSongs}
              </div>
              <div className="flex items-baseline gap-2.5 min-w-0">
                <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--ink)] truncate leading-tight">
                  {song.title}
                </h1>
                {song.displayKey && !chordsHidden && (
                  <span className="font-expressive text-lg text-[var(--accent)] flex-shrink-0">
                    {song.displayKey}
                  </span>
                )}
              </div>
            </button>

            <div className="flex items-center gap-2 flex-shrink-0 lg:order-3">
              {wakeLockActive && (
                <span
                  className="studio-chip bg-[var(--tune-dim)] text-[var(--tune)] hidden sm:inline-flex"
                  title="Tela mantida acesa automaticamente no Modo Show"
                >
                  Tela ativa
                </span>
              )}
              <button
                type="button"
                onClick={onExit}
                className="pill-btn bg-[var(--bg)] px-4 h-10 sm:h-11 text-xs sm:text-sm"
                title="Sair do Modo Show (Esc)"
              >
                Sair
              </button>
            </div>
          </div>

          <div className="relative min-w-0 lg:order-2">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap overflow-x-auto no-scrollbar pr-8 lg:pr-0 lg:flex-wrap lg:overflow-visible">
              {/* Live session controls */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {live.isLeading ? (
                  <>
                    <span className="studio-chip text-[var(--rec)] border border-[var(--rec)]/40 bg-[var(--rec)]/10">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--rec)] animate-pulse" />
                      Liderando
                    </span>
                    <button
                      type="button"
                      onClick={live.stopLeading}
                      className="pill-btn bg-[var(--bg)] px-3.5 h-10 sm:h-11 text-xs"
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
                    className="pill-btn pill-btn-rec px-4 h-10 sm:h-11 text-xs flex-shrink-0"
                  >
                    <span className="w-2 h-2 rounded-full bg-current" />
                    Iniciar Ao Vivo
                  </button>
                )}
              </div>

              {/* Pitch guide for singers/musicians */}
              {pitchTarget && (
                <button
                  type="button"
                  onClick={handlePlayPitch}
                  className={`pill-btn px-3.5 h-10 sm:h-11 text-xs flex-shrink-0 ${
                    pitchRinging ? 'pill-btn-primary' : 'bg-[var(--bg)] text-[var(--accent-ink)]'
                  }`}
                  title={`Tocar acorde-guia (${pitchTarget})`}
                >
                  ♪ {pitchTarget}
                </button>
              )}

              {/* Synchronized 1-2-3-4 count-in */}
              {canNavigate && (
                <button
                  type="button"
                  onClick={onTriggerCountIn}
                  className="pill-btn bg-[var(--bg)] px-3.5 h-10 sm:h-11 font-mono text-xs flex-shrink-0"
                  title="Contagem visual 1-2-3-4 (atalho: C)"
                >
                  1·2·3·4
                </button>
              )}

              {/* Per-device singer toggle (hides/shows chords without affecting anyone else) */}
              <button
                type="button"
                onClick={toggleHideChords}
                className={`pill-btn px-3.5 h-10 sm:h-11 text-xs flex-shrink-0 ${
                  chordsHidden ? 'pill-btn-primary' : 'bg-[var(--bg)]'
                }`}
                title="Esconder ou mostrar acordes só neste aparelho (atalho: L)"
              >
                {chordsHidden ? 'Só letra' : 'Com acordes'}
              </button>

              {/* Font size */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setFontSize(fontSize - 10)}
                  className="pill-btn bg-[var(--bg)] w-10 h-10 sm:w-11 sm:h-11 font-mono text-xs"
                  aria-label="Diminuir fonte"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() => setFontSize(fontSize + 10)}
                  className="pill-btn bg-[var(--bg)] w-10 h-10 sm:w-11 sm:h-11 font-mono text-xs"
                  aria-label="Aumentar fonte"
                >
                  A+
                </button>
              </div>

              {canNavigate && (
                <button
                  type="button"
                  onClick={store.toggleAutoScroll}
                  className={`pill-btn px-3.5 h-10 sm:h-11 text-xs flex-shrink-0 ${
                    store.isAutoScrolling ? 'pill-btn-tune' : 'bg-[var(--bg)]'
                  }`}
                  title="Atalho: Espaço"
                >
                  {store.isAutoScrolling ? '⏸ Pausar' : '▶ Auto-scroll'}
                </button>
              )}

              <Metronome
                readOnly={!canNavigate}
                beatsPerBar={beatsPerBar}
                buttonClass="bg-[var(--bg)]"
                heightClass="h-10 sm:h-11"
              />

              <button
                type="button"
                onClick={() => setVisualPulseEnabled(!visualPulseEnabled)}
                title="Piscar a borda da tela no tempo (só neste aparelho)"
                className={`pill-btn px-3.5 h-10 sm:h-11 text-xs flex-shrink-0 ${
                  visualPulseEnabled ? 'pill-btn-tonal' : 'bg-[var(--bg)]'
                }`}
              >
                Pulso
              </button>
            </div>
            <div
              aria-hidden="true"
              className="pointer-events-none lg:hidden absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[var(--surface)] to-transparent"
            />
          </div>
        </div>
      </header>

      {/* Go-live name modal (centered overlay so it never clips inside horizontal stage bar) */}
      {showNamePrompt && (
        <div
          className="fixed inset-0 z-[75] bg-black/45 flex items-center justify-center p-4"
          onClick={() => setShowNamePrompt(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Iniciar sessão Ao Vivo"
            className="w-full max-w-xs bg-[var(--surface)] rounded-[28px] p-6 space-y-4"
            style={{ boxShadow: 'var(--shadow-md)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h2 className="font-display text-lg font-bold text-[var(--ink)]">Iniciar Ao Vivo</h2>
              <p className="text-xs text-[var(--muted)] leading-relaxed">
                Seu nome, para a banda saber quem está puxando o show:
              </p>
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
              className="studio-input w-full px-3.5 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNamePrompt(false)}
                className="pill-btn bg-[var(--bg)] h-9 px-4 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmGoLive}
                className="pill-btn pill-btn-primary h-9 px-4 text-xs"
              >
                Iniciar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rehearsal / stage cues strip when defined */}
      <StageNotesBar notes={song.notes} editing={false} readOnly />

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
        className="flex-shrink-0 bg-[var(--bg)]/95 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-2.5"
        style={{ paddingBottom: 'max(0.65rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="w-full flex items-center justify-between gap-3">
          {canNavigate ? (
            <button
              type="button"
              onClick={() => prevSongId && onNavigate(prevSongId)}
              disabled={!prevSongId}
              className="pill-btn h-11 px-5 text-sm"
              title="Música anterior (←)"
            >
              ‹ Anterior
            </button>
          ) : (
            <span className="font-mono text-xs text-[var(--muted)]">
              Seguindo {live.session.leaderName}
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowSetlist(true)}
            className="font-expressive text-sm text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer hidden sm:inline"
          >
            {setlistSongIdx + 1} / {totalSongs} · Setlist (S)
          </button>

          {canNavigate ? (
            <button
              type="button"
              onClick={() => nextSongId && onNavigate(nextSongId)}
              disabled={!nextSongId}
              className="pill-btn pill-btn-primary h-11 px-5 text-sm max-w-[60vw]"
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
            <span className="font-mono text-xs text-[var(--muted)] truncate">
              {nextSongMeta ? `Próxima: ${nextSongMeta.title}` : 'Última música'}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
