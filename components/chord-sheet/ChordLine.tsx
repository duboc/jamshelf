'use client';

import { parseLine } from '@/lib/utils/music';
import { ChordBadge } from './ChordBadge';

interface ChordLineProps {
  line: string;
  onChordTap: (chord: string) => void;
  // Edit mode props
  editMode?: boolean;
  selectedSegIdx?: number | null;
  onChordSelect?: (segIdx: number) => void;
  onAddChord?: (charPos: number) => void;
}

export function ChordLine({
  line,
  onChordTap,
  editMode = false,
  selectedSegIdx = null,
  onChordSelect,
  onAddChord,
}: ChordLineProps) {
  const segments = parseLine(line);
  const hasChords = segments.some((s) => s.chord);

  if (!editMode) {
    if (!hasChords) {
      return (
        <div className="min-h-[1.4em] whitespace-pre-wrap leading-relaxed">
          {line || '\u00A0'}
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-end leading-relaxed">
        {segments.map((seg, i) => (
          <span key={i} className="inline-flex flex-col">
            <span className="min-h-[1.4em]">
              {seg.chord ? <ChordBadge chord={seg.chord} onTap={onChordTap} /> : null}
            </span>
            <span className="whitespace-pre-wrap">{seg.text || '\u00A0'}</span>
          </span>
        ))}
      </div>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────────
  // Calculate char positions of each segment's text start for insert targets
  let charCursor = 0;
  const segCharPositions: number[] = [];
  for (const seg of segments) {
    segCharPositions.push(charCursor);
    charCursor += seg.text.length;
  }

  if (!hasChords) {
    // No chords yet — show a single add button for the line
    return (
      <div className="flex items-center gap-1 min-h-[2.4em]">
        <span className="whitespace-pre-wrap text-zinc-300">{line || '\u00A0'}</span>
        <button
          onClick={() => onAddChord?.(0)}
          className="ml-1 w-7 h-7 rounded-full bg-zinc-700 hover:bg-violet-600 text-zinc-400 hover:text-white text-base flex items-center justify-center transition-colors flex-shrink-0"
          title="Add chord here"
        >
          +
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end leading-relaxed">
      {segments.map((seg, i) => {
        const isSelected = selectedSegIdx === i;
        const textCharPos = segCharPositions[i] + seg.text.length;

        return (
          <span key={i} className="inline-flex flex-col">
            {/* Chord chip */}
            <span className="min-h-[2em] flex items-center">
              {seg.chord ? (
                <button
                  onClick={() => onChordSelect?.(i)}
                  className={`px-2 py-1 rounded-lg text-[0.85em] font-bold font-mono transition-all select-none ${
                    isSelected
                      ? 'bg-violet-600 text-white ring-2 ring-violet-300 scale-110'
                      : 'bg-zinc-800 text-violet-400 hover:bg-violet-700/40 hover:text-violet-200'
                  }`}
                >
                  {seg.chord}
                </button>
              ) : null}
            </span>

            {/* Lyric text + add button after it */}
            <span className="flex items-center gap-0.5">
              <span className="whitespace-pre-wrap text-zinc-300">
                {seg.text || '\u00A0'}
              </span>
              {/* Show + after the text of each segment */}
              <button
                onClick={() => onAddChord?.(textCharPos)}
                className="w-5 h-5 rounded-full bg-zinc-800 hover:bg-violet-600 text-zinc-500 hover:text-white text-xs flex items-center justify-center transition-colors flex-shrink-0 leading-none"
                title="Add chord here"
              >
                +
              </button>
            </span>
          </span>
        );
      })}
    </div>
  );
}
