'use client';

import Link, { type LinkProps } from 'next/link';
import { useRouter } from 'next/navigation';
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
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
  vtSongId,
  vtDirection = 'fade',
  target,
  ...rest
}: TransitionLinkProps) {
  const router = useRouter();

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

  return <Link href={href} target={target} onClick={handleClick} {...rest} />;
}
