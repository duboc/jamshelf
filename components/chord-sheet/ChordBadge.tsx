'use client';

import { usePlayerStore } from '@/lib/stores/player-store';
import { transposeChord } from '@/lib/utils/music';

interface ChordBadgeProps {
  chord: string;
  onTap: (chord: string) => void;
}

export function ChordBadge({ chord, onTap }: ChordBadgeProps) {
  const { transpose, useFlats } = usePlayerStore();
  const displayed = transposeChord(chord, transpose, useFlats);

  return (
    <button
      onClick={() => onTap(displayed)}
      className="inline-block rounded px-1 py-0.5 text-[0.85em] font-bold text-violet-400 hover:bg-violet-500/20 transition-colors cursor-pointer font-mono"
    >
      {displayed}
    </button>
  );
}
