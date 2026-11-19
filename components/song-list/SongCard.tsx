'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Song } from '@/lib/types/song';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { formatDuration } from '@/lib/utils/chordpro-parser';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TransitionLink } from '@/components/ui/TransitionLink';
import { CheckIcon, HeartIcon, MoreVertIcon, StarIcon } from '@/components/ui/Icons';

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
  const [favPop, setFavPop] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const handleStar = (e: React.MouseEvent, star: number) => {
    e.preventDefault();
    const newRating = song.rating === star ? 0 : star;
    patchMeta(song.id, 'rating', newRating);
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    const nextFav = !song.favorite;
    if (nextFav) {
      setFavPop(true);
      setTimeout(() => setFavPop(false), 280);
    }
    patchMeta(song.id, 'favorite', nextFav ? 'true' : 'false');
  };

  const handleAddToSetlist = (setlistId: string, setlistName: string) => {
    addSongToSetlist(setlistId, song.id);
    setMenuOpen(false);
    setAddedNotice(`Em "${setlistName}"`);
    setTimeout(() => setAddedNotice(''), 3500);
  };

  const overflowMenu = (
    <div ref={menuRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="gm3-icon-btn w-10 h-10 flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] cursor-pointer"
        title="Mais ações"
        aria-label={`Mais ações para ${song.title}`}
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
      >
        <MoreVertIcon size={18} />
      </button>

      {menuOpen && (
        <div
          role="dialog"
          aria-label={`Ações de ${song.title}`}
          className="gm3-card gm3-popover-top-right absolute right-0 top-[calc(100%+6px)] z-40 w-64 rounded-[20px] bg-[var(--surface)] py-2"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          {/* Rating inside menu (accessible 36px stars with WCAG AA contrast) */}
          <div className="px-4 py-2 flex items-center justify-between gap-2">
            <span className="field-label">Avaliação</span>
            <div className="flex items-center gap-0.5" role="group" aria-label={`Avaliação de ${song.title}`}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={(e) => handleStar(e, star)}
                  className={`gm3-icon-btn gm3-star-btn w-9 h-9 flex items-center justify-center cursor-pointer hover:bg-[var(--surface-high)] ${
                    star <= song.rating ? 'text-[var(--warn-icon)]' : 'text-[var(--line)] hover:text-[var(--warn-icon)]'
                  }`}
                  title={`Avaliar com ${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
                  aria-label={`Avaliar com ${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
                  aria-pressed={star <= song.rating}
                >
                  <StarIcon size={16} filled={star <= song.rating} />
                </button>
              ))}
            </div>
          </div>

          <div className="my-1.5 mx-3 border-t border-[var(--line-subtle)]/40" />

          <div className="px-4 py-1.5 field-label">Adicionar ao setlist</div>
          {setlists.length === 0 ? (
            <Link
              href="/?tab=setlists"
              onClick={() => setMenuOpen(false)}
              className="gm3-menu-item block mx-1.5 px-3 py-2 text-xs font-medium text-[var(--accent-ink)] hover:bg-[var(--surface-high)]"
            >
              Criar primeiro setlist →
            </Link>
          ) : (
            <div className="max-h-44 overflow-y-auto px-1.5 py-0.5">
              {setlists.map((sl) => {
                const already = sl.songIds.includes(song.id);
                return (
                  <button
                    key={sl.id}
                    type="button"
                    disabled={already}
                    onClick={() => !already && handleAddToSetlist(sl.id, sl.name)}
                    className={`gm3-menu-item w-full text-left px-3 py-2 text-[13px] flex items-center justify-between gap-2 ${
                      already
                        ? 'text-[var(--muted)] opacity-60 cursor-default'
                        : 'text-[var(--ink)] hover:bg-[var(--surface-high)] cursor-pointer'
                    }`}
                  >
                    <span className="truncate">{sl.name}</span>
                    {already && <CheckIcon size={14} className="flex-shrink-0" />}
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
              className="gm3-menu-item w-full text-left px-3 py-2 text-[13px] font-medium text-[var(--rec)] hover:bg-[var(--rec-dim)]/50 cursor-pointer"
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

  // GM3 Expressive Tonal Card (single link per card, signature key badge, clean rating chip)
  if (variant === 'card') {
    return (
      <article className="gm3-card gm3-card-interactive group relative bg-[var(--surface)] hover:bg-[var(--surface-high)] px-5 py-4 flex flex-col justify-between gap-3">
        <div className="flex items-start justify-between gap-2">
          <TransitionLink
            href={`/song/${song.id}`}
            vtSongId={song.id}
            vtDirection="forward"
            className="min-w-0 flex-1 flex items-start justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2 min-w-0">
                <h2
                  data-vt-song-title={song.id}
                  className="font-display text-[20px] font-bold leading-snug text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors line-clamp-2 break-words"
                >
                  {song.title}
                </h2>
                {addedNotice && (
                  <span
                    role="status"
                    aria-live="polite"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--tune)] flex-shrink-0 pt-1"
                  >
                    <CheckIcon size={13} /> {addedNotice}
                  </span>
                )}
              </div>
              <p className="text-[13px] text-[var(--muted)] truncate mt-0.5">
                {song.artist || 'Artista não informado'}
              </p>
            </div>

            {/* Signature GM3 Expressive Musical Key badge */}
            {song.displayKey ? (
              <span
                data-vt-song-key={song.id}
                className="gm3-key-badge min-w-[44px] h-10 px-2.5 bg-[var(--primary-container)] text-[var(--on-primary-container)] font-expressive text-[19px] leading-none inline-flex items-center justify-center flex-shrink-0"
                title={`Tom ${song.displayKey}`}
              >
                {song.displayKey}
              </span>
            ) : (
              <span className="gm3-key-badge min-w-[44px] h-10 px-2.5 bg-[var(--bg)] text-[var(--muted)] font-expressive text-base leading-none inline-flex items-center justify-center flex-shrink-0">
                -
              </span>
            )}
          </TransitionLink>

          {overflowMenu}
        </div>

        {/* Clean 2-zone footer: musical metadata left, rated pill + heart right (never wraps onto 4th row) */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="studio-chip bg-[var(--bg)] text-[var(--muted)] font-mono text-xs tabular-nums">
              {song.tempo} BPM · {song.timeSignature}
              {song.duration ? ` · ${formatDuration(song.duration)}` : ''}
            </span>
            {song.capo > 0 && (
              <span className="studio-chip bg-[var(--tune-dim)] text-[var(--tune)] text-xs">
                Capo {song.capo}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {song.rating > 0 && (
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="pill-btn h-7 px-2.5 text-xs bg-[var(--warn-dim)] text-[var(--warn-ink)]"
                title={`Avaliação: ${song.rating} de 5 estrelas. Clique para ajustar`}
                aria-label={`Avaliação ${song.rating} de 5 estrelas para ${song.title}`}
              >
                <StarIcon size={13} filled className="text-[var(--warn-icon)]" />
                <span className="font-mono tabular-nums">{song.rating}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleFavorite}
              className={`gm3-icon-btn gm3-fav-btn ${favPop ? 'gm3-pop-once' : ''} w-10 h-10 flex items-center justify-center cursor-pointer hover:bg-[var(--surface2)] ${
                song.favorite ? 'text-[var(--rec)]' : 'text-[var(--muted)] hover:text-[var(--rec)]'
              }`}
              title={song.favorite ? 'Remover das favoritas' : 'Adicionar às favoritas'}
              aria-label={song.favorite ? `Remover ${song.title} das favoritas` : `Adicionar ${song.title} às favoritas`}
              aria-pressed={song.favorite}
            >
              <HeartIcon size={18} filled={song.favorite} />
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
      className={`gm3-card gm3-list-row group flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_110px_176px_76px_92px] md:items-center gap-2 md:gap-3 py-3.5 px-5 bg-[var(--surface)] hover:bg-[var(--surface-high)] ${segmentedRadius}`}
    >
      <TransitionLink
        href={`/song/${song.id}`}
        vtSongId={song.id}
        vtDirection="forward"
        className="min-w-0 block"
      >
        <div className="flex items-center gap-2 min-w-0">
          <h2
            data-vt-song-title={song.id}
            className="font-display text-[20px] font-bold leading-snug text-[var(--ink)] group-hover:text-[var(--accent)] md:truncate break-words transition-colors"
          >
            {song.title}
          </h2>
          {addedNotice && (
            <span
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--tune)] flex-shrink-0"
            >
              <CheckIcon size={13} /> {addedNotice}
            </span>
          )}
        </div>
        <div className="text-[13px] text-[var(--muted)] truncate mt-0.5">
          {song.artist || 'Artista não informado'}
        </div>
      </TransitionLink>

      <div className="flex items-center gap-1.5">
        {song.displayKey ? (
          <span
            data-vt-song-key={song.id}
            className="gm3-key-badge min-w-[40px] h-8 px-2.5 bg-[var(--primary-container)] text-[var(--on-primary-container)] font-expressive text-base leading-none inline-flex items-center justify-center"
          >
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
        <div>
          {song.rating > 0 ? (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="pill-btn h-7 px-2.5 text-xs bg-[var(--warn-dim)] text-[var(--warn-ink)]"
              aria-label={`Avaliação ${song.rating} de 5 estrelas para ${song.title}`}
            >
              <StarIcon size={13} filled className="text-[var(--warn-icon)]" />
              <span className="font-mono tabular-nums">{song.rating}</span>
            </button>
          ) : (
            <span className="text-xs text-[var(--muted)] hidden md:inline">-</span>
          )}
        </div>

        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={handleFavorite}
            className={`gm3-icon-btn gm3-fav-btn ${favPop ? 'gm3-pop-once' : ''} w-10 h-10 flex items-center justify-center cursor-pointer hover:bg-[var(--surface2)] ${
              song.favorite ? 'text-[var(--rec)]' : 'text-[var(--muted)] hover:text-[var(--rec)]'
            }`}
            title={song.favorite ? 'Remover das favoritas' : 'Adicionar às favoritas'}
            aria-label={song.favorite ? `Remover ${song.title} das favoritas` : `Adicionar ${song.title} às favoritas`}
            aria-pressed={song.favorite}
          >
            <HeartIcon size={18} filled={song.favorite} />
          </button>
          {overflowMenu}
        </div>
      </div>

      {confirmDialog}
    </div>
  );
}
