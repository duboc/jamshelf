'use client';

import type { Section } from '@/lib/types/song';
import { SECTION_COLORS } from '@/lib/utils/music';

interface SectionNavProps {
  sections: Section[];
  activeIdx: number;
  onJump: (sectionIdx: number) => void;
}

export function SectionNav({ sections, activeIdx, onJump }: SectionNavProps) {
  if (sections.length <= 1) return null;

  return (
    <div
      aria-label="Seções da música"
      className="flex-shrink-0 border-b border-[var(--line)] bg-[var(--surface)] px-4 sm:px-6"
    >
      <div className="max-w-6xl mx-auto flex items-center gap-0.5 overflow-x-auto no-scrollbar">
        <span className="eyebrow flex-shrink-0 mr-2 hidden sm:inline">Seções</span>
        {sections.map((sec, idx) => {
          const colors = SECTION_COLORS[sec.type] || SECTION_COLORS.verse;
          const isActive = idx === activeIdx;
          return (
            <button
              key={`${sec.label}-${idx}`}
              type="button"
              onClick={() => onJump(idx)}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 font-display text-[12.5px] transition-colors cursor-pointer border-b-2 ${
                isActive
                  ? 'border-[var(--accent)] text-[var(--accent-ink)] font-medium'
                  : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)]/60'
              }`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: colors.bd }}
              />
              {sec.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
