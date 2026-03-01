'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { Song } from '@/lib/types/song';
import { usePlayerStore } from '@/lib/stores/player-store';
import { SectionBlock } from './SectionBlock';

interface ChordSheetProps {
  song: Song;
  onChordTap: (chord: string) => void;
}

export function ChordSheet({ song, onChordTap }: ChordSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const { fontSize, isAutoScrolling, autoScrollSpeed } = usePlayerStore();

  const doScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop += autoScrollSpeed * 0.5;
    animRef.current = requestAnimationFrame(doScroll);
  }, [autoScrollSpeed]);

  useEffect(() => {
    if (isAutoScrolling) {
      animRef.current = requestAnimationFrame(doScroll);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isAutoScrolling, doScroll]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-4"
      style={{ fontSize: `${fontSize}%` }}
    >
      <div className="max-w-3xl mx-auto font-mono">
        {song.sections.map((section, i) => (
          <SectionBlock key={i} section={section} onChordTap={onChordTap} />
        ))}
      </div>
    </div>
  );
}
