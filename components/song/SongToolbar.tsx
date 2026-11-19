'use client';

import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import { Metronome } from '@/components/metronome/Metronome';

interface SongToolbarProps {
  beatsPerBar: number;
  chordCount: number;
  isFollowing: boolean;
  onRequestSaveTranspose: () => void;
  onToggleEditMode: () => void;
}

export function SongToolbar({
  beatsPerBar,
  chordCount,
  isFollowing,
  onRequestSaveTranspose,
  onToggleEditMode,
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

  return (
    <div className="flex-shrink-0 border-b border-[var(--line)] bg-[var(--bg)] px-4 sm:px-6 py-2">
      <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center flex-wrap gap-2 sm:gap-3">
          {/* Instrument controls: hidden in Singer (lyrics-only) mode so singers get a calm, focused bar */}
          {!isSingerMode && (
            <div className="flex items-center gap-1.5">
              <span className="eyebrow hidden sm:inline">Tom</span>
              <button
                type="button"
                onClick={store.transposeDown}
                className="pill-btn w-7 h-7 font-mono text-xs"
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
                className="pill-btn w-7 h-7 font-mono text-xs"
                title="Subir meio tom"
              >
                +
              </button>
              <button
                type="button"
                onClick={store.toggleFlats}
                className={`pill-btn px-2 h-7 font-mono text-xs ${
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
                  className="pill-btn px-2.5 h-7 text-[11.5px] text-[var(--accent-ink)] border-[var(--accent)]/50"
                >
                  Salvar tom
                </button>
              )}
            </div>
          )}

          {/* Font size */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFontSize(fontSize - 10)}
              className="pill-btn w-7 h-7 font-mono text-[11px]"
              title="Diminuir letra"
            >
              A-
            </button>
            <span className="font-mono text-[11px] text-[var(--muted)] w-10 text-center tabular-nums hidden sm:inline">
              {fontSize}%
            </span>
            <button
              type="button"
              onClick={() => setFontSize(fontSize + 10)}
              className="pill-btn w-7 h-7 font-mono text-[11px]"
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
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={store.toggleAutoScroll}
                disabled={store.editMode}
                className={`pill-btn px-3 py-1.5 text-xs ${
                  store.isAutoScrolling ? 'pill-btn-tune' : ''
                }`}
                title="Atalho: barra de espaço"
              >
                {store.isAutoScrolling ? '⏸ Pausar rolagem' : '▶ Auto-scroll'}
              </button>
              {store.isAutoScrolling && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      store.setAutoScrollSpeed(+(store.autoScrollSpeed / 1.15).toFixed(2))
                    }
                    className="pill-btn w-7 h-7 font-mono text-xs"
                    aria-label="Mais devagar"
                  >
                    -
                  </button>
                  {[
                    { label: 'Lento', value: 0.3 },
                    { label: 'Médio', value: 0.7 },
                    { label: 'Rápido', value: 1.5 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => store.setAutoScrollSpeed(preset.value)}
                      className={`pill-btn px-2 h-7 font-mono text-[10.5px] ${
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
                    onClick={() =>
                      store.setAutoScrollSpeed(+(store.autoScrollSpeed * 1.15).toFixed(2))
                    }
                    className="pill-btn w-7 h-7 font-mono text-xs"
                    aria-label="Mais rápido"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Metronome */}
          <Metronome readOnly={isFollowing} beatsPerBar={beatsPerBar} />

          {/* Visual beat pulse toggle (especially handy for singers in lyrics-only mode) */}
          {store.metronomeOn && (
            <button
              type="button"
              onClick={() => setVisualPulseEnabled(!visualPulseEnabled)}
              className={`pill-btn px-2.5 py-1 text-xs ${
                visualPulseEnabled ? 'pill-btn-primary' : ''
              }`}
              title="Piscar a borda da tela no tempo do metrônomo"
            >
              Pulso
            </button>
          )}
        </div>

        {/* Right: Diagrams toggle (collapsible!) / Quick Show Chords in Singer Mode / Edit */}
        <div className="flex items-center gap-2">
          {isSingerMode ? (
            <button
              type="button"
              onClick={() => setDisplayMode('both')}
              className="pill-btn px-3 py-1.5 text-xs text-[var(--accent-ink)]"
              title="Voltar a exibir os acordes acima da letra"
            >
              Mostrar acordes
            </button>
          ) : (
            !store.editMode &&
            chordCount > 0 && (
              <button
                type="button"
                onClick={() => setChordsRefOpen(!chordsRefOpen)}
                aria-expanded={chordsRefOpen}
                className={`pill-btn px-3 py-1.5 text-xs ${
                  chordsRefOpen ? 'border-[var(--accent)] text-[var(--accent-ink)]' : ''
                }`}
                title="Abrir ou recolher os diagramas dos acordes desta música"
              >
                Diagramas ({chordCount}) {chordsRefOpen ? '▴' : '▾'}
              </button>
            )
          )}

          <button
            type="button"
            onClick={onToggleEditMode}
            className={`pill-btn px-3 py-1.5 text-xs ${
              store.editMode ? 'pill-btn-primary' : ''
            }`}
          >
            {store.editMode ? '✓ Concluir' : '✎ Editar'}
          </button>
        </div>
      </div>
    </div>
  );
}
