'use client';

import { useRef, useEffect } from 'react';
import type { Song } from '@/lib/types/song';
import { usePlayerStore } from '@/lib/stores/player-store';
import { SectionBlock } from './SectionBlock';

interface ChordSheetProps {
  song: Song;
  onChordTap: (chord: string) => void;
  // Edit mode props
  editMode?: boolean;
  selectedCoord?: { sectionIdx: number; lineIdx: number; segIdx: number } | null;
  onChordSelect?: (sectionIdx: number, lineIdx: number, segIdx: number) => void;
  onAddChord?: (sectionIdx: number, lineIdx: number, charPos: number) => void;
  // Live-session sync props
  onScrollTopChange?: (scrollTop: number) => void;
  syncCorrection?: { scrollTop: number; nonce: number };
}

export function ChordSheet({
  song,
  onChordTap,
  editMode = false,
  selectedCoord = null,
  onChordSelect,
  onAddChord,
  onScrollTopChange,
  syncCorrection,
}: ChordSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { fontSize, isAutoScrolling, autoScrollSpeed } = usePlayerStore();

  const speedRef = useRef(autoScrollSpeed);
  useEffect(() => { speedRef.current = autoScrollSpeed; }, [autoScrollSpeed]);

  useEffect(() => {
    if (!isAutoScrolling) return;
    let frameId: number;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      const el = scrollRef.current;
      // Speed value maps to pixels per second:
      // 0.1 = 2px/s, 0.3 = 6px/s (slow), 0.7 = 14px/s (med), 1.5 = 30px/s (fast)
      if (el) el.scrollTop += speedRef.current * 20 * (dt / 1000);
      frameId = requestAnimationFrame(step);
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [isAutoScrolling]);

  // Report scroll position for a live-session leader to broadcast.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onScrollTopChange) return;
    const handler = () => onScrollTopChange(el.scrollTop);
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [onScrollTopChange]);

  // Snap to the latest synced position when following a live session leader.
  useEffect(() => {
    if (!syncCorrection) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = syncCorrection.scrollTop;
    // Only re-run when a new correction arrives (nonce), not on every scrollTop read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncCorrection?.nonce]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-4"
      style={{ fontSize: `${fontSize}%` }}
    >
      <div className="max-w-3xl mx-auto font-mono">
        {song.sections.map((section, i) => (
          <SectionBlock
            key={i}
            section={section}
            sectionIdx={i}
            onChordTap={onChordTap}
            editMode={editMode}
            selectedCoord={selectedCoord}
            onChordSelect={onChordSelect}
            onAddChord={onAddChord}
          />
        ))}
      </div>
    </div>
  );
}
