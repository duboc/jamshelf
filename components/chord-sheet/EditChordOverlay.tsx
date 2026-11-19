'use client';

import { useState } from 'react';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SUFFIXES = ['', 'm', '7', 'm7', 'maj7', 'sus2', 'sus4', 'dim', 'aug', 'add9'];

interface SelectedChord {
  sectionIdx: number;
  lineIdx: number;
  segIdx: number;
  chord: string;
}

interface EditChordOverlayProps {
  selected: SelectedChord | null;
  addTarget: { sectionIdx: number; lineIdx: number; charPos: number } | null;
  onMove: (sectionIdx: number, lineIdx: number, segIdx: number, dir: 'left' | 'right') => void;
  onRename: (sectionIdx: number, lineIdx: number, segIdx: number, newChord: string) => void;
  onDelete: (sectionIdx: number, lineIdx: number, segIdx: number) => void;
  onInsert: (sectionIdx: number, lineIdx: number, charPos: number, chord: string) => void;
  onClose: () => void;
}

function parseChord(chord: string): { root: string; suffix: string } {
  const m = chord.match(/^([A-G][#b]?)(.*)/);
  if (!m) return { root: chord, suffix: '' };
  return { root: m[1], suffix: m[2] };
}

export function EditChordOverlay({
  selected,
  addTarget,
  onMove,
  onRename,
  onDelete,
  onInsert,
  onClose,
}: EditChordOverlayProps) {
  const isAdd = addTarget !== null && selected === null;
  const isEdit = selected !== null;

  const [mode, setMode] = useState<'main' | 'change'>('main');
  const [useFlats, setUseFlats] = useState(false);

  const parsed = selected ? parseChord(selected.chord) : { root: 'C', suffix: '' };
  const [pickedRoot, setPickedRoot] = useState(parsed.root);
  const [pickedSuffix, setPickedSuffix] = useState(parsed.suffix);

  if (!isEdit && !isAdd) return null;

  const noteList = useFlats ? FLAT_NOTES : NOTES;
  const builtChord = pickedRoot + pickedSuffix;

  const handleApply = () => {
    if (isEdit && selected) {
      onRename(selected.sectionIdx, selected.lineIdx, selected.segIdx, builtChord);
    } else if (isAdd && addTarget) {
      onInsert(addTarget.sectionIdx, addTarget.lineIdx, addTarget.charPos, builtChord);
    }
    setMode('main');
    onClose();
  };

  const handleOpenChange = () => {
    if (selected) {
      const p = parseChord(selected.chord);
      setPickedRoot(p.root);
      setPickedSuffix(p.suffix);
    } else {
      setPickedRoot('C');
      setPickedSuffix('');
    }
    setMode('change');
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        className="fixed bottom-0 inset-x-0 z-50 bg-[var(--surface)] border-t border-[var(--line)]"
        style={{ boxShadow: 'var(--shadow-md)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-xl mx-auto">
          {mode === 'main' && (
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-base font-bold font-mono text-[var(--accent-ink)]">
                  {isAdd ? '+ Adicionar acorde' : selected!.chord}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--surface2)] text-[var(--muted)] hover:text-[var(--ink)] text-lg cursor-pointer"
                  aria-label="Fechar"
                >
                  ×
                </button>
              </div>

              {isEdit && selected && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="eyebrow w-14">Mover</span>
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        onMove(selected.sectionIdx, selected.lineIdx, selected.segIdx, 'left');
                      }}
                      className="flex-1 h-12 rounded-xl border border-[var(--line)] bg-[var(--surface2)] hover:border-[var(--muted)] text-[var(--ink)] text-xl font-bold transition-colors flex items-center justify-center select-none cursor-pointer"
                      title="Mover para esquerda"
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        onMove(selected.sectionIdx, selected.lineIdx, selected.segIdx, 'right');
                      }}
                      className="flex-1 h-12 rounded-xl border border-[var(--line)] bg-[var(--surface2)] hover:border-[var(--muted)] text-[var(--ink)] text-xl font-bold transition-colors flex items-center justify-center select-none cursor-pointer"
                      title="Mover para direita"
                    >
                      ▶
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleOpenChange}
                      className="flex-1 h-11 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-ink)] text-[var(--on-accent)] font-semibold text-sm transition-colors cursor-pointer"
                    >
                      Trocar acorde
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(selected.sectionIdx, selected.lineIdx, selected.segIdx);
                        onClose();
                      }}
                      className="flex-1 h-11 rounded-full bg-[var(--rec)]/15 hover:bg-[var(--rec)] text-[var(--rec)] hover:text-[var(--on-rec)] border border-[var(--rec)]/40 font-semibold text-sm transition-colors cursor-pointer"
                    >
                      Remover
                    </button>
                  </div>
                </>
              )}

              {isAdd && (
                <button
                  type="button"
                  onClick={handleOpenChange}
                  className="w-full h-11 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-ink)] text-[var(--on-accent)] font-semibold text-sm transition-colors cursor-pointer"
                >
                  Escolher acorde
                </button>
              )}
            </div>
          )}

          {mode === 'change' && (
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--ink)]">
                  {isAdd ? 'Inserir acorde' : 'Trocar acorde'}:{' '}
                  <span className="font-mono font-bold text-[var(--accent-ink)]">{builtChord}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setUseFlats((f) => !f)}
                  className={`pill-btn px-3 py-1 text-xs font-mono ${useFlats ? 'pill-btn-primary' : ''}`}
                >
                  {useFlats ? '♭ Bemóis' : '♯ Sustenidos'}
                </button>
              </div>

              <div className="grid grid-cols-6 gap-1.5">
                {noteList.map((note) => (
                  <button
                    key={note}
                    type="button"
                    onClick={() => setPickedRoot(note)}
                    className={`h-10 rounded-xl text-sm font-bold font-mono transition-colors cursor-pointer border ${
                      pickedRoot === note
                        ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--on-accent)]'
                        : 'bg-[var(--surface2)] border-[var(--line)] text-[var(--ink)] hover:border-[var(--muted)]'
                    }`}
                  >
                    {note}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {SUFFIXES.map((suf) => (
                  <button
                    key={suf || 'maj'}
                    type="button"
                    onClick={() => setPickedSuffix(suf)}
                    className={`px-3 h-9 rounded-lg text-xs font-mono font-bold transition-colors cursor-pointer border ${
                      pickedSuffix === suf
                        ? 'bg-[var(--tune)] border-[var(--tune)] text-[var(--on-accent)]'
                        : 'bg-[var(--surface2)] border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {suf || 'maior'}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setMode('main')}
                  className="flex-1 h-10 pill-btn text-sm"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="flex-1 h-10 pill-btn pill-btn-primary text-sm"
                >
                  Aplicar {builtChord}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
