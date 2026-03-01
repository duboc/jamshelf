'use client';

import { useRef, useEffect } from 'react';
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

  // Use a ref for speed so the animation loop always reads the latest value
  // without needing to restart the loop when speed changes
  const speedRef = useRef(autoScrollSpeed);
  useEffect(() => { speedRef.current = autoScrollSpeed; }, [autoScrollSpeed]);

  useEffect(() => {
    if (!isAutoScrolling) return;
    let frameId: number;
    const step = () => {
      const el = scrollRef.current;
      if (el) el.scrollTop += speedRef.current * 0.5;
      frameId = requestAnimationFrame(step);
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [isAutoScrolling]);

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
