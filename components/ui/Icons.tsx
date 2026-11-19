'use client';

import type { SVGProps } from 'react';

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

const baseProps = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.85,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
});

/** Subtle custom Jamshelf mark (rounded guitar pick + eighth-note bar). */
export function JamshelfMark({ size = 24, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}>
      <rect x="2" y="2" width="20" height="20" rx="7" fill="var(--primary-container)" />
      <path
        d="M14.5 6.8v7.6a2.4 2.4 0 1 1-1.6-2.25V8.3l4.2-1.1v1.9l-2.6.7"
        fill="none"
        stroke="var(--on-primary-container)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlayIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}>
      <path d="M7.5 5.6 19 12 7.5 18.4V5.6Z" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function PauseIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}>
      <rect x="6.5" y="5" width="3.8" height="14" rx="1.4" fill="currentColor" />
      <rect x="13.7" y="5" width="3.8" height="14" rx="1.4" fill="currentColor" />
    </svg>
  );
}

export function HeartIcon({ size = 18, filled = false, ...rest }: IconProps & { filled?: boolean }) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path
        d="M12 20.4s-7.2-4.4-7.2-9.6A4.1 4.1 0 0 1 12 7.9a4.1 4.1 0 0 1 7.2 2.9c0 5.2-7.2 9.6-7.2 9.6Z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  );
}

export function StarIcon({ size = 16, filled = false, ...rest }: IconProps & { filled?: boolean }) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path
        d="m12 3.8 2.55 5.16 5.7.83-4.12 4.02.97 5.68L12 16.8l-5.1 2.69.97-5.68-4.12-4.02 5.7-.83L12 3.8Z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  );
}

export function EditIcon({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M15.8 4.8 19.2 8.2 9 18.4 4.5 19.5 5.6 15 15.8 4.8Z" />
      <path d="m13.6 7 3.4 3.4" />
    </svg>
  );
}

export function PitchWaveIcon({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <line className="gm3-wave-bar" x1="4" y1="10" x2="4" y2="14" />
      <line className="gm3-wave-bar" x1="8" y1="7.5" x2="8" y2="16.5" />
      <line className="gm3-wave-bar" x1="12" y1="5" x2="12" y2="19" />
      <line className="gm3-wave-bar" x1="16" y1="7.5" x2="16" y2="16.5" />
      <line className="gm3-wave-bar" x1="20" y1="10" x2="20" y2="14" />
    </svg>
  );
}

export function HeadphonesIcon({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M4 13a8 8 0 0 1 16 0" />
      <rect x="3.5" y="13" width="3.5" height="6" rx="1.5" />
      <rect x="17" y="13" width="3.5" height="6" rx="1.5" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="m14.5 6-6 6 6 6" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="m9.5 6 6 6-6 6" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ChevronUpIcon({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}

export function ArrowUpIcon({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" />
    </svg>
  );
}

export function ArrowDownIcon({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M12 5v14M6.5 13.5 12 19l5.5-5.5" />
    </svg>
  );
}

export function CloseIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function PlusIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CheckIcon({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="m5 12.5 4.5 4.5 9.5-10" />
    </svg>
  );
}

export function UndoIcon({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M9 7H4.5v4.5" />
      <path d="M5 11.5A7.5 7.5 0 1 1 7.5 18.5" />
    </svg>
  );
}

export function RedoIcon({ size = 15, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M15 7h4.5v4.5" />
      <path d="M19 11.5a7.5 7.5 0 1 0-2.5 7" />
    </svg>
  );
}

export function GripIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}>
      <circle cx="9" cy="6.5" r="1.5" fill="currentColor" />
      <circle cx="15" cy="6.5" r="1.5" fill="currentColor" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      <circle cx="9" cy="17.5" r="1.5" fill="currentColor" />
      <circle cx="15" cy="17.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function MoreVertIcon({ size = 18, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}>
      <circle cx="12" cy="5.5" r="1.7" fill="currentColor" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
      <circle cx="12" cy="18.5" r="1.7" fill="currentColor" />
    </svg>
  );
}

export function SunIcon({ size = 17, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2.2M12 19v2.2M4.8 4.8l1.6 1.6M17.6 17.6l1.6 1.6M2.8 12H5M19 12h2.2M4.8 19.2l1.6-1.6M17.6 6.4l1.6-1.6" />
    </svg>
  );
}

export function MoonIcon({ size = 17, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M20 14.5A7.8 7.8 0 0 1 9.5 4a7.8 7.8 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

export function MenuListIcon({ size = 17, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M4 7h16M4 12h16M4 17h11" />
    </svg>
  );
}

export function VolumeIcon({ size = 16, muted = false, ...rest }: IconProps & { muted?: boolean }) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M11 5.5 6.8 9H4v6h2.8L11 18.5v-13Z" />
      {muted ? (
        <path d="m16 9.5 5 5m0-5-5 5" />
      ) : (
        <path d="M15.5 8.8a4.5 4.5 0 0 1 0 6.4M18.3 6.3a8 8 0 0 1 0 11.4" />
      )}
    </svg>
  );
}

export function SlidersIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="2.2" fill="var(--surface)" />
      <circle cx="15" cy="17" r="2.2" fill="var(--surface)" />
    </svg>
  );
}

export function ColumnsIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <rect x="3.5" y="4.5" width="7" height="15" rx="1.8" />
      <rect x="13.5" y="4.5" width="7" height="15" rx="1.8" />
    </svg>
  );
}

export function HelpCircleIcon({ size = 17, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.6-2.4 2-2.4 3.4" />
      <circle cx="12" cy="16.9" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MusicNoteIcon({ size = 18, ...rest }: IconProps) {
  return (
    <svg {...baseProps(size)} {...rest}>
      <path d="M12 4v11.2a3.3 3.3 0 1 1-2-3V6.8l7-1.8v2.4l-5 1.3" />
    </svg>
  );
}
