'use client';

import { usePlayerStore } from '@/lib/stores/player-store';

// Reads the exact same beat/metronomeOn/bpm state Metronome.tsx already owns
// and writes to — this never runs its own timer, so it can't drift from the
// audible click or the beat dots. Keying the flash by `beat` remounts it on
// every tick, restarting the fade-out animation cleanly each time.
export function VisualPulse() {
  const { beat, metronomeOn, bpm } = usePlayerStore();
  if (!metronomeOn) return null;

  const durationMs = (60 / bpm) * 1000;

  return (
    <div
      key={beat}
      aria-hidden
      className="fixed inset-0 z-40 pointer-events-none"
      style={{
        boxShadow: 'inset 0 0 0 16px #a78bfa',
        animation: `metronome-flash ${durationMs}ms ease-out forwards`,
      }}
    />
  );
}
