import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';

export type TransitionKind =
  | 'none'
  | 'forward'
  | 'backward'
  | 'top-level'
  | 'lateral-next'
  | 'lateral-prev';

export interface RouteLocation {
  pathname: string;
  search: string;
  params: URLSearchParams;
  transition: TransitionKind;
  transitionKey: string;
}

function routeDepth(pathname: string): number {
  if (pathname === '/') return 0;
  if (pathname === '/add-song' || pathname.startsWith('/setlists/')) return 1;
  if (pathname.startsWith('/song/')) return 2;
  if (pathname === '/slides') return 3;
  return 1;
}

function getTransitionKey(pathname: string): string {
  return pathname || '/';
}

function inferTransition(
  prev: RouteLocation,
  nextPath: string,
  nextSearch: string,
  explicit?: TransitionKind
): TransitionKind {
  if (explicit) return explicit;
  if (prev.pathname === nextPath) {
    if (nextPath === '/' && prev.search !== nextSearch) return 'top-level';
    return 'none';
  }
  const delta = routeDepth(nextPath) - routeDepth(prev.pathname);
  if (delta > 0) return 'forward';
  if (delta < 0) return 'backward';
  return 'forward';
}

function readLocation(transition: TransitionKind = 'none'): RouteLocation {
  const pathname = window.location.pathname || '/';
  const search = window.location.search || '';
  return {
    pathname,
    search,
    params: new URLSearchParams(search),
    transition,
    transitionKey: getTransitionKey(pathname),
  };
}

let currentLocation: RouteLocation = readLocation('none');
const listeners = new Set<() => void>();

export function navigate(
  to: string,
  options?: { replace?: boolean; direction?: TransitionKind }
) {
  const url = new URL(to, window.location.origin);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const transition = inferTransition(
    currentLocation,
    url.pathname,
    url.search,
    options?.direction
  );
  if (options?.replace) {
    window.history.replaceState({}, '', next);
  } else {
    window.history.pushState({}, '', next);
  }
  const prevPath = currentLocation.pathname;
  currentLocation = readLocation(transition);
  listeners.forEach((fn) => fn());
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (prevPath !== url.pathname) {
    window.requestAnimationFrame(() => {
      document.getElementById('main')?.focus({ preventScroll: true });
    });
  }
}

export function useRoute(): RouteLocation {
  const [loc, setLoc] = useState<RouteLocation>(() => currentLocation);

  useEffect(() => {
    const sync = () => setLoc(currentLocation);
    const onPop = () => {
      const nextPath = window.location.pathname || '/';
      const nextSearch = window.location.search || '';
      const inferred: TransitionKind =
        currentLocation.pathname === nextPath
          ? nextPath === '/' && currentLocation.search !== nextSearch
            ? 'top-level'
            : 'none'
          : routeDepth(nextPath) <= routeDepth(currentLocation.pathname)
            ? 'backward'
            : 'forward';
      currentLocation = readLocation(inferred);
      setLoc(currentLocation);
    };
    listeners.add(sync);
    window.addEventListener('popstate', onPop);
    return () => {
      listeners.delete(sync);
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  return loc;
}

export function AuroraLink({
  href,
  direction,
  onClick,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  direction?: TransitionKind;
}) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      rest.target === '_blank'
    ) {
      return;
    }
    e.preventDefault();
    navigate(href, direction ? { direction } : undefined);
  };

  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
