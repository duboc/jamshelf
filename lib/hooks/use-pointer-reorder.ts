'use client';

import { useState } from 'react';

const EDGE_SCROLL_ZONE_PX = 48;
const EDGE_SCROLL_STEP_PX = 10;

export interface ReorderDrag {
  /** Display index where the drag started. */
  from: number;
  /** Display index currently under the pointer. */
  to: number;
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

interface UsePointerReorderOptions {
  /** Called once, on release, with the display indices of the completed move. */
  onReorder: (from: number, to: number) => void;
  /**
   * Scrollable list container, for edge auto-scroll while dragging.
   * Omit when the list scrolls with the document — the window scrolls instead.
   */
  listRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Drag-to-reorder driven by pointer events, so it works on touch screens
 * where HTML5 drag-and-drop silently does nothing.
 *
 * Usage: give every row `data-display-idx={idx}`, spread
 * `getHandleProps(idx)` onto its drag handle (which needs `touch-none`),
 * and render the in-flight order with
 * `drag ? moveItem(items, drag.from, drag.to) : items`. The store is only
 * written once, on release.
 */
export function usePointerReorder({ onReorder, listRef }: UsePointerReorderOptions) {
  const [drag, setDrag] = useState<ReorderDrag | null>(null);

  const handlePointerDown = (e: React.PointerEvent, displayIdx: number) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from: displayIdx, to: displayIdx });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const list = listRef?.current;
    if (list) {
      const rect = list.getBoundingClientRect();
      if (e.clientY < rect.top + EDGE_SCROLL_ZONE_PX) list.scrollBy(0, -EDGE_SCROLL_STEP_PX);
      else if (e.clientY > rect.bottom - EDGE_SCROLL_ZONE_PX) list.scrollBy(0, EDGE_SCROLL_STEP_PX);
    } else {
      if (e.clientY < EDGE_SCROLL_ZONE_PX) window.scrollBy(0, -EDGE_SCROLL_STEP_PX);
      else if (e.clientY > window.innerHeight - EDGE_SCROLL_ZONE_PX) window.scrollBy(0, EDGE_SCROLL_STEP_PX);
    }
    // Pointer capture keeps events on the handle, so hit-test manually.
    const row = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest('[data-display-idx]') as HTMLElement | null;
    if (!row) return;
    const overIdx = Number(row.dataset.displayIdx);
    if (!Number.isNaN(overIdx) && overIdx !== drag.to) {
      setDrag({ from: drag.from, to: overIdx });
    }
  };

  const handlePointerEnd = () => {
    if (!drag) return;
    if (drag.from !== drag.to) onReorder(drag.from, drag.to);
    setDrag(null);
  };

  const getHandleProps = (displayIdx: number) => ({
    onPointerDown: (e: React.PointerEvent) => handlePointerDown(e, displayIdx),
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerEnd,
    onPointerCancel: handlePointerEnd,
  });

  return { drag, getHandleProps };
}
