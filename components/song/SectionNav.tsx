'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { Section } from '@/lib/types/song';
import { SECTION_COLORS, formatSectionLabel } from '@/lib/utils/music';

interface SectionNavProps {
  sections: Section[];
  activeIdx: number;
  onJump: (sectionIdx: number) => void;
  collapsed?: boolean;
  leadingSlot?: ReactNode;
  trailingSlot?: ReactNode;
}

export function SectionNav({
  sections,
  activeIdx,
  onJump,
  collapsed = false,
  leadingSlot,
  trailingSlot,
}: SectionNavProps) {
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
    // Scroll ONLY the horizontal rail (never scrollIntoView, which hijacks vertical ChordSheet scroll!)
    const targetLeft =
      activeBtn.offsetLeft - rail.clientWidth / 2 + activeBtn.clientWidth / 2;
    rail.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: reduced ? 'auto' : 'smooth',
    });
  }, [activeIdx, collapsed]);

  if (sections.length <= 1 && !leadingSlot && !trailingSlot) return null;

  return (
    <nav
      aria-label="Seções da música"
      className="relative flex-shrink-0 bg-transparent px-4 sm:px-6 lg:px-8 pb-1.5 flex items-center gap-1.5"
    >
      {leadingSlot}
      <div
        ref={railRef}
        className="gm3-scroll-fade-right flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 pr-6"
      >
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
              {formatSectionLabel(sec.label)}
            </button>
          );
        })}
        {trailingSlot}
      </div>
    </nav>
  );
}
