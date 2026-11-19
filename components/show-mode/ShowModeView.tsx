'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import type { useLiveSession } from '@/lib/stores/live-session-store';
import { useDialogA11y } from '@/lib/hooks/use-dialog-a11y';
import { Metronome } from '@/components/metronome/Metronome';
import { VisualPulse } from '@/components/metronome/VisualPulse';
import { ChordSheet } from '@/components/chord-sheet/ChordSheet';
import { SetlistDrawer } from '@/components/show-mode/SetlistDrawer';
import { StageNotesBar } from '@/components/song/StageNotesBar';
import { playReferencePitch } from '@/lib/utils/pitch-audio';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ColumnsIcon,
  MenuListIcon,
  MoonIcon,
  PauseIcon,
  PitchWaveIcon,
  PlayIcon,
  SlidersIcon,
  SunIcon,
} from '@/components/ui/Icons';
import type { Song, Setlist } from '@/lib/types/song';

const SWIPE_MIN_DX = 60;
const SWIPE_MAX_DT = 600;
const SWIPE_DX_DY_RATIO = 1.5;
const EDGE_GUARD_PX = 24;

const subscribeSystemDark = (cb: () => void) => {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
};
const getSystemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
const getServerDark = () => false;

interface ShowModeViewProps {
  song: Song;
  displayedKey: string;
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
  onSaveBpm?: (bpm: number) => void;
  handleGoLive: () => void;
  confirmGoLive: () => void;
  showNamePrompt: boolean;
  nameInput: string;
  setNameInput: (v: string) => void;
  setShowNamePrompt: (v: boolean) => void;
}

export function ShowModeView({
  song,
  displayedKey,
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
  onSaveBpm,
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
    theme,
    setTheme,
    sheetColumns,
    setSheetColumns,
    singleKeyShortcuts,
    capoDisplay,
    setCapoDisplay,
  } = useDisplayStore();

  const systemDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, getServerDark);
  const isDark = theme === 'dark' || (theme === 'system' && systemDark);

  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const goLiveDialogRef = useRef<HTMLDivElement>(null);
  const [showSetlist, setShowSetlist] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [pitchRinging, setPitchRinging] = useState(false);

  const canNavigate = !live.isFollowing;
  const chordsHidden = displayMode === 'lyrics-only';

  useDialogA11y(showNamePrompt, () => setShowNamePrompt(false), goLiveDialogRef);

  const handlePlayPitch = () => {
    if (!pitchTarget) return;
    if (playReferencePitch(pitchTarget, { mode: 'chord' })) {
      setPitchRinging(true);
      setTimeout(() => setPitchRinging(false), 1600);
    }
  };

  // Keyboard shortcuts for stage pedals / laptops (guarded against modifiers, inputs, focused controls, and modals)
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
        else if (mobileToolsOpen) setMobileToolsOpen(false);
        else onExit();
        return;
      }

      if (showSetlist) return;

      if (e.key === 'ArrowRight' && canNavigate && nextSongId && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onNavigate(nextSongId);
        return;
      }
      if (e.key === 'ArrowLeft' && canNavigate && prevSongId && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onNavigate(prevSongId);
        return;
      }

      if (!singleKeyShortcuts || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === ' ' && canNavigate && !onInteractiveControl) {
        e.preventDefault();
        store.toggleAutoScroll();
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleHideChords();
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        setShowSetlist((v) => !v);
      } else if (e.key.toLowerCase() === 'c' && canNavigate) {
        e.preventDefault();
        onTriggerCountIn();
      } else if (e.key.toLowerCase() === 'm' && canNavigate) {
        e.preventDefault();
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
    canNavigate,
    nextSongId,
    prevSongId,
    onNavigate,
    onExit,
    showSetlist,
    showNamePrompt,
    mobileToolsOpen,
    singleKeyShortcuts,
    store,
    toggleHideChords,
    onTriggerCountIn,
  ]);

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

  const secondaryStageControls = (
    <>
      {/* Live session controls */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {live.isLeading ? (
          <>
            <span className="studio-chip text-[var(--rec)] border border-[var(--rec)]/40 bg-[var(--rec)]/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--rec-dot)] animate-pulse" aria-hidden="true" />
              Liderando
            </span>
            <button
              type="button"
              onClick={live.stopLeading}
              className="pill-btn bg-[var(--bg)] px-3.5 h-11 text-xs"
            >
              Parar
            </button>
          </>
        ) : live.isFollowing ? (
          <>
            <span className="studio-chip text-[var(--tune)] border border-[var(--tune)]/40 bg-[var(--tune-dim)]">
              {live.isLeaderStale
                ? `${live.session.leaderName} inativo`
                : `Seguindo ${live.session.leaderName}`}
            </span>
            <button
              type="button"
              onClick={handleGoLive}
              className="pill-btn bg-[var(--bg)] px-3.5 h-11 text-xs"
            >
              Assumir
            </button>
            <button
              type="button"
              onClick={live.unfollow}
              className="pill-btn bg-[var(--bg)] px-3.5 h-11 text-xs"
              title="Desconectar do líder e navegar livremente neste aparelho"
            >
              Desconectar
            </button>
          </>
        ) : live.hasRemoteLeader && live.localUnfollow ? (
          <button
            type="button"
            onClick={live.refollow}
            className="pill-btn pill-btn-tune px-4 h-11 text-xs"
          >
            Seguir {live.session.leaderName}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleGoLive}
            className="pill-btn pill-btn-rec px-3.5 h-11 text-xs flex-shrink-0"
          >
            <span className="w-2 h-2 rounded-full bg-current" aria-hidden="true" />
            <span className="hidden 2xl:inline">Iniciar </span>Ao Vivo
          </button>
        )}

        {live.liveError && (
          <span role="alert" className="studio-chip bg-[var(--rec-dim)] text-[var(--on-rec-container)]">
            {live.liveError}
          </span>
        )}
      </div>

      {/* Pitch guide */}
      {pitchTarget && (
        <button
          type="button"
          onClick={handlePlayPitch}
          className={`pill-btn px-3.5 h-11 text-xs flex-shrink-0 ${
            pitchRinging ? 'pill-btn-primary' : 'bg-[var(--bg)] text-[var(--accent-ink)]'
          }`}
          title={`Tocar acorde-guia (${pitchTarget})`}
        >
          <PitchWaveIcon size={14} />
          {pitchTarget}
        </button>
      )}

      {/* Synchronized 1-2-3-4 count-in */}
      {canNavigate && (
        <button
          type="button"
          onClick={onTriggerCountIn}
          className="pill-btn bg-[var(--bg)] px-3.5 h-11 font-mono text-xs flex-shrink-0"
          title="Contagem visual 1-2-3-4 (atalho: C)"
        >
          1·2·3·4
        </button>
      )}

      {/* Per-device Capo shapes vs concert sounding chords toggle */}
      {song.capo > 0 && !chordsHidden && (
        <button
          type="button"
          aria-pressed={capoDisplay === 'shapes'}
          onClick={() => setCapoDisplay(capoDisplay === 'shapes' ? 'sounding' : 'shapes')}
          className={`pill-btn px-3.5 h-11 text-xs flex-shrink-0 ${
            capoDisplay === 'shapes' ? 'pill-btn-tune' : 'bg-[var(--bg)]'
          }`}
          title={
            capoDisplay === 'shapes'
              ? `Mostrando formas de dedo para Capo ${song.capo}. Clique para ver acordes no tom real (sem capo).`
              : `Mostrando acordes no tom real (sem capo). Clique para ver formas com Capo ${song.capo}.`
          }
        >
          {capoDisplay === 'shapes' ? `Formas (Capo ${song.capo})` : 'Tom real (sem capo)'}
        </button>
      )}

      {/* Speed stepper + quick presets (shown while scrolling on desktop, always inside mobile Palco tray) */}
      {canNavigate && (
        <div
          className={`${
            store.isAutoScrolling ? 'flex' : 'flex lg:hidden'
          } items-center gap-1 flex-wrap`}
        >
          <button
            type="button"
            onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed - 0.1)}
            className="pill-btn bg-[var(--bg)] w-11 h-11 font-mono text-xs"
            aria-label="Scroll mais devagar"
            title="Mais devagar (atalho: -)"
          >
            -
          </button>
          <span className="font-mono text-xs text-[var(--muted)] tabular-nums px-1 min-w-[40px] text-center">
            {store.autoScrollSpeed.toFixed(1)}×
          </span>
          <button
            type="button"
            onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed + 0.1)}
            className="pill-btn bg-[var(--bg)] w-11 h-11 font-mono text-xs"
            aria-label="Scroll mais rápido"
            title="Mais rápido (atalho: +)"
          >
            +
          </button>
          {store.isAutoScrolling &&
            [
              { label: '0.75×', value: 0.75 },
              { label: '1.0×', value: 1 },
              { label: '1.25×', value: 1.25 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                aria-pressed={Math.abs(store.autoScrollSpeed - preset.value) < 0.04}
                onClick={() => store.setAutoScrollSpeed(preset.value)}
                className={`pill-btn px-2.5 h-11 font-mono text-xs ${
                  Math.abs(store.autoScrollSpeed - preset.value) < 0.04
                    ? 'pill-btn-tune'
                    : 'bg-[var(--bg)]'
                }`}
              >
                {preset.label}
              </button>
            ))}
        </div>
      )}

      <Metronome
        readOnly={!canNavigate}
        beatsPerBar={beatsPerBar}
        savedTempo={song.tempo}
        tempoConfirmed={song.tempoConfirmed}
        onSaveBpm={onSaveBpm}
        buttonClass="bg-[var(--bg)]"
        heightClass="h-11"
      />

      <button
        type="button"
        aria-pressed={visualPulseEnabled}
        onClick={() => setVisualPulseEnabled(!visualPulseEnabled)}
        title="Exibir barra rítmica discreta no topo (só neste aparelho)"
        className={`pill-btn px-3.5 h-11 text-xs flex-shrink-0 ${
          visualPulseEnabled ? 'pill-btn-tonal' : 'bg-[var(--bg)]'
        }`}
      >
        Pulso
      </button>

      <button
        type="button"
        aria-pressed={sheetColumns === 2}
        onClick={() => setSheetColumns(sheetColumns === 2 ? 1 : 2)}
        className={`hidden xl:inline-flex pill-btn px-3.5 h-11 text-xs flex-shrink-0 ${
          sheetColumns === 2 ? 'pill-btn-tonal' : 'bg-[var(--bg)]'
        }`}
        title="Alternar entre 1 e 2 colunas no Modo Show"
      >
        <ColumnsIcon size={15} />
        {sheetColumns === 2 ? '2 col' : '1 col'}
      </button>
    </>
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      <VisualPulse />

      {/* Stage header */}
      <header className="flex-shrink-0 bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pt-3 pb-2.5">
        <div className="w-full rounded-[20px] bg-[var(--surface)] px-4 sm:px-5 py-2.5 space-y-2.5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="flex items-center justify-between gap-2 min-w-0 lg:contents">
              <button
                type="button"
                onClick={() => setShowSetlist((v) => !v)}
                title="Abrir setlist (atalho: S) - toque para pular ou arraste para reordenar"
                className="min-w-0 text-left rounded-2xl -mx-2 px-3 py-1 hover:bg-[var(--surface-high)] transition-colors cursor-pointer lg:order-1 lg:mr-auto"
              >
                <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] truncate">
                  <MenuListIcon size={14} className="flex-shrink-0" />
                  <span className="truncate">
                    {activeSetlist.name} · {setlistSongIdx + 1} de {totalSongs}
                    {wakeLockActive ? ' · Tela ativa' : ''}
                  </span>
                </div>
                <div className="flex items-baseline gap-2.5 min-w-0">
                  <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--ink)] truncate leading-tight">
                    {song.title}
                  </h1>
                  {displayedKey && !chordsHidden && (
                    <span className="font-expressive text-lg text-[var(--accent)] flex-shrink-0">
                      {displayedKey}
                    </span>
                  )}
                </div>
              </button>

              <div className="flex items-center gap-1.5 flex-shrink-0 lg:order-3">
                <button
                  type="button"
                  onClick={() => setTheme(isDark ? 'light' : 'dark')}
                  className="pill-btn bg-[var(--bg)] w-11 h-11"
                  title={isDark ? 'Alternar para modo claro' : 'Alternar para modo escuro (palco)'}
                  aria-label={isDark ? 'Alternar para modo claro' : 'Alternar para modo escuro'}
                >
                  {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  className="pill-btn bg-[var(--bg)] px-4 h-11 text-xs sm:text-sm"
                  title="Sair do Modo Show (Esc)"
                >
                  Sair
                </button>
              </div>
            </div>

            {/* Primary controls (always visible with 44px touch targets and zero clipping) */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap lg:order-2">
              {canNavigate && (
                <button
                  type="button"
                  aria-pressed={store.isAutoScrolling}
                  onClick={store.toggleAutoScroll}
                  className={`pill-btn px-3 sm:px-3.5 h-11 text-xs flex-shrink-0 ${
                    store.isAutoScrolling ? 'pill-btn-tune' : 'bg-[var(--bg)]'
                  }`}
                  title="Atalho: Espaço"
                >
                  {store.isAutoScrolling ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
                  <span className="sm:hidden">{store.isAutoScrolling ? 'Pausar' : 'Rolar'}</span>
                  <span className="hidden sm:inline">{store.isAutoScrolling ? 'Pausar' : 'Auto-scroll'}</span>
                </button>
              )}

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setFontSize(fontSize - 10)}
                  className="pill-btn bg-[var(--bg)] w-11 h-11 font-mono text-xs"
                  aria-label="Diminuir fonte"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() => setFontSize(fontSize + 10)}
                  className="pill-btn bg-[var(--bg)] w-11 h-11 font-mono text-xs"
                  aria-label="Aumentar fonte"
                >
                  A+
                </button>
              </div>

              <button
                type="button"
                aria-pressed={chordsHidden}
                onClick={toggleHideChords}
                className={`pill-btn px-3 sm:px-3.5 h-11 text-xs flex-shrink-0 ${
                  chordsHidden ? 'pill-btn-primary' : 'bg-[var(--bg)]'
                }`}
                title="Esconder ou mostrar acordes só neste aparelho (atalho: L)"
              >
                <span className="sm:hidden">{chordsHidden ? 'Letra' : 'Cifra'}</span>
                <span className="hidden sm:inline">{chordsHidden ? 'Só letra' : 'Com acordes'}</span>
              </button>

              {/* Compact tray trigger on mobile/tablet (< lg) so zero controls clip */}
              <button
                type="button"
                aria-expanded={mobileToolsOpen}
                onClick={() => setMobileToolsOpen((v) => !v)}
                className={`lg:hidden pill-btn px-3 sm:px-3.5 h-11 text-xs ml-auto ${
                  mobileToolsOpen ? 'pill-btn-tonal' : 'bg-[var(--bg)]'
                }`}
                title="Abrir controles de palco (Ao Vivo, metrônomo, guia, 1-2-3-4)"
              >
                <SlidersIcon size={15} />
                Palco
              </button>

              {/* Full inline wrapped controls on desktop (>= lg) */}
              <div className="hidden lg:contents">{secondaryStageControls}</div>
            </div>
          </div>

          {/* Mobile / Tablet collapsible stage controls tray */}
          {mobileToolsOpen && (
            <div className="gm3-panel-enter lg:hidden pt-2.5 border-t border-[var(--line-subtle)]/40 flex flex-wrap items-center gap-2">
              {secondaryStageControls}
            </div>
          )}
        </div>
      </header>

      {/* Go-live name modal */}
      {showNamePrompt && (
        <div
          className="gm3-backdrop-enter fixed inset-0 z-[75] bg-black/45 flex items-center justify-center p-4"
          onClick={() => setShowNamePrompt(false)}
        >
          <div
            ref={goLiveDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="show-go-live-title"
            className="gm3-dialog-enter w-full max-w-xs bg-[var(--surface)] rounded-[28px] p-6 space-y-4"
            style={{ boxShadow: 'var(--shadow-md)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h2 id="show-go-live-title" className="font-display text-lg font-bold text-[var(--ink)]">
                Iniciar Ao Vivo
              </h2>
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

      {/* Rehearsal / stage cues strip when defined */}
      <StageNotesBar notes={song.notes} editing={false} readOnly />

      {/* Main sheet */}
      <main
        id="main-content"
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
      </main>

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
              className="pill-btn h-11 px-4 sm:px-5 text-sm"
              title="Música anterior (←)"
            >
              <ChevronLeftIcon size={16} />
              Anterior
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
              className="pill-btn pill-btn-primary h-11 px-4 sm:px-5 text-sm max-w-[60vw]"
              title="Próxima música (→)"
            >
              <span className="truncate">
                {nextSongMeta
                  ? `Próxima: ${nextSongMeta.title}${
                      nextSongMeta.displayKey && !chordsHidden ? ` (${nextSongMeta.displayKey})` : ''
                    }`
                  : 'Fim do setlist'}
              </span>
              {nextSongId && <ChevronRightIcon size={16} />}
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
