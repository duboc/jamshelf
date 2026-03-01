'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Song } from '@/lib/types/song';
import { DEFAULT_SONGS } from '@/lib/data/default-songs';

interface SongStore {
  songs: Song[];
  addSong: (song: Song) => void;
  removeSong: (id: string) => void;
}

export const useSongStore = create<SongStore>()(
  persist(
    (set) => ({
      songs: DEFAULT_SONGS,
      addSong: (song) => set((s) => ({ songs: [...s.songs, song] })),
      removeSong: (id) => set((s) => ({ songs: s.songs.filter((x) => x.id !== id) })),
    }),
    { name: 'jamshelf-songs' }
  )
);
