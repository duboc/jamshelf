'use client';

import { SECTION_COLORS } from '@/lib/utils/music';
import type { Section } from '@/lib/types/song';
import { ChordLine } from './ChordLine';

interface SectionBlockProps {
  section: Section;
  sectionIdx: number;
  onChordTap: (chord: string) => void;
  // Edit mode props
  editMode?: boolean;
  selectedCoord?: { sectionIdx: number; lineIdx: number; segIdx: number } | null;
  onChordSelect?: (sectionIdx: number, lineIdx: number, segIdx: number) => void;
  onAddChord?: (sectionIdx: number, lineIdx: number, charPos: number) => void;
}

export function SectionBlock({
  section,
  sectionIdx,
  onChordTap,
  editMode = false,
  selectedCoord = null,
  onChordSelect,
  onAddChord,
}: SectionBlockProps) {
  const colors = SECTION_COLORS[section.type] || SECTION_COLORS.verse;

  return (
    <div
      className="rounded-lg p-4 mb-3 border-l-4"
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
      <div className="space-y-0.5">
        {section.lines.map((line, lineIdx) => {
          const isSelectedLine =
            selectedCoord?.sectionIdx === sectionIdx &&
            selectedCoord?.lineIdx === lineIdx;

          return (
            <ChordLine
              key={lineIdx}
              line={line}
              onChordTap={onChordTap}
              editMode={editMode}
              selectedSegIdx={isSelectedLine ? selectedCoord!.segIdx : null}
              onChordSelect={(segIdx) => onChordSelect?.(sectionIdx, lineIdx, segIdx)}
              onAddChord={(charPos) => onAddChord?.(sectionIdx, lineIdx, charPos)}
            />
          );
        })}
      </div>
    </div>
  );
}
