'use client';

export type TransitionDirection = 'forward' | 'back' | 'next' | 'prev' | 'fade';

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

function tagHeroElementsForSong(songId: string | null) {
  clearTaggedElements();
  if (!songId || typeof document === 'undefined') return;
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(songId) : songId.replace(/"/g, '\\"');

  const titleCandidates = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-vt-song-title="${escaped}"]`)
  );
  const titleEl = titleCandidates.find(isElementVisibleInViewport) ?? titleCandidates[0];
  if (titleEl) {
    titleEl.style.viewTransitionName = 'song-title-hero';
    taggedElements.push(titleEl);
  }

  const keyCandidates = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-vt-song-key="${escaped}"]`)
  );
  const keyEl = keyCandidates.find(isElementVisibleInViewport) ?? keyCandidates[0];
  if (keyEl) {
    keyEl.style.viewTransitionName = 'song-key-hero';
    taggedElements.push(keyEl);
  }
}

/**
 * Called synchronously inside AppShell's useLayoutEffect when Next.js commits a new route.
 * Tags matching destination hero elements and releases the awaiting View Transition snapshot.
 */
export function commitPendingViewTransition() {
  if (!pendingResolve) return;
  const resolve = pendingResolve;
  const songId = pendingSongId;
  pendingResolve = null;
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  markSettledEntrances();
  tagHeroElementsForSong(songId);
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
  pendingSongId = opts?.songId ?? null;
  document.documentElement.dataset.vtDir = direction;
  tagHeroElementsForSong(pendingSongId);

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
            tagHeroElementsForSong(pendingSongId);
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
        delete document.documentElement.dataset.vtDir;
      });
  } catch {
    if (transitionSeq === mySeq) {
      clearTaggedElements();
      pendingSongId = null;
      delete document.documentElement.dataset.vtDir;
    }
    go();
  }
}
