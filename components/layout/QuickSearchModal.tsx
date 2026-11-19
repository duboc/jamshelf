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
        className="w-full max-w-xl rounded-lg border border-[var(--line)] bg-[var(--surface)] overflow-hidden"
        style={{ boxShadow: 'var(--shadow-md)' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--line)]">
          <svg width="16" height="16" viewBox="0 0 16 16" className="text-[var(--muted)] flex-shrink-0" aria-hidden="true">
            <circle cx="7" cy="7" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="m10.8 10.8 3.2 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
            className="flex-1 bg-transparent text-sm text-[var(--ink)] placeholder-[var(--muted)] outline-none"
          />
          <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface2)] border border-[var(--line)] text-[var(--muted)]">
            ESC
          </kbd>
        </div>

        <div className="max-h-[55vh] overflow-y-auto py-1">
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
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer ${
                    active ? 'bg-[var(--nav-active-bg)]' : 'hover:bg-[var(--surface2)]'
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span
                      className={`font-display text-[10.5px] font-medium uppercase px-1.5 py-0.5 rounded ${
                        item.kind === 'setlist'
                          ? 'bg-[var(--tune-dim)] text-[var(--tune)]'
                          : 'bg-[var(--nav-active-bg)] text-[var(--accent-ink)]'
                      }`}
                    >
                      {item.kind === 'setlist' ? 'Setlist' : 'Música'}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-display font-medium text-[var(--ink)] truncate">{item.title}</div>
                      <div className="text-xs text-[var(--muted)] truncate">{item.subtitle}</div>
                    </div>
                  </div>
                  {item.meta && (
                    <span className="font-mono text-[11px] text-[var(--muted)] flex-shrink-0">
                      {item.meta}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-[var(--line-subtle)] bg-[var(--bg)] flex items-center justify-between text-[11px] font-mono text-[var(--muted)]">
          <span>↑↓ navegar · Enter abrir</span>
          <span>/ ou Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}

export function QuickSearchModal({ open, onClose }: QuickSearchModalProps) {
  if (!open) return null;
  return <QuickSearchDialog onClose={onClose} />;
}
