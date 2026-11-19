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
      className={`inline-block font-bold text-[var(--accent-ink)] hover:bg-[var(--primary-container)] transition-colors cursor-pointer font-mono ${
        size === 'lg'
          ? 'text-xl px-4 py-1.5 rounded-full bg-[var(--primary-container)] text-[var(--on-primary-container)]'
          : 'rounded-lg text-[0.88em] px-1.5 py-0.5'
      }`}
    >
      {displayed}
    </button>
  );
}
