'use client';

import { SECTION_COLORS } from '@/lib/utils/music';
import type { Section } from '@/lib/types/song';
import { ChordLine } from './ChordLine';

interface SectionBlockProps {
  section: Section;
  onChordTap: (chord: string) => void;
}

export function SectionBlock({ section, onChordTap }: SectionBlockProps) {
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
        {section.lines.map((line, i) => (
          <ChordLine key={i} line={line} onChordTap={onChordTap} />
        ))}
      </div>
    </div>
  );
}
