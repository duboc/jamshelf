'use client';

import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import { Metronome } from '@/components/metronome/Metronome';

interface SongToolbarProps {
  beatsPerBar: number;
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
  // Scroll, transpose, count-in & notes actions
  hasNotes: boolean;
  onSaveScrollSpeed: () => void;
  onStartCalibration: () => void;
  onClearCalibration: () => void;
  onRequestSaveTranspose: () => void;
  onTriggerCountIn: () => void;
  onToggleEditNotes: () => void;
}

export function SongToolbar({
  beatsPerBar,
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
  onSaveScrollSpeed,
  onStartCalibration,
  onClearCalibration,
  onRequestSaveTranspose,
  onTriggerCountIn,
  onToggleEditNotes,
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
  } = useDisplayStore();

  const isSingerMode = !store.editMode && displayMode === 'lyrics-only';
  const baselineSpeed = savedScrollSpeed ?? 1;
  const speedChanged = Math.abs(store.autoScrollSpeed - baselineSpeed) >= 0.04;

  // Dedicated clean edit toolbar when visual editor is active
  if (store.editMode) {
    return (
      <div className="flex-shrink-0 bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pb-2.5">
        <div className="w-full rounded-2xl bg-[var(--surface-high)] px-4 py-2 flex items-center justify-between flex-nowrap overflow-x-auto no-scrollbar gap-2">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="studio-chip bg-[var(--nav-active-bg)] text-[var(--accent-ink)] font-semibold">
              Modo edição
            </span>
            <button
              type="button"
              disabled={!canUndo}
              onClick={onUndo}
              className="pill-btn px-3 h-8 text-xs"
              title="Desfazer última alteração (Ctrl+Z)"
            >
              ↶ Desfazer
            </button>
            <button
              type="button"
              disabled={!canRedo}
              onClick={onRedo}
              className="pill-btn px-3 h-8 text-xs"
              title="Refazer alteração (Ctrl+Y)"
            >
              ↷ Refazer
            </button>
            {editDirty && (
              <span className="font-mono text-xs text-[var(--muted)] hidden sm:inline">
                Alterações pendentes
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onCancelEdit}
              className={`pill-btn px-3.5 h-8 text-xs ${editDiscardArmed ? 'pill-btn-rec' : ''}`}
            >
              {editDiscardArmed ? 'Descartar edições' : 'Cancelar'}
            </button>
            <button
              type="button"
              onClick={onSaveEdit}
              className="pill-btn pill-btn-primary px-4 h-8 text-xs"
            >
              ✓ Salvar e sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pb-2.5">
      <div className="relative rounded-2xl bg-[var(--surface-high)] overflow-hidden lg:overflow-visible">
        <div className="w-full px-3.5 py-2 pr-10 lg:pr-3.5 flex items-center justify-between flex-nowrap overflow-x-auto no-scrollbar lg:flex-wrap lg:overflow-visible gap-2">
        <div className="flex items-center flex-nowrap lg:flex-wrap gap-2 flex-shrink-0">
          {/* Transpose controls: hidden in Singer (lyrics-only) mode */}
          {!isSingerMode && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="field-label hidden sm:inline mr-0.5">Tom</span>
              <button
                type="button"
                onClick={store.transposeDown}
                className="pill-btn w-8 h-8 font-mono text-xs"
                title="Baixar meio tom"
              >
                -
              </button>
              <span className="font-mono text-xs text-[var(--ink)] w-7 text-center tabular-nums">
                {store.transpose > 0 ? `+${store.transpose}` : store.transpose || '0'}
              </span>
              <button
                type="button"
                onClick={store.transposeUp}
                className="pill-btn w-8 h-8 font-mono text-xs"
                title="Subir meio tom"
              >
                +
              </button>
              <button
                type="button"
                onClick={store.toggleFlats}
                className={`pill-btn w-8 h-8 font-mono text-xs ${
                  store.useFlats ? 'pill-btn-primary' : ''
                }`}
                title="Alternar sustenidos (#) e bemóis (b)"
              >
                {store.useFlats ? '♭' : '♯'}
              </button>
              {store.transpose !== 0 && (
                <button
                  type="button"
                  onClick={onRequestSaveTranspose}
                  title="Salvar este novo tom permanentemente na música"
                  className="pill-btn px-2.5 h-8 text-xs text-[var(--accent-ink)] border-[var(--accent)]/50"
                >
                  Salvar tom
                </button>
              )}
            </div>
          )}

          {/* Font size */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => setFontSize(fontSize - 10)}
              className="pill-btn w-8 h-8 font-mono text-xs"
              title="Diminuir letra"
            >
              A-
            </button>
            <span className="font-mono text-xs text-[var(--muted)] w-10 text-center tabular-nums hidden sm:inline">
              {fontSize}%
            </span>
            <button
              type="button"
              onClick={() => setFontSize(fontSize + 10)}
              className="pill-btn w-8 h-8 font-mono text-xs"
              title="Aumentar letra"
            >
              A+
            </button>
          </div>

          {/* Auto scroll */}
          {isFollowing ? (
            <span className="studio-chip text-[var(--tune)]">
              {store.isAutoScrolling ? 'Rolando (sinc.)' : 'Rolagem (sinc.)'}
            </span>
          ) : (
            <div className="flex items-center gap-1.5 flex-nowrap lg:flex-wrap flex-shrink-0">
              <button
                type="button"
                onClick={store.toggleAutoScroll}
                disabled={calibrating}
                className={`pill-btn px-3 h-8 text-xs ${
                  store.isAutoScrolling ? 'pill-btn-tune' : ''
                }`}
                title="Atalho: barra de espaço"
              >
                {store.isAutoScrolling ? '⏸ Pausar' : '▶ Auto-scroll'}
              </button>

              {store.isAutoScrolling && (
                <div className="flex items-center gap-1 flex-nowrap">
                  <button
                    type="button"
                    onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed - 0.1)}
                    className="pill-btn w-8 h-8 font-mono text-xs"
                    aria-label="Mais devagar"
                  >
                    -
                  </button>
                  {[
                    { label: '0.75×', value: 0.75 },
                    { label: '1.0×', value: 1 },
                    { label: '1.25×', value: 1.25 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => store.setAutoScrollSpeed(preset.value)}
                      className={`pill-btn px-2 h-8 font-mono text-xs ${
                        Math.abs(store.autoScrollSpeed - preset.value) < 0.04
                          ? 'pill-btn-tune'
                          : ''
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => store.setAutoScrollSpeed(store.autoScrollSpeed + 0.1)}
                    className="pill-btn w-8 h-8 font-mono text-xs"
                    aria-label="Mais rápido"
                  >
                    +
                  </button>
                  <span className="font-mono text-xs text-[var(--muted)] tabular-nums px-1">
                    {store.autoScrollSpeed.toFixed(2)}×
                  </span>
                </div>
              )}

              {speedChanged && !calibrating && (
                <button
                  type="button"
                  onClick={onSaveScrollSpeed}
                  className="pill-btn px-2.5 h-8 text-xs text-[var(--tune)] border-[var(--tune)]/50"
                  title="Salvar esta velocidade como padrão desta música"
                >
                  Salvar ritmo
                </button>
              )}

              {canCalibrate && !calibrating && !store.isAutoScrolling && (
                hasCalibration ? (
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={onStartCalibration}
                      className="pill-btn px-2.5 h-8 text-xs text-[var(--tune)] border-[var(--tune)]/45"
                      title="Esta música tem marcos por seção salvos. Clique para recalibrar."
                    >
                      ✓ Calibrada
                    </button>
                    <button
                      type="button"
                      onClick={onClearCalibration}
                      className="w-7 h-7 rounded-full text-[var(--muted)] hover:text-[var(--rec)] hover:bg-[var(--surface2)] text-xs flex items-center justify-center cursor-pointer"
                      title="Remover calibração por seção e voltar ao modo linear"
                      aria-label="Remover calibração"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onStartCalibration}
                    className="pill-btn px-2.5 h-8 text-xs text-[var(--muted)]"
                    title="Gravar em 1 ensaio o momento exato de cada seção para o auto-scroll acompanhar solos e viradas"
                  >
                    Calibrar
                  </button>
                )
              )}
            </div>
          )}

          {/* Metronome */}
          <Metronome readOnly={isFollowing} beatsPerBar={beatsPerBar} />

          {/* Visual 1-2-3-4 count-in (synced when leading Live Session) */}
          {!isFollowing && !calibrating && (
            <button
              type="button"
              onClick={onTriggerCountIn}
              className="pill-btn px-2.5 h-8 font-mono text-xs"
              title="Contagem visual 1-2-3-4 (atalho: C). Sincroniza com a banda se estiver liderando o Ao Vivo."
            >
              1·2·3·4
            </button>
          )}

          {/* Visual pulse toggle */}
          {store.metronomeOn && (
            <button
              type="button"
              onClick={() => setVisualPulseEnabled(!visualPulseEnabled)}
              className={`pill-btn px-2.5 h-8 text-xs ${
                visualPulseEnabled ? 'pill-btn-primary' : ''
              }`}
              title="Piscar a borda da tela no tempo do metrônomo"
            >
              Pulso
            </button>
          )}
        </div>

        {/* Right: Diagrams / Show chords / Notes / Edit */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {isSingerMode ? (
            <button
              type="button"
              onClick={() => setDisplayMode('both')}
              className="pill-btn px-3 h-8 text-xs text-[var(--accent-ink)]"
              title="Voltar a exibir os acordes acima da letra"
            >
              Mostrar acordes
            </button>
          ) : (
            chordCount > 0 && (
              <button
                type="button"
                onClick={() => setChordsRefOpen(!chordsRefOpen)}
                aria-expanded={chordsRefOpen}
                className={`pill-btn px-3 h-8 text-xs ${
                  chordsRefOpen ? 'border-[var(--accent)] text-[var(--accent-ink)]' : ''
                }`}
                title="Abrir ou recolher os diagramas dos acordes desta música"
              >
                Diagramas ({chordCount}) {chordsRefOpen ? '▴' : '▾'}
              </button>
            )
          )}

          {!calibrating && (
            <>
              <button
                type="button"
                onClick={onToggleEditNotes}
                className={`pill-btn px-3 h-8 text-xs ${
                  hasNotes ? 'bg-[var(--warn-dim)] text-[var(--warn-ink)]' : ''
                }`}
                title="Adicionar ou editar deixas de palco e notas de ensaio"
              >
                {hasNotes ? '✎ Deixa' : '+ Deixa'}
              </button>
              <button
                type="button"
                onClick={onEnterEdit}
                className="pill-btn px-3 h-8 text-xs"
              >
                ✎ Editar
              </button>
            </>
          )}
        </div>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none lg:hidden absolute right-0 top-0 bottom-0 w-9 bg-gradient-to-l from-[var(--surface-high)] to-transparent"
        />
      </div>
    </div>
  );
}
