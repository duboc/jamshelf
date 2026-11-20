'use client';

import type { ReactNode } from 'react';

function buildCookiePath(lobes: number, rMid: number, amp: number, size: number): string {
  const steps = 64;
  const cx = size / 2;
  const cy = size / 2;
  let d = '';
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = rMid + amp * Math.cos(lobes * t);
    const x = (cx + r * Math.cos(t)).toFixed(2);
    const y = (cy + r * Math.sin(t)).toFixed(2);
    d += `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }
  return `${d}Z`;
}

// Symmetric 8-scallop GM3 Expressive Cookie silhouette (reserved for at most 1 focal element per screen)
const COOKIE_8_PATH = buildCookiePath(8, 17.6, 1.65, 40);

interface Gm3FocalBadgeProps {
  children: ReactNode;
  tone?: 'primary' | 'minor';
  size?: 'sm' | 'md';
  vtSongKey?: string;
  title?: string;
  className?: string;
}

export function Gm3FocalBadge({
  children,
  tone = 'primary',
  size = 'md',
  vtSongKey,
  title,
  className = '',
}: Gm3FocalBadgeProps) {
  const fillVar = tone === 'minor' ? 'var(--minor-container)' : 'var(--primary-container)';
  const textVar = tone === 'minor' ? 'var(--on-minor-container)' : 'var(--on-primary-container)';
  const boxCls = size === 'sm' ? 'w-9 h-9 text-xs' : 'w-11 h-11 text-[16px]';

  return (
    <span
      data-gm3-focal="true"
      data-vt-song-key={vtSongKey}
      title={title}
      className={`gm3-focal-badge relative inline-flex items-center justify-center flex-shrink-0 ${boxCls} ${className}`}
    >
      <svg viewBox="0 0 40 40" className="w-full h-full block" aria-hidden="true">
        <path
          d={COOKIE_8_PATH}
          className="gm3-focal-cookie-path"
          style={{ fill: fillVar }}
        />
      </svg>
      <span
        className="absolute inset-0 inline-flex items-center justify-center font-expressive font-semibold leading-none tabular-nums px-1"
        style={{ color: textVar }}
      >
        {children}
      </span>
    </span>
  );
}
