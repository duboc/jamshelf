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
      type="button"
      onClick={() => onTap(displayed)}
      className={`inline-block rounded-[4px] font-bold text-[var(--accent-ink)] hover:bg-[var(--nav-active-bg)] transition-colors cursor-pointer font-mono ${
        size === 'lg' ? 'text-xl px-3 py-1.5 bg-[var(--nav-active-bg)]' : 'text-[0.86em] px-1 py-0.5'
      }`}
    >
      {displayed}
    </button>
  );
}
