'use client';

import Link from 'next/link';
import type { Song } from '@/lib/types/song';
import { useSongStore } from '@/lib/stores/song-store';

interface SongCardProps {
  song: Song;
  onRemove: (id: string) => void;
}

export function SongCard({ song, onRemove }: SongCardProps) {
  const { patchMeta } = useSongStore();

  const handleStar = (e: React.MouseEvent, star: number) => {
    e.preventDefault();
    // clicking the same star twice clears rating
    const newRating = song.rating === star ? 0 : star;
    patchMeta(song.id, 'rating', newRating);
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    if (song.favorite) {
      patchMeta(song.id, 'favorite', 'false');
    } else {
      patchMeta(song.id, 'favorite', 'true');
    }
  };

  return (
    <div className="group flex items-center gap-3 p-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-all">
      <Link href={`/song/${song.id}`} className="flex-1 min-w-0">
        <div className="font-semibold text-zinc-100 truncate">{song.title}</div>
        <div className="text-sm text-zinc-400 truncate">{song.artist}</div>
        <div className="flex gap-2 mt-2">
          {song.displayKey && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-violet-400 font-mono">
              {song.displayKey}
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
            {song.tempo} BPM
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
            {song.timeSignature}
          </span>
          {song.capo > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-amber-400 font-mono">
              Capo {song.capo}
            </span>
          )}
        </div>
      </Link>

      {/* Stars */}
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={(e) => handleStar(e, star)}
            className={`text-base transition-colors ${
              star <= song.rating ? 'text-amber-400' : 'text-zinc-700 hover:text-amber-400/50'
            }`}
            title={`Rate ${star} star${star !== 1 ? 's' : ''}`}
          >
            ★
          </button>
        ))}
      </div>

      {/* Favorite heart */}
      <button
        onClick={handleFavorite}
        className={`text-xl transition-colors ${
          song.favorite ? 'text-red-400' : 'text-zinc-700 hover:text-red-400/50'
        }`}
        title={song.favorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        {song.favorite ? '♥' : '♡'}
      </button>

      {/* Remove */}
      <button
        onClick={(e) => {
          e.preventDefault();
          onRemove(song.id);
        }}
        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all text-lg w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-700"
        title="Remove song"
      >
        &times;
      </button>
    </div>
  );
}
