'use client';

import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';

export function VisualPulse() {
  const { beat, metronomeOn, bpm } = usePlayerStore();
  const { visualPulseEnabled } = useDisplayStore();
  if (!metronomeOn || !visualPulseEnabled) return null;

  const durationMs = (60 / bpm) * 1000;
  const color = beat === 0 ? 'var(--accent)' : 'var(--tune)';

  return (
    <div
      key={beat}
      aria-hidden
      className="fixed inset-0 z-40 pointer-events-none"
      style={{
        boxShadow: `inset 0 0 110px 24px ${color}`,
        animation: `metronome-flash ${durationMs}ms ease-in-out forwards`,
      }}
    />
  );
}
