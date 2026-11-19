'use client';

import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';
import { transposeChord } from '@/lib/utils/music';

interface ChordBadgeProps {
  chord: string;
  onTap: (chord: string) => void;
  size?: 'normal' | 'lg';
}

export function ChordBadge({ chord, onTap, size = 'normal' }: ChordBadgeProps) {
  const { transpose, useFlats, capo } = usePlayerStore();
  const capoDisplay = useDisplayStore((s) => s.capoDisplay);
  const shift = capoDisplay === 'shapes' ? transpose : transpose + capo;
  const displayed = transposeChord(chord, shift, useFlats);

  return (
    <button
      type="button"
      onClick={() => onTap(displayed)}
      aria-label={`Ver diagrama do acorde ${displayed}`}
      className={`inline-block font-bold transition-colors cursor-pointer font-mono ${
        size === 'lg'
          ? 'text-xl px-4 py-1.5 rounded-full bg-[var(--primary-container)] text-[var(--on-primary-container)] hover:bg-[var(--accent)] hover:text-[var(--on-accent)]'
          : 'rounded-lg text-[0.88em] px-1 py-0.5 text-[var(--accent-ink)] hover:bg-[var(--primary-container)] hover:text-[var(--on-primary-container)]'
      }`}
    >
      {displayed}
    </button>
  );
}
