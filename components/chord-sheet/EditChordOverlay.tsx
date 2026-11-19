'use client';

import { useEffect, useRef, useState } from 'react';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SUFFIXES = [
  '',
  'm',
  '7',
  'm7',
  'maj7',
  '6',
  'm6',
  '9',
  'add9',
  'sus2',
  'sus4',
  '7sus4',
  'dim',
  'aug',
  'm7b5',
  '5',
];

interface SelectedChord {
  sectionIdx: number;
  lineIdx: number;
  segIdx: number;
  chord: string;
}

interface EditChordOverlayProps {
  selected: SelectedChord | null;
  addTarget: { sectionIdx: number; lineIdx: number; charPos: number } | null;
  songChords?: string[];
  onMove: (sectionIdx: number, lineIdx: number, segIdx: number, dir: 'left' | 'right') => void;
  onRename: (sectionIdx: number, lineIdx: number, segIdx: number, newChord: string) => void;
  onDelete: (sectionIdx: number, lineIdx: number, segIdx: number) => void;
  onInsert: (sectionIdx: number, lineIdx: number, charPos: number, chord: string) => void;
  onClose: () => void;
}

function parseChordParts(chord: string): { root: string; suffix: string; bass: string } {
  const [main, bass = ''] = chord.split('/');
  const m = main.match(/^([A-G][#b]?)(.*)/);
  if (!m) return { root: 'C', suffix: '', bass: '' };
  return { root: m[1], suffix: m[2], bass };
}

function OverlayInner({
  selected,
  addTarget,
  songChords = [],
  onMove,
  onRename,
  onDelete,
  onInsert,
  onClose,
}: EditChordOverlayProps) {
  const isAdd = addTarget !== null && selected === null;
  const isEdit = selected !== null;

  // In add mode jump straight to picker so inserting takes 1 tap!
  const [mode, setMode] = useState<'main' | 'change'>(isAdd ? 'change' : 'main');
  const [useFlats, setUseFlats] = useState(false);

  const parsed = selected ? parseChordParts(selected.chord) : { root: 'C', suffix: '', bass: '' };
  const [pickedRoot, setPickedRoot] = useState(parsed.root);
  const [pickedSuffix, setPickedSuffix] = useState(parsed.suffix);
  const [pickedBass, setPickedBass] = useState(parsed.bass);
  const [customInput, setCustomInput] = useState(selected?.chord ?? '');
  const [showBassPicker, setShowBassPicker] = useState(Boolean(parsed.bass));

  // Keep latest selected + onMove in refs so hold-to-repeat stays accurate as segIdx changes
  const selectedRef = useRef(selected);
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    selectedRef.current = selected;
    onMoveRef.current = onMove;
  });

  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopHold = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };

  useEffect(() => stopHold, []);

  const triggerMove = (dir: 'left' | 'right') => {
    const cur = selectedRef.current;
    if (!cur) return;
    onMoveRef.current(cur.sectionIdx, cur.lineIdx, cur.segIdx, dir);
  };

  const startHoldMove = (dir: 'left' | 'right') => {
    stopHold();
    triggerMove(dir);
    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => triggerMove(dir), 95);
    }, 280);
  };

  // Keyboard shortcuts while overlay is open
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (inInput) return;
      if (mode === 'main' && selectedRef.current) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          triggerMove('left');
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          triggerMove('right');
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          const cur = selectedRef.current;
          onDelete(cur.sectionIdx, cur.lineIdx, cur.segIdx);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, onClose, onDelete]);

  const noteList = useFlats ? FLAT_NOTES : NOTES;
  const builtChord = `${pickedRoot}${pickedSuffix}${pickedBass ? `/${pickedBass}` : ''}`;

  const commitChord = (chordName: string) => {
    const clean = chordName.trim().replace(/^\[|\]$/g, '');
    if (!clean) return;
    if (isEdit && selected) {
      onRename(selected.sectionIdx, selected.lineIdx, selected.segIdx, clean);
    } else if (isAdd && addTarget) {
      onInsert(addTarget.sectionIdx, addTarget.lineIdx, addTarget.charPos, clean);
    }
    onClose();
  };

  const openChangeMode = () => {
    if (selected) {
      const p = parseChordParts(selected.chord);
      setPickedRoot(p.root);
      setPickedSuffix(p.suffix);
      setPickedBass(p.bass);
      setShowBassPicker(Boolean(p.bass));
      setCustomInput(selected.chord);
    } else {
      setPickedRoot('C');
      setPickedSuffix('');
      setPickedBass('');
      setShowBassPicker(false);
      setCustomInput('');
    }
    setMode('change');
  };

  return (
    <>
      <button
        type="button"
        aria-label="Fechar editor de acorde"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-transparent border-0 p-0 cursor-default"
      />

      <div
        className="fixed bottom-0 inset-x-0 z-50 rounded-t-[28px] bg-[var(--surface)] max-h-[78vh] overflow-y-auto"
        style={{ boxShadow: 'var(--shadow-md)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-3xl mx-auto">
          {mode === 'main' && isEdit && selected && (
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="field-label">Acorde selecionado</span>
                  <span className="text-base font-bold font-mono text-[var(--accent-ink)]">
                    {selected.chord}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--surface2)] text-[var(--muted)] hover:text-[var(--ink)] text-lg cursor-pointer"
                  aria-label="Fechar"
                >
                  ×
                </button>
              </div>

              {/* Move row with hold-to-repeat */}
              <div className="flex items-center gap-2">
                <span className="field-label w-14">Mover</span>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    startHoldMove('left');
                  }}
                  onPointerUp={stopHold}
                  onPointerLeave={stopHold}
                  onPointerCancel={stopHold}
                  className="flex-1 h-12 rounded-2xl bg-[var(--surface-high)] hover:bg-[var(--surface2)] active:bg-[var(--primary-container)] text-[var(--ink)] text-xl font-bold transition-colors flex items-center justify-center select-none touch-none cursor-pointer"
                  title="Mover para esquerda (segure ou use seta ←)"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    startHoldMove('right');
                  }}
                  onPointerUp={stopHold}
                  onPointerLeave={stopHold}
                  onPointerCancel={stopHold}
                  className="flex-1 h-12 rounded-2xl bg-[var(--surface-high)] hover:bg-[var(--surface2)] active:bg-[var(--primary-container)] text-[var(--ink)] text-xl font-bold transition-colors flex items-center justify-center select-none touch-none cursor-pointer"
                  title="Mover para direita (segure ou use seta →)"
                >
                  ▶
                </button>
              </div>

              {/* Quick 1-tap swap with chords already in the song */}
              {songChords.length > 0 && (
                <div className="space-y-1.5">
                  <span className="field-label block">Troca rápida (acordes da música)</span>
                  <div className="flex flex-wrap gap-1.5">
                    {songChords.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => commitChord(c)}
                        className={`px-3 py-1.5 rounded-full font-mono text-xs font-bold transition-colors cursor-pointer ${
                          c === selected.chord
                            ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                            : 'bg-[var(--surface-high)] text-[var(--ink)] hover:bg-[var(--primary-container)] hover:text-[var(--on-primary-container)]'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={openChangeMode}
                  className="flex-1 h-10 pill-btn pill-btn-primary text-sm"
                >
                  Outro acorde…
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(selected.sectionIdx, selected.lineIdx, selected.segIdx);
                    onClose();
                  }}
                  className="flex-1 h-10 pill-btn bg-[var(--rec-dim)] text-[var(--on-rec-container)] hover:bg-[var(--rec)] hover:text-[var(--on-rec)] text-sm"
                >
                  Remover
                </button>
              </div>
            </div>
          )}

          {mode === 'change' && (
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--ink)]">
                  {isAdd ? 'Inserir acorde' : 'Trocar acorde'}:{' '}
                  <span className="font-mono font-bold text-[var(--accent-ink)]">
                    {customInput.trim() || builtChord}
                  </span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setUseFlats((f) => !f)}
                    className={`pill-btn px-3 py-1.5 text-xs font-mono ${useFlats ? 'pill-btn-primary' : 'bg-[var(--bg)]'}`}
                  >
                    {useFlats ? '♭ Bemóis' : '♯ Sustenidos'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--surface-high)] text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                    aria-label="Fechar"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Quick 1-tap chords from this song */}
              {songChords.length > 0 && (
                <div className="space-y-1">
                  <span className="field-label block">Acordes desta música</span>
                  <div className="flex flex-wrap gap-1.5">
                    {songChords.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => commitChord(c)}
                        className="px-3 py-1.5 rounded-full font-mono text-xs font-bold bg-[var(--primary-container)] text-[var(--on-primary-container)] hover:bg-[var(--accent)] hover:text-[var(--on-accent)] transition-colors cursor-pointer"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Direct free-text input (e.g. D/F#, C7M(9), Bm7b5) */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commitChord(customInput.trim() || builtChord);
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="Ou digite direto (ex.: D/F#, Cmaj7, Bm7b5)..."
                  className="studio-input flex-1 px-3 py-1.5 text-sm font-mono"
                />
                <button
                  type="submit"
                  className="pill-btn pill-btn-primary px-4 py-1.5 text-xs"
                >
                  Usar
                </button>
              </form>

              {/* Root note grid */}
              <div className="grid grid-cols-6 gap-1.5">
                {noteList.map((note) => (
                  <button
                    key={note}
                    type="button"
                    onClick={() => {
                      setPickedRoot(note);
                      setCustomInput(`${note}${pickedSuffix}${pickedBass ? `/${pickedBass}` : ''}`);
                    }}
                    className={`h-9 rounded-xl text-xs font-bold font-mono transition-colors cursor-pointer ${
                      pickedRoot === note
                        ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                        : 'bg-[var(--surface-high)] text-[var(--ink)] hover:bg-[var(--surface2)]'
                    }`}
                  >
                    {note}
                  </button>
                ))}
              </div>

              {/* Suffix chips */}
              <div className="flex flex-wrap gap-1">
                {SUFFIXES.map((suf) => (
                  <button
                    key={suf || 'maj'}
                    type="button"
                    onClick={() => {
                      setPickedSuffix(suf);
                      setCustomInput(`${pickedRoot}${suf}${pickedBass ? `/${pickedBass}` : ''}`);
                    }}
                    className={`px-3 h-8 rounded-full text-xs font-mono font-bold transition-colors cursor-pointer ${
                      pickedSuffix === suf
                        ? 'bg-[var(--tune)] text-[var(--on-tune)]'
                        : 'bg-[var(--surface-high)] text-[var(--muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {suf || 'maior'}
                  </button>
                ))}
              </div>

              {/* Slash-bass toggle + picker */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowBassPicker((v) => !v)}
                    className="font-mono text-xs text-[var(--accent-ink)] hover:underline cursor-pointer"
                  >
                    {showBassPicker ? '▾ Baixo invertido (/nota)' : '▸ Baixo invertido (/F#, /G, /B…)'}
                    {pickedBass ? ` · /${pickedBass}` : ''}
                  </button>
                  {pickedBass && (
                    <button
                      type="button"
                      onClick={() => {
                        setPickedBass('');
                        setCustomInput(`${pickedRoot}${pickedSuffix}`);
                      }}
                      className="font-mono text-xs text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                    >
                      Limpar baixo
                    </button>
                  )}
                </div>
                {showBassPicker && (
                  <div className="grid grid-cols-6 gap-1">
                    {noteList.map((bass) => (
                      <button
                        key={`bass-${bass}`}
                        type="button"
                        onClick={() => {
                          const nextBass = pickedBass === bass ? '' : bass;
                          setPickedBass(nextBass);
                          setCustomInput(`${pickedRoot}${pickedSuffix}${nextBass ? `/${nextBass}` : ''}`);
                        }}
                        className={`h-8 rounded-xl text-xs font-bold font-mono transition-colors cursor-pointer ${
                          pickedBass === bass
                            ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)]'
                            : 'bg-[var(--bg)] text-[var(--muted)] hover:bg-[var(--surface-high)] hover:text-[var(--ink)]'
                        }`}
                      >
                        /{bass}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Confirm / Back */}
              <div className="flex gap-2 pt-1">
                {isEdit && (
                  <button
                    type="button"
                    onClick={() => setMode('main')}
                    className="flex-1 h-10 pill-btn bg-[var(--bg)] text-sm"
                  >
                    Voltar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => commitChord(customInput.trim() || builtChord)}
                  className="flex-1 h-10 pill-btn pill-btn-primary text-sm"
                >
                  Aplicar {customInput.trim() || builtChord}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function EditChordOverlay(props: EditChordOverlayProps) {
  const { selected, addTarget } = props;
  if (!selected && !addTarget) return null;
  const key = selected
    ? `edit-${selected.sectionIdx}-${selected.lineIdx}`
    : `add-${addTarget!.sectionIdx}-${addTarget!.lineIdx}-${addTarget!.charPos}`;
  return <OverlayInner key={key} {...props} />;
}
