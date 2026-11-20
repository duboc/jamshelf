'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

interface ConnectedGroupProps {
  /** Current active value (updates indicator clip-path directly on DOM with zero extra React re-renders). */
  value: string | number;
  ariaLabel: string;
  subtle?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * GM3 Expressive Connected Button Group with a GPU-composited sliding pill indicator
 * (`clip-path: inset(... round 20px)` on the Expressive Fast spring curve).
 * Uses direct DOM style updates and untransformed `offsetLeft`/`offsetWidth`
 * for zero React re-render overhead and exact geometry even inside scaled popovers.
 */
export function ConnectedGroup({
  value,
  ariaLabel,
  subtle = false,
  className = '',
  children,
}: ConnectedGroupProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  const syncIndicator = useCallback(() => {
    const grp = groupRef.current;
    const ind = indicatorRef.current;
    if (!grp || !ind) return;
    const active = grp.querySelector<HTMLElement>('[aria-pressed="true"]');
    const totalW = grp.clientWidth;
    if (!active || totalW <= 0) {
      delete grp.dataset.sliding;
      ind.style.clipPath = '';
      return;
    }
    const left = Math.max(0, active.offsetLeft);
    const right = Math.max(0, totalW - (active.offsetLeft + active.offsetWidth));
    ind.style.clipPath = `inset(0px ${right.toFixed(1)}px 0px ${left.toFixed(1)}px round 20px)`;
    grp.dataset.sliding = 'true';
  }, []);

  useLayoutEffect(() => {
    syncIndicator();
    const raf = requestAnimationFrame(() => {
      syncIndicator();
      if (indicatorRef.current) {
        indicatorRef.current.dataset.ready = 'true';
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [value, syncIndicator]);

  useEffect(() => {
    const grp = groupRef.current;
    if (!grp || typeof ResizeObserver === 'undefined') return;
    let rafId = 0;
    const ro = new ResizeObserver(() => {
      const ind = indicatorRef.current;
      // Snap geometry silently on layout resize / header collapse without triggering spring wobble
      if (ind) delete ind.dataset.ready;
      syncIndicator();
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (indicatorRef.current) indicatorRef.current.dataset.ready = 'true';
      });
    });
    ro.observe(grp);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [syncIndicator]);

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label={ariaLabel}
      className={`gm3-connected-group ${subtle ? 'gm3-connected-group-subtle' : ''} ${className}`}
    >
      <span ref={indicatorRef} aria-hidden="true" className="gm3-connected-indicator" />
      {children}
    </div>
  );
}
