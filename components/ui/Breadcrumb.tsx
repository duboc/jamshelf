'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export interface BreadcrumbItem {
  label: string;
  href?: string; // omit for the current page (rendered non-clickable)
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  onBack?: () => void;
  rightSlot?: React.ReactNode;
}

export function Breadcrumb({ items, onBack, rightSlot }: BreadcrumbProps) {
  const router = useRouter();
  const parentItem = items.length >= 2 ? items[items.length - 2] : null;

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (parentItem?.href) {
      router.push(parentItem.href);
    } else {
      router.back();
    }
  };

  return (
    <nav
      aria-label="Onde você está"
      className="sticky top-0 z-20 flex-shrink-0 border-b border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur-md"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-[44px] py-1.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {parentItem && (
            <button
              type="button"
              onClick={handleBack}
              className="pill-btn px-2.5 py-1 text-xs flex-shrink-0"
              title={`Voltar para ${parentItem.label}`}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
                <path
                  d="M8.8 2.6 4.4 7l4.4 4.4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Voltar</span>
            </button>
          )}

          <ol className="flex items-center gap-1.5 text-[13px] min-w-0 overflow-hidden">
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
                    <Link
                      href={item.href}
                      className="text-[var(--muted)] hover:text-[var(--ink)] hover:underline underline-offset-2 transition-colors truncate max-w-[160px]"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span
                      aria-current={isLast ? 'page' : undefined}
                      className="text-[var(--ink)] font-semibold truncate max-w-[240px]"
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
