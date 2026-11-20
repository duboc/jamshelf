'use client';

import Link, { type LinkProps } from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, type AnchorHTMLAttributes, type FocusEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import {
  navigateWithTransition,
  type TransitionDirection,
} from '@/lib/utils/view-transition';

export interface TransitionLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>,
    LinkProps {
  children: ReactNode;
  vtSongId?: string;
  vtDirection?: TransitionDirection;
}

export function TransitionLink({
  href,
  onClick,
  onPointerEnter,
  onFocus,
  vtSongId,
  vtDirection = 'fade',
  target,
  ...rest
}: TransitionLinkProps) {
  const router = useRouter();
  const prefetchedRef = useRef(false);

  const warmRoute = (el: HTMLAnchorElement) => {
    if (prefetchedRef.current) return;
    const url = typeof href === 'string' ? href : href.pathname || '';
    if (!url || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('#')) {
      return;
    }
    prefetchedRef.current = true;
    el.dataset.vtPrefetched = 'true';
    router.prefetch(url);
  };

  const handlePointerEnter = (e: PointerEvent<HTMLAnchorElement>) => {
    onPointerEnter?.(e);
    warmRoute(e.currentTarget);
  };

  const handleFocus = (e: FocusEvent<HTMLAnchorElement>) => {
    onFocus?.(e);
    warmRoute(e.currentTarget);
  };

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      (target && target !== '_self')
    ) {
      return;
    }

    const url = typeof href === 'string' ? href : href.pathname || '';
    if (!url || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('#')) {
      return;
    }

    e.preventDefault();
    navigateWithTransition(router, url, {
      songId: vtSongId,
      direction: vtDirection,
    });
  };

  return (
    <Link
      href={href}
      target={target}
      onPointerEnter={handlePointerEnter}
      onFocus={handleFocus}
      onClick={handleClick}
      {...rest}
    />
  );
}
