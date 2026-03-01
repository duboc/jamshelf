'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Setlist } from '@/lib/types/song';

interface SetlistStore {
  setlists: Setlist[];
  createSetlist: (name: string) => Setlist;
  deleteSetlist: (id: string) => void;
  renameSetlist: (id: string, name: string) => void;
  addSongToSetlist: (setlistId: string, songId: string) => void;
  removeSongFromSetlist: (setlistId: string, songId: string) => void;
  reorderSong: (setlistId: string, fromIdx: number, toIdx: number) => void;
}

export const useSetlistStore = create<SetlistStore>()(
  persist(
    (set, get) => ({
      setlists: [],

      createSetlist: (name) => {
        const setlist: Setlist = {
          id: 'setlist-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          name,
          songIds: [],
          createdAt: Date.now(),
        };
        set((s) => ({ setlists: [...s.setlists, setlist] }));
        return setlist;
      },

      deleteSetlist: (id) =>
        set((s) => ({ setlists: s.setlists.filter((sl) => sl.id !== id) })),

      renameSetlist: (id, name) =>
        set((s) => ({
          setlists: s.setlists.map((sl) => (sl.id === id ? { ...sl, name } : sl)),
        })),

      addSongToSetlist: (setlistId, songId) => {
        const sl = get().setlists.find((s) => s.id === setlistId);
        if (!sl || sl.songIds.includes(songId)) return;
        set((s) => ({
          setlists: s.setlists.map((sl) =>
            sl.id === setlistId ? { ...sl, songIds: [...sl.songIds, songId] } : sl
          ),
        }));
      },

      removeSongFromSetlist: (setlistId, songId) =>
        set((s) => ({
          setlists: s.setlists.map((sl) =>
            sl.id === setlistId
              ? { ...sl, songIds: sl.songIds.filter((id) => id !== songId) }
              : sl
          ),
        })),

      reorderSong: (setlistId, fromIdx, toIdx) => {
        const sl = get().setlists.find((s) => s.id === setlistId);
        if (!sl) return;
        const ids = [...sl.songIds];
        const [moved] = ids.splice(fromIdx, 1);
        ids.splice(toIdx, 0, moved);
        set((s) => ({
          setlists: s.setlists.map((sl) =>
            sl.id === setlistId ? { ...sl, songIds: ids } : sl
          ),
        }));
      },
    }),
    { name: 'jamshelf-setlists' }
  )
);
