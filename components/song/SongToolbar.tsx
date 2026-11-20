'use client';

import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import { runStateViewTransition } from '@/lib/utils/view-transition';
import { Metronome } from '@/components/metronome/Metronome';
import {
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  ColumnsIcon,
  EditIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RedoIcon,
  UndoIcon,
} from '@/components/ui/Icons';

interface SongToolbarProps {
  beatsPerBar: number;
  savedTempo: number;
  tempoConfirmed: boolean;
  chordCount: number;
  isFollowing: boolean;
  savedScrollSpeed: number | null;
  hasCalibration: boolean;
  calibrating: boolean;
  canCalibrate: boolean;
  // Visual edit mode controls
  canUndo: boolean;
  canRedo: boolean;
  editDirty: boolean;
  editDiscardArmed: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEnterEdit: () => void;
  // Scroll, transpose, count-in, BPM & notes actions
  hasNotes: boolean;
  onSaveBpm: (bpm: number) => void;
  onSaveScrollSpeed: () => void;
  onStartCalibration: () => void;
  onClearCalibration: () => void;
  onRequestSaveTranspose: () => void;
  onTriggerCountIn: () => void;
  onToggleEditNotes: () => void;
  onChordsRefToggle?: () => void;
}

export function SongToolbar({
  beatsPerBar,
  savedTempo,
  tempoConfirmed,
  chordCount,
  isFollowing,
  savedScrollSpeed,
  hasCalibration,
  calibrating,
  canCalibrate,
  canUndo,
  canRedo,
  editDirty,
  editDiscardArmed,
  onUndo,
  onRedo,
  onSaveEdit,
  onCancelEdit,
  onEnterEdit,
  hasNotes,
  onSaveBpm,
  onSaveScrollSpeed,
  onStartCalibration,
  onClearCalibration,
  onRequestSaveTranspose,
  onTriggerCountIn,
  onToggleEditNotes,
  onChordsRefToggle,
}: SongToolbarProps) {
  const store = usePlayerStore();
  const {
    displayMode,
    setDisplayMode,
    fontSize,
    setFontSize,
    chordsRefOpen,
    setChordsRefOpen,
    visualPulseEnabled,
    setVisualPulseEnabled,
    sheetColumns,
    setSheetColumns,
  } = useDisplayStore();

  const isSingerMode = !store.editMode && displayMode === 'lyrics-only';
  const baselineSpeed = savedScrollSpeed ?? 1;
  const speedChanged = Math.abs(store.autoScrollSpeed - baselineSpeed) >= 0.04;
  const transposeLabel =
    store.transpose > 0 ? `+${store.transpose}` : store.transpose < 0 ? `${store.transpose}` : '0';

  // Dedicated clean edit toolbar when visual editor is active
  if (store.editMode) {
    return (
      <div className="flex items-center justify-between flex-nowrap gap-2 flex-shrink-0 lg:col-span-3 lg:row-start-3 lg:w-full lg:rounded-2xl lg:bg-[var(--surface-high)] lg:px-4 lg:py-2">
        <div className="flex items-center gap-1.5 flex-nowrap flex-shrink-0">
          <span className="studio-chip bg-[var(--nav-active-bg)] text-[var(--accent-ink)] font-semibold">
            Modo edição
          </span>
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            className="pill-btn px-3 h-9 text-xs"
            title="Desfazer última alteração (Ctrl+Z)"
          >
            <UndoIcon size={14} />
            Desfazer
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            className="pill-btn px-3 h-9 text-xs"
            title="Refazer alteração (Ctrl+Y)"
          >
            <RedoIcon size={14} />
            Refazer
          </button>
          {editDirty && (
            <span className="font-mono text-xs text-[var(--muted)] hidden sm:inline">
              Alterações pendentes
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={onCancelEdit}
            className={`pill-btn px-3.5 h-9 text-xs ${editDiscardArmed ? 'pill-btn-rec' : ''}`}
          >
            {editDiscardArmed ? 'Descartar edições' : 'Cancelar'}
          </button>
          <button
            type="button"
            onClick={onSaveEdit}
            className="pill-btn pill-btn-primary px-4 h-9 text-xs"
          >
            <CheckIcon size={14} />
            Salvar e sair
          </button>
        </div>
      </div>
    );
  }

  // Unified pill strip: flows horizontally inside SongHeader's single scroll rail on < lg,
  // and becomes a sleek full-width GM3 toolbar capsule on >= lg.
  return (
    <div className="flex items-center flex-nowrap gap-1.5 sm:gap-2 flex-shrink-0 lg:col-span-3 lg:row-start-3 lg:w-full lg:rounded-2xl lg:bg-[var(--surface-high)] lg:px-3 lg:py-2 lg:overflow-x-auto lg:no-scrollbar">
      {/* Primary Auto-scroll + smooth sliding speed stepper & Save pace */}
      <div className="inline-flex items-center flex-nowrap flex-shrink-0 lg:order-3">
        {isFollowing ? (
          <span className="studio-chip text-[var(--tune)] flex-shrink-0">
            {store.isAutoScrolling ? 'Rolando (sinc.)' : 'Rolagem (sinc.)'}
          </span>
        ) : (
          <button
            type="button"
            aria-pressed={store.isAutoScrolling}
            onClick={store.toggleAutoScroll}
            disabled={calibrating}
            className={`pill-btn px-3 h-9 text-xs flex-shrink-0 ${
              store.isAutoScrolling ? 'pill-btn-tune' : ''
            }`}
            title="Atalho: barra de espaço"
          >
            {store.isAutoScrolling ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
            {store.isAutoScrolling ? 'Pausar' : 'Auto-scroll'}
          </button>
        )}

        {/* Speed stepper + presets glide out smoothly when scrolling starts */}
        {!isFollowing && !calibrating && (
          <div
            data-compact-slot="true"
            data-collapsed={!store.isAutoScrolling ? 'true' : undefined}
            aria-hidden={!store.isAutoScrolling || undefined}
            inert={!store.isAutoScrolling || undefined}
            className="gm3-slot-x gm3-slot-x-toolbar flex-shrink-0"
          >
            <div className="gm3-slot-x-inner pl-1.5">
              <div className="gm3-btn-group flex-nowrap">
                <button
                  type="button"
                  onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed - 0.1)}
                  className="pill-btn w-9 h-9 font-mono text-xs"
                  aria-label="Scroll mais devagar"
                  title="Diminuir velocidade do scroll (atalho: -)"
                >
                  -
                </button>
                <span
                  className="font-mono text-xs text-[var(--muted)] tabular-nums px-1 min-w-[44px] text-center"
                  title="Multiplicador de velocidade do auto-scroll"
                >
                  {store.autoScrollSpeed.toFixed(2)}×
                </span>
                <button
                  type="button"
                  onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed + 0.1)}
                  className="pill-btn w-9 h-9 font-mono text-xs"
                  aria-label="Scroll mais rápido"
                  title="Aumentar velocidade do scroll (atalho: +)"
                >
                  +
                </button>
                {[
                  { label: '0.75×', value: 0.75 },
                  { label: '1.0×', value: 1 },
                  { label: '1.25×', value: 1.25 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    aria-pressed={Math.abs(store.autoScrollSpeed - preset.value) < 0.04}
                    onClick={() => store.setAutoScrollSpeed(preset.value)}
                    className={`pill-btn px-2.5 h-9 font-mono text-xs ${
                      Math.abs(store.autoScrollSpeed - preset.value) < 0.04 ? 'pill-btn-tune' : ''
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {!isFollowing && !calibrating && (
          <div
            data-compact-slot="true"
            data-collapsed={!speedChanged ? 'true' : undefined}
            aria-hidden={!speedChanged || undefined}
            inert={!speedChanged || undefined}
            className="gm3-slot-x gm3-slot-x-toolbar flex-shrink-0"
          >
            <div className="gm3-slot-x-inner pl-1.5">
              <button
                type="button"
                onClick={onSaveScrollSpeed}
                className="pill-btn px-3 h-9 text-xs text-[var(--tune)] border-[var(--tune)]/50 flex-shrink-0"
                title="Salvar esta velocidade como padrão desta música"
              >
                Salvar ritmo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transpose controls: smoothly collapse in Singer (lyrics-only) mode */}
      <div
        data-compact-slot="true"
        data-collapsed={isSingerMode ? 'true' : undefined}
        aria-hidden={isSingerMode || undefined}
        inert={isSingerMode || undefined}
        className="gm3-slot-x gm3-slot-x-toolbar flex-shrink-0 lg:order-1"
      >
        <div className="gm3-slot-x-inner">
          <div className="inline-flex items-center flex-nowrap">
            <div className="gm3-btn-group flex-shrink-0">
              <span className="field-label hidden sm:inline mr-0.5">Tom</span>
              <button
                type="button"
                onClick={store.transposeDown}
                className="pill-btn w-9 h-9 font-mono text-xs"
                title="Baixar meio tom"
                aria-label="Baixar meio tom"
              >
                -
              </button>
              <button
                type="button"
                disabled={store.transpose === 0}
                onClick={() => store.setTranspose(0)}
                className={`gm3-icon-btn font-mono text-xs min-w-[32px] h-9 px-1.5 text-center tabular-nums ${
                  store.transpose !== 0
                    ? 'bg-[var(--primary-container)] text-[var(--on-primary-container)] font-semibold cursor-pointer hover:bg-[var(--accent)] hover:text-[var(--on-accent)]'
                    : 'text-[var(--ink)] cursor-default'
                }`}
                title={store.transpose !== 0 ? 'Clique para resetar transposição para 0' : 'Tom original'}
                aria-label={
                  store.transpose !== 0
                    ? `Transposição ${transposeLabel} semitons, clique para resetar para 0`
                    : 'Transposição 0 semitons'
                }
              >
                {transposeLabel}
              </button>
              <button
                type="button"
                onClick={store.transposeUp}
                className="pill-btn w-9 h-9 font-mono text-xs"
                title="Subir meio tom"
                aria-label="Subir meio tom"
              >
                +
              </button>
              <button
                type="button"
                aria-pressed={store.useFlats}
                onClick={store.toggleFlats}
                className={`pill-btn w-9 h-9 font-mono text-xs ${
                  store.useFlats ? 'pill-btn-primary' : ''
                }`}
                title="Alternar sustenidos (#) e bemóis (b)"
                aria-label={
                  store.useFlats
                    ? 'Usando bemóis, alternar para sustenidos'
                    : 'Usando sustenidos, alternar para bemóis'
                }
              >
                {store.useFlats ? '♭' : '♯'}
              </button>
            </div>
            <div
              data-compact-slot="true"
              data-collapsed={store.transpose === 0 ? 'true' : undefined}
              aria-hidden={store.transpose === 0 || undefined}
              inert={store.transpose === 0 || undefined}
              className="gm3-slot-x gm3-slot-x-toolbar flex-shrink-0"
            >
              <div className="gm3-slot-x-inner pl-1.5">
                <button
                  type="button"
                  onClick={onRequestSaveTranspose}
                  title="Salvar este novo tom permanentemente na música"
                  className="pill-btn px-2.5 h-9 text-xs text-[var(--accent-ink)] border-[var(--accent)]/50"
                >
                  Salvar tom
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Font size */}
      <div className="gm3-btn-group flex-shrink-0 lg:order-2">
        <button
          type="button"
          onClick={() => setFontSize(fontSize - 10)}
          className="pill-btn w-9 h-9 font-mono text-xs"
          title="Diminuir letra"
          aria-label="Diminuir letra"
        >
          A-
        </button>
        <span className="font-mono text-xs text-[var(--muted)] w-10 text-center tabular-nums hidden sm:inline">
          {fontSize}%
        </span>
        <button
          type="button"
          onClick={() => setFontSize(fontSize + 10)}
          className="pill-btn w-9 h-9 font-mono text-xs"
          title="Aumentar letra"
          aria-label="Aumentar letra"
        >
          A+
        </button>
      </div>

      {/* Calibration */}
      {!isFollowing && canCalibrate && !calibrating && !store.isAutoScrolling && (
        hasCalibration ? (
          <div className="inline-flex items-center gap-1 flex-shrink-0 lg:order-5">
            <button
              type="button"
              onClick={onStartCalibration}
              className="pill-btn px-3 h-9 text-xs text-[var(--tune)] border-[var(--tune)]/45"
              title="Esta música tem marcos por seção salvos. Clique para recalibrar."
            >
              <CheckIcon size={13} />
              Calibrada
            </button>
            <button
              type="button"
              onClick={onClearCalibration}
              className="gm3-icon-btn w-8 h-8 text-[var(--muted)] hover:text-[var(--rec)] hover:bg-[var(--surface2)] flex items-center justify-center cursor-pointer"
              title="Remover calibração por seção e voltar ao modo linear"
              aria-label="Remover calibração"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartCalibration}
            className="pill-btn px-3 h-9 text-xs text-[var(--muted)] flex-shrink-0 lg:order-5"
            title="Gravar em 1 ensaio o momento exato de cada seção para o auto-scroll acompanhar solos e viradas"
          >
            Calibrar
          </button>
        )
      )}

      {/* Metronome + Tap Tempo + sliding Visual pulse toggle */}
      <div className="inline-flex items-center flex-nowrap flex-shrink-0 lg:order-6">
        <Metronome
          readOnly={isFollowing}
          beatsPerBar={beatsPerBar}
          savedTempo={savedTempo}
          tempoConfirmed={tempoConfirmed}
          onSaveBpm={onSaveBpm}
          heightClass="h-9"
        />
        <div
          data-compact-slot="true"
          data-collapsed={!store.metronomeOn ? 'true' : undefined}
          aria-hidden={!store.metronomeOn || undefined}
          inert={!store.metronomeOn || undefined}
          className="gm3-slot-x gm3-slot-x-toolbar flex-shrink-0"
        >
          <div className="gm3-slot-x-inner pl-1.5">
            <button
              type="button"
              aria-pressed={visualPulseEnabled}
              onClick={() => setVisualPulseEnabled(!visualPulseEnabled)}
              className={`pill-btn px-3 h-9 text-xs flex-shrink-0 ${
                visualPulseEnabled ? 'pill-btn-primary' : ''
              }`}
              title="Exibir barra rítmica discreta no topo durante o metrônomo"
            >
              Pulso
            </button>
          </div>
        </div>
      </div>

      {/* Visual 1-2-3-4 count-in */}
      {!isFollowing && !calibrating && (
        <button
          type="button"
          onClick={onTriggerCountIn}
          className="pill-btn px-3 h-9 font-mono text-xs flex-shrink-0 lg:order-7"
          title="Contagem visual 1-2-3-4 (atalho: C). Sincroniza com a banda se estiver liderando o Ao Vivo."
        >
          1·2·3·4
        </button>
      )}

      {/* 2-column stage layout toggle on wide screens */}
      {!calibrating && (
        <button
          type="button"
          aria-pressed={sheetColumns === 2}
          onClick={() => runStateViewTransition(() => setSheetColumns(sheetColumns === 2 ? 1 : 2), 'morph')}
          className={`hidden xl:inline-flex pill-btn px-3 h-9 text-xs flex-shrink-0 lg:order-9 ${
            sheetColumns === 2 ? 'pill-btn-tonal' : ''
          }`}
          title="Alternar entre 1 e 2 colunas para aproveitar telas largas"
        >
          <ColumnsIcon size={15} />
          {sheetColumns === 2 ? '2 colunas' : '1 coluna'}
        </button>
      )}

      {/* Right cluster: Diagrams / Show chords / Notes / Edit */}
      <div className="flex items-center gap-1.5 flex-nowrap flex-shrink-0 lg:order-10 lg:ml-auto">
        {isSingerMode ? (
          <button
            type="button"
            onClick={() => runStateViewTransition(() => setDisplayMode('both'), 'morph')}
            className="pill-btn px-3 h-9 text-xs text-[var(--accent-ink)]"
            title="Voltar a exibir os acordes acima da letra"
          >
            Mostrar acordes
          </button>
        ) : (
          chordCount > 0 && (
            <button
              type="button"
              onClick={() => {
                onChordsRefToggle?.();
                setChordsRefOpen(!chordsRefOpen);
              }}
              aria-expanded={chordsRefOpen}
              className={`pill-btn px-3 h-9 text-xs ${
                chordsRefOpen ? 'border-[var(--accent)] text-[var(--accent-ink)]' : ''
              }`}
              title="Abrir ou recolher os diagramas dos acordes desta música"
            >
              Diagramas ({chordCount})
              <ChevronDownIcon size={14} className="gm3-chevron" />
            </button>
          )
        )}

        {!calibrating && (
          <>
            <button
              type="button"
              onClick={onToggleEditNotes}
              className={`pill-btn px-3 h-9 text-xs ${
                hasNotes ? 'bg-[var(--warn-dim)] text-[var(--warn-ink)]' : ''
              }`}
              title="Adicionar ou editar deixas de palco e notas de ensaio"
            >
              {hasNotes ? <EditIcon size={13} /> : <PlusIcon size={13} />}
              Deixa
            </button>
            <button
              type="button"
              onClick={onEnterEdit}
              className="pill-btn px-3 h-9 text-xs"
            >
              <EditIcon size={13} />
              Editar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
