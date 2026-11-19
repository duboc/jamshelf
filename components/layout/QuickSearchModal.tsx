'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';

interface QuickSearchModalProps {
  open: boolean;
  onClose: () => void;
}

type SearchResult =
  | { kind: 'song'; id: string; title: string; subtitle: string; meta: string; href: string }
  | { kind: 'setlist'; id: string; title: string; subtitle: string; meta: string; href: string };

function QuickSearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const entries = useSongStore((s) => s.entries);
  const getSongs = useSongStore((s) => s.getSongs);
  const setlists = useSetlistStore((s) => s.setlists);

  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const songs = useMemo(() => {
    void entries;
    return getSongs();
  }, [entries, getSongs]);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    const matchedSetlists: SearchResult[] = setlists
      .filter((sl) => !q || sl.name.toLowerCase().includes(q))
      .slice(0, q ? 4 : 3)
      .map((sl) => ({
        kind: 'setlist',
        id: sl.id,
        title: sl.name,
        subtitle: 'Setlist',
        meta: `${sl.songIds.length} ${sl.songIds.length === 1 ? 'música' : 'músicas'}`,
        href: `/setlists/${sl.id}`,
      }));

    const matchedSongs: SearchResult[] = songs
      .filter(
        (s) =>
          !q ||
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.displayKey.toLowerCase().includes(q)
      )
      .slice(0, q ? 12 : 8)
      .map((s) => ({
        kind: 'song',
        id: s.id,
        title: s.title,
        subtitle: s.artist || 'Artista desconhecido',
        meta: [s.displayKey, `${s.tempo} BPM`].filter(Boolean).join(' · '),
        href: `/song/${s.id}`,
      }));

    return [...matchedSongs, ...matchedSetlists];
  }, [query, songs, setlists]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const clampedIdx = results.length ? Math.min(activeIdx, results.length - 1) : 0;

  const selectItem = (item: SearchResult) => {
    onClose();
    router.push(item.href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter' && results[clampedIdx]) {
      e.preventDefault();
      selectItem(results[clampedIdx]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/45 flex items-start justify-center pt-[10vh] px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Busca rápida"
        className="w-full max-w-xl rounded-[28px] bg-[var(--surface)] overflow-hidden"
        style={{ boxShadow: 'var(--shadow-md)' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--line-subtle)]/40">
          <svg width="18" height="18" viewBox="0 0 24 24" className="text-[var(--muted)] flex-shrink-0" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
            <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            placeholder="Pesquisar músicas, artistas, tons e setlists..."
            className="flex-1 bg-transparent text-[15px] text-[var(--ink)] placeholder-[var(--muted)] outline-none"
          />
          <kbd className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-[var(--bg)] text-[var(--muted)]">
            Esc
          </kbd>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2 space-y-0.5">
          {results.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--muted)]">
              Nada encontrado para &ldquo;{query}&rdquo;.
            </div>
          ) : (
            results.map((item, idx) => {
              const active = idx === clampedIdx;
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => selectItem(item)}
                  className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-colors cursor-pointer ${
                    active ? 'bg-[var(--secondary-container)]/75' : 'hover:bg-[var(--surface-high)]'
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <span
                      className={`text-xs font-medium px-2.5 py-0.5 rounded-full flex-shrink-0 ${
                        item.kind === 'setlist'
                          ? 'bg-[var(--tune-dim)] text-[var(--tune)]'
                          : 'bg-[var(--primary-container)] text-[var(--on-primary-container)]'
                      }`}
                    >
                      {item.kind === 'setlist' ? 'Setlist' : 'Música'}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-display font-medium text-[var(--ink)] truncate">{item.title}</div>
                      <div className="text-xs text-[var(--muted)] truncate">{item.subtitle}</div>
                    </div>
                  </div>
                  {item.meta && (
                    <span className="font-mono text-xs text-[var(--muted)] flex-shrink-0">
                      {item.meta}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="px-5 py-2.5 bg-[var(--bg)] flex items-center justify-between text-xs text-[var(--muted)]">
          <span>↑↓ navegar · Enter abrir</span>
          <span className="font-mono">/ ou Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}

export function QuickSearchModal({ open, onClose }: QuickSearchModalProps) {
  if (!open) return null;
  return <QuickSearchDialog onClose={onClose} />;
}
