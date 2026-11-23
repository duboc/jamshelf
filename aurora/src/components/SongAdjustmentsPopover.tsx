import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore, type DisplayMode } from '@/lib/stores/display-store';
import type { useLiveSession } from '@/lib/stores/live-session-store';
import { AuroraButton, AuroraSegmented, UiIcon } from '../aurora/primitives';
import { MetronomeControl } from './MetronomeControl';

export interface SongAdjustmentsPopoverProps {
  variant: 'song' | 'clean';
  displayedKey: string;
  capo: number;
  beatsPerBar: number;
  savedTempo: number;
  tempoConfirmed: boolean;
  isFollowing: boolean;
  isDark: boolean;
  onToggleTheme: () => void;
  audioBlocked?: boolean;
  onUnlockAudio?: () => void;
  chordCount?: number;
  hideDiagramsOnXl?: boolean;
  onToggleChordsRef?: () => void;
  hasCalibration?: boolean;
  canCalibrate?: boolean;
  calibrating?: boolean;
  onStartCalibration?: () => void;
  onClearCalibration?: () => void;
  hasSpotify?: boolean;
  showSpotifyPreview?: boolean;
  onToggleSpotifyPreview?: () => void;
  onSaveBpm?: (bpm: number) => void;
  onRequestSaveTranspose?: () => void;
  onTriggerCountIn: () => void;
  hasSetlist?: boolean;
  live?: ReturnType<typeof useLiveSession>;
  onGoLive?: () => void;
  onEnterFocusMode?: () => void;
  onEnterSlidesMode?: () => void;
  onEnterEdit?: () => void;
  onClose: () => void;
}

/**
 * Unified Aurora Adjustments & Rehearsal popover shared between Song view and Tela limpa.
 * Keeps top/bottom stage bars ultra-calm while Tonalidade, Fonte, Leitura, Metrônomo,
 * 1·2·3·4, Calibração, Diagramas, 2 colunas, and Ao vivo stay 1 tap away.
 */
export function SongAdjustmentsPopover({
  variant,
  displayedKey,
  capo,
  beatsPerBar,
  savedTempo,
  tempoConfirmed,
  isFollowing,
  isDark,
  onToggleTheme,
  audioBlocked = false,
  onUnlockAudio,
  chordCount = 0,
  hideDiagramsOnXl = false,
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
  } = useDisplayStore();

  const isLyricsOnly = displayMode === 'lyrics-only';
  const transposeDeltaLabel =
    store.transpose > 0 ? `+${store.transpose}` : store.transpose < 0 ? `${store.transpose}` : '';

  return (
    <div className="space-y-2.5 text-left">
      {/* 1. Tonalidade e Fonte (always present in all 3 views & reading modes) */}
      <div className="space-y-2">
        <div className="typescale-label-sm text-on-surface-variant">Tonalidade e fonte</div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="typescale-label-lg text-on-surface">Tom</span>
          <div className="inline-flex items-center gap-1.5">
            <div className="inline-flex items-center gap-0.5 rounded-full bg-surface-container p-0.5">
              <button
                type="button"
                onClick={store.transposeDown}
                className="dock-stepper-btn"
                aria-label="Baixar meio tom"
                title="Baixar meio tom"
              >
                <UiIcon name="remove" size={20} />
              </button>
              <button
                type="button"
                disabled={store.transpose === 0}
                onClick={() => store.setTranspose(0)}
                className={`min-w-[58px] h-9 px-2 rounded-full font-mono typescale-label-sm tabular-nums border-none transition-colors ${
                  store.transpose !== 0
                    ? 'bg-primary-container text-on-primary-container cursor-pointer'
                    : 'bg-transparent text-on-surface cursor-default'
                }`}
                title={store.transpose !== 0 ? 'Toque para voltar ao tom original' : 'Tom atual'}
              >
                {displayedKey || '0'}
                {transposeDeltaLabel ? ` (${transposeDeltaLabel})` : ''}
              </button>
              <button
                type="button"
                onClick={store.transposeUp}
                className="dock-stepper-btn"
                aria-label="Subir meio tom"
                title="Subir meio tom"
              >
                <UiIcon name="add" size={20} />
              </button>
            </div>
            <button
              type="button"
              aria-pressed={store.useFlats}
              onClick={store.toggleFlats}
              className={`stage-touch-44 inline-flex items-center justify-center w-9 h-9 rounded-full border-none font-mono typescale-label-lg cursor-pointer transition-colors ${
                store.useFlats
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
              }`}
              title="Alternar sustenidos (#) e bemóis (b)"
              aria-label={store.useFlats ? 'Mudar para sustenidos' : 'Mudar para bemóis'}
            >
              {store.useFlats ? '♭' : '♯'}
            </button>
          </div>
        </div>

        {store.transpose !== 0 && onRequestSaveTranspose && (
          <AuroraButton
            color="primary-tonal"
            icon="check"
            className="w-full justify-center"
            onClick={() => {
              onClose();
              onRequestSaveTranspose();
            }}
          >
            Salvar neste novo tom
          </AuroraButton>
        )}

        {capo > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="typescale-body-sm text-on-surface-variant">Capo {capo}</span>
            <AuroraSegmented<'sounding' | 'shapes'>
              ariaLabel="Acordes com capo"
              value={capoDisplay}
              onChange={setCapoDisplay}
              options={[
                { value: 'sounding', label: 'Tom real' },
                { value: 'shapes', label: 'Formas' },
              ]}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="typescale-label-lg text-on-surface">Fonte</span>
          <div className="inline-flex items-center gap-0.5 rounded-full bg-surface-container p-0.5">
            <button
              type="button"
              disabled={fontSize <= 70}
              onClick={() => setFontSize(fontSize - 10)}
              className="dock-stepper-btn font-mono typescale-label-sm disabled:opacity-40"
              aria-label="Diminuir fonte"
            >
              A-
            </button>
            <button
              type="button"
              disabled={fontSize === 100}
              onClick={() => setFontSize(100)}
              className={`min-w-[52px] h-9 px-2 rounded-full font-mono typescale-label-sm tabular-nums border-none transition-colors ${
                fontSize !== 100
                  ? 'bg-primary-container text-on-primary-container cursor-pointer'
                  : 'bg-transparent text-on-surface-variant cursor-default'
              }`}
              title={fontSize !== 100 ? 'Toque para voltar a 100%' : 'Tamanho padrão (100%)'}
              aria-label={`Tamanho da fonte ${fontSize}%`}
            >
              {fontSize}%
            </button>
            <button
              type="button"
              disabled={fontSize >= 160}
              onClick={() => setFontSize(fontSize + 10)}
              className="dock-stepper-btn font-mono typescale-label-sm disabled:opacity-40"
              aria-label="Aumentar fonte"
            >
              A+
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-outline-variant/50" />

      {/* 2. Leitura */}
      <div className="space-y-2.5">
        <div className="typescale-label-sm text-on-surface-variant">Leitura</div>

        <AuroraSegmented<DisplayMode>
          ariaLabel="Modo de leitura"
          value={displayMode}
          onChange={setDisplayMode}
          className="w-full [&_.stage-segmented-btn]:flex-1"
          options={[
            { value: 'both', label: 'Cifra' },
            { value: 'lyrics-only', label: 'Só letra' },
            { value: 'chords-only', label: 'Acordes' },
          ]}
        />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
          <AuroraButton
            color="outlined"
            icon={isDark ? 'sunny' : 'nightlight'}
            onClick={onToggleTheme}
            className="w-full justify-center"
          >
            {isDark ? 'Tema claro' : 'Tema escuro'}
          </AuroraButton>

          <AuroraButton
            color={sheetColumns === 2 ? 'tonal' : 'outlined'}
            icon="view_column_2"
            aria-pressed={sheetColumns === 2}
            onClick={() => setSheetColumns(sheetColumns === 2 ? 1 : 2)}
            className="hidden xl:inline-flex w-full justify-center"
          >
            {sheetColumns === 2 ? '2 colunas' : '1 coluna'}
          </AuroraButton>
        </div>
      </div>

      <div className="border-t border-outline-variant/50" />

      {/* 3. Ensaio e palco */}
      <div className="space-y-2.5">
        <div className="typescale-label-sm text-on-surface-variant">Ensaio e palco</div>

        <MetronomeControl
          readOnly={isFollowing}
          beatsPerBar={beatsPerBar}
          savedTempo={savedTempo}
          tempoConfirmed={tempoConfirmed}
          audioBlocked={audioBlocked}
          onUnlockAudio={onUnlockAudio}
          onSaveBpm={onSaveBpm}
          fullWidth
        />

        <div className="grid grid-cols-2 gap-1.5">
          {!isFollowing && !calibrating && (
            <AuroraButton
              color="outlined"
              icon="looks_4"
              onClick={() => {
                onClose();
                onTriggerCountIn();
              }}
              title="Contagem visual 1·2·3·4 (atalho: C)"
              className="w-full justify-center min-h-[40px] px-2.5"
            >
              1·2·3·4
            </AuroraButton>
          )}

          <AuroraButton
            color={visualPulseEnabled ? 'tonal' : 'outlined'}
            icon="graphic_eq"
            aria-pressed={visualPulseEnabled}
            onClick={() => setVisualPulseEnabled(!visualPulseEnabled)}
            title="Faixa rítmica visual no topo durante o metrônomo"
            className="w-full justify-center min-h-[40px] px-2.5"
          >
            Pulso visual
          </AuroraButton>

          {variant === 'song' && !isLyricsOnly && chordCount > 0 && onToggleChordsRef && (
            <AuroraButton
              color={chordsRefOpen ? 'tonal' : 'outlined'}
              icon="piano"
              aria-pressed={chordsRefOpen}
              onClick={() => {
                onToggleChordsRef();
                onClose();
              }}
              className={`w-full justify-center min-h-[40px] px-2.5 ${hideDiagramsOnXl ? 'xl:hidden' : ''}`}
            >
              Diagramas ({chordCount})
            </AuroraButton>
          )}

          {variant === 'song' && !isFollowing && canCalibrate && !calibrating && onStartCalibration && (
            hasCalibration ? (
              <div className="inline-flex items-center gap-1 w-full">
                <AuroraButton
                  color="tonal"
                  icon="check_circle"
                  onClick={() => {
                    onClose();
                    onStartCalibration();
                  }}
                  className="flex-1 justify-center min-h-[40px] px-2.5"
                >
                  Calibrada
                </AuroraButton>
                {onClearCalibration && (
                  <button
                    type="button"
                    aria-label="Remover calibração"
                    title="Remover calibração"
                    onClick={() => {
                      onClose();
                      onClearCalibration();
                    }}
                    className="dock-stepper-btn text-on-surface-variant hover:text-error"
                  >
                    <UiIcon name="close" size={20} />
                  </button>
                )}
              </div>
            ) : (
              <AuroraButton
                color="outlined"
                icon="timer"
                onClick={() => {
                  onClose();
                  onStartCalibration();
                }}
                className="w-full justify-center min-h-[40px] px-2.5"
              >
                Calibrar
              </AuroraButton>
            )
          )}

          {variant === 'song' && hasSpotify && onToggleSpotifyPreview && (
            <AuroraButton
              color={showSpotifyPreview ? 'primary-tonal' : 'outlined'}
              icon="headphones"
              aria-pressed={showSpotifyPreview}
              onClick={() => {
                onToggleSpotifyPreview();
                onClose();
              }}
              className="col-span-2 w-full justify-center min-h-[40px] px-2.5"
            >
              {showSpotifyPreview ? 'Ocultar Spotify' : 'Ouvir Spotify'}
            </AuroraButton>
          )}
        </div>

        {/* Live band sync controls when inside a setlist */}
        {hasSetlist && live && (
          <div className="pt-1 flex flex-wrap items-center gap-1.5">
            {live.isLeading ? (
              <>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-error-container text-on-error-container typescale-label-sm">
                  <UiIcon name="sensors" size={20} />
                  Liderando Ao vivo
                </span>
                <AuroraButton color="outlined" onClick={live.stopLeading}>
                  Parar
                </AuroraButton>
              </>
            ) : live.isFollowing ? (
              <>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-tertiary-container text-on-tertiary-container typescale-label-sm">
                  {live.isLeaderStale
                    ? `${live.session.leaderName} inativo`
                    : `Seguindo ${live.session.leaderName}`}
                </span>
                {onGoLive && (
                  <AuroraButton
                    color="tonal"
                    onClick={() => {
                      onClose();
                      onGoLive();
                    }}
                  >
                    Assumir
                  </AuroraButton>
                )}
                <AuroraButton color="outlined" onClick={live.unfollow}>
                  Desconectar
                </AuroraButton>
              </>
            ) : live.hasRemoteLeader && live.localUnfollow ? (
              <AuroraButton color="primary-tonal" icon="sensors" onClick={live.refollow}>
                Seguir {live.session.leaderName}
              </AuroraButton>
            ) : onGoLive ? (
              <AuroraButton
                color="outlined"
                icon="sensors"
                onClick={() => {
                  onClose();
                  onGoLive();
                }}
                className="w-full justify-center"
              >
                Iniciar Ao vivo com a banda
              </AuroraButton>
            ) : null}
          </div>
        )}
      </div>

      {/* 4. Quick view switching footer (only shown when controls aren't already in the visible bar) */}
      {(onEnterFocusMode || onEnterSlidesMode || onEnterEdit) && (
        <div className={variant === 'song' ? 'lg:hidden space-y-2.5' : 'space-y-2.5'}>
          <div className="border-t border-outline-variant/50" />
          <div className="flex flex-wrap items-center gap-1.5">
            {onEnterFocusMode && (
              <AuroraButton
                color="outlined"
                icon="fullscreen"
                onClick={() => {
                  onClose();
                  onEnterFocusMode();
                }}
                className="lg:hidden flex-1 justify-center min-h-[40px]"
              >
                Tela limpa
              </AuroraButton>
            )}
            {onEnterSlidesMode && (
              <AuroraButton
                color="outlined"
                icon="slideshow"
                onClick={() => {
                  onClose();
                  onEnterSlidesMode();
                }}
                className={`${variant === 'clean' ? 'sm:hidden ' : ''}flex-1 justify-center min-h-[40px]`}
              >
                Slides
              </AuroraButton>
            )}
            {onEnterEdit && (
              <AuroraButton
                color="outlined"
                icon="edit_note"
                onClick={() => {
                  onClose();
                  onEnterEdit();
                }}
                className={`${variant === 'song' ? 'lg:hidden ' : ''}flex-1 justify-center min-h-[40px]`}
              >
                Editar
              </AuroraButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
