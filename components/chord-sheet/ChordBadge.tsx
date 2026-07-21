'use client';

import { usePlayerStore } from '@/lib/stores/player-store';
import { transposeChord } from '@/lib/utils/music';

interface ChordBadgeProps {
  chord: string;
  onTap: (chord: string) => void;
  size?: 'normal' | 'lg';
}

export function ChordBadge({ chord, onTap, size = 'normal' }: ChordBadgeProps) {
  const { transpose, useFlats, capo } = usePlayerStore();
  const displayed = transposeChord(chord, transpose + capo, useFlats);

  return (
    <button
      onClick={() => onTap(displayed)}
      className={`inline-block rounded font-bold text-violet-400 hover:bg-violet-500/20 transition-colors cursor-pointer font-mono ${
        size === 'lg' ? 'text-xl px-3 py-1.5' : 'text-[0.85em] px-1 py-0.5'
      }`}
    >
      {displayed}
    </button>
  );
}
