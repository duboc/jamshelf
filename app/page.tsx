'use client';

import { useState } from 'react';
import { useSongStore } from '@/lib/stores/song-store';
import { SongCard } from '@/components/song-list/SongCard';
import Link from 'next/link';

export default function Home() {
  const { songs, removeSong } = useSongStore();
  const [search, setSearch] = useState('');

  const filtered = songs.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.artist.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold font-display tracking-tight text-violet-400">
            Jamshelf
          </h1>
          <Link
            href="/add-song"
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
          >
            + Add Song
          </Link>
        </div>
      </header>

      {/* Search */}
      <div className="px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <input
            type="text"
            placeholder="Search songs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-500 transition-colors"
          />
        </div>
      </div>

      {/* Song list */}
      <main className="flex-1 px-6 pb-8">
        <div className="max-w-3xl mx-auto space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              {songs.length === 0
                ? 'No songs yet. Add one to get started!'
                : 'No songs match your search.'}
            </div>
          ) : (
            filtered.map((song) => (
              <SongCard key={song.id} song={song} onRemove={removeSong} />
            ))
          )}
        </div>
      </main>
    </div>
  );
}
