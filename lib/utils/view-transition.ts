'use client';

export type TransitionDirection = 'forward' | 'back' | 'next' | 'prev' | 'fade' | 'theme' | 'morph';

interface RouterLike {
  push: (href: string) => void;
  replace?: (href: string) => void;
}

type StartViewTransitionFn = (
  updateCallback: () => void | Promise<void>
) => {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
};

let pendingResolve: (() => void) | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSongId: string | null = null;
let pendingDirection: TransitionDirection | null = null;
let pendingHasSourceSurface = false;
let taggedElements: HTMLElement[] = [];
let transitionSeq = 0;

function markSettledEntrances() {
  if (typeof document === 'undefined') return;
  const nodes = document.querySelectorAll<HTMLElement>(
    '.gm3-page-enter, .gm3-sheet-block, .gm3-stagger-item'
  );
  nodes.forEach((el) => {
    el.dataset.vtSettled = 'true';
  });
}

function clearTaggedElements() {
  for (const el of taggedElements) {
    if (el && el.style) {
      el.style.viewTransitionName = '';
    }
  }
  taggedElements = [];
}

function isElementVisibleInViewport(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
}

function tagHeroElementsForSong(
  songId: string | null,
  opts?: { allowSurface?: boolean; requireVisibleSurface?: boolean }
): { hasSurface: boolean } {
  clearTaggedElements();
  if (!songId || typeof document === 'undefined') return { hasSurface: false };
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(songId) : songId.replace(/"/g, '\\"');
  let hasSurface = false;

  if (opts?.allowSurface) {
    const surfaceCandidates = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-vt-song-surface="${escaped}"]`)
    );
    const visibleSurface = surfaceCandidates.find(isElementVisibleInViewport);
    const surfaceEl = opts.requireVisibleSurface ? visibleSurface : visibleSurface ?? surfaceCandidates[0];
    if (surfaceEl) {
      surfaceEl.style.viewTransitionName = 'song-surface-hero';
      taggedElements.push(surfaceEl);
      hasSurface = true;
      // Pure GM3 Container Transform: keep title & key intact inside the expanding/collapsing surface
      // so they never double-ghost, collide with the back button, or leave holes in the key stepper pill.
      return { hasSurface: true };
    }
  }

  // Only tag title/key when they are visible (or on forward destination) so off-screen back returns never fly wildly
  const titleCandidates = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-vt-song-title="${escaped}"]`)
  );
  const visibleTitle = titleCandidates.find(isElementVisibleInViewport);
  const titleEl = opts?.requireVisibleSurface ? visibleTitle : visibleTitle ?? titleCandidates[0];
  if (titleEl) {
    titleEl.style.viewTransitionName = 'song-title-hero';
    taggedElements.push(titleEl);
  }

  const keyCandidates = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-vt-song-key="${escaped}"]`)
  );
  const visibleKey = keyCandidates.find(isElementVisibleInViewport);
  const keyEl = opts?.requireVisibleSurface ? visibleKey : visibleKey ?? keyCandidates[0];
  if (keyEl) {
    keyEl.style.viewTransitionName = 'song-key-hero';
    taggedElements.push(keyEl);
  }

  return { hasSurface };
}

/**
 * Called synchronously inside AppShell's useLayoutEffect when Next.js commits a new route.
 * Tags matching destination hero elements and releases the awaiting View Transition snapshot.
 */
export function commitPendingViewTransition() {
  if (!pendingResolve) return;
  const resolve = pendingResolve;
  const songId = pendingSongId;
  const dir = pendingDirection;
  const hadSourceSurface = pendingHasSourceSurface;
  pendingResolve = null;
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  markSettledEntrances();
  const isContainerNav = (dir === 'forward' || dir === 'back') && hadSourceSurface;
  const { hasSurface } = tagHeroElementsForSong(songId, {
    allowSurface: isContainerNav,
    requireVisibleSurface: dir === 'back',
  });
  if (isContainerNav && hasSurface) {
    document.documentElement.dataset.vtContainer = 'true';
  } else {
    delete document.documentElement.dataset.vtContainer;
  }
  resolve();
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function navigateWithTransition(
  router: RouterLike,
  href: string,
  opts?: {
    songId?: string;
    direction?: TransitionDirection;
    replace?: boolean;
  }
) {
  const go = () => {
    if (opts?.replace && router.replace) router.replace(href);
    else router.push(href);
  };

  if (typeof document === 'undefined' || prefersReducedMotion()) {
    go();
    return;
  }

  const startVT = (
    document as unknown as { startViewTransition?: StartViewTransitionFn }
  ).startViewTransition;
  if (typeof startVT !== 'function') {
    go();
    return;
  }

  // Avoid hanging if navigating to the exact current URL
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (href === currentUrl) {
    go();
    return;
  }

  // Cancel any prior unresolved transition cleanly
  if (pendingResolve) {
    pendingResolve();
    pendingResolve = null;
  }
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }

  const direction: TransitionDirection = opts?.direction ?? 'fade';
  const mySeq = ++transitionSeq;
  const allowSurface = direction === 'forward' || direction === 'back';
  pendingSongId = opts?.songId ?? null;
  pendingDirection = direction;
  document.documentElement.dataset.vtDir = direction;
  const { hasSurface } = tagHeroElementsForSong(pendingSongId, {
    allowSurface,
    requireVisibleSurface: direction === 'forward',
  });
  pendingHasSourceSurface = hasSurface;
  if (allowSurface && hasSurface) {
    document.documentElement.dataset.vtContainer = 'true';
  } else {
    delete document.documentElement.dataset.vtContainer;
  }

  try {
    const vt = startVT.call(document, () => {
      return new Promise<void>((resolve) => {
        pendingResolve = resolve;
        go();
        pendingTimer = setTimeout(() => {
          if (pendingResolve && transitionSeq === mySeq) {
            const done = pendingResolve;
            pendingResolve = null;
            pendingTimer = null;
            markSettledEntrances();
            const isContainerNav = allowSurface && pendingHasSourceSurface;
            const dest = tagHeroElementsForSong(pendingSongId, {
              allowSurface: isContainerNav,
              requireVisibleSurface: direction === 'back',
            });
            if (isContainerNav && dest.hasSurface) {
              document.documentElement.dataset.vtContainer = 'true';
            } else {
              delete document.documentElement.dataset.vtContainer;
            }
            done();
          }
        }, 420);
      });
    });

    vt.finished
      .catch(() => {
        // Ignore aborted transitions when user clicks rapidly
      })
      .finally(() => {
        if (transitionSeq !== mySeq) return;
        clearTaggedElements();
        pendingSongId = null;
        pendingDirection = null;
        pendingHasSourceSurface = false;
        delete document.documentElement.dataset.vtDir;
        delete document.documentElement.dataset.vtContainer;
      });
  } catch {
    if (transitionSeq === mySeq) {
      clearTaggedElements();
      pendingSongId = null;
      pendingDirection = null;
      pendingHasSourceSurface = false;
      delete document.documentElement.dataset.vtDir;
      delete document.documentElement.dataset.vtContainer;
    }
    go();
  }
}

/**
 * Wraps an in-page React state transition (e.g. Focus Mode, Edit Mode, reading mode,
 * 1/2 columns, Cards/Lista, Add Song preview) in a calm native View Transition crossfade.
 * Falls back immediately to `updateFn()` under reduced motion, SSR, unsupported browsers,
 * or while a route navigation transition is already in flight.
 */
export function runStateViewTransition(
  updateFn: () => void,
  direction: 'morph' | 'fade' | 'theme' = 'morph'
) {
  if (typeof document === 'undefined' || prefersReducedMotion() || pendingResolve !== null) {
    updateFn();
    return;
  }

  const startVT = (
    document as unknown as { startViewTransition?: StartViewTransitionFn }
  ).startViewTransition;
  if (typeof startVT !== 'function') {
    updateFn();
    return;
  }

  const mySeq = ++transitionSeq;
  document.documentElement.dataset.vtDir = direction;

  try {
    const vt = startVT.call(document, () => {
      updateFn();
      // Never wait on rAF inside startViewTransition (Chromium pauses rAF while callback is pending).
      // A short macrotask lets React 19 commit its render before the new snapshot is captured.
      return new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });
    });

    vt.finished
      .catch(() => {
        // Ignore rapid re-toggles cleanly
      })
      .finally(() => {
        if (transitionSeq !== mySeq) return;
        delete document.documentElement.dataset.vtDir;
      });
  } catch {
    if (transitionSeq === mySeq) {
      delete document.documentElement.dataset.vtDir;
    }
    updateFn();
  }
}
