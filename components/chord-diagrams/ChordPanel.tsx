'use client';

import { useRef, useState } from 'react';
import { getGuitarPositions, getPianoNotes } from '@/lib/utils/chord-lookup';
import { playReferencePitch } from '@/lib/utils/pitch-audio';
import { useDialogA11y } from '@/lib/hooks/use-dialog-a11y';
import { CloseIcon, PitchWaveIcon } from '@/components/ui/Icons';
import { GuitarChordDiagram } from './GuitarChordDiagram';
import { PianoChordDiagram } from './PianoChordDiagram';

interface ChordPanelProps {
  chord: string | null;
  onClose: () => void;
}

function ChordPanelBody({ chord, onClose }: { chord: string; onClose: () => void }) {
  const [voicingIdx, setVoicingIdx] = useState(0);
  const panelRef = useRef<HTMLElement>(null);

  useDialogA11y(true, onClose, panelRef);

  const positions = getGuitarPositions(chord);
  const pianoNotes = getPianoNotes(chord);
  const safeIdx = positions.length ? voicingIdx % positions.length : 0;
  const currentVoicing = positions[safeIdx] || positions[0];

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/25 sm:bg-transparent"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chord-panel-title"
        className="gm3-drawer-right fixed right-0 top-0 bottom-0 w-72 max-w-[85vw] rounded-l-[28px] bg-[var(--surface)] z-50 flex flex-col overflow-hidden"
        style={{ boxShadow: 'var(--shadow-md)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line-subtle)]/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <h2
              id="chord-panel-title"
              className="text-2xl font-display font-bold text-[var(--accent-ink)] leading-tight"
            >
              {chord}
            </h2>
            <button
              type="button"
              onClick={() => playReferencePitch(chord, { mode: 'chord' })}
              className="pill-btn bg-[var(--bg)] px-2.5 h-8 text-xs text-[var(--accent-ink)]"
              title="Ouvir referência sonora deste acorde"
            >
              <PitchWaveIcon size={14} />
              Ouvir
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-high)] transition-colors cursor-pointer"
            aria-label="Fechar painel de acorde"
          >
            <CloseIcon size={17} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 border-b border-[var(--line-subtle)]/40">
            <div className="field-label mb-3">Violão / Guitarra</div>
            {currentVoicing ? (
              <>
                <div className="flex justify-center">
                  <GuitarChordDiagram voicing={currentVoicing} label={chord} />
                </div>
                {positions.length > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setVoicingIdx((v) => (v - 1 + positions.length) % positions.length)}
                      className="pill-btn bg-[var(--bg)] px-3 h-8 text-xs"
                    >
                      Anterior
                    </button>
                    <span className="font-mono text-xs text-[var(--muted)] tabular-nums">
                      {safeIdx + 1}/{positions.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setVoicingIdx((v) => (v + 1) % positions.length)}
                      className="pill-btn bg-[var(--bg)] px-3 h-8 text-xs"
                    >
                      Próxima
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-[var(--muted)] text-center py-4">
                Sem diagrama disponível
              </div>
            )}
          </div>

          <div className="p-4">
            <div className="field-label mb-3">Teclado / Piano</div>
            {pianoNotes.length > 0 ? (
              <div className="flex justify-center">
                <PianoChordDiagram notes={pianoNotes} label={chord} />
              </div>
            ) : (
              <div className="text-xs text-[var(--muted)] text-center py-4">
                Sem diagrama disponível
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export function ChordPanel({ chord, onClose }: ChordPanelProps) {
  if (!chord) return null;
  // Keying by chord automatically resets voicingIdx whenever a different chord is tapped.
  return <ChordPanelBody key={chord} chord={chord} onClose={onClose} />;
}
