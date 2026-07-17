'use client';

import Link from 'next/link';

export interface BreadcrumbItem {
  label: string;
  href?: string; // omit for the current page (rendered non-clickable)
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs min-w-0">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5 min-w-0">
          {i > 0 && <span className="text-zinc-700">/</span>}
          {item.href ? (
            <Link
              href={item.href}
              className="text-zinc-500 hover:text-violet-400 transition-colors truncate max-w-[160px]"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-zinc-300 font-medium truncate max-w-[220px]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
