'use client';

import { useState, useSyncExternalStore } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import { playReferencePitch } from '@/lib/utils/pitch-audio';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MenuListIcon,
  MoonIcon,
  PauseIcon,
  PitchWaveIcon,
  PlayIcon,
  SunIcon,
} from '@/components/ui/Icons';

const subscribeSystemDark = (cb: () => void) => {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
};
const getSystemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
const getServerDark = () => false;

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
  const { displayMode, toggleHideChords, fontSize, setFontSize, theme, setTheme } = useDisplayStore();
  const systemDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, getServerDark);
  const isDark = theme === 'dark' || (theme === 'system' && systemDark);
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
      <div data-motion-scheme="standard" className="gm3-panel-enter flex-shrink-0 bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pt-2.5 pb-1.5">
        <div className="w-full rounded-[20px] bg-[var(--surface)] px-4 py-2 space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {hasSetlist && (
                <button
                  type="button"
                  onClick={onOpenSetlistDrawer}
                  className="pill-btn bg-[var(--bg)] w-10 h-10 flex-shrink-0"
                  title="Abrir setlist"
                  aria-label="Abrir setlist"
                >
                  <MenuListIcon size={17} />
                </button>
              )}
              <h1 className="font-display font-bold text-lg text-[var(--ink)] truncate">{songTitle}</h1>
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

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className="pill-btn bg-[var(--bg)] w-10 h-10"
                title={isDark ? 'Alternar para modo claro' : 'Alternar para modo escuro (palco)'}
                aria-label={isDark ? 'Alternar para modo claro' : 'Alternar para modo escuro'}
              >
                <span key={isDark ? 'sun' : 'moon'} className="gm3-icon-swap inline-flex">
                  {isDark ? <SunIcon size={17} /> : <MoonIcon size={17} />}
                </span>
              </button>
              <button
                type="button"
                onClick={onExit}
                className="pill-btn bg-[var(--bg)] px-3.5 h-10 text-xs flex-shrink-0"
                title="Voltar para a tela completa (Esc)"
              >
                Sair da tela limpa
              </button>
            </div>
          </div>
          {stageNotes && (
            <div className="flex items-start gap-2 text-xs text-[var(--ink)]">
              <span className="studio-chip bg-[var(--warn-dim)] text-[var(--warn-ink)] flex-shrink-0">
                Deixa
              </span>
              <span className="line-clamp-2 leading-snug">{stageNotes}</span>
            </div>
          )}
        </div>
      </div>

      {/* Floating bottom dock */}
      <div
        data-motion-scheme="standard"
        className="fixed bottom-4 inset-x-0 z-30 flex justify-center px-3 pointer-events-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div
          className="gm3-sheet-enter pointer-events-auto flex items-center gap-1.5 sm:gap-2 flex-wrap justify-center rounded-[24px] sm:rounded-full bg-[var(--surface)] px-3 py-2"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          {hasSetlist && !isFollowing && (
            <div className="gm3-btn-group">
              <button
                type="button"
                disabled={!prevSongId}
                onClick={() => prevSongId && onNavigateSong(prevSongId)}
                className="pill-btn bg-[var(--bg)] w-10 h-10"
                title="Música anterior"
                aria-label="Música anterior"
              >
                <ChevronLeftIcon size={17} />
              </button>
              <button
                type="button"
                disabled={!nextSongId}
                onClick={() => nextSongId && onNavigateSong(nextSongId)}
                className="pill-btn bg-[var(--bg)] w-10 h-10"
                title="Próxima música"
                aria-label="Próxima música"
              >
                <ChevronRightIcon size={17} />
              </button>
            </div>
          )}

          {!isFollowing && (
            <button
              type="button"
              aria-pressed={store.isAutoScrolling}
              onClick={store.toggleAutoScroll}
              className={`pill-btn px-3.5 h-10 text-xs ${
                store.isAutoScrolling ? 'pill-btn-tune' : 'bg-[var(--bg)]'
              }`}
            >
              {store.isAutoScrolling ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
              {store.isAutoScrolling ? 'Pausar' : 'Rolar'}
            </button>
          )}

          {!isFollowing && (
            <div
              data-compact-slot="true"
              data-collapsed={!store.isAutoScrolling ? 'true' : undefined}
              aria-hidden={!store.isAutoScrolling || undefined}
              inert={!store.isAutoScrolling || undefined}
              className="gm3-slot-x gm3-slot-x-toolbar flex-shrink-0"
            >
              <div className="gm3-slot-x-inner">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed - 0.1)}
                    className="pill-btn bg-[var(--bg)] w-10 h-10 font-mono text-xs"
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
                    className="pill-btn bg-[var(--bg)] w-10 h-10 font-mono text-xs"
                    aria-label="Aumentar velocidade"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="gm3-btn-group">
            <button
              type="button"
              onClick={() => setFontSize(fontSize - 10)}
              className="pill-btn bg-[var(--bg)] w-10 h-10 font-mono text-xs"
              aria-label="Diminuir letra"
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => setFontSize(fontSize + 10)}
              className="pill-btn bg-[var(--bg)] w-10 h-10 font-mono text-xs"
              aria-label="Aumentar letra"
            >
              A+
            </button>
          </div>

          {pitchTarget && (
            <button
              type="button"
              onClick={handlePlayPitch}
              className={`pill-btn px-3 h-10 text-xs ${
                pitchRinging ? 'pill-btn-primary' : 'bg-[var(--bg)] text-[var(--accent-ink)]'
              }`}
              title={`Tocar acorde-guia (${pitchTarget})`}
            >
              <PitchWaveIcon size={14} className={pitchRinging ? 'gm3-wave-ringing' : undefined} />
              {pitchTarget}
            </button>
          )}

          {!isFollowing && (
            <button
              type="button"
              onClick={onTriggerCountIn}
              className="pill-btn bg-[var(--bg)] px-3 h-10 font-mono text-xs"
              title="Contagem visual 1-2-3-4 (atalho: C)"
            >
              1·2·3·4
            </button>
          )}

          <button
            type="button"
            aria-pressed={chordsHidden}
            onClick={toggleHideChords}
            className={`pill-btn px-3.5 h-10 text-xs ${
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
