'use client';

import { useState } from 'react';
import { getGuitarPositions, getPianoNotes } from '@/lib/utils/chord-lookup';
import { GuitarChordDiagram } from './GuitarChordDiagram';
import { PianoChordDiagram } from './PianoChordDiagram';

interface ChordPanelProps {
  chord: string | null;
  onClose: () => void;
}

function ChordPanelBody({ chord, onClose }: { chord: string; onClose: () => void }) {
  const [voicingIdx, setVoicingIdx] = useState(0);

  const positions = getGuitarPositions(chord);
  const pianoNotes = getPianoNotes(chord);
  const safeIdx = positions.length ? voicingIdx % positions.length : 0;
  const currentVoicing = positions[safeIdx] || positions[0];

  return (
    <aside
      aria-label={`Diagramas do acorde ${chord}`}
      className="fixed right-0 top-0 bottom-0 w-72 max-w-[85vw] bg-[var(--surface)] border-l border-[var(--line)] z-50 flex flex-col"
      style={{ boxShadow: 'var(--shadow-md)' }}
    >
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--line)]">
        <div>
          <div className="eyebrow">Acorde</div>
          <h3 className="text-2xl font-display text-[var(--accent-ink)] leading-tight">{chord}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] transition-colors cursor-pointer text-lg"
          aria-label="Fechar painel de acorde"
        >
          &times;
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 border-b border-[var(--line)]">
          <div className="eyebrow mb-3">Violão / Guitarra</div>
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
                    className="pill-btn px-2.5 py-1 text-xs"
                  >
                    Anterior
                  </button>
                  <span className="font-mono text-xs text-[var(--muted)] tabular-nums">
                    {safeIdx + 1}/{positions.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setVoicingIdx((v) => (v + 1) % positions.length)}
                    className="pill-btn px-2.5 py-1 text-xs"
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
          <div className="eyebrow mb-3">Teclado / Piano</div>
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
  );
}

export function ChordPanel({ chord, onClose }: ChordPanelProps) {
  if (!chord) return null;
  // Keying by chord automatically resets voicingIdx whenever a different chord is tapped.
  return <ChordPanelBody key={chord} chord={chord} onClose={onClose} />;
}
