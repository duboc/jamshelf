'use client';

import { parseLine, extractLyricText, lineHasLyrics } from '@/lib/utils/music';
import { PlusIcon } from '@/components/ui/Icons';
import { ChordBadge } from './ChordBadge';

interface ChordLineProps {
  line: string;
  onChordTap: (chord: string) => void;
  displayMode?: 'both' | 'lyrics-only' | 'chords-only';
  // Edit mode props
  editMode?: boolean;
  selectedSegIdx?: number | null;
  onChordSelect?: (segIdx: number) => void;
  onAddChord?: (charPos: number) => void;
}

export function ChordLine({
  line,
  onChordTap,
  displayMode = 'both',
  editMode = false,
  selectedSegIdx = null,
  onChordSelect,
  onAddChord,
}: ChordLineProps) {
  const segments = parseLine(line);
  const hasChords = segments.some((s) => s.chord);

  if (!editMode) {
    if (displayMode === 'lyrics-only') {
      // Skip chord-only or bar-grid lines (e.g. "| [C] | [Am] |") when singing
      if (!line.trim()) {
        return <div className="h-3" aria-hidden="true" />;
      }
      if (!lineHasLyrics(line)) {
        return null;
      }
      const text = extractLyricText(line).replace(/\s{2,}/g, ' ').trim();
      return (
        <p className="text-[1.3em] leading-[1.7] tracking-[-0.01em] text-[var(--ink)] font-normal whitespace-pre-wrap">
          {text}
        </p>
      );
    }

    if (displayMode === 'chords-only') {
      if (!hasChords) return null;
      return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 py-1">
          {segments
            .filter((seg) => seg.chord)
            .map((seg, i) => (
              <ChordBadge key={i} chord={seg.chord!} onTap={onChordTap} size="lg" />
            ))}
        </div>
      );
    }

    if (!hasChords) {
      return (
        <div className="min-h-[1.45em] whitespace-pre-wrap leading-relaxed text-[var(--ink)]">
          {line || '\u00A0'}
        </div>
      );
    }

    // Compact horizontal chord grid for instrumental / chord-only lines (no phantom blank lyric row)
    if (!lineHasLyrics(line)) {
      return (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 py-0.5 text-[var(--ink)]">
          {segments.map((seg, i) => {
            const extra = seg.text.trim();
            return (
              <span key={i} className="inline-flex items-center gap-1.5">
                {seg.chord ? <ChordBadge chord={seg.chord} onTap={onChordTap} /> : null}
                {extra ? <span className="text-[var(--muted)] text-[0.9em]">{extra}</span> : null}
              </span>
            );
          })}
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-end leading-relaxed text-[var(--ink)]">
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
  let charCursor = 0;
  const segCharPositions: number[] = [];
  for (const seg of segments) {
    segCharPositions.push(charCursor);
    charCursor += seg.text.length;
  }

  if (!hasChords) {
    return (
      <div className="flex items-center gap-1 min-h-[2.4em]">
        <span className="whitespace-pre-wrap text-[var(--ink)]">{line || '\u00A0'}</span>
        <button
          type="button"
          onClick={() => onAddChord?.(0)}
          className="ml-1 w-7 h-7 rounded-full bg-[var(--surface2)] hover:bg-[var(--accent)] text-[var(--muted)] hover:text-[var(--on-accent)] flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer"
          title="Adicionar acorde aqui"
          aria-label="Adicionar acorde aqui"
        >
          <PlusIcon size={14} />
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
            <span className="min-h-[2em] flex items-center">
              {seg.chord ? (
                <button
                  type="button"
                  onClick={() => onChordSelect?.(i)}
                  className={`gm3-edit-chord-btn px-2 py-1 rounded-lg text-[0.85em] font-bold font-mono select-none cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--accent)] text-[var(--on-accent)] ring-2 ring-[var(--accent-ink)] scale-105'
                      : 'bg-[var(--surface2)] text-[var(--accent-ink)] hover:bg-[var(--accent-dim)]'
                  }`}
                >
                  {seg.chord}
                </button>
              ) : null}
            </span>

            <span className="flex items-center gap-0.5">
              <span className="whitespace-pre-wrap text-[var(--ink)]">
                {seg.text || '\u00A0'}
              </span>
              <button
                type="button"
                onClick={() => onAddChord?.(textCharPos)}
                className="w-7 h-7 rounded-full bg-[var(--surface2)] hover:bg-[var(--accent)] text-[var(--muted)] hover:text-[var(--on-accent)] flex items-center justify-center transition-colors flex-shrink-0 leading-none cursor-pointer"
                title="Adicionar acorde aqui"
                aria-label="Adicionar acorde aqui"
              >
                <PlusIcon size={13} />
              </button>
            </span>
          </span>
        );
      })}
    </div>
  );
}
