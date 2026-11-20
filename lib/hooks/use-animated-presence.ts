'use client';

import { useEffect, useState } from 'react';

/**
 * Keeps overlays (modals, popovers, drawers, sheets) mounted during their CSS exit
 * animation after `open` flips to `false`, then unmounts cleanly.
 * Under `prefers-reduced-motion: reduce`, unmounts immediately (0ms delay).
 */
export function useAnimatedPresence(open: boolean, exitMs = 220) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [closing, setClosing] = useState(false);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setClosing(false);
    } else {
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setClosing(!reduced && exitMs > 0);
    }
  }

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => setClosing(false), exitMs);
    return () => clearTimeout(timer);
  }, [closing, exitMs]);

  return {
    mounted: open || closing,
    closing: !open && closing,
  };
}

/**
 * Retains the most recent non-null value so data-driven overlays (e.g. ChordPanel,
 * CountInOverlay, EditChordOverlay) keep rendering their content during exit glides.
 * Pass a primitive `compareKey` whenever `value` is a freshly constructed object.
 */
export function useRetainedValue<T>(
  value: T | null,
  compareKey?: string | number | null
): T | null {
  const [state, setState] = useState<{ val: T | null; key: string | number | null }>({
    val: value,
    key: compareKey ?? null,
  });

  if (value !== null) {
    const changed =
      compareKey !== undefined ? compareKey !== state.key : value !== state.val;
    if (changed) {
      setState({ val: value, key: compareKey ?? null });
    }
  }

  return value ?? state.val;
}
