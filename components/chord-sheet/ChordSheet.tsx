'use client';

import { useRef, useEffect } from 'react';
import type { Song } from '@/lib/types/song';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import { SectionBlock } from './SectionBlock';

interface ChordSheetProps {
  song: Song;
  onChordTap: (chord: string) => void;
  displayMode?: 'both' | 'lyrics-only' | 'chords-only';
  // Edit mode props
  editMode?: boolean;
  selectedCoord?: { sectionIdx: number; lineIdx: number; segIdx: number } | null;
  onChordSelect?: (sectionIdx: number, lineIdx: number, segIdx: number) => void;
  onAddChord?: (sectionIdx: number, lineIdx: number, charPos: number) => void;
  onLinesChange?: (sectionIdx: number, lines: string[]) => void;
  // Live-session & navigation props
  onScrollTopChange?: (scrollTop: number) => void;
  syncCorrection?: { scrollTop: number; nonce: number };
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  onActiveSectionChange?: (sectionIdx: number) => void;
  bottomPaddingClass?: string;
}

export function ChordSheet({
  song,
  onChordTap,
  displayMode = 'both',
  editMode = false,
  selectedCoord = null,
  onChordSelect,
  onAddChord,
  onLinesChange,
  onScrollTopChange,
  syncCorrection,
  scrollContainerRef,
  onActiveSectionChange,
  bottomPaddingClass = 'pb-20',
}: ChordSheetProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const scrollRef = scrollContainerRef ?? internalRef;
  const { isAutoScrolling, autoScrollSpeed } = usePlayerStore();
  const fontSize = useDisplayStore((s) => s.fontSize);

  const speedRef = useRef(autoScrollSpeed);
  useEffect(() => {
    speedRef.current = autoScrollSpeed;
  }, [autoScrollSpeed]);

  // Reset scroll to top when switching songs
  useEffect(() => {
    if (scrollRef.current && !syncCorrection) {
      scrollRef.current.scrollTop = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  useEffect(() => {
    if (!isAutoScrolling) return;
    const el = scrollRef.current;
    if (!el) return;
    let frameId: number;
    let last = performance.now();
    // Track intended position in a JS float because DOM scrollTop truncates sub-1px increments.
    let position = el.scrollTop;
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      position += speedRef.current * 20 * (dt / 1000);
      el.scrollTop = position;
      frameId = requestAnimationFrame(step);
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [isAutoScrolling, scrollRef]);

  // Report scroll position for live-session sync + track active visible section
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      onScrollTopChange?.(el.scrollTop);
      if (onActiveSectionChange) {
        const nodes = el.querySelectorAll<HTMLElement>('[data-section-idx]');
        let currentIdx = 0;
        const topThreshold = el.scrollTop + 96;
        for (const node of nodes) {
          if (node.offsetTop <= topThreshold) {
            currentIdx = Number(node.dataset.sectionIdx || 0);
          } else {
            break;
          }
        }
        onActiveSectionChange(currentIdx);
      }
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [onScrollTopChange, onActiveSectionChange, scrollRef]);

  // Snap to the latest synced position when following a live session leader.
  useEffect(() => {
    if (!syncCorrection) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = syncCorrection.scrollTop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncCorrection?.nonce]);

  // Always show both chords and lyrics while editing
  const effectiveDisplayMode = editMode ? 'both' : displayMode;
  const isSingerMode = effectiveDisplayMode === 'lyrics-only';

  return (
    <div
      ref={scrollRef}
      className={`flex-1 overflow-y-auto px-4 sm:px-6 pt-5 ${bottomPaddingClass}`}
      style={{ fontSize: `${fontSize}%` }}
    >
      <div
        className={`mx-auto ${
          isSingerMode ? 'max-w-2xl font-sans' : 'max-w-3xl font-mono'
        }`}
      >
        {song.sections.map((section, i) => (
          <SectionBlock
            key={i}
            section={section}
            sectionIdx={i}
            onChordTap={onChordTap}
            displayMode={effectiveDisplayMode}
            editMode={editMode}
            selectedCoord={selectedCoord}
            onChordSelect={onChordSelect}
            onAddChord={onAddChord}
            onLinesChange={onLinesChange}
          />
        ))}
      </div>
    </div>
  );
}
