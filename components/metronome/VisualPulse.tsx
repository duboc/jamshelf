'use client';

import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';

// Reads the exact same beat/metronomeOn/bpm state Metronome.tsx already owns
// and writes to — this never runs its own timer, so it can't drift from the
// audible click or the beat dots. Keying the flash by `beat` remounts it on
// every tick, restarting the fade-out animation cleanly each time.
// visualPulseEnabled is a local, per-device preference (display-store) — one
// musician can turn the flash off for themselves without affecting anyone
// else on the same live session.
export function VisualPulse() {
  const { beat, metronomeOn, bpm } = usePlayerStore();
  const { visualPulseEnabled } = useDisplayStore();
  if (!metronomeOn || !visualPulseEnabled) return null;

  const durationMs = (60 / bpm) * 1000;

  return (
    <div
      key={beat}
      aria-hidden
      className="fixed inset-0 z-40 pointer-events-none"
      style={{
        boxShadow: 'inset 0 0 120px 30px #a78bfa',
        animation: `metronome-flash ${durationMs}ms ease-in-out forwards`,
      }}
    />
  );
}
