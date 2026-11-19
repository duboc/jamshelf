'use client';

import { useEffect, useRef } from 'react';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { useSongStore } from '@/lib/stores/song-store';
import { usePointerReorder, moveItem } from '@/lib/hooks/use-pointer-reorder';
import type { Setlist, ParsedSong } from '@/lib/types/song';

interface SetlistDrawerProps {
  setlist: Setlist;
  currentSongId: string;
  /** Followers get a read-only view — same rule as prev/next navigation. */
  canReorder: boolean;
  onNavigate: (songId: string) => void;
  onClose: () => void;
}

interface Entry {
  song: ParsedSong;
  storeIdx: number;
}

export function SetlistDrawer({
  setlist,
  currentSongId,
  canReorder,
  onNavigate,
  onClose,
}: SetlistDrawerProps) {
  const { reorderSong } = useSetlistStore();
  const { getSong } = useSongStore();
  const listRef = useRef<HTMLDivElement>(null);

  const baseEntries: Entry[] = setlist.songIds
    .map((sid, storeIdx) => ({ song: getSong(sid), storeIdx }))
    .filter((e): e is Entry => e.song !== null);

  const { drag, getHandleProps } = usePointerReorder({
    listRef,
    onReorder: (from, to) =>
      reorderSong(setlist.id, baseEntries[from].storeIdx, baseEntries[to].storeIdx),
  });

  const displayEntries = drag ? moveItem(baseEntries, drag.from, drag.to) : baseEntries;

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-current="true"]')
      ?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40"
        onClick={onClose}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      />
      <aside
        aria-label={`Setlist ${setlist.name}`}
        className="fixed inset-y-0 left-0 w-80 max-w-[85vw] z-50 flex flex-col bg-[var(--surface)]/98 backdrop-blur-md border-r border-[var(--line)]"
        style={{ boxShadow: 'var(--shadow-md)' }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--line)] flex-shrink-0">
          <div className="min-w-0">
            <div className="eyebrow">Setlist</div>
            <div className="text-lg font-display text-[var(--ink)] truncate">{setlist.name}</div>
            <div className="font-mono text-[10.5px] text-[var(--muted)] mt-0.5">
              {canReorder
                ? 'Toque para pular · arraste ⣿ para ordenar'
                : 'Seguindo o líder da sessão'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--ink)] text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--surface2)] transition-colors flex-shrink-0 cursor-pointer"
            title="Fechar setlist"
            aria-label="Fechar setlist"
          >
            &times;
          </button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {displayEntries.map(({ song }, displayIdx) => {
            const isCurrent = song.id === currentSongId;
            const isDragged = drag !== null && displayIdx === drag.to;
            return (
              <div
                key={song.id}
                data-display-idx={displayIdx}
                data-current={isCurrent || undefined}
                className={`flex items-center gap-1 rounded-xl border transition-colors ${
                  isDragged
                    ? 'border-[var(--accent)] bg-[var(--surface2)]'
                    : isCurrent
                    ? 'border-[var(--accent)]/60 bg-[var(--accent-dim)]'
                    : 'border-transparent hover:bg-[var(--surface2)]/60'
                }`}
              >
                <span
                  className={`text-[10.5px] font-mono w-7 text-center flex-shrink-0 tabular-nums ${
                    isCurrent ? 'text-[var(--accent-ink)] font-semibold' : 'text-[var(--muted)]'
                  }`}
                >
                  {displayIdx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (!canReorder) return;
                    if (!isCurrent) onNavigate(song.id);
                    onClose();
                  }}
                  disabled={!canReorder}
                  className="flex-1 min-w-0 py-2.5 text-left disabled:cursor-default cursor-pointer"
                >
                  <div
                    className={`text-sm truncate ${
                      isCurrent ? 'font-bold text-[var(--accent-ink)]' : 'font-medium text-[var(--ink)]'
                    }`}
                  >
                    {song.title}
                  </div>
                  <div className="text-[11px] text-[var(--muted)] truncate">
                    {song.artist || 'Artista não informado'}
                    {song.displayKey && (
                      <span className="font-mono text-[var(--accent-ink)]"> · {song.displayKey}</span>
                    )}
                  </div>
                </button>
                {canReorder && (
                  <div
                    {...getHandleProps(displayIdx)}
                    title="Arrastar para reordenar"
                    className="touch-none select-none cursor-grab active:cursor-grabbing text-[var(--muted)] hover:text-[var(--ink)] px-3 py-3 flex-shrink-0 text-base leading-none"
                  >
                    &#10495;
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
