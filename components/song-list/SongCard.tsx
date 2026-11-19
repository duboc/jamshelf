'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Song } from '@/lib/types/song';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { formatDuration } from '@/lib/utils/chordpro-parser';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface SongCardProps {
  song: Song;
  onRemove: (id: string) => void;
  variant?: 'card' | 'list';
  position?: 'only' | 'first' | 'middle' | 'last';
}

export function SongCard({
  song,
  onRemove,
  variant = 'card',
  position = 'only',
}: SongCardProps) {
  const { patchMeta } = useSongStore();
  const { setlists, addSongToSetlist } = useSetlistStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addedNotice, setAddedNotice] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  const handleStar = (e: React.MouseEvent, star: number) => {
    e.preventDefault();
    const newRating = song.rating === star ? 0 : star;
    patchMeta(song.id, 'rating', newRating);
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    patchMeta(song.id, 'favorite', song.favorite ? 'false' : 'true');
  };

  const handleAddToSetlist = (setlistId: string, setlistName: string) => {
    addSongToSetlist(setlistId, song.id);
    setMenuOpen(false);
    setAddedNotice(`Em "${setlistName}"`);
    setTimeout(() => setAddedNotice(''), 2000);
  };

  const overflowMenu = (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] transition-colors cursor-pointer"
        title="Mais ações"
        aria-label="Mais ações"
        aria-expanded={menuOpen}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="4.2" r="1.5" fill="currentColor" />
          <circle cx="10" cy="10" r="1.5" fill="currentColor" />
          <circle cx="10" cy="15.8" r="1.5" fill="currentColor" />
        </svg>
      </button>

      {menuOpen && (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-40 w-60 rounded-[20px] bg-[var(--surface)] py-2"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          <div className="px-4 py-1.5 field-label">Adicionar ao setlist</div>
          {setlists.length === 0 ? (
            <Link
              href="/?tab=setlists"
              onClick={() => setMenuOpen(false)}
              className="block px-4 py-2 text-xs font-medium text-[var(--accent-ink)] hover:bg-[var(--surface-high)]"
            >
              Criar primeiro setlist →
            </Link>
          ) : (
            <div className="max-h-44 overflow-y-auto px-1.5">
              {setlists.map((sl) => {
                const already = sl.songIds.includes(song.id);
                return (
                  <button
                    key={sl.id}
                    type="button"
                    disabled={already}
                    onClick={() => !already && handleAddToSetlist(sl.id, sl.name)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-[13px] flex items-center justify-between gap-2 transition-colors ${
                      already
                        ? 'text-[var(--muted)] opacity-55 cursor-default'
                        : 'text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer'
                    }`}
                  >
                    <span className="truncate">{sl.name}</span>
                    {already && <span className="font-mono text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
          )}

          <div className="my-1.5 mx-3 border-t border-[var(--line-subtle)]/40" />

          <div className="px-1.5">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setConfirmDelete(true);
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-[13px] font-medium text-[var(--rec)] hover:bg-[var(--rec-dim)]/50 transition-colors cursor-pointer"
            >
              Excluir música
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const confirmDialog = (
    <ConfirmDialog
      open={confirmDelete}
      title="Excluir esta música?"
      description={
        <>
          &ldquo;{song.title}&rdquo; será removida da biblioteca e dos setlists onde aparece. Essa ação não pode ser desfeita.
        </>
      }
      confirmLabel="Excluir"
      danger
      onConfirm={() => {
        onRemove(song.id);
        setConfirmDelete(false);
      }}
      onCancel={() => setConfirmDelete(false)}
    />
  );

  // GM3 Expressive Tonal Card (default view, inspired by the World Clock city cards)
  if (variant === 'card') {
    return (
      <article className="group relative rounded-[20px] bg-[var(--surface)] hover:bg-[var(--surface-high)] transition-colors px-5 py-4 flex flex-col justify-between gap-3.5">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/song/${song.id}`} className="min-w-0 flex-1 block">
            <div className="flex items-start gap-2 min-w-0">
              <h3 className="font-display text-[20px] font-bold leading-snug text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors line-clamp-2 break-words">
                {song.title}
              </h3>
              {addedNotice && (
                <span className="text-xs font-medium text-[var(--tune)] flex-shrink-0 pt-1">
                  ✓ {addedNotice}
                </span>
              )}
            </div>
            <p className="text-[13px] text-[var(--muted)] truncate mt-0.5">
              {song.artist || 'Artista não informado'}
            </p>
          </Link>

          {/* Expressive rounded key display */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Link
              href={`/song/${song.id}`}
              className="text-right pr-1"
              title={song.displayKey ? `Tom ${song.displayKey}` : 'Sem tom definido'}
            >
              <div
                className={`font-expressive text-[26px] leading-none ${
                  song.displayKey ? 'text-[var(--ink)] group-hover:text-[var(--accent)]' : 'text-[var(--line-subtle)]'
                } transition-colors`}
              >
                {song.displayKey || '-'}
              </div>
            </Link>
            {overflowMenu}
          </div>
        </div>

        {/* Bottom metadata + quick rating & favorite */}
        <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="studio-chip bg-[var(--bg)] text-[var(--muted)] font-mono text-xs tabular-nums">
              {song.tempo} BPM · {song.timeSignature}
            </span>
            {song.capo > 0 && (
              <span className="studio-chip bg-[var(--tune-dim)] text-[var(--tune)] text-xs">
                Capo {song.capo}
              </span>
            )}
            {song.duration ? (
              <span className="text-xs font-mono text-[var(--muted)] tabular-nums pl-0.5">
                {formatDuration(song.duration)}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
            <div className="flex items-center" role="group" aria-label={`Avaliação de ${song.title}`}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={(e) => handleStar(e, star)}
                  className={`w-7 h-7 flex items-center justify-center text-base transition-colors cursor-pointer ${
                    star <= song.rating
                      ? 'text-[var(--warn)]'
                      : 'text-[var(--line-subtle)] hover:text-[var(--warn)]'
                  }`}
                  title={`Avaliar com ${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
                  aria-label={`Avaliar com ${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
                >
                  ★
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleFavorite}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-colors cursor-pointer hover:bg-[var(--surface2)] ${
                song.favorite ? 'text-[var(--rec)]' : 'text-[var(--muted)] hover:text-[var(--rec)]'
              }`}
              title={song.favorite ? 'Remover das favoritas' : 'Adicionar às favoritas'}
              aria-label={song.favorite ? 'Remover das favoritas' : 'Adicionar às favoritas'}
              aria-pressed={song.favorite}
            >
              {song.favorite ? '♥' : '♡'}
            </button>
          </div>
        </div>

        {confirmDialog}
      </article>
    );
  }

  // GM3 Expressive Segmented List Row (stacked #FFFFFF rows with 2px gap)
  const segmentedRadius =
    position === 'only'
      ? 'rounded-[20px]'
      : position === 'first'
      ? 'rounded-t-[20px] rounded-b-[6px]'
      : position === 'last'
      ? 'rounded-b-[20px] rounded-t-[6px]'
      : 'rounded-[6px]';

  return (
    <div
      className={`group flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_88px_164px_144px_84px] md:items-center gap-2 md:gap-3 py-3.5 px-5 bg-[var(--surface)] hover:bg-[var(--surface-high)] transition-colors ${segmentedRadius}`}
    >
      <Link href={`/song/${song.id}`} className="min-w-0 block">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-display text-[20px] font-bold leading-snug text-[var(--ink)] group-hover:text-[var(--accent)] md:truncate break-words transition-colors">
            {song.title}
          </h3>
          {addedNotice && (
            <span className="text-xs font-medium text-[var(--tune)] flex-shrink-0">
              ✓ {addedNotice}
            </span>
          )}
        </div>
        <div className="text-[13px] text-[var(--muted)] truncate mt-0.5">
          {song.artist || 'Artista não informado'}
        </div>
      </Link>

      <div className="flex items-center gap-1.5">
        {song.displayKey ? (
          <span className="font-expressive text-lg text-[var(--accent)]">
            {song.displayKey}
          </span>
        ) : (
          <span className="text-xs text-[var(--muted)]">-</span>
        )}
        {song.capo > 0 && (
          <span className="studio-chip bg-[var(--tune-dim)] text-[var(--tune)] text-xs" title={`Capo casa ${song.capo}`}>
            C{song.capo}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 font-mono text-xs text-[var(--muted)] tabular-nums">
        <span>{song.tempo} BPM</span>
        <span className="opacity-50">·</span>
        <span>{song.timeSignature}</span>
        {song.duration ? (
          <>
            <span className="opacity-50">·</span>
            <span>{formatDuration(song.duration)}</span>
          </>
        ) : null}
      </div>

      <div className="flex items-center justify-between md:contents">
        <div className="flex items-center" role="group" aria-label={`Avaliação de ${song.title}`}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={(e) => handleStar(e, star)}
              className={`w-7 h-7 flex items-center justify-center text-base transition-colors cursor-pointer ${
                star <= song.rating
                  ? 'text-[var(--warn)]'
                  : 'text-[var(--line-subtle)] hover:text-[var(--warn)]'
              }`}
              title={`Avaliar com ${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
              aria-label={`Avaliar com ${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
            >
              ★
            </button>
          ))}
        </div>

        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={handleFavorite}
            className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-colors cursor-pointer hover:bg-[var(--surface2)] ${
              song.favorite ? 'text-[var(--rec)]' : 'text-[var(--muted)] hover:text-[var(--rec)]'
            }`}
            title={song.favorite ? 'Remover das favoritas' : 'Adicionar às favoritas'}
            aria-label={song.favorite ? 'Remover das favoritas' : 'Adicionar às favoritas'}
            aria-pressed={song.favorite}
          >
            {song.favorite ? '♥' : '♡'}
          </button>
          {overflowMenu}
        </div>
      </div>

      {confirmDialog}
    </div>
  );
}
