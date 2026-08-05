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
  /** Index into setlist.songIds, which may contain ids of deleted songs. */
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
        className="absolute inset-0 bg-black/50 z-20"
        onClick={onClose}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      />
      {/* stopPropagation so drags in here never trigger the swipe-to-navigate
          gesture on the sheet behind us. */}
      <aside
        className="absolute inset-y-0 left-0 w-80 max-w-[85vw] z-30 flex flex-col bg-zinc-950/95 backdrop-blur border-r border-zinc-800"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <div className="min-w-0">
            <div className="text-sm font-bold font-display text-zinc-100 truncate">{setlist.name}</div>
            <div className="text-[11px] text-zinc-500">
              {canReorder
                ? 'Tap a song to jump · drag ⣿ to reorder'
                : 'Following — the leader controls the set'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-800 transition-colors flex-shrink-0"
            title="Close setlist"
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
                className={`flex items-center gap-1 rounded-lg border transition-colors ${
                  isDragged
                    ? 'border-violet-500 bg-zinc-800'
                    : isCurrent
                    ? 'border-violet-500/60 bg-violet-500/10'
                    : 'border-transparent hover:bg-zinc-900'
                }`}
              >
                <span
                  className={`text-[10px] font-mono w-6 text-center flex-shrink-0 ${
                    isCurrent ? 'text-violet-400' : 'text-zinc-600'
                  }`}
                >
                  {displayIdx + 1}
                </span>
                <button
                  onClick={() => {
                    if (!canReorder) return;
                    if (!isCurrent) onNavigate(song.id);
                    onClose();
                  }}
                  disabled={!canReorder}
                  className="flex-1 min-w-0 py-2.5 text-left disabled:cursor-default"
                >
                  <div
                    className={`text-sm truncate ${
                      isCurrent ? 'font-bold text-violet-300' : 'font-medium text-zinc-200'
                    }`}
                  >
                    {song.title}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    {song.artist}
                    {song.displayKey && (
                      <span className="font-mono text-zinc-400"> &middot; {song.displayKey}</span>
                    )}
                  </div>
                </button>
                {canReorder && (
                  <div
                    {...getHandleProps(displayIdx)}
                    title="Drag to reorder"
                    className="touch-none select-none cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300 px-3 py-3 flex-shrink-0 text-base leading-none"
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
