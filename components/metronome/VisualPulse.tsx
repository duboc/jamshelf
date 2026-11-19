'use client';

import { useSyncExternalStore } from 'react';
import { usePlayerStore } from '@/lib/stores/player-store';
import { useDisplayStore } from '@/lib/stores/display-store';

function subscribeReducedMotion(cb: () => void) {
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

/**
 * WCAG 2.3.1-safe visual beat indicator.
 * - Completely disabled when prefers-reduced-motion is active.
 * - Caps flash rate <= 2.5 Hz by pulsing downbeat-only above 150 BPM.
 * - Uses a slim top stage ribbon (area << 0.6% of viewport) instead of a full-screen strobe.
 */
export function VisualPulse() {
  const { beat, metronomeOn, bpm } = usePlayerStore();
  const { visualPulseEnabled } = useDisplayStore();
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );

  if (!metronomeOn || !visualPulseEnabled || reducedMotion) return null;

  // Above 150 BPM (> 2.5 Hz), pulse only on the downbeat so flash rate always stays safely below 3 Hz.
  if (bpm > 150 && beat !== 0) return null;

  const durationMs = Math.max(400, (60 / bpm) * 1000);
  const color = beat === 0 ? 'var(--accent)' : 'var(--tune)';

  return (
    <div
      key={beat}
      aria-hidden="true"
      className="fixed top-0 inset-x-0 h-1.5 z-40 pointer-events-none"
      style={{
        backgroundColor: color,
        animation: `metronome-flash ${durationMs}ms ease-out forwards`,
      }}
    />
  );
}
