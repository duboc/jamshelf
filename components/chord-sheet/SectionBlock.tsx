'use client';

import { SECTION_COLORS, isInstrumentalSection } from '@/lib/utils/music';
import type { Section } from '@/lib/types/song';
import { ChordLine } from './ChordLine';
import { SectionEditor } from './SectionEditor';

interface SectionBlockProps {
  section: Section;
  sectionIdx: number;
  onChordTap: (chord: string) => void;
  displayMode?: 'both' | 'lyrics-only' | 'chords-only';
  // Edit mode props
  editMode?: boolean;
  selectedCoord?: { sectionIdx: number; lineIdx: number; segIdx: number } | null;
  onChordSelect?: (sectionIdx: number, lineIdx: number, segIdx: number) => void;
  onAddChord?: (sectionIdx: number, lineIdx: number, charPos: number) => void;
  onLinesChange?: (sectionIdx: number, lines: string[]) => void;
}

export function SectionBlock({
  section,
  sectionIdx,
  onChordTap,
  displayMode = 'both',
  editMode = false,
  selectedCoord = null,
  onChordSelect,
  onAddChord,
  onLinesChange,
}: SectionBlockProps) {
  const colors = SECTION_COLORS[section.type] || SECTION_COLORS.verse;
  const selectedInSection =
    selectedCoord?.sectionIdx === sectionIdx
      ? { lineIdx: selectedCoord.lineIdx, segIdx: selectedCoord.segIdx }
      : null;

  const isSingerMode = !editMode && displayMode === 'lyrics-only';
  const instrumentalOnly = isSingerMode && isInstrumentalSection(section.lines);

  if (instrumentalOnly) {
    return (
      <div
        id={`section-${sectionIdx}`}
        data-section-idx={sectionIdx}
        className="scroll-mt-4 mb-3 flex items-center gap-2.5 rounded-xl border border-[var(--line)] border-l-[3px] px-4 py-2.5"
        style={{
          background: colors.bg,
          borderLeftColor: colors.bd,
        }}
      >
        <span className="font-mono text-[11px] uppercase tracking-wider font-semibold" style={{ color: colors.lb }}>
          ♪ {section.label}
        </span>
        <span className="font-mono text-[11px] text-[var(--muted)]">
          trecho instrumental
        </span>
      </div>
    );
  }

  return (
    <section
      id={`section-${sectionIdx}`}
      data-section-idx={sectionIdx}
      className={`scroll-mt-4 relative rounded-2xl border border-[var(--line)] border-l-4 ${
        isSingerMode ? 'px-5 sm:px-7 py-5 mb-4' : 'p-4 sm:p-5 mb-3.5'
      }`}
      style={{
        background: colors.bg,
        borderLeftColor: colors.bd,
      }}
    >
      <div
        className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] mb-2.5"
        style={{ color: colors.lb }}
      >
        {section.label}
      </div>
      {editMode ? (
        <SectionEditor
          lines={section.lines}
          selected={selectedInSection}
          onChordSelect={(lineIdx, segIdx) => onChordSelect?.(sectionIdx, lineIdx, segIdx)}
          onAddChord={(lineIdx, charPos) => onAddChord?.(sectionIdx, lineIdx, charPos)}
          onLinesChange={(lines) => onLinesChange?.(sectionIdx, lines)}
        />
      ) : (
        <div className={isSingerMode ? 'space-y-2' : 'space-y-1'}>
          {section.lines.map((line, lineIdx) => (
            <ChordLine
              key={lineIdx}
              line={line}
              onChordTap={onChordTap}
              displayMode={displayMode}
            />
          ))}
        </div>
      )}
    </section>
  );
}
