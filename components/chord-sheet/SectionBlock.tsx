'use client';

import { SECTION_COLORS } from '@/lib/utils/music';
import type { Section } from '@/lib/types/song';
import { ChordLine } from './ChordLine';
import { SectionEditor } from './SectionEditor';

interface SectionBlockProps {
  section: Section;
  sectionIdx: number;
  onChordTap: (chord: string) => void;
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

  return (
    <div
      className="relative rounded-lg p-4 mb-3 border-l-4"
      style={{
        background: colors.bg,
        borderLeftColor: colors.bd,
      }}
    >
      <div
        className="text-xs font-bold uppercase tracking-widest mb-2"
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
        <div className="space-y-0.5">
          {section.lines.map((line, lineIdx) => (
            <ChordLine key={lineIdx} line={line} onChordTap={onChordTap} />
          ))}
        </div>
      )}
    </div>
  );
}
