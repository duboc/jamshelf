'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Song } from '@/lib/types/song';
import { useSongStore } from '@/lib/stores/song-store';
import { useSetlistStore } from '@/lib/stores/setlist-store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface SongCardProps {
  song: Song;
  onRemove: (id: string) => void;
}

export function SongCard({ song, onRemove }: SongCardProps) {
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

  return (
    <div className="group flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 py-3.5 px-2 sm:px-3 border-b border-[var(--line)] hover:bg-[var(--surface2)]/45 transition-colors">
      <Link href={`/song/${song.id}`} className="flex-1 min-w-0 block">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="font-display text-[19px] leading-snug text-[var(--ink)] group-hover:underline underline-offset-4 truncate">
            {song.title}
          </h3>
          {addedNotice && (
            <span className="font-mono text-[10.5px] text-[var(--tune)] flex-shrink-0">
              ✓ {addedNotice}
            </span>
          )}
        </div>
        <div className="text-[13.5px] text-[var(--muted)] truncate mt-0.5">
          {song.artist || 'Artista não informado'}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {song.displayKey && (
            <span className="studio-chip text-[var(--accent-ink)]">
              Tom {song.displayKey}
            </span>
          )}
          <span className="studio-chip text-[var(--muted)]">
            {song.tempo} BPM
          </span>
          <span className="studio-chip text-[var(--muted)]">
            {song.timeSignature}
          </span>
          {song.capo > 0 && (
            <span className="studio-chip text-[var(--tune)]">
              Capo {song.capo}
            </span>
          )}
        </div>
      </Link>

      <div className="flex items-center justify-between sm:justify-end gap-2 flex-shrink-0">
        {/* Star rating */}
        <div className="flex items-center gap-0.5" role="group" aria-label={`Avaliação de ${song.title}`}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={(e) => handleStar(e, star)}
              className={`w-6 h-6 flex items-center justify-center text-sm transition-colors cursor-pointer ${
                star <= song.rating
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--line)] hover:text-[var(--accent)]/60'
              }`}
              title={`Avaliar com ${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
              aria-label={`Avaliar com ${star} ${star === 1 ? 'estrela' : 'estrelas'}`}
            >
              ★
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {/* Favorite toggle */}
          <button
            type="button"
            onClick={handleFavorite}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-base transition-colors cursor-pointer hover:bg-[var(--surface2)] ${
              song.favorite ? 'text-[var(--rec)]' : 'text-[var(--muted)] hover:text-[var(--rec)]'
            }`}
            title={song.favorite ? 'Remover das favoritas' : 'Adicionar às favoritas'}
            aria-label={song.favorite ? 'Remover das favoritas' : 'Adicionar às favoritas'}
            aria-pressed={song.favorite}
          >
            {song.favorite ? '♥' : '♡'}
          </button>

          {/* Overflow actions: Add to setlist + Delete */}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] transition-colors cursor-pointer"
              title="Mais ações"
              aria-label="Mais ações"
              aria-expanded={menuOpen}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="3.2" cy="8" r="1.3" fill="currentColor" />
                <circle cx="8" cy="8" r="1.3" fill="currentColor" />
                <circle cx="12.8" cy="8" r="1.3" fill="currentColor" />
              </svg>
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-[calc(100%+4px)] z-40 w-52 rounded-xl border border-[var(--line)] bg-[var(--surface)] py-1.5"
                style={{ boxShadow: 'var(--shadow-md)' }}
              >
                <div className="px-3 py-1 eyebrow">Adicionar ao setlist</div>
                {setlists.length === 0 ? (
                  <Link
                    href="/?tab=setlists"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2 text-xs text-[var(--accent-ink)] hover:bg-[var(--surface2)]"
                  >
                    Criar primeiro setlist →
                  </Link>
                ) : (
                  <div className="max-h-44 overflow-y-auto">
                    {setlists.map((sl) => {
                      const already = sl.songIds.includes(song.id);
                      return (
                        <button
                          key={sl.id}
                          type="button"
                          disabled={already}
                          onClick={() => !already && handleAddToSetlist(sl.id, sl.name)}
                          className={`w-full text-left px-3 py-1.5 text-[13px] flex items-center justify-between gap-2 transition-colors ${
                            already
                              ? 'text-[var(--muted)] opacity-60 cursor-default'
                              : 'text-[var(--ink)] hover:bg-[var(--surface2)] cursor-pointer'
                          }`}
                        >
                          <span className="truncate">{sl.name}</span>
                          {already && <span className="font-mono text-[10px]">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="my-1 border-t border-[var(--line)]" />

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                  className="w-full text-left px-3 py-1.5 text-[13px] text-[var(--rec)] hover:bg-[var(--surface2)] transition-colors cursor-pointer"
                >
                  Excluir música
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

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
    </div>
  );
}
