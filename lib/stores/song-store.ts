'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Song } from '@/lib/types/song';
import { DEFAULT_SONGS } from '@/lib/data/default-songs';

interface SongStore {
  songs: Song[];
  addSong: (song: Song) => void;
  removeSong: (id: string) => void;
  updateSong: (id: string, updates: Partial<Song>) => void;
  exportSong: (id: string) => string | null;
  exportAll: () => string;
  importSongs: (json: string) => number;
}

export const useSongStore = create<SongStore>()(
  persist(
    (set, get) => ({
      songs: DEFAULT_SONGS,
      addSong: (song) => set((s) => ({ songs: [...s.songs, song] })),
      removeSong: (id) => set((s) => ({ songs: s.songs.filter((x) => x.id !== id) })),
      updateSong: (id, updates) =>
        set((s) => ({
          songs: s.songs.map((song) =>
            song.id === id ? { ...song, ...updates } : song
          ),
        })),
      exportSong: (id) => {
        const song = get().songs.find((s) => s.id === id);
        return song ? JSON.stringify(song, null, 2) : null;
      },
      exportAll: () => JSON.stringify(get().songs, null, 2),
      importSongs: (json: string) => {
        try {
          const parsed = JSON.parse(json);
          const arr: Song[] = Array.isArray(parsed) ? parsed : [parsed];
          const valid = arr.filter(
            (s) => s.title && s.sections && Array.isArray(s.sections)
          );
          if (!valid.length) return 0;
          // assign new IDs to avoid collisions
          const withIds = valid.map((s) => ({
            ...s,
            id: s.id || 'song-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          }));
          set((s) => ({ songs: [...s.songs, ...withIds] }));
          return withIds.length;
        } catch {
          return 0;
        }
      },
    }),
    { name: 'jamshelf-songs' }
  )
);
