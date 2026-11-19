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
      className="flex-shrink-0 border-b border-[var(--line)] bg-[var(--bg)]/80 px-4 sm:px-6 py-1.5"
    >
      <div className="max-w-6xl mx-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <span className="eyebrow flex-shrink-0 mr-1 hidden sm:inline">Ir para</span>
        {sections.map((sec, idx) => {
          const colors = SECTION_COLORS[sec.type] || SECTION_COLORS.verse;
          const isActive = idx === activeIdx;
          return (
            <button
              key={`${sec.label}-${idx}`}
              type="button"
              onClick={() => onJump(idx)}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[11px] transition-all cursor-pointer border ${
                isActive
                  ? 'bg-[var(--surface)] border-[var(--accent)] text-[var(--ink)] font-semibold shadow-[var(--shadow-sm)]'
                  : 'bg-transparent border-transparent text-[var(--muted)] hover:bg-[var(--surface2)] hover:text-[var(--ink)]'
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
