'use client';

import { useEffect, useRef } from 'react';
import type { Section } from '@/lib/types/song';
import { SECTION_COLORS } from '@/lib/utils/music';

interface SectionNavProps {
  sections: Section[];
  activeIdx: number;
  onJump: (sectionIdx: number) => void;
  collapsed?: boolean;
}

export function SectionNav({ sections, activeIdx, onJump, collapsed = false }: SectionNavProps) {
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (collapsed) return;
    const rail = railRef.current;
    if (!rail) return;
    const activeBtn = rail.querySelector<HTMLElement>('[aria-current="true"]');
    if (!activeBtn) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    activeBtn.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: reduced ? 'auto' : 'smooth',
    });
  }, [activeIdx, collapsed]);

  if (sections.length <= 1) return null;

  return (
    <nav
      aria-label="Seções da música"
      className="relative flex-shrink-0 bg-[var(--bg)] px-4 sm:px-6 lg:px-8 pb-2"
    >
      <div ref={railRef} className="w-full flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 pr-6">
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
                className="gm3-section-dot w-2 h-2 rounded-full flex-shrink-0"
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
