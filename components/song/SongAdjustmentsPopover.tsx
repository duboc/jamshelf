'use client';

import { useSyncExternalStore } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore, type DisplayMode } from '@/lib/stores/display-store';
import type { useLiveSession } from '@/lib/stores/live-session-store';
import { runStateViewTransition } from '@/lib/utils/view-transition';
import { ConnectedGroup } from '@/components/ui/ConnectedGroup';
import { Metronome } from '@/components/metronome/Metronome';
import {
  CheckIcon,
  CloseIcon,
  ColumnsIcon,
  EditIcon,
  HeadphonesIcon,
  MoonIcon,
  SlidesIcon,
  SunIcon,
} from '@/components/ui/Icons';

const subscribeSystemDark = (cb: () => void) => {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
};
const getSystemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
const getServerDark = () => false;

interface SongAdjustmentsPopoverProps {
  /** 'song' for full Song view, 'clean' for unified Tela limpa stage view */
  variant: 'song' | 'clean';
  displayedKey: string;
  capo: number;
  beatsPerBar: number;
  savedTempo: number;
  tempoConfirmed: boolean;
  isFollowing: boolean;
  audioBlocked?: boolean;
  onUnlockAudio?: () => void;
  // Song-view rehearsal extras
  chordCount?: number;
  onToggleChordsRef?: () => void;
  hasCalibration?: boolean;
  canCalibrate?: boolean;
  calibrating?: boolean;
  onStartCalibration?: () => void;
  onClearCalibration?: () => void;
  hasSpotify?: boolean;
  showSpotifyPreview?: boolean;
  onToggleSpotifyPreview?: () => void;
  // Shared actions
  onSaveBpm?: (bpm: number) => void;
  onRequestSaveTranspose?: () => void;
  onTriggerCountIn: () => void;
  // Live session (optional, shown when in a setlist)
  hasSetlist?: boolean;
  live?: ReturnType<typeof useLiveSession>;
  onGoLive?: () => void;
  // Quick view switching
  onEnterFocusMode?: () => void;
  onEnterSlidesMode?: () => void;
  onEnterEdit?: () => void;
  onClose: () => void;
}

/**
 * Unified GM3 Adjustments & Rehearsal popover shared between Song view and Tela limpa.
 * Keeps top/bottom stage bars ultra-calm while every secondary tool stays 1 tap away.
 */
export function SongAdjustmentsPopover({
  variant,
  displayedKey,
  capo,
  beatsPerBar,
  savedTempo,
  tempoConfirmed,
  isFollowing,
  audioBlocked = false,
  onUnlockAudio,
  chordCount = 0,
  onToggleChordsRef,
  hasCalibration = false,
  canCalibrate = false,
  calibrating = false,
  onStartCalibration,
  onClearCalibration,
  hasSpotify = false,
  showSpotifyPreview = false,
  onToggleSpotifyPreview,
  onSaveBpm,
  onRequestSaveTranspose,
  onTriggerCountIn,
  hasSetlist = false,
  live,
  onGoLive,
  onEnterFocusMode,
  onEnterSlidesMode,
  onEnterEdit,
  onClose,
}: SongAdjustmentsPopoverProps) {
  const store = usePlayerStore();
  const {
    displayMode,
    setDisplayMode,
    fontSize,
    setFontSize,
    chordsRefOpen,
    visualPulseEnabled,
    setVisualPulseEnabled,
    sheetColumns,
    setSheetColumns,
    capoDisplay,
    setCapoDisplay,
    theme,
    setTheme,
  } = useDisplayStore();

  const systemDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, getServerDark);
  const isDark = theme === 'dark' || (theme === 'system' && systemDark);

  const isLyricsOnly = displayMode === 'lyrics-only';
  const transposeDeltaLabel =
    store.transpose > 0 ? `+${store.transpose}` : store.transpose < 0 ? `${store.transpose}` : '';

  return (
    <div className="space-y-3.5 text-left">
      {/* 1. Tonalidade e Fonte (always visible in every reading mode) */}
      <div className="space-y-2.5">
        <div className="field-label">Tonalidade e fonte</div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-medium text-[var(--ink)]">Tom</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="gm3-btn-group">
              <button
                type="button"
                onClick={store.transposeDown}
                className="pill-btn bg-[var(--bg)] w-9 h-9 font-mono text-xs"
                aria-label="Baixar meio tom"
              >
                -
              </button>
              <button
                type="button"
                disabled={store.transpose === 0}
                onClick={() => store.setTranspose(0)}
                className={`gm3-icon-btn font-mono text-xs min-w-[52px] h-9 px-2 text-center tabular-nums ${
                  store.transpose !== 0
                    ? 'bg-[var(--primary-container)] text-[var(--on-primary-container)] font-semibold cursor-pointer'
                    : 'text-[var(--ink)] font-semibold cursor-default'
                }`}
                title={store.transpose !== 0 ? 'Toque para voltar ao tom original' : 'Tom atual'}
              >
                {displayedKey || '0'}
                {transposeDeltaLabel ? ` (${transposeDeltaLabel})` : ''}
              </button>
              <button
                type="button"
                onClick={store.transposeUp}
                className="pill-btn bg-[var(--bg)] w-9 h-9 font-mono text-xs"
                aria-label="Subir meio tom"
              >
                +
              </button>
              <button
                type="button"
                aria-pressed={store.useFlats}
                onClick={store.toggleFlats}
                className={`pill-btn w-9 h-9 font-mono text-xs ${
                  store.useFlats ? 'pill-btn-primary' : 'bg-[var(--bg)]'
                }`}
                title="Alternar sustenidos (#) e bemóis (b)"
                aria-label={store.useFlats ? 'Mudar para sustenidos' : 'Mudar para bemóis'}
              >
                {store.useFlats ? '♭' : '♯'}
              </button>
            </div>
          </div>
        </div>

        {store.transpose !== 0 && onRequestSaveTranspose && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onRequestSaveTranspose();
            }}
            className="pill-btn bg-[var(--primary-container)] text-[var(--on-primary-container)] w-full justify-center px-3 h-9 text-xs font-semibold"
          >
            Salvar neste novo tom
          </button>
        )}

        {capo > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[var(--muted)]">Capo {capo}</span>
            <ConnectedGroup value={capoDisplay} ariaLabel="Acordes com capo" subtle>
              <button
                type="button"
                aria-pressed={capoDisplay === 'sounding'}
                onClick={() => setCapoDisplay('sounding')}
                className="gm3-connected-btn h-8 px-2.5 text-xs font-medium cursor-pointer"
              >
                Tom real
              </button>
              <button
                type="button"
                aria-pressed={capoDisplay === 'shapes'}
                onClick={() => setCapoDisplay('shapes')}
                className="gm3-connected-btn h-8 px-2.5 text-xs font-medium cursor-pointer"
              >
                Formas
              </button>
            </ConnectedGroup>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-[var(--ink)]">Fonte</span>
          <div className="gm3-btn-group">
            <button
              type="button"
              onClick={() => setFontSize(fontSize - 10)}
              className="pill-btn bg-[var(--bg)] w-9 h-9 font-mono text-xs"
              aria-label="Diminuir fonte"
            >
              A-
            </button>
            <button
              type="button"
              disabled={fontSize === 100}
              onClick={() => setFontSize(100)}
              className={`gm3-icon-btn font-mono text-xs min-w-[46px] h-9 px-1.5 text-center tabular-nums ${
                fontSize !== 100
                  ? 'bg-[var(--primary-container)] text-[var(--on-primary-container)] font-semibold cursor-pointer'
                  : 'text-[var(--muted)] cursor-default'
              }`}
              title={fontSize !== 100 ? 'Toque para voltar a 100%' : 'Tamanho padrão (100%)'}
              aria-label={`Tamanho da fonte ${fontSize}%`}
            >
              {fontSize}%
            </button>
            <button
              type="button"
              onClick={() => setFontSize(fontSize + 10)}
              className="pill-btn bg-[var(--bg)] w-9 h-9 font-mono text-xs"
              aria-label="Aumentar fonte"
            >
              A+
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--line-subtle)]/40" />

      {/* 2. Leitura (Reading mode, Theme & Columns) */}
      <div className="space-y-2.5">
        <div className="field-label">Leitura</div>

        <ConnectedGroup
          value={displayMode}
          ariaLabel="Modo de leitura"
          subtle
          className="w-full grid grid-cols-3"
        >
          {(
            [
              { mode: 'both', label: 'Cifra' },
              { mode: 'lyrics-only', label: 'Só letra' },
              { mode: 'chords-only', label: 'Acordes' },
            ] as { mode: DisplayMode; label: string }[]
          ).map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              aria-pressed={displayMode === mode}
              onClick={() => runStateViewTransition(() => setDisplayMode(mode), 'morph')}
              className="gm3-connected-btn h-9 px-2 text-xs font-medium cursor-pointer"
            >
              {label}
            </button>
          ))}
        </ConnectedGroup>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="pill-btn bg-[var(--bg)] px-3 h-9 text-xs flex-1 justify-center"
          >
            {isDark ? <SunIcon size={15} /> : <MoonIcon size={15} />}
            {isDark ? 'Tema claro' : 'Tema escuro'}
          </button>

          <button
            type="button"
            aria-pressed={sheetColumns === 2}
            onClick={() =>
              runStateViewTransition(() => setSheetColumns(sheetColumns === 2 ? 1 : 2), 'morph')
            }
            className={`hidden xl:inline-flex pill-btn px-3 h-9 text-xs flex-1 justify-center ${
              sheetColumns === 2 ? 'pill-btn-tonal' : 'bg-[var(--bg)]'
            }`}
          >
            <ColumnsIcon size={15} />
            {sheetColumns === 2 ? '2 colunas' : '1 coluna'}
          </button>
        </div>
      </div>

      <div className="border-t border-[var(--line-subtle)]/40" />

      {/* 3. Ensaio e Palco */}
      <div className="space-y-2.5">
        <div className="field-label">Ensaio e palco</div>

        <Metronome
          readOnly={isFollowing}
          beatsPerBar={beatsPerBar}
          savedTempo={savedTempo}
          tempoConfirmed={tempoConfirmed}
          onSaveBpm={onSaveBpm}
          audioBlocked={audioBlocked}
          onUnlockAudio={onUnlockAudio}
          buttonClass="bg-[var(--bg)]"
          heightClass="h-9"
        />

        <div className="flex flex-wrap items-center gap-1.5">
          {!isFollowing && !calibrating && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onTriggerCountIn();
              }}
              className="pill-btn bg-[var(--bg)] px-3 h-9 font-mono text-xs"
              title="Contagem visual 1-2-3-4 (atalho: C)"
            >
              1·2·3·4
            </button>
          )}

          <button
            type="button"
            aria-pressed={visualPulseEnabled}
            onClick={() => setVisualPulseEnabled(!visualPulseEnabled)}
            className={`pill-btn px-3 h-9 text-xs ${
              visualPulseEnabled ? 'pill-btn-tonal' : 'bg-[var(--bg)]'
            }`}
            title="Barra rítmica visual no topo durante o metrônomo"
          >
            Pulso visual
          </button>

          {variant === 'song' && !isLyricsOnly && chordCount > 0 && onToggleChordsRef && (
            <button
              type="button"
              aria-pressed={chordsRefOpen}
              onClick={() => {
                onToggleChordsRef();
                onClose();
              }}
              className={`pill-btn px-3 h-9 text-xs ${
                chordsRefOpen ? 'pill-btn-tonal' : 'bg-[var(--bg)]'
              }`}
            >
              Diagramas ({chordCount})
            </button>
          )}

          {variant === 'song' && !isFollowing && canCalibrate && !calibrating && onStartCalibration && (
            hasCalibration ? (
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStartCalibration();
                  }}
                  className="pill-btn bg-[var(--bg)] px-3 h-9 text-xs text-[var(--tune)]"
                >
                  <CheckIcon size={13} />
                  Calibrada
                </button>
                {onClearCalibration && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onClearCalibration();
                    }}
                    className="gm3-icon-btn w-8 h-8 flex items-center justify-center text-[var(--muted)] hover:text-[var(--rec)] cursor-pointer"
                    aria-label="Remover calibração"
                    title="Remover calibração"
                  >
                    <CloseIcon size={14} />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartCalibration();
                }}
                className="pill-btn bg-[var(--bg)] px-3 h-9 text-xs"
              >
                Calibrar rolagem
              </button>
            )
          )}

          {variant === 'song' && hasSpotify && onToggleSpotifyPreview && (
            <button
              type="button"
              aria-pressed={showSpotifyPreview}
              onClick={() => {
                onToggleSpotifyPreview();
                onClose();
              }}
              className={`pill-btn px-3 h-9 text-xs ${
                showSpotifyPreview ? 'pill-btn-tune' : 'bg-[var(--bg)]'
              }`}
            >
              <HeadphonesIcon size={14} />
              {showSpotifyPreview ? 'Ocultar Spotify' : 'Ouvir Spotify'}
            </button>
          )}
        </div>

        {/* Live band sync controls when inside a setlist */}
        {hasSetlist && live && (
          <div className="pt-1 flex flex-wrap items-center gap-1.5">
            {live.isLeading ? (
              <>
                <span className="studio-chip text-[var(--rec)] border border-[var(--rec)]/40 bg-[var(--rec)]/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--rec-dot)] animate-pulse" aria-hidden="true" />
                  Liderando Ao vivo
                </span>
                <button
                  type="button"
                  onClick={live.stopLeading}
                  className="pill-btn bg-[var(--bg)] px-3 h-9 text-xs"
                >
                  Parar
                </button>
              </>
            ) : live.isFollowing ? (
              <>
                <span className="studio-chip text-[var(--tune)] bg-[var(--tune-dim)]">
                  {live.isLeaderStale
                    ? `${live.session.leaderName} inativo`
                    : `Seguindo ${live.session.leaderName}`}
                </span>
                {onGoLive && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onGoLive();
                    }}
                    className="pill-btn bg-[var(--bg)] px-3 h-9 text-xs"
                  >
                    Assumir
                  </button>
                )}
                <button
                  type="button"
                  onClick={live.unfollow}
                  className="pill-btn bg-[var(--bg)] px-3 h-9 text-xs"
                >
                  Desconectar
                </button>
              </>
            ) : live.hasRemoteLeader && live.localUnfollow ? (
              <button
                type="button"
                onClick={live.refollow}
                className="pill-btn pill-btn-tune px-3 h-9 text-xs"
              >
                Seguir {live.session.leaderName}
              </button>
            ) : onGoLive ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onGoLive();
                }}
                className="pill-btn bg-[var(--bg)] px-3 h-9 text-xs"
                title="Sincronizar rolagem, metrônomo e troca de música com a banda"
              >
                <span className="w-2 h-2 rounded-full bg-[var(--rec-dot)]" aria-hidden="true" />
                Iniciar Ao vivo com a banda
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* 4. Quick view switching footer */}
      {(onEnterFocusMode || onEnterSlidesMode || onEnterEdit) && (
        <>
          <div className="border-t border-[var(--line-subtle)]/40" />
          <div className="flex flex-wrap items-center gap-1.5">
            {onEnterFocusMode && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEnterFocusMode();
                }}
                className="lg:hidden pill-btn bg-[var(--bg)] px-3 h-9 text-xs flex-1 justify-center"
              >
                Tela limpa
              </button>
            )}
            {onEnterSlidesMode && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEnterSlidesMode();
                }}
                className="pill-btn bg-[var(--bg)] px-3 h-9 text-xs flex-1 justify-center"
              >
                <SlidesIcon size={14} />
                Slides
              </button>
            )}
            {onEnterEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEnterEdit();
                }}
                className="pill-btn bg-[var(--bg)] px-3 h-9 text-xs flex-1 justify-center"
              >
                <EditIcon size={13} />
                Editar
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
