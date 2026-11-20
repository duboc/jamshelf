'use client';

import { useRouter } from 'next/navigation';
import { navigateWithTransition, runStateViewTransition } from '@/lib/utils/view-transition';
import { TransitionLink } from './TransitionLink';

export interface BreadcrumbItem {
  label: string;
  href?: string; // omit for the current page (rendered non-clickable)
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  onBack?: () => void;
  rightSlot?: React.ReactNode;
  vtSongId?: string;
}

export function Breadcrumb({ items, onBack, rightSlot, vtSongId }: BreadcrumbProps) {
  const router = useRouter();
  const parentItem = items.length >= 2 ? items[items.length - 2] : null;

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (parentItem?.href) {
      navigateWithTransition(router, parentItem.href, {
        songId: vtSongId,
        direction: 'back',
      });
    } else {
      runStateViewTransition(() => router.back(), 'fade');
    }
  };

  return (
    <nav
      aria-label="Onde você está"
      className="flex-shrink-0 bg-transparent"
    >
      <div className="w-full px-4 sm:px-6 lg:px-8 pt-3 pb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {parentItem && (
            <button
              type="button"
              onClick={handleBack}
              className="group gm3-icon-btn w-9 h-9 flex items-center justify-center text-[var(--ink)] bg-[var(--surface)] hover:bg-[var(--surface-high)] flex-shrink-0 cursor-pointer"
              title={`Voltar para ${parentItem.label}`}
              aria-label={`Voltar para ${parentItem.label}`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                aria-hidden="true"
                className="transition-transform group-hover:-translate-x-0.5"
              >
                <path
                  d="M13 8H3.5M7.5 3.8 3.3 8l4.2 4.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}

          <ol className="flex items-center gap-1.5 text-[13px] font-display min-w-0 overflow-hidden">
            {items.map((item, i) => {
              const isLast = i === items.length - 1;
              const hideOnTiny = items.length > 2 && i < items.length - 2;
              return (
                <li
                  key={i}
                  className={`flex items-center gap-1.5 min-w-0 ${hideOnTiny ? 'hidden sm:flex' : 'flex'}`}
                >
                  {i > 0 && (
                    <span className="text-[var(--muted)] opacity-60 flex-shrink-0" aria-hidden="true">
                      ›
                    </span>
                  )}
                  {item.href && !isLast ? (
                    <TransitionLink
                      href={item.href}
                      vtSongId={vtSongId}
                      vtDirection="back"
                      className="text-[var(--muted)] hover:text-[var(--accent-ink)] hover:underline underline-offset-2 transition-colors truncate max-w-[180px]"
                    >
                      {item.label}
                    </TransitionLink>
                  ) : (
                    <span
                      aria-current={isLast ? 'page' : undefined}
                      className="text-[var(--ink)] font-medium truncate max-w-[260px]"
                    >
                      {item.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {rightSlot && <div className="flex items-center gap-2 flex-shrink-0">{rightSlot}</div>}
      </div>
    </nav>
  );
}
