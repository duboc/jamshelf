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

  // Reset state when selection changes
  const chordKey = selected
    ? `${selected.sectionIdx}-${selected.lineIdx}-${selected.segIdx}`
    : addTarget
    ? `add-${addTarget.sectionIdx}-${addTarget.lineIdx}-${addTarget.charPos}`
    : '';

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
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed bottom-0 inset-x-0 z-50 bg-zinc-900 border-t border-zinc-700 shadow-2xl">

        {/* Main mode */}
        {mode === 'main' && (
          <div className="px-4 py-4 space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <span className="text-base font-bold font-mono text-violet-400">
                {isAdd ? '+ Add chord' : selected!.chord}
              </span>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white text-lg"
              >
                ×
              </button>
            </div>

            {/* Action buttons */}
            {isEdit && selected && (
              <>
                {/* Move row */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 w-12">Move:</span>
                  <button
                    onPointerDown={(e) => { e.preventDefault(); onMove(selected.sectionIdx, selected.lineIdx, selected.segIdx, 'left'); }}
                    className="flex-1 h-14 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-200 text-2xl font-bold transition-colors flex items-center justify-center select-none"
                    title="Move left"
                  >
                    ◀
                  </button>
                  <button
                    onPointerDown={(e) => { e.preventDefault(); onMove(selected.sectionIdx, selected.lineIdx, selected.segIdx, 'right'); }}
                    className="flex-1 h-14 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-200 text-2xl font-bold transition-colors flex items-center justify-center select-none"
                    title="Move right"
                  >
                    ▶
                  </button>
                </div>

                {/* Change / Delete row */}
                <div className="flex gap-2">
                  <button
                    onClick={handleOpenChange}
                    className="flex-1 h-12 rounded-xl bg-violet-700 hover:bg-violet-600 active:bg-violet-500 text-white font-semibold text-sm transition-colors"
                  >
                    Change chord
                  </button>
                  <button
                    onClick={() => {
                      onDelete(selected.sectionIdx, selected.lineIdx, selected.segIdx);
                      onClose();
                    }}
                    className="flex-1 h-12 rounded-xl bg-red-900/60 hover:bg-red-800 active:bg-red-700 text-red-300 font-semibold text-sm transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}

            {/* Add mode: jump straight to chord picker */}
            {isAdd && (
              <button
                onClick={handleOpenChange}
                className="w-full h-12 rounded-xl bg-violet-700 hover:bg-violet-600 text-white font-semibold text-sm transition-colors"
              >
                Pick chord
              </button>
            )}
          </div>
        )}

        {/* Chord picker mode */}
        {mode === 'change' && (
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-300">
                {isAdd ? 'Insert chord' : 'Change chord'}
                <span className="ml-2 font-mono text-violet-400">{builtChord}</span>
              </span>
              <button
                onClick={() => setUseFlats((f) => !f)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  useFlats ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {useFlats ? '♭ Flats' : '♯ Sharps'}
              </button>
            </div>

            {/* Note grid */}
            <div className="grid grid-cols-6 gap-1.5">
              {noteList.map((note) => (
                <button
                  key={note}
                  onClick={() => setPickedRoot(note)}
                  className={`h-11 rounded-xl text-sm font-bold font-mono transition-colors ${
                    pickedRoot === note || (useFlats && note === pickedRoot)
                      ? 'bg-violet-600 text-white'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {note}
                </button>
              ))}
            </div>

            {/* Suffix chips */}
            <div className="flex flex-wrap gap-1.5">
              {SUFFIXES.map((suf) => (
                <button
                  key={suf || 'maj'}
                  onClick={() => setPickedSuffix(suf)}
                  className={`px-3 h-9 rounded-lg text-xs font-mono font-bold transition-colors ${
                    pickedSuffix === suf
                      ? 'bg-amber-500 text-zinc-900'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {suf || 'maj'}
                </button>
              ))}
            </div>

            {/* Confirm / Cancel */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setMode('main')}
                className="flex-1 h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm font-semibold transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleApply}
                className="flex-2 flex-1 h-11 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm transition-colors"
              >
                Apply {builtChord}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
