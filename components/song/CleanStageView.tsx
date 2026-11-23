'use client';

import { useEffect, useRef, useState } from 'react';
import type { ParsedSong, Setlist } from '@/lib/types/song';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore, type DisplayMode } from '@/lib/stores/display-store';
import type { useLiveSession } from '@/lib/stores/live-session-store';
import { ensureMetronomeAudioContext } from '@/lib/hooks/use-metronome-engine';
import { useDialogA11y } from '@/lib/hooks/use-dialog-a11y';
import { useAnimatedPresence } from '@/lib/hooks/use-animated-presence';
import { prefersReducedMotion, runStateViewTransition } from '@/lib/utils/view-transition';
import { isMinorKey } from '@/lib/utils/music';
import { VisualPulse } from '@/components/metronome/VisualPulse';
import { ChordSheet } from '@/components/chord-sheet/ChordSheet';
import { SetlistDrawer } from '@/components/show-mode/SetlistDrawer';
import { StageNotesBar } from './StageNotesBar';
import { SongAdjustmentsPopover } from './SongAdjustmentsPopover';
import { ConnectedGroup } from '@/components/ui/ConnectedGroup';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MenuListIcon,
  PauseIcon,
  PlayIcon,
  SlidersIcon,
  SlidesIcon,
} from '@/components/ui/Icons';

const SWIPE_MIN_DX = 60;
const SWIPE_MAX_DT = 600;
const SWIPE_DX_DY_RATIO = 1.5;
const EDGE_GUARD_PX = 24;

interface CleanStageViewProps {
  song: ParsedSong;
  displayedKey: string;
  beatsPerBar: number;
  wakeLockActive: boolean;
  audioBlocked: boolean;
  onUnlockAudio: () => void;
  // Optional setlist & live sync (when opened from a setlist)
  activeSetlist: Setlist | null;
  setlistSongIdx: number;
  totalSongs: number;
  prevSongId: string | null;
  nextSongId: string | null;
  live: ReturnType<typeof useLiveSession>;
  handleGoLive: () => void;
  confirmGoLive: () => void;
  showNamePrompt: boolean;
  nameInput: string;
  setNameInput: (v: string) => void;
  setShowNamePrompt: (v: boolean) => void;
  // Navigation & actions
  onNavigateSong: (songId: string) => void;
  onChordTap: (chord: string) => void;
  onScrollStateChange: (state: { scrollTop: number; scrollRatio: number; maxScroll: number }) => void;
  onTriggerCountIn: () => void;
  onSaveBpm: (bpm: number) => void;
  onRequestSaveTranspose: () => void;
  onEnterSlidesMode: () => void;
  onEnterEdit: () => void;
  onExit: () => void;
}

/**
 * Unified distraction-free stage reading view ("Tela limpa"), absorbing legacy Show Mode.
 * Works identically for standalone songs and full setlists (with swipe navigation & Ao vivo sync),
 * using a constant 56px top bar and a calm 4-item floating bottom dock.
 */
export function CleanStageView({
  song,
  displayedKey,
  beatsPerBar,
  wakeLockActive,
  audioBlocked,
  onUnlockAudio,
  activeSetlist,
  setlistSongIdx,
  totalSongs,
  prevSongId,
  nextSongId,
  live,
  handleGoLive,
  confirmGoLive,
  showNamePrompt,
  nameInput,
  setNameInput,
  setShowNamePrompt,
  onNavigateSong,
  onChordTap,
  onScrollStateChange,
  onTriggerCountIn,
  onSaveBpm,
  onRequestSaveTranspose,
  onEnterSlidesMode,
  onEnterEdit,
  onExit,
}: CleanStageViewProps) {
  const store = usePlayerStore();
  const {
    displayMode,
    setDisplayMode,
    toggleHideChords,
    fontSize,
    setFontSize,
    sheetColumns,
    singleKeyShortcuts,
  } = useDisplayStore();

  const [showSetlist, setShowSetlist] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const touchRef = useRef<{ x: number; y: number; t: number; horizontal: boolean } | null>(null);
  const swipeLayerRef = useRef<HTMLDivElement>(null);
  const adjustRef = useRef<HTMLDivElement>(null);
  const adjustTriggerRef = useRef<HTMLButtonElement>(null);
  const goLiveDialogRef = useRef<HTMLDivElement>(null);

  const { mounted: adjustMounted, closing: adjustClosing } = useAnimatedPresence(adjustOpen, 200);
  const { mounted: goLiveMounted, closing: goLiveClosing } = useAnimatedPresence(showNamePrompt, 220);

  const hasSetlist = Boolean(activeSetlist);
  const canNavigate = !live.isFollowing;
  const minorKey = isMinorKey(displayedKey);
  const keyChipToneClasses = minorKey
    ? 'bg-[var(--minor-container)] text-[var(--on-minor-container)]'
    : 'bg-[var(--primary-container)] text-[var(--on-primary-container)]';
  const transposeDeltaLabel =
    store.transpose > 0 ? `+${store.transpose}` : store.transpose < 0 ? `${store.transpose}` : '';

  const hasActiveAdjustments =
    store.transpose !== 0 ||
    fontSize !== 100 ||
    store.metronomeOn ||
    sheetColumns === 2 ||
    live.isLeading ||
    live.isFollowing;

  useDialogA11y(showNamePrompt, () => setShowNamePrompt(false), goLiveDialogRef);

  // Close Adjustments popover on outside click
  useEffect(() => {
    if (!adjustOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (adjustRef.current && !adjustRef.current.contains(e.target as Node)) {
        setAdjustOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [adjustOpen]);

  // Stage keyboard shortcuts (guarded against inputs, modals, and focused buttons)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showNamePrompt) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      const onInteractiveControl = Boolean(
        target &&
          (target.tagName === 'BUTTON' ||
            target.tagName === 'A' ||
            target.tagName === 'SELECT' ||
            target.tagName === 'SUMMARY' ||
            target.getAttribute('role') === 'button')
      );

      if (e.key === 'Escape') {
        if (showSetlist) setShowSetlist(false);
        else if (adjustOpen) {
          setAdjustOpen(false);
          requestAnimationFrame(() => adjustTriggerRef.current?.focus({ preventScroll: true }));
        } else onExit();
        return;
      }

      if (showSetlist) return;

      if (hasSetlist && e.key === 'ArrowRight' && canNavigate && nextSongId && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onNavigateSong(nextSongId);
        return;
      }
      if (hasSetlist && e.key === 'ArrowLeft' && canNavigate && prevSongId && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onNavigateSong(prevSongId);
        return;
      }

      if (!singleKeyShortcuts || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === ' ' && canNavigate && !onInteractiveControl) {
        e.preventDefault();
        store.toggleAutoScroll();
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleHideChords();
      } else if (hasSetlist && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setShowSetlist((v) => !v);
      } else if (e.key.toLowerCase() === 'c' && canNavigate) {
        e.preventDefault();
        onTriggerCountIn();
      } else if (e.key.toLowerCase() === 'm' && canNavigate) {
        e.preventDefault();
        if (!store.metronomeOn) ensureMetronomeAudioContext();
        store.setMetronomeOn(!store.metronomeOn);
      } else if ((e.key === '+' || e.key === '=') && canNavigate) {
        e.preventDefault();
        store.setAutoScrollSpeed(store.autoScrollSpeed + 0.1);
      } else if ((e.key === '-' || e.key === '_') && canNavigate) {
        e.preventDefault();
        store.setAutoScrollSpeed(store.autoScrollSpeed - 0.1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    hasSetlist,
    canNavigate,
    nextSongId,
    prevSongId,
    onNavigateSong,
    onExit,
    showSetlist,
    showNamePrompt,
    adjustOpen,
    singleKeyShortcuts,
    store,
    toggleHideChords,
    onTriggerCountIn,
  ]);

  // Smooth horizontal swipe between setlist songs
  const resetSwipeOffset = (animate: boolean) => {
    const layer = swipeLayerRef.current;
    if (!layer) return;
    layer.style.transition =
      animate && !prefersReducedMotion()
        ? 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)'
        : 'none';
    layer.style.transform = 'translate3d(0, 0, 0)';
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!hasSetlist || !canNavigate) return;
    const t = e.touches[0];
    if (!t) return;
    if (t.clientX <= EDGE_GUARD_PX || t.clientX >= window.innerWidth - EDGE_GUARD_PX) {
      touchRef.current = null;
      return;
    }
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), horizontal: false };
    const layer = swipeLayerRef.current;
    if (layer) layer.style.transition = 'none';
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchRef.current || !canNavigate || prefersReducedMotion()) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    if (!touchRef.current.horizontal) {
      if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * SWIPE_DX_DY_RATIO) {
        touchRef.current.horizontal = true;
      } else if (Math.abs(dy) > 18) {
        touchRef.current = null;
        return;
      } else {
        return;
      }
    }
    const layer = swipeLayerRef.current;
    if (!layer) return;
    const canGoDir = (dx < 0 && Boolean(nextSongId)) || (dx > 0 && Boolean(prevSongId));
    const damped = canGoDir ? Math.max(-72, Math.min(72, dx * 0.28)) : dx * 0.08;
    layer.style.transform = `translate3d(${damped}px, 0, 0)`;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchRef.current || !canNavigate) {
      resetSwipeOffset(true);
      return;
    }
    const start = touchRef.current;
    touchRef.current = null;
    const t = e.changedTouches[0];
    if (!t) {
      resetSwipeOffset(true);
      return;
    }
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    if (
      dt <= SWIPE_MAX_DT &&
      Math.abs(dx) >= SWIPE_MIN_DX &&
      Math.abs(dx) > Math.abs(dy) * SWIPE_DX_DY_RATIO
    ) {
      if (dx < 0 && nextSongId) {
        resetSwipeOffset(false);
        onNavigateSong(nextSongId);
        return;
      }
      if (dx > 0 && prevSongId) {
        resetSwipeOffset(false);
        onNavigateSong(prevSongId);
        return;
      }
    }
    resetSwipeOffset(true);
  };

  const handleTouchCancel = () => {
    touchRef.current = null;
    resetSwipeOffset(true);
  };

  return (
    <div
      data-clean-stage="true"
      data-motion-scheme="standard"
      className="h-screen flex flex-col overflow-hidden bg-[var(--bg)] text-[var(--ink)]"
    >
      <VisualPulse />

      {/* Constant 56px slim top bar: never collapses, never shifts lyrics */}
      <header
        className={`flex-shrink-0 h-[56px] px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 border-b transition-colors duration-200 ${
          scrolled
            ? 'bg-[var(--surface)]/95 backdrop-blur-md border-[var(--line-subtle)]/35'
            : 'bg-transparent border-transparent'
        }`}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          {activeSetlist && (
            <button
              type="button"
              onClick={() => setShowSetlist(true)}
              aria-haspopup="dialog"
              aria-expanded={showSetlist}
              className="pill-btn bg-[var(--surface)] h-9 px-2.5 font-mono text-xs tabular-nums flex-shrink-0"
              title={`Abrir setlist ${activeSetlist.name} (atalho: S)`}
              aria-label={`Abrir setlist ${activeSetlist.name} (${setlistSongIdx + 1} de ${totalSongs})`}
            >
              <MenuListIcon size={15} />
              <span>
                {setlistSongIdx + 1}/{totalSongs}
              </span>
            </button>
          )}

          <h1
            data-vt-song-title={song.id}
            title={song.title}
            className="font-display font-bold text-[17px] sm:text-xl text-[var(--ink)] truncate leading-tight"
          >
            {song.title}
          </h1>

          {displayedKey && (
            <button
              type="button"
              data-vt-song-key={song.id}
              onClick={() => setAdjustOpen((v) => !v)}
              className={`studio-chip ${keyChipToneClasses} font-semibold px-2.5 py-0.5 text-xs flex-shrink-0 cursor-pointer hover:opacity-90`}
              title={`Tom ${displayedKey}${transposeDeltaLabel ? ` (${transposeDeltaLabel})` : ''}. Toque para ajustar tonalidade e fonte`}
              aria-label={`Tom ${displayedKey}. Abrir ajustes de tonalidade e fonte`}
            >
              {displayedKey}
            </button>
          )}

          {wakeLockActive && (
            <span
              className="hidden md:inline-flex studio-chip bg-[var(--tune-dim)] text-[var(--tune)] flex-shrink-0"
              title="Bloqueio automático de tela desativado enquanto você lê"
            >
              Tela ativa
            </span>
          )}

          {activeSetlist && live.isLeading && (
            <span className="hidden sm:inline-flex studio-chip text-[var(--rec)] border border-[var(--rec)]/40 bg-[var(--rec)]/10 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--rec-dot)] animate-pulse" aria-hidden="true" />
              Ao vivo
            </span>
          )}

          {activeSetlist && live.isFollowing && (
            <span className="hidden sm:inline-flex studio-chip text-[var(--tune)] bg-[var(--tune-dim)] flex-shrink-0">
              Seguindo {live.session.leaderName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {store.metronomeOn && (
            <button
              type="button"
              onClick={() => store.setMetronomeOn(false)}
              className="hidden sm:inline-flex pill-btn pill-btn-primary h-9 px-2.5 text-xs font-mono tabular-nums"
              title="Metrônomo ativo — toque para parar"
            >
              <span className="w-2 h-2 rounded-full bg-current animate-pulse" aria-hidden="true" />
              {store.bpm}
            </button>
          )}

          <button
            type="button"
            onClick={onEnterSlidesMode}
            className="pill-btn bg-[var(--surface)] h-9 w-9 sm:w-auto sm:px-3 text-xs flex-shrink-0"
            title="Trocar para visão paginada em Slides"
            aria-label="Slides"
          >
            <SlidesIcon size={15} />
            <span className="hidden sm:inline">Slides</span>
          </button>

          <button
            type="button"
            onClick={onExit}
            className="pill-btn bg-[var(--surface)] h-9 px-3 sm:px-3.5 text-xs flex-shrink-0"
            title="Voltar para a visão da música (Esc)"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Optional compact stage cue bar */}
      {song.notes.trim() && <StageNotesBar notes={song.notes} editing={false} readOnly />}

      {/* Live session error notice */}
      {live.liveError && (
        <div role="alert" className="flex-shrink-0 px-4 sm:px-6 lg:px-8 pb-1.5">
          <span className="studio-chip bg-[var(--rec-dim)] text-[var(--on-rec-container)]">
            {live.liveError}
          </span>
        </div>
      )}

      {/* Full-height distraction-free ChordSheet */}
      <main
        id="main-content"
        className="flex flex-1 relative min-h-0"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        <div ref={swipeLayerRef} key={song.id} className="gm3-page-enter flex flex-1 min-h-0 min-w-0">
          <ChordSheet
            song={song}
            displayMode={displayMode}
            onChordTap={onChordTap}
            onScrollStateChange={(st) => {
              onScrollStateChange(st);
              setScrolled(st.scrollTop > 12);
            }}
            syncCorrection={live.syncCorrection}
            bottomPaddingClass="pb-28"
          />
        </div>
      </main>

      {/* Calm 4-item floating bottom dock (consistent Cifra|Letra|Acordes + Ajustes across all 3 views) */}
      <div
        className="fixed bottom-3 sm:bottom-4 inset-x-0 z-30 flex justify-center px-2.5 sm:px-4 pointer-events-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div
          ref={adjustRef}
          data-clean-dock="true"
          className="relative pointer-events-auto flex items-center gap-1.5 sm:gap-2 rounded-full bg-[var(--surface)]/95 backdrop-blur-md px-2 sm:px-3 py-1.5 max-w-full"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          {/* 1. Setlist Prev / Next (when inside a setlist and not following) */}
          {hasSetlist && canNavigate && (
            <div className="gm3-btn-group flex-shrink-0">
              <button
                type="button"
                disabled={!prevSongId}
                onClick={() => prevSongId && onNavigateSong(prevSongId)}
                className="pill-btn bg-[var(--bg)] w-10 h-10"
                title="Música anterior (←)"
                aria-label="Música anterior"
              >
                <ChevronLeftIcon size={16} />
              </button>
              <button
                type="button"
                disabled={!nextSongId}
                onClick={() => nextSongId && onNavigateSong(nextSongId)}
                className="pill-btn bg-[var(--bg)] w-10 h-10"
                title="Próxima música (→)"
                aria-label="Próxima música"
              >
                <ChevronRightIcon size={16} />
              </button>
            </div>
          )}

          {/* 2. Rolar + inline speed stepper ONLY while actively scrolling */}
          {canNavigate && (
            <div className="inline-flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                aria-pressed={store.isAutoScrolling}
                onClick={store.toggleAutoScroll}
                className={`pill-btn h-10 w-10 lg:w-auto lg:px-3.5 text-xs flex-shrink-0 ${
                  store.isAutoScrolling ? 'pill-btn-tune' : 'bg-[var(--bg)]'
                }`}
                title={store.isAutoScrolling ? 'Pausar rolagem (Espaço)' : 'Rolar automaticamente (Espaço)'}
                aria-label={store.isAutoScrolling ? 'Pausar rolagem' : 'Iniciar rolagem'}
              >
                {store.isAutoScrolling ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
                <span className="hidden lg:inline">{store.isAutoScrolling ? 'Pausar' : 'Rolar'}</span>
              </button>

              {store.isAutoScrolling && (
                <div className="hidden sm:inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed - 0.1)}
                    className="pill-btn bg-[var(--bg)] w-8 h-10 font-mono text-xs"
                    aria-label="Diminuir velocidade"
                  >
                    -
                  </button>
                  <span className="font-mono text-xs text-[var(--muted)] tabular-nums px-0.5 min-w-[34px] text-center">
                    {store.autoScrollSpeed.toFixed(1)}×
                  </span>
                  <button
                    type="button"
                    onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed + 0.1)}
                    className="pill-btn bg-[var(--bg)] w-8 h-10 font-mono text-xs"
                    aria-label="Aumentar velocidade"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 3. Unified Cifra | Letra | Acordes */}
          <ConnectedGroup
            value={displayMode}
            ariaLabel="Modo de leitura na tela limpa"
            subtle
            className="flex-shrink-0"
          >
            {(
              [
                { id: 'both', label: 'Cifra' },
                { id: 'lyrics-only', label: 'Letra' },
                { id: 'chords-only', label: 'Acordes' },
              ] as { id: DisplayMode; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={displayMode === opt.id}
                onClick={() => runStateViewTransition(() => setDisplayMode(opt.id), 'morph')}
                className="gm3-connected-btn h-10 px-2.5 sm:px-3 text-xs font-medium cursor-pointer"
              >
                {opt.label}
              </button>
            ))}
          </ConnectedGroup>

          {/* 4. Direct Tonalidade & Fonte quick steppers on tablet/desktop (always top of Ajustes on phone) */}
          <div
            data-clean-transpose="true"
            role="group"
            aria-label="Ajustar tonalidade"
            className="hidden md:inline-flex gm3-btn-group flex-shrink-0"
          >
            <button
              type="button"
              onClick={store.transposeDown}
              className="pill-btn bg-[var(--bg)] w-8 h-10 font-mono text-xs"
              aria-label="Baixar meio tom"
              title="Baixar meio tom"
            >
              -
            </button>
            <button
              type="button"
              disabled={store.transpose === 0}
              onClick={() => store.setTranspose(0)}
              className={`gm3-icon-btn font-mono text-xs min-w-[38px] h-10 px-1.5 text-center tabular-nums inline-flex items-center justify-center ${
                store.transpose !== 0
                  ? `${keyChipToneClasses} font-semibold cursor-pointer`
                  : 'bg-[var(--bg)] text-[var(--ink)] font-semibold cursor-default'
              }`}
              title={
                store.transpose !== 0
                  ? `Tom ${displayedKey || transposeDeltaLabel} (${transposeDeltaLabel}). Toque para voltar ao original`
                  : `Tom ${displayedKey || 'original'}`
              }
              aria-label={`Tom ${displayedKey || transposeDeltaLabel || 'original'}`}
            >
              {displayedKey || transposeDeltaLabel || '0'}
            </button>
            <button
              type="button"
              onClick={store.transposeUp}
              className="pill-btn bg-[var(--bg)] w-8 h-10 font-mono text-xs"
              aria-label="Subir meio tom"
              title="Subir meio tom"
            >
              +
            </button>
          </div>

          <div
            data-clean-font="true"
            role="group"
            aria-label="Ajustar tamanho da fonte"
            className="hidden md:inline-flex gm3-btn-group flex-shrink-0"
          >
            <button
              type="button"
              onClick={() => setFontSize(fontSize - 10)}
              className="pill-btn bg-[var(--bg)] w-9 h-10 font-mono text-xs"
              aria-label="Diminuir fonte"
              title={`Diminuir fonte (atual ${fontSize}%)`}
            >
              A-
            </button>
            <button
              type="button"
              disabled={fontSize === 100}
              onClick={() => setFontSize(100)}
              className={`hidden lg:inline-flex gm3-icon-btn font-mono text-xs min-w-[42px] h-10 px-1 text-center tabular-nums items-center justify-center ${
                fontSize !== 100
                  ? 'bg-[var(--primary-container)] text-[var(--on-primary-container)] font-semibold cursor-pointer'
                  : 'bg-[var(--bg)] text-[var(--muted)] cursor-default'
              }`}
              title={fontSize !== 100 ? 'Toque para voltar a 100%' : 'Tamanho padrão da fonte (100%)'}
              aria-label={`Tamanho da fonte ${fontSize}%`}
            >
              {fontSize}%
            </button>
            <button
              type="button"
              onClick={() => setFontSize(fontSize + 10)}
              className="pill-btn bg-[var(--bg)] w-9 h-10 font-mono text-xs"
              aria-label="Aumentar fonte"
              title={`Aumentar fonte (atual ${fontSize}%)`}
            >
              A+
            </button>
          </div>

          {/* 5. Unified Ajustes trigger (opens upward cleanly above the dock) */}
          <button
            ref={adjustTriggerRef}
            type="button"
            data-clean-adjustments-trigger="true"
            onClick={() => setAdjustOpen((v) => !v)}
            aria-expanded={adjustOpen}
            aria-haspopup="dialog"
            aria-label="Ajustes da tela limpa"
            title="Ajustes (tonalidade, fonte, metrônomo, 1·2·3·4, tema)"
            className={`relative pill-btn h-10 w-10 xl:w-auto xl:px-3 text-xs flex-shrink-0 ${
              adjustOpen ? 'pill-btn-tonal' : 'bg-[var(--bg)]'
            }`}
          >
            <SlidersIcon size={16} />
            <span className="hidden xl:inline">Ajustes</span>
            {hasActiveAdjustments && (
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 xl:static w-2 h-2 rounded-full bg-[var(--accent)]"
              />
            )}
          </button>

          {/* Upward GM3 Adjustments Popover */}
          {adjustMounted && (
            <div
              role="dialog"
              aria-label="Ajustes da tela limpa"
              data-clean-adjustments-popover="true"
              inert={adjustClosing || undefined}
              className={`gm3-popover-bottom-right ${adjustClosing ? 'gm3-popover-exit' : ''} absolute right-0 bottom-[calc(100%+10px)] z-50 w-[min(330px,calc(100vw-24px))] max-h-[min(74vh,580px)] overflow-y-auto rounded-[24px] bg-[var(--surface)] p-4`}
              style={{ boxShadow: 'var(--shadow-md)' }}
            >
              {/* Mobile auto-scroll speed row inside Ajustes when scrolling on tiny phones */}
              {canNavigate && store.isAutoScrolling && (
                <div className="sm:hidden pb-3 mb-3 border-b border-[var(--line-subtle)]/40 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--ink)]">Velocidade</span>
                  <div className="gm3-btn-group">
                    <button
                      type="button"
                      onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed - 0.1)}
                      className="pill-btn bg-[var(--bg)] w-9 h-9 font-mono text-xs"
                      aria-label="Diminuir velocidade"
                    >
                      -
                    </button>
                    <span className="font-mono text-xs text-[var(--ink)] tabular-nums px-2 flex items-center">
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
                </div>
              )}

              <SongAdjustmentsPopover
                variant="clean"
                displayedKey={displayedKey}
                capo={song.capo}
                beatsPerBar={beatsPerBar}
                savedTempo={song.tempo}
                tempoConfirmed={song.tempoConfirmed}
                isFollowing={live.isFollowing}
                audioBlocked={audioBlocked}
                onUnlockAudio={onUnlockAudio}
                onSaveBpm={onSaveBpm}
                onRequestSaveTranspose={onRequestSaveTranspose}
                onTriggerCountIn={onTriggerCountIn}
                hasSetlist={hasSetlist}
                live={live}
                onGoLive={handleGoLive}
                onEnterSlidesMode={onEnterSlidesMode}
                onEnterEdit={onEnterEdit}
                onClose={() => setAdjustOpen(false)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Setlist Drawer */}
      {activeSetlist && (
        <SetlistDrawer
          open={showSetlist}
          setlist={activeSetlist}
          currentSongId={song.id}
          canReorder={canNavigate}
          onNavigate={onNavigateSong}
          onClose={() => setShowSetlist(false)}
        />
      )}

      {/* Go-live name prompt modal */}
      {goLiveMounted && (
        <div
          className={`${goLiveClosing ? 'gm3-backdrop-exit' : 'gm3-backdrop-enter'} fixed inset-0 z-[75] bg-black/45 flex items-center justify-center p-4`}
          onClick={goLiveClosing ? undefined : () => setShowNamePrompt(false)}
          inert={goLiveClosing || undefined}
        >
          <div
            ref={goLiveDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clean-go-live-title"
            className={`${goLiveClosing ? 'gm3-dialog-exit' : 'gm3-dialog-enter'} w-full max-w-xs bg-[var(--surface)] rounded-[28px] p-6 space-y-4`}
            style={{ boxShadow: 'var(--shadow-md)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h2 id="clean-go-live-title" className="font-display text-lg font-bold text-[var(--ink)]">
                Iniciar Ao Vivo
              </h2>
              <p className="text-xs text-[var(--muted)] leading-relaxed">
                Seu nome, para a banda saber quem está puxando a música:
              </p>
            </div>
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmGoLive();
              }}
              aria-label="Seu nome na sessão ao vivo"
              placeholder="Ex.: Alex - Violão"
              className="studio-input w-full px-3.5 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNamePrompt(false)}
                className="pill-btn bg-[var(--bg)] h-10 px-4 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmGoLive}
                className="pill-btn pill-btn-primary h-10 px-4 text-xs"
              >
                Iniciar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
