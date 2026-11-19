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
    <nav
      aria-label="Seções da música"
      className="relative flex-shrink-0 bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pb-2"
    >
      <div className="w-full flex items-center gap-1.5 overflow-x-auto no-scrollbar pr-6">
        {sections.map((sec, idx) => {
          const colors = SECTION_COLORS[sec.type] || SECTION_COLORS.verse;
          const isActive = idx === activeIdx;
          return (
            <button
              key={`${sec.label}-${idx}`}
              type="button"
              onClick={() => onJump(idx)}
              aria-current={isActive ? 'true' : undefined}
              className={`gm3-section-pill flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 h-9 text-xs font-medium cursor-pointer ${
                isActive
                  ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)]'
                  : 'bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-high)] hover:text-[var(--ink)]'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 transition-transform duration-[220ms] ${
                  isActive ? 'scale-120' : ''
                }`}
                style={{ backgroundColor: colors.bd }}
                aria-hidden="true"
              />
              {sec.label}
            </button>
          );
        })}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[var(--bg)] to-transparent"
      />
    </nav>
  );
}
