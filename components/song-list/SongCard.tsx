'use client';

import Link from 'next/link';
import type { Song } from '@/lib/types/song';

interface SongCardProps {
  song: Song;
  onRemove: (id: string) => void;
}

export function SongCard({ song, onRemove }: SongCardProps) {
  return (
    <div className="group flex items-center gap-3 p-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-all">
      <Link
        href={`/song/${song.id}`}
        className="flex-1 min-w-0"
      >
        <div className="font-semibold text-zinc-100 truncate">{song.title}</div>
        <div className="text-sm text-zinc-400 truncate">{song.artist}</div>
        <div className="flex gap-2 mt-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-violet-400 font-mono">
            {song.displayKey}
          </span>
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
