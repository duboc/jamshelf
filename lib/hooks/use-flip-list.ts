'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * Lightweight GPU FLIP list animation for smooth reordering (drag-and-drop & keyboard ↑↓).
 * Tag each list row with `data-flip-key={id}` inside the container pointed to by `containerRef`.
 * Automatically no-ops under `prefers-reduced-motion: reduce`.
 */
export function useFlipList(
  containerRef: React.RefObject<HTMLElement | null>,
  orderKey: string,
  durationMs = 340
) {
  const prevRectsRef = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-flip-key]'));
    const nextRects = new Map<string, number>();
    for (const node of nodes) {
      const key = node.dataset.flipKey;
      if (key) nextRects.set(key, node.getBoundingClientRect().top);
    }

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!reduced && prevRectsRef.current.size > 0) {
      const animated: HTMLElement[] = [];

      for (const node of nodes) {
        const key = node.dataset.flipKey;
        if (!key || node.dataset.dragging === 'true') continue;
        const prevTop = prevRectsRef.current.get(key);
        const nextTop = nextRects.get(key);
        if (prevTop === undefined || nextTop === undefined) continue;
        const dy = prevTop - nextTop;
        if (Math.abs(dy) < 1) continue;

        node.style.transition = 'none';
        node.style.transform = `translate3d(0, ${dy}px, 0)`;
        animated.push(node);
      }

      if (animated.length > 0) {
        // Force a single layout flush before releasing to target positions
        void container.offsetHeight;
        for (const node of animated) {
          node.style.transition = `transform ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
          node.style.transform = 'translate3d(0, 0, 0)';
        }
        const timer = setTimeout(() => {
          for (const node of animated) {
            node.style.transition = '';
            node.style.transform = '';
          }
        }, durationMs + 40);
        prevRectsRef.current = nextRects;
        return () => clearTimeout(timer);
      }
    }

    prevRectsRef.current = nextRects;
  }, [containerRef, orderKey, durationMs]);
}
