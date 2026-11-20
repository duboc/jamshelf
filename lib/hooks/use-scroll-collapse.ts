'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseScrollCollapseOptions {
  /** Force expanded and disable collapsing (e.g., edit mode, calibration, focus mode, inline drawers). */
  lockedExpanded: boolean;
  /** Freeze current compact/expanded state while a floating popover is open (prevents jarring jump). */
  paused?: boolean;
  /** Reset collapse state cleanly whenever this key changes (e.g., song.id). */
  resetKey: string;
}

const COLLAPSE_SCROLL_TOP_MIN = 88;
const COLLAPSE_DOWN_DELTA = 56;
const EXPAND_UP_DELTA = 36;
const TOP_RESTORE_PX = 20;
const MIN_OVERFLOW_TO_COLLAPSE = 180;
const TRANSITION_LOCKOUT_MS = 540;

/**
 * Hysteresis-guarded scroll-direction collapse hook for GM3 Top App Bars.
 * Immune to layout-height feedback loops when collapsing/expanding above a flex-1 scroll container.
 */
export function useScrollCollapse({
  lockedExpanded,
  paused = false,
  resetKey,
}: UseScrollCollapseOptions) {
  const [compact, setCompactState] = useState(false);
  const compactRef = useRef(false);
  const lastTopRef = useRef(0);
  const accDeltaRef = useRef(0);
  const lockUntilRef = useRef(0);
  const pendingTopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockedExpandedRef = useRef(lockedExpanded);
  const pausedRef = useRef(paused);

  const clearPendingTopTimer = useCallback(() => {
    if (pendingTopTimerRef.current) {
      clearTimeout(pendingTopTimerRef.current);
      pendingTopTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearPendingTopTimer();
  }, [clearPendingTopTimer]);

  useEffect(() => {
    lockedExpandedRef.current = lockedExpanded;
  }, [lockedExpanded]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const setCompact = useCallback((next: boolean) => {
    if (compactRef.current === next) return;
    compactRef.current = next;
    accDeltaRef.current = 0;
    lockUntilRef.current = performance.now() + TRANSITION_LOCKOUT_MS;
    setCompactState(next);
  }, []);

  // Reset cleanly on song change or when forced expanded
  useEffect(() => {
    compactRef.current = false;
    lastTopRef.current = 0;
    accDeltaRef.current = 0;
    lockUntilRef.current = 0;
    const t = setTimeout(() => setCompactState(false), 0);
    return () => clearTimeout(t);
  }, [resetKey]);

  const effectiveCompact = lockedExpanded ? false : compact;
  useEffect(() => {
    if (lockedExpanded && compactRef.current) {
      compactRef.current = false;
      accDeltaRef.current = 0;
      const t = setTimeout(() => setCompactState(false), 0);
      return () => clearTimeout(t);
    }
  }, [lockedExpanded]);

  const handleScroll = useCallback(
    (scrollTop: number, maxScroll: number, isAutoScrolling = false) => {
      if (lockedExpandedRef.current || pausedRef.current) {
        lastTopRef.current = scrollTop;
        accDeltaRef.current = 0;
        return;
      }

      const now = performance.now();
      if (now < lockUntilRef.current) {
        lastTopRef.current = scrollTop;
        // If user flicks all the way back to top during the 380ms lockout, schedule an automatic restore
        // right when lockout ends so the header can never get stuck compact at scrollTop = 0.
        if (scrollTop <= TOP_RESTORE_PX && compactRef.current) {
          if (!pendingTopTimerRef.current) {
            const waitMs = Math.max(16, lockUntilRef.current - now + 12);
            pendingTopTimerRef.current = setTimeout(() => {
              pendingTopTimerRef.current = null;
              if (
                !lockedExpandedRef.current &&
                !pausedRef.current &&
                lastTopRef.current <= TOP_RESTORE_PX &&
                compactRef.current
              ) {
                setCompact(false);
              }
            }, waitMs);
          }
        } else {
          clearPendingTopTimer();
        }
        return;
      }

      clearPendingTopTimer();

      // Always restore full header near the top of the sheet
      if (scrollTop <= TOP_RESTORE_PX) {
        lastTopRef.current = scrollTop;
        accDeltaRef.current = 0;
        if (compactRef.current) setCompact(false);
        return;
      }

      const delta = scrollTop - lastTopRef.current;
      lastTopRef.current = scrollTop;
      if (Math.abs(delta) < 0.5) return;

      // Reset accumulator on direction reversal so small nudges don't misfire
      if ((delta > 0 && accDeltaRef.current < 0) || (delta < 0 && accDeltaRef.current > 0)) {
        accDeltaRef.current = delta;
      } else {
        accDeltaRef.current += delta;
      }

      if (!compactRef.current) {
        if (maxScroll < MIN_OVERFLOW_TO_COLLAPSE) return;
        if (
          (isAutoScrolling && scrollTop > 44) ||
          (scrollTop > COLLAPSE_SCROLL_TOP_MIN && accDeltaRef.current >= COLLAPSE_DOWN_DELTA)
        ) {
          setCompact(true);
        }
      } else if (accDeltaRef.current <= -EXPAND_UP_DELTA) {
        setCompact(false);
      }
    },
    [setCompact, clearPendingTopTimer]
  );

  return {
    compact: effectiveCompact,
    setCompact,
    handleScroll,
  };
}
