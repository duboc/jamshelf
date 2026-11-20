'use client';

import { useEffect, useRef, useState } from 'react';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { useSongStore } from '@/lib/stores/song-store';
import { usePointerReorder, moveItem } from '@/lib/hooks/use-pointer-reorder';
import { useDialogA11y } from '@/lib/hooks/use-dialog-a11y';
import { useAnimatedPresence } from '@/lib/hooks/use-animated-presence';
import { useFlipList } from '@/lib/hooks/use-flip-list';
import { computeSetlistDuration, formatSetlistDuration } from '@/lib/utils/autoscroll';
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, GripIcon } from '@/components/ui/Icons';
import type { Setlist, ParsedSong } from '@/lib/types/song';

interface SetlistDrawerProps {
  open?: boolean;
  setlist: Setlist;
  currentSongId: string;
  /** Followers get a read-only view, matching prev/next navigation rules. */
  canReorder: boolean;
  onNavigate: (songId: string) => void;
  onClose: () => void;
}

interface Entry {
  song: ParsedSong;
  storeIdx: number;
}

export function SetlistDrawer({
  open = true,
  setlist,
  currentSongId,
  canReorder,
  onNavigate,
  onClose,
}: SetlistDrawerProps) {
  const { reorderSong } = useSetlistStore();
  const { getSong } = useSongStore();
  const listRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const [liveStatus, setLiveStatus] = useState('');
  const { mounted, closing } = useAnimatedPresence(open, 260);

  useDialogA11y(open, onClose, drawerRef);

  const baseEntries: Entry[] = setlist.songIds
    .map((sid, storeIdx) => ({ song: getSong(sid), storeIdx }))
    .filter((e): e is Entry => e.song !== null);

  const { drag, getHandleProps } = usePointerReorder({
    listRef,
    onReorder: (from, to) =>
      reorderSong(setlist.id, baseEntries[from].storeIdx, baseEntries[to].storeIdx),
  });

  const displayEntries = drag ? moveItem(baseEntries, drag.from, drag.to) : baseEntries;
  const orderKey = displayEntries.map((e) => e.song.id).join('|');
  useFlipList(listRef, orderKey);

  const durSummary =
    displayEntries.length > 0
      ? computeSetlistDuration(displayEntries.map((e) => e.song))
      : null;
  const durLabel = durSummary
    ? formatSetlistDuration(durSummary.totalSec, durSummary.estimatedCount > 0)
    : null;

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-current="true"]')
      ?.scrollIntoView({ block: 'center' });
  }, [open]);

  if (!mounted) return null;

  const handleKeyboardReorder = (displayIdx: number, delta: -1 | 1) => {
    const targetIdx = displayIdx + delta;
    if (targetIdx < 0 || targetIdx >= baseEntries.length) return;
    const item = baseEntries[displayIdx];
    const target = baseEntries[targetIdx];
    reorderSong(setlist.id, item.storeIdx, target.storeIdx);
    setLiveStatus(`${item.song.title} movida para a posição ${targetIdx + 1}`);
  };

  return (
    <>
      <div
        className={`${closing ? 'gm3-backdrop-exit' : 'gm3-backdrop-enter'} fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40`}
        onClick={closing ? undefined : onClose}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="setlist-drawer-title"
        inert={closing || undefined}
        className={`${closing ? 'gm3-drawer-left-exit' : 'gm3-drawer-left'} fixed inset-y-0 left-0 w-80 max-w-[88vw] z-50 flex flex-col rounded-r-[28px] bg-[var(--surface)] overflow-hidden`}
        style={{ boxShadow: 'var(--shadow-md)' }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <div className="sr-only" role="status" aria-live="polite">
          {liveStatus}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line-subtle)]/40 flex-shrink-0">
          <div className="min-w-0">
            <h2 id="setlist-drawer-title" className="text-lg font-display font-bold text-[var(--ink)] truncate">
              {setlist.name}
            </h2>
            <div className="font-mono text-xs text-[var(--muted)] mt-0.5">
              {displayEntries.length}{' '}
              {displayEntries.length === 1 ? 'música' : 'músicas'}
              {durLabel ? ` · ${durLabel}` : ''}
            </div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              {canReorder
                ? 'Toque para pular · arraste ou use as setas para ordenar'
                : 'Seguindo o líder da sessão'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="gm3-icon-btn text-[var(--muted)] hover:text-[var(--ink)] w-9 h-9 flex items-center justify-center hover:bg-[var(--surface-high)] flex-shrink-0 cursor-pointer"
            title="Fechar setlist"
            aria-label="Fechar setlist"
          >
            <CloseIcon size={17} />
          </button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-2.5 py-2.5 space-y-1">
          {displayEntries.map(({ song }, displayIdx) => {
            const isCurrent = song.id === currentSongId;
            const isDragged = drag !== null && displayIdx === drag.to;
            return (
              <div
                key={song.id}
                data-flip-key={song.id}
                data-display-idx={displayIdx}
                data-current={isCurrent || undefined}
                data-dragging={isDragged || undefined}
                className={`gm3-list-row flex items-center gap-1 rounded-2xl ${
                  isDragged
                    ? 'bg-[var(--secondary-container)]/60 ring-2 ring-[var(--accent)]'
                    : isCurrent
                    ? 'bg-[var(--secondary-container)] text-[var(--on-secondary-container)]'
                    : 'hover:bg-[var(--surface-high)]'
                }`}
              >
                <span
                  className={`text-xs font-mono w-7 text-center flex-shrink-0 tabular-nums ${
                    isCurrent ? 'text-[var(--on-secondary-container)] font-semibold' : 'text-[var(--muted)]'
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
                  aria-current={isCurrent ? 'true' : undefined}
                  className="flex-1 min-w-0 py-2.5 text-left disabled:cursor-default cursor-pointer"
                >
                  <div
                    className={`text-[15px] font-display font-bold truncate ${
                      isCurrent ? 'text-[var(--on-secondary-container)]' : 'text-[var(--ink)]'
                    }`}
                  >
                    {song.title}
                  </div>
                  <div className="text-xs text-[var(--muted)] truncate">
                    {song.artist || 'Artista não informado'}
                    {song.displayKey && (
                      <span className="font-mono text-[var(--accent-ink)]"> · {song.displayKey}</span>
                    )}
                    {song.notes && (
                      <span className="text-[var(--warn-ink)]"> · {song.notes}</span>
                    )}
                  </div>
                </button>
                {canReorder && (
                  <div className="flex items-center flex-shrink-0 pr-1">
                    <button
                      type="button"
                      disabled={displayIdx === 0}
                      onClick={() => handleKeyboardReorder(displayIdx, -1)}
                      className="gm3-icon-btn w-7 h-7 flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--bg)]/60 disabled:opacity-30 cursor-pointer"
                      aria-label={`Mover ${song.title} para cima`}
                      title="Mover para cima"
                    >
                      <ArrowUpIcon size={13} />
                    </button>
                    <button
                      type="button"
                      disabled={displayIdx >= displayEntries.length - 1}
                      onClick={() => handleKeyboardReorder(displayIdx, 1)}
                      className="gm3-icon-btn w-7 h-7 flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--bg)]/60 disabled:opacity-30 cursor-pointer"
                      aria-label={`Mover ${song.title} para baixo`}
                      title="Mover para baixo"
                    >
                      <ArrowDownIcon size={13} />
                    </button>
                    <div
                      {...getHandleProps(displayIdx)}
                      title="Arrastar para reordenar"
                      aria-hidden="true"
                      className="touch-none select-none cursor-grab active:cursor-grabbing text-[var(--muted)] hover:text-[var(--ink)] p-2 flex-shrink-0"
                    >
                      <GripIcon size={15} />
                    </div>
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
